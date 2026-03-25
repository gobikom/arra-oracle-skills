---
name: xray
description: X-ray scan of agent internals — memory, skills, sessions. Use when user says "xray", "x-ray", "scan memory", "what do you remember", "show skills", "session history", "memory stats", or wants to inspect agent state. Do NOT trigger for Oracle vault/psi (use /trace), session handoffs (use /inbox).
argument-hint: "[memory|skills|sessions]"
---

# /xray - Agent X-Ray Scanner

Deep scan of agent internals. Parse the first argument as target:

```
/xray                     # Default: memory scan
/xray memory              # Scan Claude Code auto-memory
/xray memory scan         # Same as above
/xray memory read <name>  # Read a specific memory file
/xray memory stats        # Show counts by type, total size, age
/xray memory types        # Group memories by type
/xray memory clean        # Find stale/outdated memories
/xray memory forget <name># Remove a memory (after confirmation)
/xray memory --all        # Cross-project memory view
/xray skills              # List installed skills with versions and profiles
/xray sessions            # Show session history, sizes, counts
```

---

## Argument Parsing

Parse `$ARGUMENTS` — split by whitespace:

- **First word** = target: `memory` (default), `skills`, or `sessions`
- **Remaining words** = subcommand args passed to the target

If no arguments or first word doesn't match a target, default to `memory`.

---

## Target 1: memory (default)

Inspect and manage Claude Code's auto-memory for the current project.

### Memory Location

```bash
ENCODED=$(pwd | sed 's|^/|-|; s|/|-|g')
MEMORY_DIR="$HOME/.claude/projects/${ENCODED}/memory"
```

### Mode 1: Scan (default)

List all memory files with type, age, and description.

```bash
MEMORY_DIR="$HOME/.claude/projects/$(pwd | sed 's|^/|-|; s|/|-|g')/memory"
```

Read each `.md` file (except MEMORY.md), extract frontmatter:

For each file, display:

```
🧠 X-Ray Memory — [project name]

  Type        Name                              Age     Description
  ─────────── ───────────────────────────────── ─────── ────────────────────────
  feedback    never_push_main_skills            2d      Always use branch + PR
  feedback    talk_to_not_oracle_thread         9d      Use /talk-to for threads
  reference   maw_cli                           9d      maw hey, peek, ls commands
  reference   pulse_cli                         9d      board, timeline, scan
  user        work_patterns                     9d      maker's schedule, peak hours

  Total: 14 memories (5 feedback, 3 reference, 1 user, 0 project)
  Index: MEMORY.md (60 lines)
```

#### How to parse

For each `.md` file in MEMORY_DIR (excluding MEMORY.md):

1. Read frontmatter between `---` markers
2. Extract `name`, `description`, `type` fields
3. Get file age from modification time: `stat -c %Y` or `date -r`
4. Format age as: `Xd` (days), `Xh` (hours), `Xm` (minutes)

Sort by type, then by age (newest first).

---

### Mode 2: Read

#### `/xray memory read <name>`

Find file matching `<name>` (partial match OK):

```bash
ls "$MEMORY_DIR"/*<name>*.md | head -1
```

Display full content with frontmatter highlighted.

---

### Mode 3: Stats

#### `/xray memory stats`

```
🧠 X-Ray Memory Stats — [project name]

  Memories:    14 files
  Index:       MEMORY.md (60 lines)
  Total size:  12.4 KB
  Oldest:      9 days (reference_maw_cli.md)
  Newest:      2 days (feedback_never_push_main.md)

  By type:
    feedback   ████████████  5  (36%)
    reference  ████████      3  (21%)
    user       ████          1  (7%)
    project    ░░░░          0  (0%)

  Top keywords: oracle, push, maw, agent, fleet
```

#### How to calculate

- Count files by type (from frontmatter)
- Sum file sizes
- Extract keywords: split all description fields into words, count frequency, show top 5

---

### Mode 4: Types

#### `/xray memory types`

Group and display memories by type:

```
🧠 X-Ray Memory Types

  📝 feedback (5)
    - never_push_main_skills — Always use branch + PR
    - talk_to_not_oracle_thread — Use /talk-to for threads
    - use_workon_skill — Use skill flow, don't edit directly
    - worktree_naming — worktree name = repo name
    - never_maw_done_without_approval — Ask before cleanup

  📚 reference (3)
    - maw_cli — maw hey, peek, ls commands
    - pulse_cli — board, timeline, scan
    - office_hash_routes — all views, deploy flow

  👤 user (1)
    - work_patterns — maker's schedule, peak hours

  📋 project (0)
    (none)
```

