# Wave B/3 — TenantSweep KloelService (29 entries)

## Mission

Eliminate ALL 29 tenant-isolation allowlist entries for `backend/src/kloel/kloel.service.ts`. Mostly `product`/`contact` queries.

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE BANCO DE DADOS + REGRA DE QUALIDADE DE IA
3. `AGENTS.md`
4. `backend/src/kloel/kloel.service.ts` (full)

## Pattern

Same as Wave B/1.

## Ownership set

- `backend/src/kloel/kloel.service.ts`
- `backend/src/kloel/kloel.service.spec.ts`

## Constraints + DoD + Hard stops

Same as Wave B/1. Specific gates:
- `grep -c "kloel.service.ts" scripts/ops/tenant-filter-allowlist.json` returns 0
- 0 new tsc errors
- `npx jest src/kloel/kloel.service.spec.ts` no regression
