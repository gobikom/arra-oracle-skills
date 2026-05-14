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
| Long-running task (QA, review, investigation) | `/delegate-qa` (async, no timeout) |

## Step 0: Parse Arguments

Same as `/ask`:
- `TARGET_AGENT`: first word if it matches a known agent ID, otherwise auto-select
- `QUESTION`: everything else (with or without quotes)

Known agent IDs: `dora`, `devops`, `psak`, `trading`, `reviewer`, `dev`, `devlead`, `trex`, `finn`, `lex`, `mako`, `sol`, `merger`

## Step 1: Validate

### 1a. Don't ping yourself
If TARGET_AGENT == your own agent ID → just answer directly.

### 1b. Check agent is idle + online, detect platform

```bash
# Single API call: get state + detect platform from agent YAML
STATE=$(curl -s http://localhost:8086/api/agents | python3 -c "
import sys, json
for a in json.load(sys.stdin):
    if a['id'] == '${TARGET_AGENT}':
        print(a['pool_status']['state'])
")

# Detect platform (pool API doesn't expose this yet — read from YAML)
PLATFORM=$(python3 -c "
import yaml, os
p = os.path.expanduser('~/repos/agents/soul-orchestra/agents/${TARGET_AGENT}.yaml')
try:
    with open(p) as f:
        d = yaml.safe_load(f)
    print(d.get('preferred_platform', 'claude_code'))
except FileNotFoundError:
    print('claude_code')
" 2>/dev/null || echo "claude_code")
```

**Only proceed if STATE is `idle` or `active`.** All other states are blocked:

| State | Action |
|-------|--------|
| `idle` | Proceed — agent is online and waiting |
| `active` | Proceed — agent is online, not in a task |
| `off` | "{agent} is offline. Use `/talk-to` instead." |
| `busy` | "{agent} is busy (mid-task). Use `/ask` to queue your question instead." |
| `interactive` | "{agent} is in interactive mode (human using terminal). Use `/ask` to queue instead." |
| other/empty | "{agent} status unknown. Use `/ask` as fallback." |

Direct tmux injection requires the agent to be online and not in a task or interactive session.

### 1c. Resolve tmux target

Read `tmux_session` from agent YAML first, then try naming patterns as fallback:

```bash
# Try YAML-defined session name first
TMUX_TARGET=$(python3 -c "
import yaml, os
p = os.path.expanduser('~/repos/agents/soul-orchestra/agents/${TARGET_AGENT}.yaml')
try:
    with open(p) as f:
        d = yaml.safe_load(f)
    print(d.get('tmux_session', '${TARGET_AGENT}'))
except FileNotFoundError:
    print('${TARGET_AGENT}')
" 2>/dev/null || echo "${TARGET_AGENT}")

# Verify session exists, try fallback patterns if not
if ! tmux has-session -t "$TMUX_TARGET" 2>/dev/null; then
  for CANDIDATE in "${TARGET_AGENT}" "ttyd-${TARGET_AGENT}"; do
    if tmux has-session -t "$CANDIDATE" 2>/dev/null; then
      TMUX_TARGET="$CANDIDATE"
      break
    fi
  done
fi
```

If no tmux session found → fall back to `/ask` and tell the user: "No tmux session for {agent} — falling back to /ask."

## Step 2: Capture Baseline + Send + Poll

Run this as a single bash script. The polling loop uses **platform-aware idle and busy detection** so it works with both Claude Code and Codex CLI agents.

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
  
  TAIL_5=$(echo "$PANE" | tail -5)
  
  # --- Platform-aware busy detection ---
  if [ "$PLATFORM" = "codex" ]; then
    # Codex busy: spinner characters or active output indicators
    if echo "$TAIL_5" | grep -qE '⠋|⠙|⠹|⠸|Thinking|Running'; then continue; fi
  else
    # Claude Code busy: ⎿ Running… or tool execution indicators
    if echo "$TAIL_5" | grep -qE '⎿\s*Running|● '; then continue; fi
  fi
  
  # --- Platform-aware idle detection ---
  IDLE_DETECTED=false
  if [ "$PLATFORM" = "codex" ]; then
    # Codex idle: line starts with › AND a nearby line has model · path status bar
    if echo "$TAIL_5" | grep -qE '^› ' && \
       echo "$TAIL_5" | grep -qE '^\s+(gpt-|o[0-9]|claude-).*·'; then
      IDLE_DETECTED=true
    fi
  else
    # Claude Code idle: ❯ on its own line near bottom
    if echo "$TAIL_5" | grep -qE '^[❯>]\s*$'; then
      IDLE_DETECTED=true
    fi
  fi
  
  if [ "$IDLE_DETECTED" = "true" ]; then
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

## Step 5: Extract Response (platform-aware)

Take the pane output and strip platform-specific artifacts:

**Claude Code** — strip:
- Lines that match the original question (input echo)
- Prompt lines (`❯`)
- Horizontal rules (`────`)
- Permission/bypass lines
- Token/cost indicators
- Skill listing noise

**Codex CLI** — strip:
- Lines that match the original question (input echo)
- Prompt lines (`›` + placeholder hint)
- Status bar lines (model · directory)
- Box drawing characters (`╭`, `╰`, `│`)
- Spinner characters (`⠋`, `⠙`, `⠹`, `⠸`)
- Warning lines (`⚠ MCP ...`)

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

## Difference from /ask and /delegate-qa

| | /ping | /ask | /ask --continue | /delegate-qa |
|---|---|---|---|---|
| **Speed** | ~5-10s | ~30-40s | ~30-40s per turn | ~0s (async) |
| **Path** | Direct tmux | Sync task queue | Sync task queue | Async task queue |
| **Audit** | None | Full (audit DB) | Full | Task queue + issue |
| **Agent state** | Must be idle/active | Any (queued) | Any (queued) | Any (queued) |
| **Platforms** | Claude Code + Codex | Claude Code + Codex | Claude Code + Codex | Claude Code + Codex |
| **History** | None | Saved to file | Multi-turn context | Issue comment |
| **Conflict risk** | Yes (if agent gets busy) | None (queued) | None | None |
| **Timeout risk** | 30s hard | 120-180s | 120-180s | None (async) |
| **Use when** | Quick check, agent is idle | Important Q&A, tracking needed | Follow-up conversation | Long QA/review (>2 min) |
