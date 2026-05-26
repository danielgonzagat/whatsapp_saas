# Wave 13 — readNumber canonicalization report

> Authored by PI atomic subagent `w13-readNumber-canonicalize` (DeepSeek V4 Pro). Materialized 2026-05-26.


**Date:** 2026-05-26  
**Canonical module:** `backend/src/common/parse.ts`  
**Canonical facets:** `readNumber`, `readNumberLoose`, `readNumberOr`, `readNumberForce`, `readInt`

---

## 1. Per-variant inventory

### Variant A: `backend/src/cia/cia.service.ts` — private wrapper

| Attribute | Detail |
|---|---|
| Line | 561–563 (removed) |
| Signature | `private readNumber(value: unknown): number` |
| Body | `return readNumberForce(value);` |
| Semantics | Thin wrapper delegating to `readNumberForce` (returns 0 on invalid) |
| Call sites | 3: `approvedSalesAmount`, `openBacklog`, `pendingPaymentCount` |
| Decision | ✅ **MIGRATED** — calls now use `readNumberForce` directly; wrapper removed |

### Variant B: `backend/src/kloel/conversational-onboarding-tools.service.ts` — instance method

| Attribute | Detail |
|---|---|
| Line | 66–68 (removed) |
| Signature | `readNumber(value: unknown, fallback = 0): number` |
| Body | `return readNumberOr(value, fallback);` |
| Semantics | Thin wrapper delegating to `readNumberOr` (caller-provided fallback) |
| Call sites | 1: `args.price` in `add_product` handler |
| Decision | ✅ **MIGRATED** — call now uses `readNumberOr(args.price, 0)` directly; method removed |# Variant C: `backend/src/kloel/economic-objective.ts` — re-alias

| Attribute | Detail |
|---|---|
| Line | 3 |
| Signature | `import { readNumberOr as readNumber } from '../common/parse'` |
| Semantics | Already re-aliased to canonical `readNumberOr` |
| Decision | ✅ **ALREADY USING CANONICAL** (re-alias) |

### Variant D: `backend/src/kloel/email-workspace-delivery.ts` — re-alias

| Attribute | Detail |
|---|---|
| Line | 1 |
| Signature | `import { readNumberLoose as readNumber } from '../common/parse'` |
| Semantics | Already re-aliased to canonical `readNumberLoose` |
| Decision | ✅ **ALREADY USING CANONICAL** (re-alias) |

### Variant E: `backend/src/common/request-logger.interceptor.ts` — direct import

| Attribute | Detail |
|---|---|
| Line | 1 |
| Signature | `import { readString, readNumber } from './parse'` |
| Semantics | Already imports canonical `readNumber` directly |
| Decision | ✅ **ALREADY USING CANONICAL** (direct import) |

### Variant F: `backend/src/common/idempotency.guard.ts` — property extractor

| Attribute | Detail |
|---|---|
| Line | 66–76 |
| Signature | `function readNumberProperty(source: unknown, key: string): number \| undefined` |
| Body | Record guard + property access + `typeof === 'number' && Number.isFinite` check |
| Semantics | Property-extraction variant: reads `source[key]`, returns number if finite, else undefined |
| Decision | ⏸ **KEEP-LOCAL** — property-extraction helper; canonical `readNumber` operates on a single value, not `(record, key)` |# Variant G: `backend/src/payments/fraud/fraud.engine.ts` — env-var reader

| Attribute | Detail |
|---|---|
| Line | 68–76 |
| Signature | `function readNumberEnv(name: string, fallback: number, minimum = 0): number` |
| Body | Reads `process.env[name]`, parses with `Number()`, checks `>= minimum`, returns fallback otherwise |
| Semantics | Domain-specific env-var reader with minimum-constraint gating |
| Decision | ⏸ **KEEP-LOCAL** — env-var + minimum constraint variant; no canonical equivalent |

### Variant H: `worker/flow-engine.helpers.ts` — FlowNodeData property extractor

| Attribute | Detail |
|---|---|
| Line | 18–29 |
| Signature | `export const readNumber = (data: FlowNodeData \| undefined, key: string, fallback = 0): number` |
| Body | Reads `data?.[key]`, strict number check, falls back to string `Number()` parse, returns fallback on invalid |
| Semantics | Property-extraction for `FlowNodeData` bags with loose string coercion and caller-provided fallback |
| Decision | ⏸ **KEEP-LOCAL** — `(data, key, fallback)` shape is materially divergent; converting each call site to `readNumberLoose(data?.[key]) ?? fallback` would regress readability |---

## 2. Per-variant decision summary

| # | File | Symbol | Decision | Reason |
|---|---|---|---|---|
| 1 | `backend/src/cia/cia.service.ts` | `private readNumber` | ✅ MIGRATED | Pure wrapper → direct `readNumberForce` calls |
| 2 | `backend/src/kloel/conversational-onboarding-tools.service.ts` | `readNumber` | ✅ MIGRATED | Pure wrapper → direct `readNumberOr` call |
| 3 | `backend/src/kloel/economic-objective.ts` | `readNumber` (alias) | ✅ CANONICAL | Already re-aliased `readNumberOr` |
| 4 | `backend/src/kloel/email-workspace-delivery.ts` | `readNumber` (alias) | ✅ CANONICAL | Already re-aliased `readNumberLoose` |
| 5 | `backend/src/common/request-logger.interceptor.ts` | `readNumber` | ✅ CANONICAL | Direct canonical import |
| 6 | `backend/src/common/idempotency.guard.ts` | `readNumberProperty` | ⏸ KEEP-LOCAL | Property-extraction shape |
| 7 | `backend/src/payments/fraud/fraud.engine.ts` | `readNumberEnv` | ⏸ KEEP-LOCAL | Env-var + minimum constraint |
| 8 | `worker/flow-engine.helpers.ts` | `readNumber` | ⏸ KEEP-LOCAL | FlowNodeData property-extraction shape |

---

## 3. Files modified

| File | Changes |
|---|---|
| `backend/src/cia/cia.service.ts` | 3 call sites: `this.readNumber(X)` → `readNumberForce(X)`; private method removed (−3 lines) |
| `backend/src/kloel/conversational-onboarding-tools.service.ts` | 1 call site: `this.readNumber(args.price)` → `readNumberOr(args.price, 0)`; instance method removed (−3 lines) |
| `backend/src/kloel/conversational-onboarding-tools.service.spec.ts` | Removed `readNumber` unit test for the removed instance method (−5 lines) |---

## 4. Verification

| Check | Result |
|---|---|
| `backend` tsc (`tsc -p tsconfig.build.json --noEmit`) | ✅ PASS |
| `worker` tsc (`tsc -p tsconfig.json --noEmit`) | ✅ PASS |
| `conversational-onboarding-tools.service.spec.ts` (Jest) | ✅ PASS |
| Post-migration regrep: zero remaining dupes of `readNumberForce` / `readNumberOr` | ✅ CLEAN |
| Post-migration regrep: remaining locals match KEEP-LOCAL decisions above | ✅ CONSISTENT |

---

## 5. Remaining local definitions (intentionally kept)

| Symbol | File | Justification |
|---|---|---|
| `readNumber` | `worker/flow-engine.helpers.ts` | `(data, key, fallback)` property-extraction for FlowNodeData |
| `readNumberProperty` | `backend/src/common/idempotency.guard.ts` | `(source, key)` property-extraction with record guard |
| `readNumberEnv` | `backend/src/payments/fraud/fraud.engine.ts` | `(name, fallback, minimum)` env-var reader |
