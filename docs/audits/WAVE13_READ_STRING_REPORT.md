# Wave 13 — readString Canonicalization Report

> Authored by PI atomic subagent `w13-readString-canonicalize` (DeepSeek V4 Pro). Materialized 2026-05-26.


**Date:** 2026-05-26
**Worktree:** `wt-w13-readString-canonicalize`
**Task:** Migrate local `readString` definitions (S3, S5a/b, S6, S7 variants) to `backend/src/common/parse.ts` canonical family.

---

## 1. Canonical Variants (`backend/src/common/parse.ts`)

| Function | Signature | Semantics |
|---|---|---|
| `readString` | `(value: unknown) => string \| undefined` | Non-empty trimmed → string; else undefined |
| `readTrimmedString` | `(value: unknown) => string \| undefined` | Trimmed version of readString |
| `readStringOrNull` | `(value: unknown) => string \| null` | Trimmed → string; else null |
| `readStringForce` | `(value: unknown) => string` | Trimmed → string; else '' |
| `readStringOr` | `(value: unknown, fallback: string) => string` | Trimmed → string; else fallback |
| `readStringOrUntrimmed` | `(value: unknown, fallback: string) => string` | Untrimmed → string; else fallback |
| `readStringProperty` | `(source: unknown, key: string) => string \| undefined` | Record-aware property reader |
| `readStringArray` | `(value: unknown) => string[]` | Array of strings |
| `readStringArrayOr` | `(value: unknown) => string[] \| undefined` | Array or undefined |# 2. Per-Variant Inventory

## 2.1 `backend/src/prisma/checkout-paid-effects/shared.ts:39`

- **Signature:** `readString(value: Prisma.JsonValue | undefined): string | null`
- **Body:** `typeof value === 'string' && value.trim() ? value.trim() : null`
- **Canonical match:** `readStringOrNull` — EXACT
- **Decision:** ✅ MIGRATED → `export { readStringOrNull as readString } from '../../common/parse';`
- **Caller:** `affiliate.ts` (imports `readString` from `./shared`; unchanged)

## 2.2 `backend/src/whatsapp/account-agent.parsers.ts:15`

- **Signature:** Re-export of `readStringOrNull as readString`
- **Decision:** ✅ ALREADY MIGRATED (already re-exports canonical)

## 2.3 `backend/src/webhooks/payment-webhook-types.ts:181`

- **Signature:** Re-export of `readStringArray as asStringArray`
- **Decision:** ✅ ALREADY MIGRATED (already re-exports canonical)# 2.4 `frontend/src/app/(checkout)/hooks/checkout-order-submit.ts:257`

- **Signature:** `readString(value: Record<string, unknown> | null, key: string): string`
- **Semantics:** Reads a named key from a record; returns '' on missing/non-string
- **Decision:** ⏸ KEEP-LOCAL — divergent API (record-key reader, not a scalar parser)

## 2.5 `frontend/src/app/(main)/produtos/area-membros/preview/[areaId]/member-area.helpers.ts:10`

- **Signature:** `readString(value: unknown, fallback = ''): string`
- **Body:** `typeof value === 'string' && value.trim() ? value : fallback`
- **Canonical near-match:** `readStringOr` — but canonical returns `value.trim()`, local returns untrimmed `value`
- **Decision:** ⏸ KEEP-LOCAL — divergent behavior (returns untrimmed after trim-check; canonical `readStringOr` trims the output)

## 2.6 `frontend/src/app/(main)/video/page.helpers.ts:16`

- **Signature:** `readStringField(data: unknown, field: string, fallback: string | null = null): string | null`
- **Semantics:** Reads a named field from an unknown payload with null fallback
- **Decision:** ⏸ KEEP-LOCAL — divergent API (field reader from unknown payload)

## 2.7 `frontend/src/app/api/auth/_lib/shared-auth-cookies.ts:16`

- **Signature:** `readString(value: unknown): string`
- **Body:** `typeof value === 'string' ? value.trim() : ''`
- **Canonical match:** `readStringForce` — EXACT
- **Decision:** ⏸ KEEP-LOCAL — cross-package boundary (frontend cannot import `backend/src/common/parse.ts`)

## 2.8 `frontend/src/app/api/workspace/me/route.ts:17`

- **Signature:** `readString(value: unknown): string`
- **Body:** `typeof value === 'string' ? value : ''`
- **Canonical match:** `readStringOrUntrimmed(value, '')` — EXACT
- **Decision:** ⏸ KEEP-LOCAL — cross-package boundary (frontend cannot import `backend/src/common/parse.ts`)# 2.9 `worker/flow-engine.helpers.ts:5`

- **Signature:** `readString(data: FlowNodeData | undefined, key: string, fallback = ''): string`
- **Semantics:** Typed record-key reader with FlowNodeData parameter
- **Decision:** ⏸ KEEP-LOCAL — divergent API (typed record-key reader, not a scalar parser)

## 2.10 `worker/metrics-server.ts:23`

- **Signature:** `readStringHeader(req: http.IncomingMessage, name: string): MaybeString`
- **Semantics:** HTTP header reader returning undefined on missing/non-string
- **Decision:** ⏸ KEEP-LOCAL — divergent API (HTTP header reader, not a scalar parser)

## 2.11 `worker/processors/checkout-social-lead-enrichment.ts:182`

- **Signature:** `readStringField(value: unknown, keys: string[]): string | null`
- **Semantics:** Multi-key field reader from unknown record; returns first match or null
- **Decision:** ⏸ KEEP-LOCAL — divergent API (multi-key field reader, not a scalar parser)# 3. Files Modified

| File | Change |
|---|---|
| `backend/src/prisma/checkout-paid-effects/shared.ts` | Replaced local `readString` function with `export { readStringOrNull as readString } from '../../common/parse';` |

---

## 4. Verification

### TypeScript Compilation

| Package | Status |
|---|---|
| `backend` | ✅ PASS (`tsc -p tsconfig.build.json --noEmit`) |
| `worker` | ✅ PASS (`tsc -p tsconfig.json --noEmit`) |

### Test Runs

| Test | Status |
|---|---|
| `backend/src/prisma/prisma.service.spec.ts` | ✅ PASS (exit 0) |

> Note: `prisma.service.spec.ts` mocks the entire `checkout-paid-effects` module, so the re-export is transparent to the test harness.

---

## 5. Summary

- **Total definitions found:** 11
- **Already canonical:** 2 (account-agent.parsers.ts, payment-webhook-types.ts)
- **Migrated this wave:** 1 (checkout-paid-effects/shared.ts → `readStringOrNull`)
- **Kept local:** 8
  - 5 divergent API (record-key/field/header readers, not scalar parsers)
  - 1 divergent behavior (untrimmed return after trim-check)
  - 2 cross-package boundary (frontend cannot reach backend canonical)

No S3/S5a/S5b/S6/S7 scalar `readString` variants remain in `backend/src/` — the last backend-local scalar variant (`readStringOrNull` semantics under the `readString` name) has been canonicalized.
