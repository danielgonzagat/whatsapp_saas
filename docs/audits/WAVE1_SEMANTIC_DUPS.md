# Wave 1 — Semantic Duplicate Findings

> Authored by PI atomic subagent `w1-dup-hunter-semantic` (DeepSeek V4 Pro,
> ~21k investigation events). Materialized by orchestrator from the agent's
> report text (the subagent ran without a write tool in its envelope — fixed
> in launcher for wave 2+). Run date: 2026-05-26.


## Methodology

Discovered candidates via structural search (`search`/`ast_grep`) across
`backend/src/` (excluding `*.spec.ts`, `*.test.ts`, `*spec-helpers*`, `*.d.ts`,
`evol/`) for:

1. Same-name functions declared in ≥2 files — `safeStr`, `readText`, `clamp`,
   `isRecord`, `asRecord`/`readRecord`, `sleep`, `generateId`, `digitsOnly`,
   `trimToUndefined`, `sanitize*Error`.
2. Pervasive inline patterns — `errorMessage = err instanceof Error ?
   err.message : …` across catch blocks.
3. Cross-referenced with `docs/architecture/DEPRECATION_MAP.md` to exclude
   already-migrated symbols and intentionally-local variants.

Each candidate body was read and compared side-by-side. Candidates already
migrated via re-export (e.g., `safeStr` in 4 kloel helpers, `clamp` in
kloel types files) or already classified as "kept local" (e.g., `asRecord`
in webhooks/webhooks.service.ts, `normalizeEmail` in checkout) were skipped.

---

## Top Candidates (ranked by canonicalization value)

### 1. `clamp` — 13 implementations
- **Loci:**
  - `backend/src/common/math.ts:22` (canonical — `Math.max(min, Math.min(max, value))`)
  - `backend/src/checkout/checkout-shipping-profile.util.ts:8`
  - `backend/src/kloel/affil/account.protection.ts:19`
  - `backend/src/kloel/affil/angle-fatigue.detector.ts:19`
  - `backend/src/kloel/affil/angle.suggester.ts:113`
  - `backend/src/kloel/affil/audience-fit.detector.ts:24`
  - `backend/src/kloel/affil/offer-quality.scorer.service.ts:19`
  - `backend/src/kloel/affil/offer-switch.suggester.ts:36`
  - `backend/src/kloel/affil/producer-trust.scorer.service.ts:12`
  - `backend/src/kloel/affil/scale-vs-abandon.advisor.ts:22`
  - `backend/src/kloel/affil/traffic-waste.detector.ts:24`
  - `backend/src/kloel/healthymoney/revenue-quality.scorer.service.ts:16`
  - `backend/src/kloel/mind-synthetic-generator.service.ts:41`
- **Signature divergence:** All identical — `(value: number, min: number, max: number): number`. One outlier: `kloel/hypproof/proof-evaluator.service.ts:84` uses if/else instead of `Math` (kept local). One more outlier: `payments/split/split.engine.ts:36` operates on `bigint`.
- **Body divergence:** All 13 use `Math.min(Math.max(value, min), max)` except canonical (`common/math.ts`) which uses `Math.max(min, Math.min(max, value))` — mathematically equivalent. checkout variant omits `: number` return type annotation.
- **Recommended canonical:** `backend/src/common/math.ts` — already the canonical home, already exported, already imported by other modules.
- **Caller impact:** 13 files, each with 1 local call site; trivial mechanical replacement (add `import { clamp } from '../common/math'` or relative path equivalent).
- **Risk:** LOW — body-identical semantics; the two outlier variants (hypproof if/else, payments/split bigint) stay local by design.

### 2. `safeStr` — 8 implementations
- **Loci:**
  - `backend/src/common/string.ts:36` (canonical — function, explicit block body)
  - `backend/src/cia/cia-inline-fallback.service.ts:15` (arrow const, `fb` param, body-identical)
  - `backend/src/whatsapp/cia-backlog-run.helpers.ts:17` (arrow const, `fb` param, body-identical)
  - `backend/src/whatsapp/cia-remote-backlog.helpers.ts:10` (arrow const, `fb` param, body-identical)
  - `backend/src/kloel/kloel-chat-tools.service.ts:59` (function, body-identical to canonical)
  - `backend/src/kloel/kloel-chat-tools.agent-jobs.helpers.ts:173` (function, body-identical)
  - `backend/src/kloel/kloel-chat-tools.agent-runtime.helpers.ts:72` (function, body-identical)
  - `backend/src/kloel/kloel-tool-executor.helpers.ts:17` (function, body-identical)
  - `backend/src/kloel/kloel-product-context-formatter.ts:11` (inline arrow inside class method, body-identical)
