---
installer: psak-manual
origin: PSak + Human collaborative design — real-time agent-to-agent query via delegation API
name: ask
description: 'Ask another agent a question and get an answer in real-time. Uses Agent Pool delegation API (sync mode). Auto-selects the right agent if not specified. Use when you need information, opinions, or validation from another agent NOW — not async threads.'
argument-hint: '[--continue] [agent] "question"'
trigger: /ask
---

# /ask — Real-Time Agent Query

Ask another agent a question and get an answer immediately via Agent Pool delegation (sync mode).

## Usage

```
/ask dora "what content should we post this week?"
/ask trading "S50 sentiment today?"
/ask devops "any unhealthy services right now?"
/ask "should we use fan-out or round-robin for this?" → auto-selects agent
/ask --continue dora "can you elaborate on point 2?"  → multi-turn follow-up
```

## Auto-Invocation Guide

Agents should use `/ask` autonomously (without human asking) when:

| Situation | Ask? | Example |
|-----------|------|---------|
| Need data from another domain before deciding | **Yes** | PSak asks Trading for market data before writing report |
| Validating an approach before implementing | **Yes** | PSak asks DevOps "will this config change break anything?" |
| Need creative input on a single question | **Yes** | PSak asks Dora "what's a good name for this?" |
| Need multiple perspectives (3+ ideas) | **No → /brainstorm** | Use /brainstorm for ideation sessions |
| Leaving a message for later | **No → /talk-to** | Use /talk-to for async threads |
| Simple factual lookup you can do yourself | **No** | Search Oracle/memory instead |

### Agent Selection (when not specified)

If the user or agent says `/ask "question"` without specifying a target, auto-select:

| Question about | Ask | Why |
|---------------|-----|-----|
| Content, copy, naming, visual, social media | **dora** | Creative domain expert |
| Market data, prices, sentiment, trading signals | **trading** | Financial data specialist |
| Infrastructure, services, health, monitoring, deploy | **devops** | Ops domain expert |
| Code review, PR quality, test coverage | **reviewer** | Code quality specialist |
| Architecture, system design, memory, Oracle | **psak** | System architect (only if YOU are not PSak) |
| Unclear domain | **dora** (safe default) | Dora gives creative + accessible answers |

### When NOT to /ask

- **Target agent is offline** → skill checks pool status and tells you
- **You ARE the target agent** → answer directly, don't delegate to yourself
- **Question needs 3+ perspectives or creative refinement** → use `/brainstorm` instead (for multi-turn follow-ups with ONE agent, use `/ask --continue`)
- **Question is for the human** → just ask in the conversation, don't delegate

## Step 0: Parse Arguments

```
/ask dora "question here"              → agent=dora, question="question here", continue=false
/ask "question here"                   → agent=auto-select, question="question here", continue=false
/ask trading market overview           → agent=trading, question="market overview", continue=false
/ask --continue dora "follow-up?"      → agent=dora, question="follow-up?", continue=true
```

Extract:
- `CONTINUE_MODE`: true if args start with `--continue`
- `TARGET_AGENT`: first word (after removing `--continue`) if it matches a known agent ID, otherwise auto-select
- `QUESTION`: everything else (with or without quotes)

## Step 1: Validate

### 1a. Don't ask yourself
If TARGET_AGENT == your own agent ID → just answer the question directly. Print: "That's me — answering directly." Then answer.

### 1b. Pool health check

```bash
STATE=$(curl -s http://localhost:8086/api/agents | python3 -c "
import sys, json
for a in json.load(sys.stdin):
    if a['id'] == '${TARGET_AGENT}':
        print(a['pool_status']['state'])
")
```

If `off` → tell the user: "{agent} is offline. Use `/talk-to {agent}` to leave an async message instead."

## Step 1c: Build Instruction (multi-turn support)

History file: `/tmp/ask-history-${MY_ID}-${TARGET_AGENT}.json`

**If `CONTINUE_MODE` is true:**

```bash
HISTORY_FILE="/tmp/ask-history-${MY_ID}-${TARGET_AGENT}.json"
if [ -f "$HISTORY_FILE" ]; then
  HISTORY=$(cat "$HISTORY_FILE")
fi
```

Read the history JSON (array of `{"q": "...", "a": "..."}` objects). Build `FULL_INSTRUCTION` by prepending context:

```
Previous conversation:
Q: {turn1.q}
A: {turn1.a}
Q: {turn2.q}
A: {turn2.a}

Current question: {QUESTION}
```

**If `CONTINUE_MODE` is false:** `FULL_INSTRUCTION = QUESTION` (no history prefix).

**If history file doesn't exist and `--continue` was used:** Warn "No prior conversation with {agent} found — sending as new question." and proceed with `FULL_INSTRUCTION = QUESTION`.

## Step 2: Delegate (sync)

**Important**: Send `FULL_INSTRUCTION` as-is — do NOT prepend `[Asked by ...]`. The server injects the caller identity prefix automatically (server.py line 626).

```bash
RESULT=$(curl -s -X POST "http://localhost:8086/api/agents/${MY_ID}/delegate" \
  -H 'Content-Type: application/json' \
  -d "{
    \"to_agent\": \"${TARGET_AGENT}\",
    \"instruction\": \"${FULL_INSTRUCTION}\",
    \"mode\": \"sync\",
    \"timeout_sec\": 180
  }")
```

## Step 3: Extract and Present

Parse the delegation result. Strip terminal artifacts (❯, ────, bypass permissions, thinking indicators, token counts, prp- skill listings).

Present cleanly:

```
💬 {agent_name} says:

{clean response}
```

If delegation failed (timeout, error) → tell the user what happened and suggest `/talk-to` as fallback.

## Step 3b: Save to History (for multi-turn)

After a **successful** delegation, append this turn to the history file:

```bash
HISTORY_FILE="/tmp/ask-history-${MY_ID}-${TARGET_AGENT}.json"
```

Read existing history (or start with `[]`), append `{"q": "${QUESTION}", "a": "${CLEAN_RESPONSE}"}`, write back. Keep max 10 turns (drop oldest if exceeded). This enables future `--continue` calls.

On a **new conversation** (no `--continue` flag and history file exists from a different topic): overwrite the history with just the current turn. The heuristic: if the last turn in history is older than 1 hour, treat this as a new conversation and reset.

## Step 4: No Archive, No Publish

`/ask` is lightweight — no markdown archive, no GitHub Discussion, no Telegram notification. It's a quick question, not a brainstorm session. The answer lives in the conversation context only.

If the answer is important enough to save → the agent should use `arra_learn` or `write_memory` after receiving it (normal proactive memory rules apply).

## Difference from /brainstorm and /talk-to

| | /ask | /ask --continue | /brainstorm | /talk-to |
|---|---|---|---|---|
| **Speed** | 10-30s | 10-30s per turn | 1-3 min | Async (next session) |
| **Agents** | 1 | 1 | 1-5 | 1 |
| **Rounds** | 1 (single Q&A) | Multi-turn (up to 10) | 2-5 (refinement loop) | Multi-turn thread |
| **Output** | Inline answer | Inline (with context) | Archive + Discussion + Telegram | Oracle thread |
| **Use when** | Need info now | Follow-up on previous answer | Need ideas from multiple perspectives | Leave message for later |
