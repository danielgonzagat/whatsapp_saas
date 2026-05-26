# Wave 1 — prismaAny Migration Audit

> Authored by PI atomic subagent `w1-prismaAny-newcode` (DeepSeek V4 Pro).
> Materialized by orchestrator from the agent's final report (the subagent
> ran without a write tool in its envelope — fixed in launcher for wave 2+).
> Run date: 2026-05-26.

## Methodology

Searched `backend/src/` exhaustively for every occurrence of `this.prismaAny.` — the
exact pattern cited in CLAUDE.md:

> O codebase tem 133 usos de `this.prismaAny.` (bypass de tipos).

Three orthogonal search strategies were applied:

1. **Regex literal**: `this\.prismaAny` across `backend/src/**` → **0 non-spec matches**.
2. **Substring literal**: `prismaAny` across entire `backend/` directory (including all
   file types, case-sensitive) → **1 match total**, in
   `backend/src/checkout/checkout-post-payment-effects.service.spec.ts:93` — a test-local
   variable casting a mock, excluded per scope constraints.
3. **AST grep**: Structural pattern `this.prismaAny.$METHOD($$$)` across all TypeScript
   source files under `backend/src/` (excluding `*.spec.ts`, `*.test.ts`, `spec-helpers`,
   `evol/`) → **0 matches**.

Additionally verified:
- All NestJS services in `backend/src/` inject `private readonly prisma: PrismaService` —
  the **typed** Prisma client derived from `backend/prisma/schema.prisma`.
- The `PrismaService` class at `backend/src/prisma/prisma.service.ts` extends
  `PrismaClient` directly with no `prismaAny` property, no untyped escape hatch.
- No `evol/` directory exists under `backend/src/` at this commit.

**Conclusion**: The migration from `prismaAny` to typed `this.prisma.<model>` has already
been fully completed across all production source files in `backend/src/`. CLAUDE.md's
claim of 133 remaining call sites is **stale** relative to this worktree state.

## Summary

- Total `this.prismaAny.` call sites: **0**
- Files touched: **0**
- Estimated trivial (1-line) migrations: **0**
- Estimated non-trivial (needs select/include refinement): **0**

## Easiest-to-migrate (rank order)

*No entries — all `this.prismaAny.` call sites in `backend/src/` have already been migrated.*

## Supplemental: One remaining untyped Prisma bypass

While `this.prismaAny.` is fully eliminated, one file uses `this.prisma.$queryRawUnsafe`
(raw SQL string bypass) which similarly circumvents Prisma's compile-time type checking:

| File | Line | Pattern | Concern |
|---|---|---|---|
| `backend/src/brain/brain-spine-audit.service.ts` | 39 | `this.prisma.$queryRawUnsafe<SpineRow[]>(…)` | Raw SQL string; no schema-level validation at build time |

This is **not** a `prismaAny` call and was not counted; it is noted here as a related
concern for completeness.

## Verification trace

| Check | Tool | Scope | Result |
|---|---|---|---|
| `this\.prismaAny` regex | `search` | `backend/src` | **0 matches** |
| `prismaAny` literal | `search` | `backend/` (global) | **1 match** — `checkout-post-payment-effects.service.spec.ts:93` (spec, excluded) |
| `prismaAny` literal | `search` | `backend/src` | **0 matches** in non-spec files |
| `PrismaService` class definition | `read` | `backend/src/prisma/prisma.service.ts` | Extends `PrismaClient`; no `prismaAny` property |
| `evol/` directory existence | `find` | `backend/src/evol` | **Does not exist** |
| Schema model inventory | `read` | `backend/prisma/schema.prisma` | 170+ models, all accessible via typed `this.prisma.<model>` |

## Orchestrator's verification (added 2026-05-26)

Independent verification with `grep -rn "this\.prismaAny" backend/src --include="*.ts" --exclude="*.spec.ts"`:

```
```

**Result: 0 matches in non-spec files. Agent's finding confirmed.**
