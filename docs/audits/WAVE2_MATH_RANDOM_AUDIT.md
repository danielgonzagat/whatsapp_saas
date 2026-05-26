# Wave 2 — Math.random() Audit

> Authored by PI atomic subagent `w2-math-random-hunt` (DeepSeek V4 Pro,
> ~11k events). Successfully written by the subagent (the wave-2 launcher
> includes atomic_author + atomic_do in its toolset). Run date: 2026-05-26.


## Methodology

Full-text search for `Math\.random` across `backend/src/`, `frontend/src/`,
`frontend-admin/src/`, and `worker/`. Excluded all `*.spec.ts` and `*.test.ts`
files, plus `scripts/pulse/`. Each hit was read in context, classified by
purpose (ID generation, mock data, differential privacy noise, visual effect,
etc.), and cross-checked against callers where the classification was
ambiguous.

`frontend/src/` and `worker/` returned zero hits in production files.
`frontend-admin/src/` references `Math.random` only inside a comment in
`honest-placeholder.tsx` (a UI message explaining that real data will replace
placeholders). All remaining hits are in `backend/src/kloel/`.
## Summary

- Total Math.random() call sites (excluding tests): **12**
- CRITICAL: **2**
- VISUAL: **0**
- ID: **9**
- MOCK: **1**
## CRITICAL findings (must replace before next prod deploy)

### `backend/src/kloel/wisdom/wisdom-anonymizer.ts:20`

- Context: `laplacianNoise(scale)` — inverse-CDF Laplace(0,b) generator used
  for differential privacy in the WISDOM-002 anonymization pipeline
  (`applyDiffPrivacyNoise` → `anonymizePatterns` → `toWisdomPattern`).
- What it produces: Differential privacy noise applied to
  `aggregatedValue` on candidate patterns before cross-workspace sharing.
  This is a **privacy guarantee** — weak PRNG weakens the ε-differential
  privacy bound.
- Recommended replacement: `crypto.getRandomValues(new Uint32Array(1))[0] /
  2**32` (or `secureRandomFloat()` if that utility is ported to backend).
  The inverse-CDF transform needs uniform [0,1) — `Math.random()` is not
  cryptographically uniform.

### `backend/src/kloel/wisdom/wisdom-privacy-guard.service.ts:67`

- Context: `diffPrivacyNoise(value, epsilon)` — standalone pure function that
  adds calibrated Laplacian noise to a single numeric value. Used by
  `WisdomPrivacyGuardService` for cross-workspace privacy enforcement at
  the projection boundary (WISDOM-002 + WISDOM-008).
- What it produces: Same Laplacian noise as above, applied directly to
  individual values. Same privacy-guarantee concern.
- Recommended replacement: Same as above — use `crypto.getRandomValues()`
  to generate the uniform [0,1) sample. Consider extracting a shared
  `secureUniform()` helper used by both `wisdom-anonymizer.ts` and
  `wisdom-privacy-guard.service.ts`.
## ID findings

All nine sites use `Math.random().toString(36).slice(…)` to generate
record/event/prediction IDs. None are cryptographic keys, but all are
predictable and could collide under concurrent load. Replace with
`crypto.randomUUID()` or a backend equivalent of `secureRandomFloat` + base36
encoding.

### `backend/src/kloel/abi-ab/abi-ab-harness.service.ts:48`

- Context: `generateId()` → `rec_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
- What it produces: Record IDs for A/B test harness records
  (`AbHarnessRecord`).
- Recommended replacement: `crypto.randomUUID()`

### `backend/src/kloel/goal-field/goal-field.types.ts:86`

- Context: `makeTensionId()` → `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
- What it produces: Tension entity IDs in the Goal Field system.
- Recommended replacement: `crypto.randomUUID()`

### `backend/src/kloel/goal-field/goal-field.types.ts:90`

- Context: `makeGoalId()` → `g_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
- What it produces: Goal entity IDs in the Goal Field system.
- Recommended replacement: `crypto.randomUUID()`

### `backend/src/kloel/guest-chat.service.ts:90`

- Context: Upload filename generation:
  `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}${ext}`
- What it produces: Uploaded file paths served under `/uploads/…`.
- Recommended replacement: `crypto.randomUUID()` or at minimum
  `crypto.randomBytes(8).toString('hex')`

### `backend/src/kloel/incent/types.ts:190`

- Context: `makeIncidentId(prefix, seq)` →
  `${prefix}_${ts}_${seq}_${Math.random().toString(36).slice(2, 6)}`
- What it produces: Incent/conflict incident IDs.
- Recommended replacement: `crypto.randomUUID()`

### `backend/src/kloel/legit/constants.ts:105`

- Context: `generateId(prefix)` →
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
- What it produces: Generic IDs for the Legit compliance module (regulatory
  content disclaimers, CCPA disclosures, etc.).
- Recommended replacement: `crypto.randomUUID()`

### `backend/src/kloel/mercado-entrada/mercado-entrada.declarator.service.ts:392`

- Context: `makeEventId()` → `me_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
- What it produces: Spine event IDs emitted by the Mercado de Entrada
  declarator.
- Recommended replacement: `crypto.randomUUID()`

### `backend/src/kloel/mind/mind-prediction.service.ts:159`

- Context: Prediction ID:
  `pred_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
- What it produces: IDs for `GeneratedPrediction` records in the predictive
  coding engine.
- Recommended replacement: `crypto.randomUUID()`

### `backend/src/kloel/mind/mind-prediction.service.ts:177`

- Context: Sequence prediction ID:
  `pred_seq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
- What it produces: IDs for cross-pattern (sequence) predictions.
- Recommended replacement: `crypto.randomUUID()`
## VISUAL findings (low priority, hygiene only)

None found in production code.
## MOCK findings (CLAUDE.md bans these — must remove)

### `backend/src/kloel/kloel-chat-tools.service.ts:536`

- Context: Fake PIX QR code generation inside a tool handler that creates a
  `kloelSale` record with `paymentMethod: 'PIX'` and hardcoded `mockId` /
  `mockAmount`. The `Math.random().toString(16).slice(2, 6).toUpperCase()`
  fakes the CRC16-CCITT checksum field (position `6304`) of a PIX
  "copia e cola" payload. The resulting QR code and payload are returned
  to the chat UI as real-looking payment data.
- What it produces: A plausible-but-fake PIX payment QR code shown to the
  user. This is exactly the kind of fake data / false success state that
  CLAUDE.md bans in production.
- Recommended replacement: Remove the entire mock payment tool handler or
  gate it behind a `process.env.NODE_ENV !== 'production'` check. If real
  PIX integration is needed, use an actual PSP (Mercado Pago, Stripe, etc.)
  that returns a real payload + QR code. The CRC field must come from the
  PSP — never computed client-side with `Math.random()`.
