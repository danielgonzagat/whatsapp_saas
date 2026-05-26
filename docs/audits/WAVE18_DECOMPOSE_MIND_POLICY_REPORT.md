# Wave 18 — Decompose mind-policy.service.ts (Wisdom Priors)

> Authored by PI atomic subagent `w18-decompose-mind-policy` (DeepSeek V4 Pro). Materialized 2026-05-26.


## Summary

Extracted the **CIA Gap 9 wisdom prior logic** (`applyWisdomPriors` + `wisdomAlignsWithOption`) from `mind-policy.service.ts` into a standalone helpers module `mind-policy.wisdom-prior.helpers.ts`. The public API of `MindPolicyService` is preserved unchanged — `choose()` delegates to the extracted function.

## Lines Extracted + New LOC

| File | Before | After | Delta |
|------|--------|-------|-------|
| `mind-policy.service.ts` | 689 LOC | 571 LOC | **−118** |
| `mind-policy.wisdom-prior.helpers.ts` | — | 127 LOC | **+127** |
| **Net** | 689 | 698 | +9 (imports in helpers file) |

## Files Created

- `backend/src/kloel/mind-policy.wisdom-prior.helpers.ts` (127 lines)
  - Exports `applyWisdomPriors()` — standalone function, receives `wisdomFilter`, `wisdomStore`, and `logger` as parameters
  - Internal helper `wisdomAlignsWithOption()` — pattern-option alignment check
  - Constants `WISDOM_SCALE_FACTOR` (0.5) and `WISDOM_PRIOR_TARGET` (1.0)

## Files Modified

- `backend/src/kloel/mind-policy.service.ts`
  - Removed `import type { WisdomPattern }` (no longer directly referenced)
  - Removed `WISDOM_SCALE_FACTOR` and `WISDOM_PRIOR_TARGET` constants
  - Removed private methods `applyWisdomPriors()` and `wisdomAlignsWithOption()`
  - Added `import { applyWisdomPriors } from './mind-policy.wisdom-prior.helpers'`
  - Call site in `choose()` changed from `this.applyWisdomPriors({...})` to `applyWisdomPriors({..., wisdomFilter: this.wisdomFilter, wisdomStore: this.wisdomStore, logger: this.logger})`
  - All other methods (`resolveOutcome`, `resolveOpenForSubject`, `sweepExpiredOutcomes`, `confirmAutopilotOutcome`, `harness`, `mixWithGlobalPrior`, `persist`, `persistResolvedMemories`) untouched

## Backend tsc Result

```
> backend@0.0.1 typecheck
> tsc -p tsconfig.build.json --noEmit

(exit code 0 — no errors)
```

## Spec Result

```
PASS src/kloel/mind-policy.service.spec.ts (9.506 s)

  MindPolicyService
    choose
      ✓ seleciona a acao com menor EFE (expected free energy)
      ✓ registra baseline explicitamente quando fornecido
      ✓ registra baseline como pior candidato quando nao fornecido explicitamente
      ✓ faz fallback para baseline quando lift historico e negativo com samples suficientes
      ✓ NAO faz fallback quando lift e negativo mas samples insuficientes
      ✓ NAO faz fallback quando lift e positivo
      ✓ gera calcSteps auditaveis com formula e belief values
      ✓ inclui epsilon e utility weights no decision para rastreabilidade
      ✓ calcula EFE negativa quando utilidade falha e negativa e variancia alta
      ✓ fallback para baseline automatico quando so ha uma opcao
    wisdom priors (CIA Gap 9)
      ✓ shifts belief mean toward prior target when wisdom pattern matches
      ✓ wisdom filter failure does not block decision — policy still chooses with no shift
      ✓ no patterns in store → no shift, policy proceeds normally
    resolve outcomes with real baseline
      ✓ estima baseline contrafactual quando o caller nao informa baselineOutcome
      ✓ calcula lift diferente de zero quando baselineOutcome diverge do outcome
      ✓ resolveOutcome: records global prior observation when globalPrior is injected
      ✓ resolveOutcome: records failure when outcome is below threshold
      ✓ resolveOutcome: succeeds even when recordObservation throws
      ✓ resolveOpenForSubject: records global prior observations for resolved rows
      ✓ resolveOpenForSubject: skips prior when channel is absent from context
      ✓ resolveOpenForSubject: succeeds even when recordObservation throws

Test Suites: 1 passed, 1 total
Tests:       21 passed, 21 total
```

21/21 tests pass with zero spec modifications.
