# Wave B/4 — TenantSweep Affiliate + Reports + MemberArea (72 entries)

## Mission

Eliminate 72 tenant-isolation allowlist entries across 3 files:
- `backend/src/affiliate/affiliate.controller.ts` (25)
- `backend/src/reports/reports.service.ts` (24)
- `backend/src/member-area/member-area.controller.ts` (23)

## Pre-read mandatory

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` — REGRA DE BANCO DE DADOS
3. `AGENTS.md`
4. All 3 target files (full)

## Pattern

Same as Wave B/1.

## Ownership set

- `backend/src/affiliate/affiliate.controller.ts` + `.spec.ts`
- `backend/src/reports/reports.service.ts` + `.spec.ts`
- `backend/src/member-area/member-area.controller.ts` + `.spec.ts`

## Constraints + DoD + Hard stops

Same as Wave B/1. Specific gates per file. Combined: 72 → 0 allowlist entries for these 3 files.
