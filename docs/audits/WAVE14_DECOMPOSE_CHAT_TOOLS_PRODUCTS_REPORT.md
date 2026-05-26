# Wave 14 — Decompose `kloel-chat-tools.service.ts` (Product CRUD Slice)

> Authored by PI atomic subagent `w14-decompose-chat-tools-products` (DeepSeek V4 Pro). Materialized 2026-05-26.


## 1. Lines Extracted + New LOC

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| `kloel-chat-tools.service.ts` | 696 LOC | 615 LOC | **−81 LOC** |
| `kloel-chat-tools.products.helpers.ts` | — | 87 LOC | **+87 LOC** |

**Net code change**: +6 LOC (81 extracted → 87 in helpers + 6 lines of new import block).

## 2. Files Created

- `backend/src/kloel/kloel-chat-tools.products.helpers.ts` (87 LOC)
  - Exports: `ToolSaveProductArgs`, `ToolDeleteProductArgs`, `runSaveProduct`, `runListProducts`, `runDeleteProduct`
  - Follows the same `run*` function pattern as `kloel-chat-tools.settings-policy.helpers.ts` and `kloel-chat-tools.settings.helpers.ts`
  - Each `run*` function takes `PrismaService` as first parameter, making them standalone and testable

## 3. Backend tsc Result

```
PASS — tsc -p tsconfig.build.json --noEmit
```

## 4. Spec Result

### `kloel-chat-tools.service.spec.ts`
```
PASS — all 8 tests passed (exit code 0)
```

### `kloel-chat-tools.service.payments-evidence.spec.ts`
```
7/8 passed — 1 pre-existing failure in toolCreatePaymentLink
(unrelated to product CRUD; NODE_ENV ≠ 'production' in test env)
```

Product CRUD-specific tests in payments-evidence spec all passed:
- `toolSaveProduct uses correct workspaceId` ✓
- `toolListProducts filters by correct workspaceId` ✓
- `toolSaveProduct propagates Prisma error` ✓
- `toolListProducts propagates Prisma error` ✓

## 5. Changes Summary

### Removed from service
- `import { Prisma } from '@prisma/client'` (no longer needed)
- `import { filterLegacyProducts } from '../common/products/legacy-products.util'` (moved to helpers)
- `interface ToolSaveProductArgs` (16 lines — moved to helpers)
- `interface ToolDeleteProductArgs` (3 lines — moved to helpers)
- Full method bodies of `toolSaveProduct` (22 lines), `toolListProducts` (15 lines), `toolDeleteProduct` (37 lines)

### Added to service
- Import block from `./kloel-chat-tools.products.helpers` (7 lines)
- Thin delegator methods (3 lines each):
  - `toolSaveProduct` → `runSaveProduct(this.prisma, workspaceId, args)`
  - `toolListProducts` → `runListProducts(this.prisma, workspaceId)`
  - `toolDeleteProduct` → `runDeleteProduct(this.prisma, workspaceId, args)`

### Public API
- **Unchanged.** All three methods retain identical signatures and return types.
- `ToolSaveProductArgs` and `ToolDeleteProductArgs` are re-exported via type imports.
- No callers need updating.
