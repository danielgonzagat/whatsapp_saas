# Wave F — EmBreve / Planejado Residuals Cleanup (single subagent)

## Mission

Eliminate all "Em Breve" / "Planejado" / "Coming Soon" residual surface from
the live product. Per A.7 of mission anexo, 9 specific occurrences in 7 files.
Replace with either real functionality OR honest empty/setup states (per
CLAUDE.md "Estados Honestos" table).

## Exact targets

| # | File | Lines | Current | Action |
|---|------|-------|---------|--------|
| 1 | `frontend/src/components/kloel/carteira/CarteiraAntecipateModal.tsx` | 123, 143 | "Antecipacao em breve" | Replace modal body with empty-state: "Antecipação ainda não habilitada para sua conta. Aguarde análise bancária." + disabled CTA. Add tooltip explaining "antecipação requer aprovação bancária". Modal stays openable but doesn't pretend to do anything. |
| 2 | `frontend/src/components/kloel/conta/ContaIdiomasSection.tsx` | 106, 121, 126 | label `Planejado` in dropdown | Remove all language entries marked "Planejado". Keep only languages that have actual i18n catalog files in the repo (pt-BR, en-US, es-LA if present). |
| 3 | `frontend/src/components/kloel/ToolCard.helpers.ts` | 25 | `return disabled ? 'Planejado' : badge` | Change behavior: tools with `disabled=true` simply do NOT render in the tools menu. Return `null` for badge when disabled, and update consuming component to filter out disabled tools. |
| 4 | `frontend/src/components/kloel/EmptyStates.tsx` | 286, 289 | "Anúncios — Em Breve" | Replace with "Conecte sua primeira conta de anúncios" + CTA button that links to Meta/Google/TikTok OAuth flow (route already exists at `/anuncios/connect`). |
| 5 | `frontend/src/components/kloel/__tests__/EmptyStates.test.tsx` | 93 | tests "Anúncios — Em Breve" string | Update test to match the new copy in EmptyStates.tsx. Verify CTA renders with correct href. |
| 6 | `frontend/src/app/(main)/products/[id]/plans/[planId]/page.tsx` | 170 | "EM BREVE" badge on plan | Replace with `plan.status` real value: `Active` (green) / `Draft` (yellow) / `Archived` (gray). Read from Prisma `PlanStatus` enum. |
| 7 | `frontend/src/app/(main)/ferramentas/page.tsx` | 51 | description says "ativo, parcial e planejado" | Update text: "Ferramentas ativas e em desenvolvimento" — remove "planejado". |

## Ownership set

- All 7 files listed above.
- Any direct tests that reference the old strings (grep `Em Breve|Planejado|Coming Soon` in `__tests__` after edits).

Outside set: STOP and report.

## Mandatory pre-read

1. `CLAUDE.md` — REGRA MESTRA + "Estados Honestos" table.
2. `AGENTS.md` — full read.
3. Each target file — full read.
4. `backend/prisma/schema.prisma` — section about `Plan`, `PlanStatus`, `Tool` models.

## Forbidden moves

- Add a TODO or `// em breve` style comment claiming future work.
- Hide a button/feature entirely if the underlying capability exists but
  isn't fully ready — instead, show honest "setup required" state.
- Touch tests outside the named __tests__ files.
- Bypass tokens, new `any`.

## Validation gates

```bash
cd frontend
npx tsc --noEmit 2>&1 | grep "error TS" | wc -l
npx eslint src/components/kloel/carteira/CarteiraAntecipateModal.tsx \
  src/components/kloel/conta/ContaIdiomasSection.tsx \
  src/components/kloel/ToolCard.helpers.ts \
  src/components/kloel/EmptyStates.tsx \
  src/components/kloel/__tests__/EmptyStates.test.tsx \
  'src/app/(main)/products/[id]/plans/[planId]/page.tsx' \
  'src/app/(main)/ferramentas/page.tsx'
npx jest --testPathPattern="EmptyStates|carteira|ContaIdiomas|ToolCard"

cd ..
# Final check: zero residuals
grep -rEi "em.?breve|planejado|coming.?soon|ComingSoonOverlay|PLANNED_CAPABILITY" \
  frontend/src frontend-admin/src 2>/dev/null | grep -v node_modules | wc -l
```

## Definition of done

- `grep -rEi "em.?breve|planejado|coming.?soon|ComingSoonOverlay"` in
  frontend/src + frontend-admin/src → **0 matches**.
- Each affected component renders honest state (empty/setup/active per status).
- Tests passing.
- `npx tsc` no regress.
- `npx eslint` clean.
- No bypass tokens, no protected files, no commits.

## Hard stop conditions

- If `Plan` model in schema.prisma lacks `status` enum field — STOP, report
  (schema fix needed in separate slice).
- If `Tool` registry has no concept of `enabled` boolean — STOP, report.
- If antecipation feature has a partial implementation hidden somewhere — STOP,
  report (need to decide: complete the impl or honest disable).
