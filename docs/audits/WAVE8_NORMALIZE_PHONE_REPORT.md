# Wave 8 — normalizePhone Canonicalization Report

> Authored by PI atomic subagent `w8-dup-normalize-phone` (DeepSeek V4 Pro,
> ~25k events). Closes DUP-006 — migrated 5 of 7 normalizePhone variants
> to canonical phone facets (digitsOnly/digitsOrNull/whatsappDigits).
> Materialized 2026-05-26.


> **Task**: `w8-dup-normalize-phone`
> **Date**: 2026-05-26
> **Register**: `docs/architecture/DUPLICATION_REGISTER.md` DUP-006
> **Canonical**: `backend/src/common/phone.ts`

## Summary

| # | Site | Decision | Canonical Facet |
|---|------|----------|----------------|
| 1 | `auth/auth-whatsapp-password.service.ts:31` | ✅ MIGRATED | `digitsOnly` |
| 2 | `checkout/checkout-social-lead.util.ts:32` | ✅ MIGRATED | `digitsOrNull` (re-export) |
| 3 | `kloel/kloel.autonomy-proof.helpers.ts:86` | ✅ MIGRATED | `digitsOnly` (re-export) |
| 4 | `prisma/checkout-paid-effects/whatsapp.ts:13` | ⏸ KEEP-LOCAL | `digitsOnly` + `>= 10` guard |
| 5 | `whatsapp/inbound-processor.helpers.ts:19` | ✅ MIGRATED | `whatsappDigits` (re-export) |
| 6 | `whatsapp/whatsapp-catchup.helpers.ts:7` | ✅ MIGRATED | `whatsappDigits` (re-export) |
| 7 | `worker/processors/checkout-social-lead-enrichment.ts:200` | ⏸ KEEP-LOCAL | cross-workspace |## Per-Site Decisions

### Site 1 — `auth/auth-whatsapp-password.service.ts` ✅ MIGRATED

**Before**: Local (non-exported) `normalizePhone(phone: string): string` wrapping `digitsOnly(phone)`.

**Action**: Removed the wrapper function. Inlined `digitsOnly(phone)` at both internal call sites (`sendWhatsAppCode` line 59, `verifyWhatsAppCode` line 142).

**Reason**: The wrapper was a pure delegate with zero added semantics. `digitsOnly` was already imported from the canonical module.

**External callers**: None (local function).

---

### Site 2 — `checkout/checkout-social-lead.util.ts` ✅ MIGRATED

**Before**: Exported `normalizePhone(value?: string | null)` wrapping `digitsOrNull(value)`.

**Action**: Replaced wrapper with `export { digitsOrNull as normalizePhone } from '../common/phone';`. Removed the standalone `import { digitsOrNull }` (no longer needed; the re-export pulls it in).

**Reason**: The wrapper was a pure delegate. The re-export preserves the `normalizePhone` name for the one external caller (`checkout-social-lead.candidate.ts:26`) while routing directly to the canonical.

**External callers**: `checkout-social-lead.candidate.ts` — unchanged (still imports `normalizePhone`).

---

### Site 3 — `kloel/kloel.autonomy-proof.helpers.ts` ✅ MIGRATED

**Before**: Exported `normalizePhone(value: string): string` wrapping `digitsOnly(value)`.

**Action**:
1. Replaced wrapper with `import { digitsOnly } from '../common/phone';` + `export { digitsOnly as normalizePhone };`
2. Inlined `digitsOnly` at both internal call sites:
   - `normalizeChatId`: `${digitsOnly(raw)}@c.us`
   - `phoneFromChatId`: `digitsOnly(String(value || '').split('@')[0] ?? '')`

**Reason**: No external callers found. The `import`-then-`export` pattern keeps `digitsOnly` available for local use while re-exporting it as `normalizePhone` for any future external consumers.

**External callers**: None.---

### Site 4 — `prisma/checkout-paid-effects/whatsapp.ts` ⏸ KEEP-LOCAL

**Before**: Local `normalizePhone(phone: string | null)` using `digitsOnly` with a `>= 10` digit floor guard.

**Action**: No change.

**Reason**: The `digits.length >= 10 ? digits : null` guard is a semantic addition not present in any canonical facet. It prevents creating WhatsApp conversations for malformed numbers (e.g., cardholder-name-derived attempts). This is intentionally divergent behavior specific to the checkout-paid-effects domain.

Already imports `digitsOnly` from the canonical — the core normalization logic is canonical; only the length guard is local.

---

### Site 5 — `whatsapp/inbound-processor.helpers.ts` ✅ MIGRATED

**Before**: Exported `normalizePhone(phone: string): string` wrapping `whatsappDigits(phone)`.

