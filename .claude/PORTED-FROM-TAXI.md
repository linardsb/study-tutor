# AI layer ported from the taxi repo (2026-09-26)

Copied verbatim from `~/Desktop/taxi/.claude/` at commit f2cc6c4 (2026-09-22): `skills/`, `hooks/`,
`agents/`, `settings.json`, plus empty `plans/ reports/ code-reviews/ execution-reports/ system-reviews/`.
Convention kept: every PIV artefact lives under `.claude/`, never `.agent/`. PRDs live in `docs/prd/`
(lean) and `docs/epics/` (epic PRD + architecture doc side by side).

Files that still carry taxi's stack and must be adapted once `/plan-architecture` picks this repo's
stack and gate command (they fail open until then, so nothing breaks):

| File | Taxi-specific content |
|---|---|
| `hooks/stop_check.py` | gate command `pnpm check`; `CODE_PREFIXES = apps/ services/ packages/ db/` |
| `hooks/pre_tool_use.py` | guard 3 fences `app/` and `backend/` (the anketa); keep guards 1, 2, 4, 5, 6 |
| `settings.json` | permission allow-list is pnpm / docker / gh; hooks block is generic |
| `skills/piv-validate/SKILL.md` | the turbo gate and Redis-gated suites |
| `skills/piv-create-pr/scripts/record-gate.sh` | parses the turbo gate output |
| `skills/piv-plan-implementation/SKILL.md`, `prime-app`, `prime-codebase`, `vertical-slice-audit`, `agents/code-reviewer.md` | monorepo path assumptions, a few lines each |

Order: `/plan-architecture docs/prd/study-tutor-v2.prd.md` → `rules-create-global` (writes CLAUDE.md)
→ adapt the table above → `piv-slice-epic` → PIV loop, one experiment (E1 first) per loop.
