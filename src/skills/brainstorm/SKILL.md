---
installer: psak-manual
origin: PSak + Human collaborative design — multi-agent brainstorm via delegation API
name: brainstorm
description: 'Multi-agent brainstorm with refinement loop. Agents brainstorm, critique, and refine ideas together via delegation API. Supports 3 patterns: fan-out, round-robin, creative-critic. Live Telegram updates + markdown archive + GitHub Discussion as live thread (--publish).'
argument-hint: '"topic" [--agents psak,dora] [--rounds 2] [--pattern fan-out|round-robin|creative-critic] [--project name] [--publish]'
trigger: /brainstorm
---

# /brainstorm — Multi-Agent Brainstorm with Refinement Loop

Orchestrate a brainstorm session across multiple agents via the Agent Pool delegation API.

## Usage

```
/brainstorm "topic"
/brainstorm "topic" --agents psak,dora,trading --rounds 3
/brainstorm "topic" --pattern creative-critic --rounds 4
/brainstorm "topic" --agents dora --publish --project sniper-s50
```

## Defaults

| Param | Default | Options |
|-------|---------|---------|
| `--agents` | `psak,dora` | Any pool agents: psak, dora, trading, devops, merger |
| `--rounds` | `2` | 1-5 |
| `--pattern` | `fan-out` | `fan-out`, `round-robin`, `creative-critic` |
| `--publish` | off | Flag — create GitHub Discussion thread with per-round comments |
| `--project` | (none) | Label for Discussion post (e.g., `sniper-s50`) |

## Constants

```
POOL_API=http://localhost:8086
REPO_ID=R_kgDORyOM0g
CATEGORY_ID=DIC_kwDORyOM0s4C7w8w
```

## Auto-Invocation Guide

When an agent considers using /brainstorm autonomously (without human asking), use these tables:

### When to brainstorm (vs just decide alone)

| Situation | Brainstorm? | Why |
|-----------|-------------|-----|
| Naming, taglines, copy | Yes | Creative choices benefit from diverse styles |
| Architecture decision with trade-offs | Yes (fan-out) | Multiple specialist angles reveal blind spots |
| Content strategy or calendar | Yes | Creative + data + ops perspectives compound |
| Bug fix or clear implementation | **No** | Already know the answer — just do it |
| User asked a question | **No** | Answer directly — don't over-engineer |
| Choosing between 2+ valid approaches | Yes (fan-out, 1 round) | Quick perspective check |

### Agent Selection (by topic)

| Topic domain | Primary | Secondary | Skip |
|-------------|---------|-----------|------|
| Content, copy, naming, branding | dora | trading (data angle) | devops |
| Architecture, system design | devops | trading | — |
| Market, pricing, business strategy | trading | dora (storytelling) | devops |
| Infrastructure, ops, reliability | devops | — | dora |
| Code design, API surface | reviewer | devops | dora |
| Cross-cutting (needs all views) | dora + trading + devops | — | — |

### Pattern Selection (by need)

| What you need | Pattern | Rounds | Why |
|--------------|---------|--------|-----|
| Many viewpoints fast | fan-out | 1-2 | Parallel → synthesize |
| Iterative refinement from different angles | round-robin | 2-3 | Each agent builds on previous |
| Polished creative output (copy, pitch) | creative-critic | 3-4 | Create → critique → revise loop |
| Quick validation ("is this good?") | fan-out | 1 | One-shot diverse check |
| Don't know what you need | fan-out | 2 | Safe default |

### Defaults when auto-invoking

