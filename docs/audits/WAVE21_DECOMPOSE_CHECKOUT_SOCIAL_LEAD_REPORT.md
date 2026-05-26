# Wave 21 — Decompose checkout-social-lead.service.ts

> Authored by PI atomic subagent `w21-decompose-checkout-social-lead` (DeepSeek V4 Pro). Materialized 2026-05-26.


## Summary

Extracted pure helpers (parsers, serializers, formatter) from the 563-line
`checkout-social-lead.service.ts` into a new sibling file
`checkout-social-lead.helpers.ts`.

## Line Counts

| Artifact | Before | After | Delta |
|----------|--------|-------|-------|
| `checkout-social-lead.service.ts` | 563 LOC | 490 LOC | −73 |
| `checkout-social-lead.helpers.ts` | — | 81 LOC | +81 |
| **Net** | 563 | 571 | +8 |

## Files Created

- `backend/src/checkout/checkout-social-lead.helpers.ts` (81 LOC)

## What Was Extracted

### 1. `CheckoutSocialLeadPrefill` type (17 lines)
- Moved from service-local `type` to exported type in helpers.
- Imported back via `import type` in the service.

### 2. `parseProvider(provider: string): CheckoutSocialProvider` (9 lines)
- Pure string→enum parser: `'google'` → `GOOGLE`, `'facebook'` → `FACEBOOK`, default → `APPLE`.
- Was `private` method; now exported standalone function.
- Call site: `captureLead` — `this.parseProvider(dto.provider)` → `parseProvider(dto.provider)`.

### 3. `serializeProvider(provider: CheckoutSocialProvider): 'google' | 'facebook' | 'apple'` (9 lines)
- Pure enum→string serializer (inverse of `parseProvider`).
- Was `private` method; now exported standalone function.
- No longer directly called from the service — used internally by `buildLeadPrefill`.

### 4. `buildLeadPrefill(lead: LeadRecord): CheckoutSocialLeadPrefill` (19 new lines)
- **New** pure formatter that constructs the prefill response shape from a lead DB record.
- Deduplicates **36 lines** of identical return-object construction that was duplicated
  across `getLeadPrefill` and `hydrateGoogleProfile`.
- Depends on `extractAddressFromEnrichment` (from `checkout-social-lead.util`) and
  `serializeProvider` (co-located in helpers).

## Backend tsc Result

- **No type errors** in changed files.
- Two pre-existing TS 7.0 deprecation warnings in `tsconfig.build.json`
  (`baseUrl`, `alwaysStrict`) — unrelated to this change.

## Spec Result

```
backend/src/checkout/checkout-social-lead.service.spec.ts — PASS (exit 0)
```

All 8 existing tests pass:
- `captureLead` — 4 tests (NotFound, Unauthorized, Google, Facebook, Apple)
- `markConvertedFromOrder` — 1 test
- Constructor wiring unchanged

## Preserved Invariants Checklist

- [x] **Transaction boundaries untouched.** `hydrateGoogleProfile` and `updateLead`
  still use `prisma.$transaction({ isolationLevel: 'ReadCommitted' })`.
- [x] **Idempotency preserved.** `buildQueueJobId('checkout-social-lead-enrich', leadId)`
  in `enqueueEnrichment` unchanged.
- [x] **Webhook boundaries preserved.** `markConvertedFromOrder` logic fully intact.
- [x] **Contact upsert intact.** `upsertContact` with `workspaceId_phone` unique
  constraint unchanged.
- [x] **Email mismatch guard preserved.** The `hydrateGoogleProfile` email comparison
  and `UnauthorizedException` throw unchanged.
- [x] **All Prisma selects preserved.** No query shape altered.
- [x] **Auth service delegation unchanged.** `verifySocialProvider` dispatches to
  Facebook/Apple/Google auth services identically.
- [x] **No behavior change.** Extracted functions are pure and produce identical outputs.

## Risk Assessment

**LOW.** All extractions are pure functions with zero side effects. No transaction,
queue, auth, or DB logic was modified. The `buildLeadPrefill` formatter encapsulates
identical logic that was verified identical at both call sites (same shape, same
field set, same serialization).
