# W25-A — `asRecord` family consolidation

**Date:** 2026-05-26
**Canonical:** `backend/src/common/types.ts:39`
**Baseline typecheck (PI clean worktree):** 0 errors
**Result:** 0/3 backend sites mergeable; all kept local
**Delegated to:** PI atomic subagent `w25-asrecord-consolidate` (DeepSeek V4 Pro)

## Summary

All three backend non-canonical `asRecord` declarations are semantically divergent
from the canonical and cannot be migrated to re-exports. No code changes made.

## Comparison table

| # | file:line | shape | decision | reason |
|---|-----------|-------|----------|--------|
| 1 | `backend/src/common/types.ts:39` | `(unknown) → UnknownRecord \| null` | **CANONICAL** | — |
| 2 | `backend/src/admin/chat/tools/overview.tools.ts:21` | `<T>(T) → Record<string,unknown>` | **KEPT LOCAL** | No-op type assertion, not a runtime narrow. Generic `<T>` input. Always returns input as-is (never `null`). Replacing with canonical would break 10+ callers whose `execute()` return values would become nullable. |
| 3 | `backend/src/kloel/agent-runtime/agent-runtime.session-store.search.ts:284` | `(unknown) → Record<string,unknown>` | **KEPT LOCAL** | Returns `{}` on failure instead of `null`. Callers in session store depend on property access without null-guard. Canonical returns `null`, changing downstream behavior. |
| 4 | `backend/src/webhooks/webhooks.service.ts:57` | `(unknown) → UnknownRecord \| null` | **KEPT LOCAL** | **Accepts arrays.** Missing `!Array.isArray(value)` check. Callers (`extractPhone`) pass `payload.data`, `data.object`, etc. — may be arrays in webhook payloads. Canonical rejects arrays. Return type matches canonical, but body is materially different. CEO verified by reading line 57: `return typeof value === 'object' && value !== null ? (value as UnknownRecord) : null;` — confirmed no Array.isArray guard. |

Frontend sites (3 files) excluded per procedure — different workspace, divergent shapes.

## Canonical body (for reference)

```typescript
export function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}
```

## Divergent body analysis

### Site 2: `overview.tools.ts` — no-op assertion

```typescript
function asRecord<T>(value: T): Record<string, unknown> {
  return value as Record<string, unknown>;
}
```

Local convenience for ChatTool `execute()` return values that are
already known to be objects (service method results). Not a guard — a pure
type cast. Used in 10+ tool factories (`dashboardOverviewTool`,
`marketingOverviewTool`, etc.).

### Site 3: `agent-runtime.session-store.search.ts` — `{}` fallback

```typescript
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
```

The `{}` fallback allows callers to destructure or access properties without
null-checking. The canonical's `null` return would change call site behavior.

### Site 4: `webhooks.service.ts` — array-permissive

```typescript
function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === 'object' && value !== null ? (value as UnknownRecord) : null;
}
```

Used in `extractPhone` for recursive payload inspection:

```typescript
const data = asRecord(payload.data);
const dataObject = data ? asRecord(data.object) : null;
const customerDetails = dataObject ? asRecord(dataObject.customer_details) : null;
const buyer = asRecord(payload.buyer);
```

Webhook providers may send arrays at these paths. The canonical's
`!Array.isArray(value)` guard would reject them, causing `extractPhone` to
miss phone numbers in array-bearing payloads.

## Verification

- Baseline typecheck inside PI worktree: 0 errors
- No files modified; no regression risk
- No new errors introduced
- CEO post-hoc verified Site 4 body by direct Read of webhooks.service.ts:57

## Related

- [[DEPRECATION_MAP]] — `asRecord` per-shape decision row (this audit closes it)
- [[CANONICAL_VOCABULARY]] — canonical at common/types.ts
- W25 PI atomic-edit fleet — see launch-pi.sh template
