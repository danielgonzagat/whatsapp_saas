# Wave K / Slice 1 — Decomp-InboxWorkspace

## Mission

Decompose `frontend/src/components/kloel/inbox/InboxWorkspace.tsx` (582 lines)
into cohesive modules ≤300 lines each, preserving the visual contract (no
behavior change visible to user) and existing test pass.

## Ownership set

- `frontend/src/components/kloel/inbox/InboxWorkspace.tsx` (decompose into smaller)
- `frontend/src/components/kloel/inbox/parts/` (CREATE this dir for sub-components)
- `frontend/src/components/kloel/inbox/__tests__/InboxWorkspace.test.tsx` (verify still passes; may need adjustment for renamed imports)

Outside set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA MESTRA (preserve casca, REGRA DE FRONTEND).
2. `AGENTS.md`.
3. `docs/design/KLOEL_VISUAL_DESIGN_CONTRACT.md` (READ ONLY, NEVER EDIT).
4. `frontend/src/components/kloel/inbox/InboxWorkspace.tsx` — full read.
5. Any existing tests for InboxWorkspace.
6. The components/hooks the file imports from siblings.

## Decomposition strategy (anatomical, not arbitrary)

Identify natural cohesion boundaries:
1. **InboxLayout** — outer shell with sidebar + main pane + header
2. **InboxConversationList** — left sidebar with conversation list
3. **InboxConversationItem** — single row in the list
4. **InboxMessagePane** — main message thread
5. **InboxMessageInput** — message composer at bottom
6. **useInboxState** (custom hook) — state machine for the workspace
7. **inbox-helpers.ts** — pure functions extracted

Top-level `InboxWorkspace.tsx` becomes a thin orchestrator: ≤100 lines that
composes the parts.

Each new file:
- ≤300 lines
- One responsibility
- Typed props interface explicit
- Tests for non-trivial helpers

## Forbidden moves

- Use `__parts__/` directory naming — that's gate-banned. Use `parts/` instead.
- Use `__companions__/` — banned.
- Refactor LOGIC during decomposition. This is pure structural decomposition.
  Behavior MUST be identical pre- and post-decomp.
- Edit shared files (api hooks, design tokens). Only this component's
  inbox subdirectory.
- Bypass tokens, new `any`.
- Delete tests just because you renamed something. Adapt tests to imports.

## Validation gates

```bash
cd frontend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/components/kloel/inbox/**/*.{ts,tsx}
npx jest --testPathPattern="inbox/InboxWorkspace"

cd ..
# Visual contract check (gate enforces design tokens)
node scripts/ops/check-visual-contract.mjs --path frontend/src/components/kloel/inbox 2>&1 | tail -10

# Size check: all files in inbox/ must be ≤300 lines (Wave K threshold)
for f in frontend/src/components/kloel/inbox/**/*.tsx; do
  lines=$(wc -l < "$f")
  if [ "$lines" -gt 300 ]; then echo "OVER: $f ($lines lines)"; fi
done
```

## Definition of done

- `InboxWorkspace.tsx` ≤300 lines (ideally ≤100 as thin orchestrator).
- Each new sub-component ≤300 lines.
- All existing tests pass.
- `npx tsc` no regress.
- `npx eslint` clean.
- Visual contract check clean.
- No `__parts__`/`__companions__` directories.
- No bypass tokens, no `any`.
- No commits. CEO commits.

## Hard stop conditions

- If decomposition would require schema/API changes — STOP, report.
- If tests reveal hidden coupling (one component imports from another that
  was inside the file) — STOP, report (refactor design needed).
- If any new component exceeds 300 lines after a reasonable split — STOP,
  report (need deeper anatomical split).