- **Signature divergence:** Canonical uses `(value: unknown, fallback = ''): string`. Arrow variants use `(v: unknown, fb = ''): string`. Semantics identical — only param naming differs.
- **Body divergence:** All 9 implementations test `typeof === 'string'` → return value, then `typeof === 'number' || typeof === 'boolean'` → `String(value)`, else fallback. Byte-differ only in param names and arrow-vs-function form.
- **Recommended canonical:** `backend/src/common/string.ts` — already canonical; 4 kloel files already re-export from here per DEPRECATION_MAP (lead-brain, lead-processor, workspace-context, product-sub-resources/common). The 8 remaining should follow the same pattern.
- **Caller impact:** 9 files, ~10 internal call sites per file; trivial import replacement.
- **Risk:** LOW — all body-identical.

### 3. `readRecord` / `asRecord` / `asUnknownRecord` — 12 implementations (4 shapes)
- **Loci:**
  - **Shape A** (guarded, returns `null`): `backend/src/common/types.ts:39` (`asRecord`, canonical), `backend/src/kloel/kloel-composer.service.ts:78` (`asUnknownRecord`), `backend/src/kloel/kloel-lead-processor-helpers.ts:12` (`asUnknownRecord`, exported)
  - **Shape B** (guarded, returns `{}`): `backend/src/kloel/agent-runtime/agent-runtime.session-store.search.ts:284` (`asRecord`), `backend/src/kloel/agent-runtime/agent-runtime.pulse-self-model.ts:6` (`readRecord`), `backend/src/kloel/brain-runtime.service.ts:40` (`readRecord`), `backend/src/kloel/mind-policy.helpers.ts:128` (`readRecord`), `backend/src/meta/read-model/meta-read-helpers.ts:15` (`readRecord`, exported)
  - **Shape C** (unguarded, returns `null`): `backend/src/kloel/unified-agent-actions-workspace.service.ts:26` (`readRecord`), `backend/src/webhooks/webhooks.service.ts:57` (`asRecord` — kept local, accepts Arrays)
  - **Shape D** (unguarded, returns `{}`): `backend/src/whatsapp/providers/provider-registry-session.ts:10` (`readRecord`, exported)
  - **Shape E** (unchecked cast): `backend/src/admin/chat/tools/overview.tools.ts:21` (`asRecord` — `value as Record<string, unknown>`)
- **Signature divergence:** All take `value: unknown` and return `Record<string, unknown> | null` (Shapes A/C), `Record<string, unknown>` (Shapes B/D), or `Record<string, unknown>` (Shape E — raw cast). Name variance: `asRecord`, `asUnknownRecord`, `readRecord`.
- **Body divergence:**
  - Shape A: `value && typeof value === 'object' && !Array.isArray(value) ? value : null` — guards null + Array, returns null.
  - Shape B: `value && typeof value === 'object' && !Array.isArray(value) ? value : {}` — same guard, returns `{}`.
  - Shape C: `typeof value === 'object' && value !== null ? value : null` — no Array guard, returns null.
  - Shape D: `typeof value === 'object' && value !== null ? value : {}` — no Array guard, returns `{}`.
  - Shape E: `value as Record<string, unknown>` — no runtime check.
- **Recommended canonical:** `backend/src/common/types.ts` (Shape A) — already `asRecord`, already widely used as the canonical coercion helper. Shape B callers should switch to `asRecord(…) ?? {}` at the call site (explicit about fallback semantics). Shape C/D callers need per-case review: webhooks variant is intentionally kept local (no Array guard). Shape E (`overview.tools.ts`) is a trivial cast that should be replaced or removed.
- **Caller impact:** 12 files across kloel, meta, whatsapp, admin, webhooks. Most are single-callsite local helpers. Migration needs per-shape decisions — not fully mechanical.
- **Risk:** MEDIUM — Array guard difference (Shape C/D accept `[]` as valid records, Shapes A/B reject them). Each call site must be checked for whether arrays can flow in.

