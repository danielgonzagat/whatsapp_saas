# Wave 14 — CIA Gap 6 Closure Report

> Authored by PI atomic subagent `w14-cia-gap-6-prior-closure` (DeepSeek V4 Pro). Materialized 2026-05-26.


**Date:** 2026-05-26
**Task:** Close MIND policy → global prior loop (CIA Gap 6)
**Status:** ✅ Complete

---

## 1. Files Modified

| File | Change |
|---|---|
| `backend/src/kloel/mind-policy.service.ts` | Added `recordObservation()` calls in `resolveOutcome()` and `resolveOpenForSubject()` after successful outcome resolution, wrapped in try/catch |
| `backend/src/kloel/mind-policy.service.spec.ts` | Added 8 unit tests covering prior recording, failure thresholds, missing channels, and error resilience |

---

## 2. Test Results

```
PASS src/kloel/mind-policy.service.spec.ts (7.376 s)
  MindPolicyService
    choose
      ✓ seleciona a acao com menor EFE (expected free energy) (5 ms)
      ✓ registra baseline explicitamente quando fornecido (1 ms)
      ✓ registra baseline como pior candidato quando nao fornecido explicitamente (1 ms)
      ✓ faz fallback para baseline quando lift historico e negativo com samples suficientes (1 ms)
      ✓ NAO faz fallback quando lift e negativo mas samples insuficientes (1 ms)
      ✓ NAO faz fallback quando lift e positivo (1 ms)
      ✓ gera calcSteps auditaveis com formula e belief values (1 ms)
      ✓ inclui epsilon e utility weights no decision para rastreabilidade (1 ms)
      ✓ calcula EFE negativa quando utilidade falha e negativa e variancia alta
      ✓ fallback para baseline automatico quando so ha uma opcao
    resolve outcomes with real baseline
      ✓ estima baseline contrafactual quando o caller nao informa baselineOutcome (1 ms)
      ✓ calcula lift diferente de zero quando baselineOutcome diverge do outcome
      ✓ resolveOutcome: records global prior observation when globalPrior is injected (1 ms)
      ✓ resolveOutcome: records failure when outcome is below threshold
      ✓ resolveOutcome: succeeds even when recordObservation throws (1 ms)
      ✓ resolveOpenForSubject: records global prior observations for resolved rows
      ✓ resolveOpenForSubject: skips prior when channel is absent from context (1 ms)
      ✓ resolveOpenForSubject: succeeds even when recordObservation throws

Test Suites: 1 passed, 1 total
Tests:       18 passed, 18 total
```

---

## 3. Backend tsc Result

```
✓ typecheck: tsc -p tsconfig.build.json --noEmit — exit code 0, no errors
```

---

## 4. Decision Tree

```
MindPolicyService.choose()
  └─ mixWithGlobalPrior()
       └─ KloelGlobalPriorService.getPrior(channel, decisionType, action)
            └─ Reads kloelGlobalPrior table — feeds Bayesian prior into EFE calculation

[Gap 6 closure — NEW]

MindPolicyService.resolveOutcome(workspaceId, outcomeKey, outcome)
  └─ After tx commit:
       └─ extractChannel(row.context) -> channel
            └─ KloelGlobalPriorService.recordObservation(channel, decisionType, action, success)
                 └─ Upserts kloelGlobalPrior table
                 └─ success = outcome >= 0.5

MindPolicyService.resolveOpenForSubject(subject, decisionType, outcome)
  └─ After resolution:
       └─ extractChannel(row.context) -> channel
            └─ KloelGlobalPriorService.recordObservation(channel, decisionType, action, success)
                 └─ Upserts kloelGlobalPrior table
                 └─ success = outcome >= 0.5

DecisionOutcomeService.closeOutcome()
  └─ (pre-existing) KloelGlobalPriorService.recordObservation(channel, decisionType, chosenAction, wonVsBaseline)

Callers of resolveOutcome:
  - MindController.resolve()       → POST /api/mind/:workspaceId/resolve
  - MindEventProcessorService      → reply success/failure

Callers of resolveOpenForSubject:
  - CiaSendHelpersService          → autopilot_action after WhatsApp send
  - MindEventProcessorService      → followup_timing, audio_vs_text, message_format, tom, channel_choice
```

---

## 5. Design Notes

### Success threshold
`outcome >= 0.5` maps to success. Callers pass `0` or `1`; the DTO accepts `[-1, 1]`. This threshold correctly maps the binary usage pattern and is consistent with the normalized outcome range.

### Transaction safety
- `resolveOutcome`: Prior rows are collected inside the transaction callback but `recordObservation()` is called **after** `$transaction` returns, using the main `PrismaService` (not the transaction client). This avoids cross-connection issues.
- `resolveOpenForSubject`: Called after `updateMany` + `persistResolvedMemories` complete — outside any transaction.

### Error isolation
Both calls wrap `recordObservation()` in try/catch with `this.logger.error()`. A failing prior service does **not** block policy resolution — the outcome is already resolved and persisted before the prior call.

### Workspace opt-out
- The `choose()` flow already checks `workspace.globalPriorOptOut` and skips `getPrior()` when opted out. This check is in `mixWithGlobalPrior()`.
- The new `recordObservation()` calls do **not** re-check opt-out because:
  1. Opt-out only controls whether the workspace **consumes** global priors, not whether it **contributes** observations.
  2. The `DecisionOutcomeService.closeOutcome()` (pre-existing) follows the same pattern — it records without checking opt-out.
  3. The `recordObservation()` call is fire-and-forget; it costs one upsert and does not affect behavioral decisions for the opted-out workspace.
