---
installer: psak-manual
origin: PSak + Human collaborative design — real-time agent-to-agent query via delegation API
name: ask
description: 'Ask another agent a question and get an answer in real-time. Uses Agent Pool delegation API (sync mode). Auto-selects the right agent if not specified. Use when you need information, opinions, or validation from another agent NOW — not async threads.'
argument-hint: '[agent] "question"'
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
- **Question needs multi-round refinement** → use `/brainstorm` instead
- **Question is for the human** → just ask in the conversation, don't delegate

## Step 0: Parse Arguments

```
/ask dora "question here"     → agent=dora, question="question here"
/ask "question here"          → agent=auto-select, question="question here"
/ask trading market overview  → agent=trading, question="market overview"
```

Extract:
- `TARGET_AGENT`: first word if it matches a known agent ID, otherwise auto-select
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

## Step 2: Delegate (sync)

```bash
RESULT=$(curl -s -X POST "http://localhost:8086/api/agents/${MY_ID}/delegate" \
  -H 'Content-Type: application/json' \
  -d "{
    \"to_agent\": \"${TARGET_AGENT}\",
    \"instruction\": \"${QUESTION}\",
    \"mode\": \"sync\",
    \"timeout_sec\": 120
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

## Step 4: No Archive, No Publish

`/ask` is lightweight — no markdown archive, no GitHub Discussion, no Telegram notification. It's a quick question, not a brainstorm session. The answer lives in the conversation context only.

If the answer is important enough to save → the agent should use `arra_learn` or `write_memory` after receiving it (normal proactive memory rules apply).

## Difference from /brainstorm and /talk-to

| | /ask | /brainstorm | /talk-to |
|---|---|---|---|
| **Speed** | 10-30s | 1-3 min | Async (next session) |
| **Agents** | 1 | 1-5 | 1 |
| **Rounds** | 1 (single Q&A) | 2-5 (refinement loop) | Multi-turn thread |
| **Output** | Inline answer | Archive + Discussion + Telegram | Oracle thread |
| **Use when** | Need info now | Need ideas refined | Leave message for later |
