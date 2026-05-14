---
installer: psak-manual
origin: PSak — async QA delegation with issue-based completion tracking (agent-devops#137)
name: delegate-qa
description: 'Delegate QA verification to another agent (async). Uses issue as completion artifact — no sync timeout. Use for long-running QA, review, or investigation tasks where /ask would time out.'
argument-hint: '<agent> --issue <N> --repo <owner/repo> --project-dir <path> [--criteria "..."]'
trigger: /delegate-qa
---

# /delegate-qa — Async QA Delegation

Delegate a QA verification task to another agent using async delegation. The GitHub issue becomes the completion artifact — no sync timeout, no false "failed" status.

**Why this exists**: Sync `/ask` times out at 120-180s. QA tasks take 3-10 minutes. The parent sees "failed" even though the child agent completes successfully. This skill uses async delegation so the caller returns immediately and the child posts results to the issue.

## Usage

```
/delegate-qa vera --issue 231 --repo gobikom/clienta.ai --project-dir ~/repos/automation/clienta.ai
/delegate-qa vera --issue 137 --repo gobikom/agent-devops --project-dir ~/repos/agents/agent-devops
/delegate-qa vera --issue 42 --repo gobikom/sniper-s50 --project-dir ~/repos/trading/sniper-s50 --criteria "verify the stop-loss triggers at -2%"
```

## When to use /delegate-qa vs /ask vs /ping

| Scenario | Use |
|----------|-----|
| Quick yes/no or status check (~5-10s) | `/ping` |
| Important Q&A with audit trail (~30-40s) | `/ask` |
| Long-running QA, review, or investigation (>2 min) | `/delegate-qa` |
| Multi-turn follow-up with one agent | `/ask --continue` |
| Multiple perspectives, ideation | `/brainstorm` |
| Leave a message for offline agent | `/talk-to` |

## Step 0: Parse Arguments

```
/delegate-qa vera --issue 231 --repo gobikom/clienta.ai --project-dir ~/repos/...
/delegate-qa vera --issue 231 --repo gobikom/clienta.ai --project-dir ~/repos/... --criteria "check login flow"
```

Extract:
- `TARGET_AGENT`: first word (required — typically `vera`)
- `--issue N`: GitHub issue number (required)
- `--repo owner/repo`: GitHub repository (required)
- `--project-dir DIR`: working directory for target agent (required)
- `--criteria "..."`: optional inline acceptance criteria override

**Validation**: all four required parameters must be present. If any missing:
```
Error: Missing required parameter.
Usage: /delegate-qa <agent> --issue <N> --repo <owner/repo> --project-dir <path>
```

## Step 1: Validate

### 1a. Don't delegate to yourself
If TARGET_AGENT == your own agent ID, run QA directly instead of delegating.

### 1b. Pool health check

```bash
STATE=$(curl -s http://localhost:8086/api/agents | python3 -c "
import sys, json
for a in json.load(sys.stdin):
    if a['id'] == '${TARGET_AGENT}':
        print(a['pool_status']['state'])
")
```

- If `off` → "{agent} is offline. Use `/talk-to {agent}` to leave the QA request as an async message."
- If any other state → proceed (task will queue if agent is busy)

### 1c. Verify issue exists

```bash
gh issue view ${ISSUE_NUMBER} -R ${REPO} --json number,title,state --jq '.number' 2>/dev/null
```

If issue not found → "Issue #${ISSUE_NUMBER} not found in ${REPO}. Create the issue first."

### 1d. Verify project directory exists

```bash
test -d "${PROJECT_DIR}"
```

If not found → "Project directory not found: ${PROJECT_DIR}"

## Step 2: Build Instruction

Assemble the instruction for the target agent. Do NOT prepend `[Asked by ...]` — the delegation server injects that automatically.

```
QA VERIFICATION REQUEST

Issue: ${REPO}#${ISSUE_NUMBER}
Project: ${PROJECT_DIR}
${CRITERIA_LINE}

INSTRUCTIONS:
1. cd ${PROJECT_DIR}
2. Read the issue: gh issue view ${ISSUE_NUMBER} -R ${REPO} --json title,body
3. Extract acceptance criteria from the issue body
4. Run QA verification: /prp-core:prp-qa <detected-url> --issue ${ISSUE_NUMBER}
5. Post QA results as a comment on the issue:
   gh issue comment ${ISSUE_NUMBER} -R ${REPO} --body "<QA verdict + summary>"
6. Save result: arra_learn content='[qa-task] QA ${REPO}#${ISSUE_NUMBER}: <PASSED/FAILED>'
   category='qa' project='agent:${TARGET_AGENT}'
7. Call session_handoff when done

The issue is your source of truth. Post all findings there.
```

Where `CRITERIA_LINE` is either:
- `Criteria override: ${CRITERIA}` (if `--criteria` was provided)
- Empty (if not — agent reads criteria from issue body)

## Step 3: Delegate (async)

```bash
RESULT=$(curl -s -X POST "http://localhost:8086/api/agents/${MY_ID}/delegate" \
  -H 'Content-Type: application/json' \
  -d "{
    \"to_agent\": \"${TARGET_AGENT}\",
    \"instruction\": $(echo "$INSTRUCTION" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))"),
    \"mode\": \"async\",
    \"timeout_sec\": 600
  }")
```

Extract task_id:
```bash
TASK_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('task_id',''))")
```

If delegation failed (no task_id, or HTTP error):
```
Error: Failed to delegate QA task to {agent}.
{error details}
Fallback: run QA manually with /prp-core:prp-qa in the target project.
```

## Step 4: Report to Caller

On success, print:

```
QA delegated to {agent} (async)

Task ID : {task_id}
Issue   : {repo}#{issue} — completion tracked here
Agent   : {agent} will post QA results directly on the issue

Status check:
  curl -s http://localhost:8086/api/agents/{agent}/tasks/{task_id} | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['status'])"

Do NOT wait for sync completion — check the issue for updates.
```

Then return immediately. The caller continues their work.

## Step 5: No Wait, No Archive

`/delegate-qa` is fire-and-forget:
- No blocking wait for completion
- No conversation history (unlike `/ask --continue`)
- No markdown archive (unlike `/brainstorm`)
- Task status tracked in pool task queue (queryable via API)
- Completion signal = issue comment from target agent

If the result is needed for a decision, check the issue or poll the task status API.

## Failure Modes

| Failure | Action |
|---------|--------|
| Agent offline | Tell user, suggest `/talk-to` |
| Issue not found | Tell user to create issue first |
| Project dir missing | Tell user to check path |
| Delegation API error | Report error, suggest manual `/prp-core:prp-qa` |
| Pool server unreachable | Report error, suggest manual QA |

## Comparison with Other Delegation Tools

| | /ping | /ask | /ask --continue | /delegate-qa | /brainstorm | /talk-to |
|---|---|---|---|---|---|---|
| **Speed** | ~5-10s | ~30-40s | ~30-40s/turn | ~0s (async) | 1-3 min | Async |
| **Path** | Direct tmux | Sync task queue | Sync task queue | Async task queue | Sync multi-agent | Oracle thread |
| **Audit** | None | Full | Full | Task queue + issue | Archive + Discussion | Thread |
| **Timeout risk** | 30s hard | 120-180s | 120-180s | None (async) | Per-round | None |
| **Completion signal** | Inline | Sync return | Sync return | Issue comment | Archive | Thread reply |
| **Use when** | Quick check | Important Q&A | Follow-up | Long QA/review | Multi-perspective | Offline agent |
