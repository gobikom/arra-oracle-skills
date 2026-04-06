# PROJECT.md — arra-oracle-skills

## What & Why
**One-liner:** 12 skill commands for AI coding agents -- installable via CLI to Claude Code, OpenCode, Cursor, and 18+ native agents (43+ via Vercel Skills CLI).
**Status:** active
**Owner:** Nat Weerawan (@nazt) / Soul Brews Studio

## Problem
- AI agents start sessions with zero context -- no memory, no identity, no cross-session continuity
- Installing skills manually to each agent's config dir is tedious and error-prone
- No standard way to share reusable agent behaviors (retrospectives, handoffs, soul rituals) across 18+ agents

## Users
- Oracle family agents (PSak, Dora, and other Soul Brews Oracles)
- Claude Code / OpenCode / Cursor / Codex users who want session awareness and memory skills
- Developers building custom AI agent workflows with cross-session continuity

## Requirements (Living)

### Must Have (P0)
- [x] CLI installer with global (-g) and project-local modes
- [x] Skill profiles (seed/standard/full) with `/go` switching
- [x] Auto-compile from `src/skills/*/SKILL.md` to `src/commands/` stubs
- [x] 18 native agent adapters + Vercel Skills CLI compatibility

### Should Have (P1)
- [x] Feature stacking (`/go + soul`, `/go + network`, `/go + workspace`)
- [x] Interactive skill picker (`select -g`)
- [x] Hooks support for plugin-style skills (hooks.json)
- [x] Hidden skills (installed but skip autocomplete)

### Nice to Have (P2)
- [x] X-ray deep scan of Claude Code auto-memory
- [x] ClaWHub build target (`bun run clawhub`)
- [ ] Marketplace / remote skill discovery
<!-- AUTO-GEN:BEGIN — Do not edit manually. Run: gen-ai-context.sh --update -->
## Architecture (Brief)

- **Stack:** Node.js >=18
- **Entry points:** (none detected)

## Context Map

| Task Type | Read These First |
|-----------|-----------------|
| Tests | `__tests__/` |
| Documentation | `docs/` |
| Scripts/CLI | `scripts/` |
| Deploy/CI | `.github/workflows/` |
| Source code | `src/` |
| __tests__ | `__tests__/` |
| hooks | `hooks/` |

## Exports

### npm Scripts

- `npm run build` → bun scripts/ensure-vfs-stub.ts && bun build src/cli/index.ts --outdir dist --target bun --minify
- `npm run dev` → bun run src/cli/index.ts
- `npm run test` → bun test __tests__/
- `npm run compile` → bun scripts/compile.ts
- `npm run version` → bun run compile && bun scripts/update-readme-table.ts && git add src/commands README.md
- `npm run prepare` → lefthook install
- `npm run prepublishOnly` → bun run compile && bun run build
- `npm run clawhub` → bun scripts/clawhub-build.ts
<!-- AUTO-GEN:END -->

## Key Decisions

| Decision | เลือก | ไม่เลือก | ทำไม |
|----------|-------|---------|------|
| Skill source format | SKILL.md (Markdown + frontmatter) | JSON/YAML config | ให้ agent อ่านได้เลย, human-readable, ไม่ต้อง parse |
| Build tool | Bun | Node.js / esbuild | เร็วกว่า, ใช้ TS ตรงได้ไม่ต้อง compile ก่อน |
| Branch strategy | alpha -> PR -> main | trunk-based | alpha ไว้ทดสอบก่อน release, main = stable เสมอ |
| Agent support | Native adapters per agent | Single format | แต่ละ agent มี convention ต่างกัน (skills/ vs commands/) |

## Constraints & Gotchas

- NEVER edit `src/commands/*.md` directly -- always edit `src/skills/*/SKILL.md` then `bun run compile`
- NEVER push directly to main -- use alpha branch, then PR
- All scripts in `src/skills/*/scripts/` MUST have `chmod +x` or get "permission denied"
- Every SKILL.md needs frontmatter with `name` + `description` or compile will skip it
- Version is currently 3.4.11 -- `npm version` triggers compile + README update automatically

---

*Human sections: What & Why, Problem, Users, Requirements, Key Decisions, Constraints -- review and edit as needed*
*Auto-gen sections: Architecture, Context Map, Exports -- run `gen-ai-context.sh --update` to refresh*