### 4. `isRecord` — 6 implementations (3 shapes)
- **Loci:**
  - **Shape A** (guarded, type predicate): `backend/src/audit/audit.interceptor.ts:26`, `backend/src/common/idempotency.guard.ts:62`, `backend/src/kloel/owner-criterion/observers/correction.observer.ts:36`
  - **Shape B** (exported, `Boolean()` guard): `backend/src/kloel/kloel-tool-dispatcher.high-risk.helpers.ts:57`
  - **Shape C** (unguarded, type predicate): `backend/src/kloel/unified-agent-actions-crm-predecided.helpers.ts:20`, `backend/src/kloel/unified-agent-actions-sales.service.ts:28`
- **Signature divergence:** All take `value: unknown`. Shape A: `value is AuditRequestRecord | IdempotencyRecord | Readonly<Record<string, unknown>>`. Shape B: `value is UnknownRecord`. Shape C: `value is UnknownRecord`.
- **Body divergence:**
  - Shape A: `typeof value === 'object' && value !== null && !Array.isArray(value)` — null-guard + Array-guard.
  - Shape B: `Boolean(value) && typeof value === 'object' && !Array.isArray(value)` — uses `Boolean()` for null-guard, Array-guard.
  - Shape C: `typeof value === 'object' && value !== null` — ONLY null-guard, no Array check. Arrays pass as valid records.
- **Recommended canonical:** `backend/src/common/types.ts` (add `isRecord` export with Shape A body). Already exists as `asRecord` in the same file — `isRecord` is the predicate version.
- **Caller impact:** 6 files, each with ~2-5 internal call sites. Shape C callers likely need `!Array.isArray()` guard added (behavioral change).
- **Risk:** MEDIUM — Shape C callers currently accept arrays as records. Adding the Array guard may break callers feeding `[]` into downstream record reads. Each Shape C call site must be audited.