If the agent decides to brainstorm autonomously without human specifying params:
- `--rounds 2` (don't burn budget on more unless topic is complex)
- `--pattern fan-out` (safest default)
- `--agents` based on topic table above (2 agents max for auto-invocation)
- Do NOT `--publish` unless the output will be referenced later

## Step 0: Parse Arguments

Parse the user's input. Extract:
- `TOPIC`: the quoted string (required)
- `AGENTS`: comma-separated list → split into array
- `ROUNDS`: integer 1-5
- `PATTERN`: one of fan-out, round-robin, creative-critic
- `PUBLISH`: boolean flag
- `PROJECT`: optional project label

The agent running this skill is the **coordinator**. Remove the coordinator's own ID from the AGENTS list — the coordinator orchestrates but does not brainstorm with itself via delegation.

If only one agent remains after removing the coordinator, that's fine — creative-critic pattern works with 1 creative agent.

## Step 1: Pool Health Check

```bash
curl -s http://localhost:8086/api/agents | python3 -c "
import sys, json
for a in json.load(sys.stdin):
    ps = a.get('pool_status', {})
    print(f\"{a['id']}: {ps.get('state','unknown')}\")"
```

If any target agent is `off`, warn the user and suggest removing that agent.

## Step 2: Initialize Session

### 2a. Archive file

```bash
TIMESTAMP=$(date '+%Y-%m-%d_%H%M')
SAFE_TOPIC=$(echo "$TOPIC" | tr ' ' '-' | tr -cd 'a-zA-Z0-9-_' | head -c 50)
ARCHIVE_DIR="$HOME/repos/agents/agent-psak/ψ/outbox/brainstorms"
mkdir -p "$ARCHIVE_DIR"
ARCHIVE_FILE="$ARCHIVE_DIR/${TIMESTAMP}_${SAFE_TOPIC}.md"
```

Write header:

```markdown
# Brainstorm: {TOPIC}

**Date:** {YYYY-MM-DD HH:MM}
**Pattern:** {PATTERN} | **Agents:** {AGENTS} | **Rounds:** {ROUNDS}
**Coordinator:** {your agent ID}

---
```

### 2b. GitHub Discussion — create initial post (if --publish)

Create the Discussion as the **opening post** with the brainstorm setup. Each round will be added as a **comment** on this thread.

```bash
SETUP_BODY="# Brainstorm: ${TOPIC}

**Pattern:** ${PATTERN} | **Agents:** ${AGENTS} | **Rounds:** ${ROUNDS}
**Coordinator:** PSak
${PROJECT:+**Project:** ${PROJECT}}

---

_Brainstorm in progress — each round will appear as a comment below._"

DISC_RESULT=$(gh api graphql \
  -f query='mutation($repoId:ID!, $catId:ID!, $title:String!, $body:String!) {
    createDiscussion(input: {repositoryId:$repoId, categoryId:$catId, title:$title, body:$body}) {
      discussion { id url number }
    }
  }' \
  -f repoId="R_kgDORyOM0g" \
  -f catId="DIC_kwDORyOM0s4C7w8w" \
  -f title="Brainstorm: ${TOPIC}" \
  -f body="$SETUP_BODY")
```

Extract `DISCUSSION_ID` (the node ID, e.g. `D_kwDO...`) and `DISCUSSION_URL` from the result. You need `DISCUSSION_ID` to add comments.

### 2c. Telegram start notification

```bash
source ~/.secrets/telegram-bots.env
source ~/.secrets/shared.env
curl -s "https://api.telegram.org/bot${TK_PSAK_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  --data-urlencode "text=🧠 Brainstorm starting: ${TOPIC}
Pattern: ${PATTERN} | Rounds: ${ROUNDS} | Agents: ${AGENTS}
${DISCUSSION_URL:+🔗 ${DISCUSSION_URL}}" \
  -d "parse_mode=" > /dev/null 2>&1
```

## Step 3: Execute Pattern

### Pattern A: Fan-Out → Synthesize

Each round has 2 phases:

**Phase 1 — Fan-out:** Delegate to ALL agents in parallel (async mode, then poll):

```bash
for AGENT in ${AGENTS[@]}; do
  curl -s -X POST "http://localhost:8086/api/agents/${MY_ID}/delegate" \
    -H 'Content-Type: application/json' \
    -d "{\"to_agent\":\"$AGENT\",\"instruction\":\"$PROMPT\",\"mode\":\"async\",\"timeout_sec\":120}"
done
```

Poll each task until all complete.

**Phase 2 — Synthesize:** Coordinator reads all responses, identifies themes, strongest ideas. Write synthesis → input for next round.

**Round 2+:** Prompt includes previous synthesis + refinement feedback.

**Final round:** Coordinator synthesizes final output with best ideas.

### Pattern B: Round-Robin Refine

Each round passes output to the NEXT agent:

```
Round 1: Agent A brainstorms → output_1
Round 2: Agent B receives output_1 + "build on this, add your perspective" → output_2
Round 3: Agent C receives output_2 + "refine and challenge weak points" → output_3
Final: Coordinator synthesizes
```

Use sync delegation (sequential):

```bash
curl -s -X POST "http://localhost:8086/api/agents/${MY_ID}/delegate" \
  -H 'Content-Type: application/json' \
  -d "{\"to_agent\":\"$CURRENT_AGENT\",\"instruction\":\"Previous round:\\n$PREV_OUTPUT\\n\\nYour turn: build on these ideas, add your unique perspective, challenge weak points.\",\"mode\":\"sync\",\"timeout_sec\":180}"
```

### Pattern C: Creative-Critic

Two roles alternate: **Creative** (first agent in list) and **Critic** (coordinator).

```
Round 1: Creative generates ideas         → delegate (sync)
Round 2: Critic reviews + gives feedback  → coordinator writes directly (no delegation)
Round 3: Creative revises based on feedback → delegate (sync)
Round 4: Critic picks winner + polishes   → coordinator writes directly
...repeat until ROUNDS exhausted
```

Odd rounds → delegate to Creative. Even rounds → coordinator writes critique directly.

## Step 4: After Each Round

After EVERY round, do ALL of the following:

### 4a. Append to Archive

```markdown
## Round {N}/{TOTAL} — {agent_name} ({role/phase})

{agent's cleaned response}

### Coordinator Notes
{synthesis / feedback / decisions for next round}

---
```

### 4b. Comment on GitHub Discussion (if --publish)

Post the round's content as a **comment** on the Discussion thread:

```bash
COMMENT_BODY="## Round ${N}/${TOTAL} — ${AGENT_NAME} (${ROLE})

${AGENT_RESPONSE}

---
_Coordinator (PSak): ${COORDINATOR_NOTES}_"

gh api graphql \
  -f query='mutation($discussionId:ID!, $body:String!) {
    addDiscussionComment(input: {discussionId:$discussionId, body:$body}) {
      comment { id url }
    }
  }' \
  -f discussionId="$DISCUSSION_ID" \
  -f body="$COMMENT_BODY"
```

**Pattern-specific comment formats:**

**Fan-out:** When multiple agents respond in the same round, combine into one comment:
```markdown
## Round {N}/{TOTAL} — Fan-out responses

### {Agent A}
{response A}

### {Agent B}
{response B}

---
_Coordinator synthesis: {themes, strongest ideas, feedback for next round}_
```

**Round-robin:** One comment per round, one agent:
```markdown
## Round {N}/{TOTAL} — {Agent} (builds on {Previous Agent})

{response}

---
_Coordinator: {brief note on what was added/changed}_
```

**Creative-critic:** Odd rounds (Creative) and even rounds (Critic) each get a comment:
```markdown
## Round {N}/{TOTAL} — {Agent} (Creative)
{ideas}

## Round {N}/{TOTAL} — PSak (Critic)
{feedback}
```

### 4c. Telegram Live Update

```bash
source ~/.secrets/telegram-bots.env
source ~/.secrets/shared.env
curl -s "https://api.telegram.org/bot${TK_PSAK_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  --data-urlencode "text=🔄 Brainstorm Round ${N}/${TOTAL} — ${AGENT_NAME}

${BRIEF_SUMMARY}

⏳ Next: ${NEXT_STEP}" \
  -d "parse_mode=" > /dev/null 2>&1
```

Keep brief (3-5 lines). If curl fails, skip silently.

## Step 5: Final Output

### 5a. Write Final Section to Archive

```markdown
## Final Output

{The polished final result}

## Session Stats
- **Rounds:** {N}
- **Agents:** {list}
- **Pattern:** {PATTERN}
```

### 5b. Update Discussion opening post (if --publish)

Replace the "in progress" body of the opening post with the final archive content:

```bash
FINAL_BODY=$(cat "$ARCHIVE_FILE")
gh api graphql \
  -f query='mutation($discussionId:ID!, $body:String!) {
    updateDiscussion(input: {discussionId:$discussionId, body:$body}) {
      discussion { url }
    }
  }' \
  -f discussionId="$DISCUSSION_ID" \
  -f body="$FINAL_BODY"
```

Then post a final comment with the winner:

```bash
gh api graphql \
  -f query='mutation($discussionId:ID!, $body:String!) {
    addDiscussionComment(input: {discussionId:$discussionId, body:$body}) {
      comment { id }
    }
  }' \
  -f discussionId="$DISCUSSION_ID" \
  -f body="## 🏆 Final Output

${FINAL_OUTPUT}

---
_Brainstorm complete. ${ROUNDS} rounds, ${AGENTS} agents, pattern: ${PATTERN}._"
```

### 5c. Console Output

```
============================================
  Brainstorm Complete: {TOPIC}
  Pattern: {PATTERN} | Rounds: {N} | Agents: {list}
============================================

{Final output}

Archive: {ARCHIVE_FILE}
Discussion: {DISCUSSION_URL}
============================================
```

### 5d. Telegram Final

```bash
source ~/.secrets/telegram-bots.env
source ~/.secrets/shared.env
curl -s "https://api.telegram.org/bot${TK_PSAK_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  --data-urlencode "text=✅ Brainstorm Complete: ${TOPIC}
Pattern: ${PATTERN} | ${ROUNDS} rounds | ${AGENTS}

🏆 ${FINAL_SUMMARY}

📁 Archive saved${DISCUSSION_URL:+
🔗 ${DISCUSSION_URL}}" \
  -d "parse_mode=" > /dev/null 2>&1
```

## Hard Rules

1. **Never skip the archive** — write every round before proceeding. Archive is source of truth.
2. **Respect timeouts** — log "(timeout — no response)" in archive and continue.
3. **Coordinator doesn't delegate to itself** — remove self from agents list.
4. **Extract clean responses** — strip terminal artifacts (❯, ────, bypass permissions, thinking indicators, token counts, prp- skill listings). Only actual text.
5. **Round budget** — max 5 rounds. Cap with a note if user asks for more.
6. **Discussion comments are per-round** — never dump the full archive as a single comment. Each round = one comment on the thread. Opening post = setup, final comment = winner.
7. **Discussion failure is non-fatal** — if GraphQL call fails, log warning and continue. Archive + Telegram are sufficient.

## Examples

```
/brainstorm "name for our AI agent dashboard"
→ fan-out to psak+dora, 2 rounds, archive only

/brainstorm "weekly content calendar" --agents dora,trading,psak --rounds 3 --pattern round-robin --publish
→ Discussion created → dora comment → trading comment → devops comment → final comment

/brainstorm "landing page copy" --agents dora --pattern creative-critic --rounds 4 --publish --project soul-orchestra
→ Discussion created → dora creates (comment) → psak critiques (comment) → dora revises (comment) → psak polishes (comment) → final

/brainstorm "Q2 trading strategy" --agents trading,psak --rounds 2 --publish --project sniper-s50
→ fan-out: Discussion → all agents comment → synthesis comment → refinement round → final
```
