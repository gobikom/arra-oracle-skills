---
installer: psak-manual
origin: PSak — fast direct-tmux agent query, bypasses task queue for low-latency Q&A
name: ping
description: 'Fast agent query via direct tmux (~5-10s). No audit trail. Use for quick checks, yes/no answers, and one-liners where /ask (30-40s) is too slow.'
argument-hint: '[agent] "question"'
trigger: /ping
---

# /ping — Fast Direct Agent Query

Ask another agent a quick question via direct tmux injection. Bypasses the task queue for ~5-10s response time (vs /ask's ~30-40s).

**Trade-off**: No task audit trail. Use `/ask` for important questions that need tracking.

## Usage

```
/ping dora "is the content schedule on track?"
/ping devops "is nginx healthy?"
/ping trading "S50 up or down today?"
/ping "quick sanity check — does this make sense?"  → auto-selects agent
```

## When to use /ping vs /ask

| Scenario | Use |
|----------|-----|
| Quick yes/no or status check | `/ping` |
| One-liner factual response | `/ping` |
| Need audit trail (production decisions) | `/ask` |
| Multi-turn follow-up | `/ask --continue` |
| Agent might need to search/research (>30s) | `/ask` |
| Agent is busy (mid-task) | `/ask` (queue it) |

## Step 0: Parse Arguments

Same as `/ask`:
- `TARGET_AGENT`: first word if it matches a known agent ID, otherwise auto-select
- `QUESTION`: everything else (with or without quotes)

Known agent IDs: `dora`, `devops`, `psak`, `trading`, `reviewer`, `dev`, `devlead`, `trex`, `finn`, `lex`, `mako`, `sol`, `merger`

## Step 1: Validate

### 1a. Don't ping yourself
If TARGET_AGENT == your own agent ID → just answer directly.

### 1b. Check agent is idle

```bash
STATE=$(curl -s http://localhost:8086/api/agents | python3 -c "
import sys, json
for a in json.load(sys.stdin):
    if a['id'] == '${TARGET_AGENT}':
        print(a['pool_status']['state'])
")
```

- If `off` → "{agent} is offline. Use `/talk-to` instead."
- If `busy` → "⚠️ {agent} is busy (mid-task). Use `/ask` to queue your question instead — /ping might conflict."

Only proceed with `/ping` if state is `idle`.

### 1c. Resolve tmux target

Try multiple naming patterns (agents use different tmux session names):

```bash
for CANDIDATE in "${TARGET_AGENT}" "ttyd-${TARGET_AGENT}"; do
  if tmux has-session -t "$CANDIDATE" 2>/dev/null; then
    TMUX_TARGET="$CANDIDATE"
    break
  fi
done
```

If no tmux session found → fall back to `/ask` and tell the user: "No tmux session for {agent} — falling back to /ask."

## Step 2: Capture Baseline + Send + Poll

Run this as a single bash script:

```bash
# Capture baseline BEFORE sending
BASELINE=$(tmux capture-pane -t "$TMUX_TARGET" -p -S -50)

# Send the question (flatten newlines)
SAFE_QUESTION=$(echo "$QUESTION" | tr '\n' ' ')
tmux send-keys -l -t "$TMUX_TARGET" "$SAFE_QUESTION"
tmux send-keys -t "$TMUX_TARGET" Enter

# Poll for completion (1s intervals, max 30s)
RESPONSE=""
for i in $(seq 1 30); do
  sleep 1
  PANE=$(tmux capture-pane -t "$TMUX_TARGET" -p -S -50)
  
  # Must see change from baseline (agent received input)
  if [ "$PANE" = "$BASELINE" ]; then continue; fi
  
  # Detection: look for EMPTY prompt ❯ at the very bottom (after separator)
  # The input echo also shows ❯, so we need the FINAL one (idle prompt)
  LAST_3=$(echo "$PANE" | tail -3)
  
  # Skip if still busy (Running…/⎿ indicators)
  if echo "$LAST_3" | grep -qE '⎿\s*Running|● '; then continue; fi
  
  # Check for idle prompt: ❯ on its own line near bottom
  if echo "$LAST_3" | grep -qE '^[❯>]\s*$'; then
    # Extra stability: wait 1 more second and re-check
    sleep 1
    PANE2=$(tmux capture-pane -t "$TMUX_TARGET" -p -S -50)
    if [ "$PANE" = "$PANE2" ]; then
      RESPONSE="$PANE"
      break
    fi
    PANE="$PANE2"  # Update for next iteration
  fi
done
```

**Important**: Do NOT prepend `[Asked by ...]` — this is direct tmux injection, not going through the server delegation endpoint.

If 30s reached without completion → report timeout and suggest `/ask`.

## Step 5: Extract Response

Take the pane output, strip:
- Lines that match the original question (input echo)
- Prompt lines (`❯`)
- Horizontal rules (`────`)
- Permission/bypass lines
- Token/cost indicators
- Skill listing noise

Present cleanly:

```
⚡ {agent_name} says:

{clean response}
```

Note: use ⚡ (not 💬) to visually distinguish from `/ask` responses.

## Step 6: No History, No Audit

`/ping` is fire-and-forget:
- No conversation history file (unlike `/ask --continue`)
- No delegation audit DB entry
- No task queue record
- Response lives only in current conversation context

If the answer is important → save via `arra_learn` or `write_memory` as usual.

## Failure Modes

| Failure | Action |
|---------|--------|
| Agent offline | Tell user, suggest `/talk-to` |
| Agent busy | Tell user, suggest `/ask` (queued) |
| No tmux session | Fall back to `/ask` |
| 30s timeout | Report, suggest `/ask` |
| tmux send-keys fails | Report error, suggest `/ask` |

## Difference from /ask

| | /ping | /ask | /ask --continue |
|---|---|---|---|
| **Speed** | ~5-10s | ~30-40s | ~30-40s per turn |
| **Path** | Direct tmux | Task queue | Task queue |
| **Audit** | None | Full (audit DB) | Full |
| **Agent state** | Must be idle | Any (queued) | Any (queued) |
| **History** | None | Saved to file | Multi-turn context |
| **Conflict risk** | Yes (if agent gets busy) | None (queued) | None |
| **Use when** | Quick check, agent is idle | Important Q&A, tracking needed | Follow-up conversation |