### 5. `readText` — 4 implementations (3 shapes)
- **Loci:**
  - **Shape A** (returns `''`, coerces numbers/booleans): `backend/src/common/utils.ts:6`
  - **Shape B** (returns `string | undefined`, only strings): `backend/src/kloel/email-campaign.service.ts:21`, `backend/src/member-area/member-area.helpers.ts:76`
  - **Shape C** (returns `string`, no coercion, doesn't trim): `backend/src/meta/read-model/meta-read-helpers.ts:1`
- **Signature divergence:** Shape A: `(value: unknown): string`. Shape B: `(value: unknown): string | undefined`. Shape C: `(value: unknown): string`.
- **Body divergence:**
  - Shape A: coerces numbers/booleans via `String()`, trims, returns `''` on non-string.
  - Shape B: only accepts `typeof === 'string'`, returns `undefined` for empty/non-string. email-campaign variant uses `&& value.trim()` guard; member-area variant uses `if (typeof !== 'string')` guard.
  - Shape C: accepts strings, returns as-is (no trim), returns `''` otherwise.
- **Recommended canonical:** `backend/src/common/parse.ts` — add `readTrimmedStringOr` (returns `''` fallback) matching Shape A. Shape B variants should use `readString` from `common/parse.ts`. Shape C should use `readString` with an explicit fallback `?? ''` at the call site.
- **Caller impact:** 4 files, 3 non-canonical. email-campaign.service.ts has 1 local caller; member-area.helpers.ts has 2; meta-read-helpers.ts has 3. Trivial import replacement.
- **Risk:** LOW — all replacement semantics are strictly clearer than the current ad-hoc locals.

### 6. `sanitizeAppleError` / `sanitizeErrorMessage` / `sanitizeTikTokError` — 3 body-identical implementations
- **Loci:**
  - `backend/src/auth/apple-auth.support.ts:52` (`sanitizeAppleError`, exported)
  - `backend/src/auth/facebook-auth.service.ts:44` (`sanitizeErrorMessage`, local)
  - `backend/src/auth/tiktok-auth.service.ts:68` (`sanitizeTikTokError`, local)
- **Signature divergence:** All take `(error: unknown): string`.
- **Body divergence:** All 3 are byte-identical in logic: `error instanceof Error && error.message.trim() ? error.message.trim() : typeof error === 'string' && error.trim() ? error.trim() : 'unknown_error'`.
- **Recommended canonical:** `backend/src/common/parse.ts` — add `sanitizeErrorMessage(error: unknown): string` as the canonical home. All 3 auth providers would import and rename locally or use directly.
- **Caller impact:** 3 files in `auth/`. Each has 3-5 local call sites; trivial import replacement.
- **Risk:** LOW — body-identical, zero behavioral change.

### 7. `digitsOnly` — 2 local reimplementations of `common/phone.ts`
- **Loci:**
  - `backend/src/common/phone.ts:40` (canonical — `String(value ?? '').replace(NON_DIGIT_RE, '')`, returns `string`)
  - `backend/src/kyc/kyc.helpers.ts:27` (exported — uses `trimToUndefined` guard, returns `string | undefined`)
  - `backend/src/payments/connect/connect.service.ts:30` (local — uses `trimToUndefined` guard, returns `string | undefined`)
- **Signature divergence:** Canonical: `(value: string | null | undefined): string`. Locals: `(value: unknown): string | undefined`.
- **Body divergence:** Canonical always returns `string` (empty string for null/undefined). Locals return `undefined` on empty/non-string input via `trimToUndefined` guard.
- **Recommended canonical:** `backend/src/common/phone.ts` — add `digitsOnlyOrUndefined` variant for nullable semantics. Or callers can use `digitsOnly(value) || undefined`.
- **Caller impact:** 2 files (`kyc/kyc.helpers.ts`, `payments/connect/connect.service.ts`). Each has ~2 call sites.
- **Risk:** LOW — the nullable-return variant is a thin wrapper over canonical.

### 8. `trimToUndefined` — 2 identical implementations
- **Loci:**
  - `backend/src/kyc/kyc.helpers.ts:23` (exported)
  - `backend/src/payments/connect/connect.service.ts:26` (local)
- **Signature divergence:** Both `(value: unknown): string | undefined`.
- **Body divergence:** Both byte-identical: `typeof value === 'string' && value.trim() ? value.trim() : undefined`. This is equivalent to `common/parse.ts::readTrimmedString`.
- **Recommended canonical:** `backend/src/common/parse.ts` — the existing `readTrimmedString` already implements identical logic. Both call sites should import from `common/parse`.
- **Caller impact:** 2 files, ~3 call sites each. Trivial import replacement.
- **Risk:** LOW — semantically identical to `readTrimmedString`.

### 9. `sleep` — 3 identical implementations
- **Loci:**
  - `backend/src/common/idempotency.guard.ts:42` (arrow const)
  - `backend/src/whatsapp/inbound-processor.helpers.ts:126` (function declaration)
  - `backend/src/whatsapp/inbound-processor.inline-autopilot.ts:47` (async function)
- **Signature divergence:** Two return `Promise<void>`, one is `async` (same behavior). All take `(ms: number)`.
- **Body divergence:** All call `setTimeout(resolve, ms)` inside `new Promise`. The `async` variant `await`s instead of `return`ing the promise, but semantics are identical.
- **Recommended canonical:** `backend/src/common/async-sequence.ts` — add `sleep(ms: number): Promise<void>` export. Already houses async utilities.
- **Caller impact:** 3 files, 1-2 call sites each. Trivial.
- **Risk:** LOW — zero behavioral change.

### 10. `generateId` — 2 implementations
- **Loci:**
  - `backend/src/kloel/abi-ab/abi-ab-harness.service.ts:47` — format: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  - `backend/src/kloel/legit/constants.ts:104` — format: `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, exported, takes `prefix: string`
- **Signature divergence:** `abi-ab`: `(): string`. `legit`: `(prefix: string): string`.
- **Body divergence:** Both use timestamp + random base-36 suffix but with different encodings (milliseconds vs base-36 timestamp) and separator conventions.
- **Recommended canonical:** `backend/src/common/id-gen.ts` (new) — extract a unified `generateId(prefix?: string): string` that defaults to `id_` prefix. Or keep both local since the identifier format is intentionally domain-specific (rec_ vs branded prefix).
- **Caller impact:** 2 files, 1-2 call sites each. Can be consolidated if prefix semantics are aligned.
- **Risk:** LOW if unified — format changes are cosmetic. MEDIUM if id format matters for external consumers.

### 11. `removeUndefined` / `compactObject` — 2 similar implementations
- **Loci:**
  - `backend/src/kloel/product-sub-resources/helpers/common.helpers.ts:137` (`removeUndefined` — exported, always returns the object type)
  - `backend/src/payments/connect/connect.service.ts:39` (`compactObject` — local, returns `T | undefined`)
- **Signature divergence:** `removeUndefined<T extends LooseObject>(value: T): T`. `compactObject<T extends Record<string, unknown>>(value: T): T | undefined`. Return type difference is the key semantic divergence.
- **Body divergence:** Both `Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined))`. `compactObject` additionally returns `undefined` when the result has zero keys.
- **Recommended canonical:** `backend/src/common/object.ts` (new) — add `compactObject` as the flexible variant. `removeUndefined` callers can use `compactObject(value)!` or `compactObject<T>(value) ?? ({} as T)`.
- **Caller impact:** 2 files, 1-3 call sites each.
- **Risk:** LOW — one is a superset of the other.

### 12. `extractErrorMessage` — 2 implementations (different signatures)
- **Loci:**
  - `backend/src/auth/google-auth.service.ts:20` — takes `(error: unknown)`, handles Error + string, returns `'unknown_error'` fallback.
  - `backend/src/kloel/middleware/audit-log.middleware.ts:49` — takes `(obj: Record<string, unknown>)`, checks `obj.message` then `obj.error`, returns `null` fallback.
- **Signature divergence:** `google-auth`: `(error: unknown): string`. `audit-log`: `(obj: Record<string, unknown>): string | null`. Completely different input contracts.
- **Body divergence:** `google-auth` handles Error/string raw errors (for catch blocks). `audit-log` handles structured response objects (for middleware response body extraction). Different domains.
- **Recommended canonical:** The `google-auth` variant matches the `sanitize*Error` pattern (candidate 6 above) and should be unified there into `common/parse.ts::sanitizeErrorMessage`. The `audit-log` variant is middleware-specific and should stay local (different contract).
- **Caller impact:** `google-auth` variant: 1 file, 3 call sites. Unification with candidate 6 is straightforward.
- **Risk:** LOW for google-auth variant; audit-log variant stays local.

### 13. `sha256` — 1 production implementation
- **Loci:**
  - `backend/src/common/throttler/route-class.guard.ts:5`
  - `backend/src/kloel/agent-runtime/agent-runtime.evidence-store.spec.ts:4` (test file — skip)
- **Signature divergence:** `(text: string): string` vs `(content: string): string` — identical.
- **Body divergence:** `createHash('sha256').update(text).digest('hex')` vs `createHash('sha256').update(content, 'utf8').digest('hex')`. The `'utf8'` encoding argument is a no-op (it's the default).
- **Recommended canonical:** Only 1 production use remains after excluding the spec file. Low priority; but `common/crypto.ts` already exists and could host a `sha256` helper alongside existing hash functions.
- **Caller impact:** 1 file, 1 call site.
- **Risk:** LOW.

### 14. `safeString` — diverges from `safeStr` on `bigint`
- **Loci:**
  - `backend/src/kloel/mind-verbalizer.service.ts:19`
- **Signature divergence:** `(value: unknown): string` — no fallback param; always returns `''`.
- **Body divergence:** Same as `safeStr` but also accepts `typeof value === 'bigint'` and converts via `value.toString()`. This is a superset of `safeStr`'s coercion set.
- **Recommended canonical:** Extend `backend/src/common/string.ts::safeStr` to also handle `bigint`. The `safeString` call site then imports `safeStr` directly.
- **Caller impact:** 1 file, ~5 call sites.
- **Risk:** LOW — adding `bigint` support to `safeStr` is backward-compatible.

### 15. `normalizeProviderToken` — `safeStr` variant
- **Loci:**
  - `backend/src/whatsapp/providers/provider-env.ts:4`
- **Signature divergence:** `(value: unknown): string` — same as `safeStr` without explicit fallback.
- **Body divergence:** `safeStr(value, '')` + `.trim().toLowerCase()`. This is a two-step operation that can be expressed as `safeStr(value).trim().toLowerCase()`.
- **Recommended canonical:** Caller should import `safeStr` from `common/string` and apply `.trim().toLowerCase()` inline. No new canonical needed.
- **Caller impact:** 1 file, 3 call sites.
- **Risk:** LOW.

### 16. `isValidDate` — reimplementation of logic in `readDate`
- **Loci:**
  - `backend/src/dashboard/home-aggregation.util.ts:69`
- **Signature divergence:** `(value: Date | null | undefined): value is Date` vs `common/parse.ts::readDate(value: unknown): Date | undefined`.
- **Body divergence:** Type guard `value instanceof Date && Number.isFinite(value.getTime())` vs the broader `readDate` which also parses numbers and strings. The guard is a strict subset.
- **Recommended canonical:** Caller can use `readDate(value) !== undefined` or add `isValidDate` to `common/parse.ts` as a thin wrapper.
- **Caller impact:** 1 file, ~3 internal call sites.
- **Risk:** LOW.

### 17. `resolveWorkspaceId` — throttler variant
- **Loci:**
  - `backend/src/auth/workspace-access.ts:119` (canonical — full auth guard, exported)
  - `backend/src/common/throttler/route-class.guard.ts:25` (local — simpler, checks `req.workspaceId`, params, header)
- **Signature divergence:** Canonical: `(req: { user?, params?, body?, query? }, explicit?: string): string`. Throttler: `(req: RequestLike): string | undefined`. Return type differs: canonical throws on invalid access, throttler returns `undefined`.
- **Body divergence:** Canonical resolves workspace ID AND validates access via `assertWorkspaceAccess`. Throttler only extracts the ID from multiple sources without access validation. Fundamentally different contracts.
- **Recommended canonical:** The throttler variant is intentionally simpler (no auth context available). Candidate for a shared extraction-only helper `extractWorkspaceId(req): string | undefined` in `common/`, with the auth guard layered on top.
- **Caller impact:** 1 file (throttler guard), 1 call site.
- **Risk:** MEDIUM — extraction vs auth-validation boundary must be clearly documented.

### 18. Inline `errorMessage` extraction — 4+ catch blocks
- **Loci:**
  - `backend/src/billing/billing-checkout-helper.service.ts:74`
  - `backend/src/billing/billing-webhook.helpers.ts:145`
  - `backend/src/billing/payment-method.service.ts:264`
  - `backend/src/kloel/middleware/audit-log.middleware.ts:307`
  - `backend/src/ai-brain/knowledge-base.service.ts:305` (similar but different fallback)
- **Pattern:** `const errorMessage = err instanceof Error ? err.message : 'unknown_error'` — identical in 4+ catch blocks.
- **Recommended canonical:** Already covered by candidate 6 (`sanitizeErrorMessage`). All 4 sites should import and use `sanitizeErrorMessage(err)` from `common/parse.ts`.
- **Caller impact:** 5 files, 1 site each. Trivial import replacement.
- **Risk:** LOW — the knowledge-base.service.ts variant uses a different fallback expression (`'unknown_error'` inline vs function default). Ensure the canonical's fallback matches or is configurable.

---

## Summary

| # | Symbol | Impls | Canonical Home | Risk |
|---|--------|-------|----------------|------|
| 1 | `clamp` | 13 | `common/math.ts` (exists) | LOW |
| 2 | `safeStr` | 8 | `common/string.ts` (exists) | LOW |
| 3 | `readRecord`/`asRecord`/`asUnknownRecord` | 12 | `common/types.ts::asRecord` (exists) | MEDIUM |
| 4 | `isRecord` | 6 | `common/types.ts` (new export) | MEDIUM |
| 5 | `readText` | 4 | `common/parse.ts` (new variant) | LOW |
| 6 | `sanitize*Error` | 3 | `common/parse.ts` (new export) | LOW |
| 7 | `digitsOnly` (nullable) | 2 | `common/phone.ts` (new variant) | LOW |
| 8 | `trimToUndefined` | 2 | `common/parse.ts::readTrimmedString` (exists) | LOW |
| 9 | `sleep` | 3 | `common/async-sequence.ts` (new export) | LOW |
| 10 | `generateId` | 2 | split decision — domain-specific | LOW |
| 11 | `removeUndefined`/`compactObject` | 2 | `common/object.ts` (new) | LOW |
| 12 | `extractErrorMessage` (Error→string) | 1+4 | unified with #6 | LOW |
| 13 | `safeString` (bigint) | 1 | extend `common/string.ts::safeStr` | LOW |
| 14 | `normalizeProviderToken` | 1 | use `safeStr` inline | LOW |
| 15 | `isValidDate` | 1 | use `readDate` from `common/parse.ts` | LOW |
| 16 | `resolveWorkspaceId` (extraction) | 1 | `common/` extract-only helper | MEDIUM |

This report identifies 16 semantic-duplicate clusters with concrete canonical homes. The highest-ROI targets are `clamp` (13 impls, body-identical), `safeStr` (8 remaining locals after prior migrations), and the `readRecord`/`asRecord`/`asUnknownRecord` family (12 impls across 4 semantic shapes — the hardest to unify but also the highest value).