**Action**:
1. Replaced wrapper with `import { whatsappDigits } from '../common/phone';` + `export { whatsappDigits as normalizePhone };`
2. Inlined `whatsappDigits` at all three internal call sites:
   - `expandComparablePhoneVariants`: `whatsappDigits(phone)`
   - `isWorkspaceSelfInboundExt` (self phone): `whatsappDigits(normalizeUnknownText(...))`
   - `isWorkspaceSelfInboundExt` (comparison): `whatsappDigits(String(c || ''))`

**Reason**: Pure delegate. The re-export preserves the `normalizePhone` name for the external caller (`inbound-processor.inline-autopilot.ts:37,44`).

**External callers**: `inbound-processor.inline-autopilot.ts` — unchanged.

---

### Site 6 — `whatsapp/whatsapp-catchup.helpers.ts` ✅ MIGRATED

**Before**: Exported `normalizePhoneExt(phone: string): string` wrapping `whatsappDigits(phone)`.

**Action**:
1. Replaced wrapper with `import { whatsappDigits } from '../common/phone';` + `export { whatsappDigits as normalizePhoneExt };`
2. Inlined `whatsappDigits` at all four internal call sites:
   - `expandComparablePhoneVariantsExt`
   - `resolveCanonicalPhoneExt` (two occurrences)
   - `isWorkspaceSelfChatIdExt`

**Reason**: Pure delegate. The re-export preserves the `normalizePhoneExt` name for the external caller (`whatsapp-catchup-history.service.ts:13,62`).

**External callers**: `whatsapp-catchup-history.service.ts` — unchanged.

---

### Site 7 — `worker/processors/checkout-social-lead-enrichment.ts` ⏸ KEEP-LOCAL

**Before**: Inline `const D_RE = /\D/g;` + local `normalizePhone(value: string | null)` returning `string | null`.

**Action**: No change.

**Reason**: Cross-workspace boundary. The worker package cannot import from `backend/src/common/phone`. Migrating would require either duplicating the canonical module into the worker workspace (defeating the purpose) or setting up a shared package (out of scope). The worker's `D_RE` constant is byte-identical to the canonical `NON_DIGIT_RE`, so the behavior is semantically equivalent.## Files Modified

| File | Change |
|------|--------|
| `backend/src/auth/auth-whatsapp-password.service.ts` | Removed `normalizePhone` wrapper; inlined `digitsOnly` at 2 call sites |
| `backend/src/checkout/checkout-social-lead.util.ts` | Replaced wrapper with `export { digitsOrNull as normalizePhone }` re-export |
| `backend/src/kloel/kloel.autonomy-proof.helpers.ts` | Replaced wrapper with import+re-export; inlined `digitsOnly` at 2 internal callers |
| `backend/src/whatsapp/inbound-processor.helpers.ts` | Replaced wrapper with import+re-export; inlined `whatsappDigits` at 3 internal callers |
| `backend/src/whatsapp/whatsapp-catchup.helpers.ts` | Replaced wrapper with import+re-export; inlined `whatsappDigits` at 4 internal callers |## Verification

### TypeScript Compilation

| Package | Result |
|---------|--------|
| `backend` | ✅ `tsc -p tsconfig.build.json --noEmit` — zero errors |
| `worker` | ✅ `tsc -p tsconfig.json --noEmit` — zero errors |

### Spec Runs

| Spec | Result |
|------|--------|
| `auth-whatsapp-password.service.spec.ts` | ✅ PASS |
| `checkout-social-lead.service.spec.ts` | ✅ PASS |
| `kloel.autonomy-proof.spec.ts` | ✅ PASS |
| `kloel.autonomy-proof2.spec.ts` | ✅ PASS |
| `whatsapp-catchup.service.spec.ts` | ✅ PASS |
| `whatsapp-catchup-history.service.spec.ts` | ✅ PASS |
| `inbound-processor.service.spec.ts` | ✅ PASS |
| `whatsapp-digits.util.spec.ts` | ✅ PASS |## Architectural Notes

1. **Re-export pattern**: Where wrappers were exported, they became `export { CanonicalName as LegacyName }` re-exports. This preserves backward compatibility for external callers while routing them directly to the canonical implementation.

2. **Import-then-reexport**: For files where internal callers also needed the canonical symbol (sites 3, 5, 6), the pattern is `import { X } from M; export { X as Y };` — the import makes `X` available locally, and the export re-exposes it under the legacy name.

3. **Type narrowing preserved**: Site 2's wrapper had `(value?: string | null)` while `digitsOrNull` accepts `(value: string | null | undefined)`. The re-export slightly widens the accepted type at the import boundary, which is safe (superset).

4. **Site 4 length guard**: The `>= 10` floor is a legitimate domain concern. If this pattern proliferates, consider adding a `digitsOrNullMinLength(value, min)` facet to `common/phone.ts` in a future wave.

5. **Worker dedup**: Site 7's `D_RE` is byte-identical to canonical `NON_DIGIT_RE`. If a shared `@kloel/common` package is created, this could be migrated, but cross-workspace imports are currently FORBIDDEN per constraint.