---

### Mode 5: Clean

#### `/xray memory clean`

Find potentially stale memories:

1. Read each memory file
2. If `type: reference` and mentions file paths → check if files still exist
3. If `type: project` → check if still relevant (age > 30 days = likely stale)
4. Show candidates:

```
🧹 X-Ray Memory Clean — candidates

  ⚠️  reference_office_hash_routes.md (9d)
      Mentions file paths — verify still current

  ✓  All other memories look current

  Run '/xray memory forget <name>' to remove a specific memory.
  Nothing is deleted without your confirmation.
```

**NEVER auto-delete.** Only suggest. User decides.

---

### Mode 6: Forget

#### `/xray memory forget <name>`

1. Find the file
2. Show its content
3. Ask confirmation: "Remove this memory? (yes/no)"
4. If yes:
   - Delete the file
   - Remove its entry from MEMORY.md
   - Confirm: "Forgotten: <name>"
5. If no: "Kept: <name>"

---

### Cross-Project View

If user says `/xray memory --all`:

```bash
ls -d "$HOME/.claude/projects"/*/memory/ 2>/dev/null
```

Show memory counts per project:

```
🧠 X-Ray Memory — All Projects

  Project                          Memories  Size
  ──────────────────────────────── ──────── ──────
  neo-oracle                       14        12.4KB
  oracle-skills-cli                 8         6.2KB
  maw-js                            5         3.1KB
  office-8bit                       3         2.0KB

  Total: 30 memories across 4 projects
```

---

## Target 2: skills

List installed skills with versions and profiles.

### How to scan

1. Run: `oracle-skills list 2>/dev/null` to get available skills
2. Check installed skills directory:
   ```bash
   SKILLS_DIR="$HOME/.claude/skills"
   ```
3. Read `.oracle-skills.json` manifest if present for version info
4. Cross-reference with profiles from `oracle-skills` CLI

### Display

```
🔬 X-Ray Skills

  Installed: oracle-skills-cli v0.4.x
  Location:  ~/.claude/skills/
  Profile:   standard (17 skills)

  Name                      Version   Profile    Hooks
  ─────────────────────────  ────────  ─────────  ─────
  forward                   v0.4.x    seed       no
  retrospective             v0.4.x    seed       no
  xray                      v0.4.x    seed       no
  trace                     v0.4.x    standard   no
  learn                     v0.4.x    standard   no
  awaken                    v0.4.x    standard   yes
  ...

  Total: 17 skills installed
```

### How to gather

- Read `~/.claude/skills/.oracle-skills.json` for manifest
- Read `~/.claude/skills/VERSION.md` for version info
- For each skill dir, check `SKILL.md` frontmatter for name, description
- Check if skill has `hooks/` directory
- Match against known profiles (seed, standard, full)

---

## Target 3: sessions

Show Claude Code session history, sizes, and counts.

### How to scan

```bash
SESSIONS_DIR="$HOME/.claude/projects/$(pwd | sed 's|^/|-|; s|/|-|g')/sessions"
# Also check: ~/.claude/sessions/ for global sessions
```

### Display

```
📊 X-Ray Sessions — [project name]

  Total sessions:  42
  Total size:      8.3 MB
  Oldest:          30 days ago
  Newest:          2 hours ago
  Avg size:        203 KB

  Recent sessions:
    2h ago     session_abc123    45 KB    (12 turns)
    5h ago     session_def456    82 KB    (28 turns)
    1d ago     session_ghi789    120 KB   (45 turns)
    2d ago     session_jkl012    38 KB    (8 turns)
    3d ago     session_mno345    210 KB   (67 turns)

  Size distribution:
    < 50KB     ████████████████  18  (43%)
    50-200KB   ████████████      14  (33%)
    200-500KB  ████              5   (12%)
    > 500KB    ████              5   (12%)
```

### How to gather

1. List all session files/dirs in project sessions directory
2. Get file sizes with `stat`
3. Count conversation turns by parsing JSON (look for `role` fields)
4. Calculate age from file modification time
5. Sort by most recent first, show top 5

---

ARGUMENTS: $ARGUMENTS
