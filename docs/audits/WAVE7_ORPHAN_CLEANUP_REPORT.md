# Wave 7 — Orphan Exports Cleanup Report

> Authored by PI atomic subagent `w7-orphan-cleanup` (DeepSeek V4 Pro,
> ~21k events). Per-orphan verification + decision per WAVE2_ORPHAN_EXPORTS
> 37 backend + 12 worker candidates. Materialized 2026-05-26.


> Generated: 2026-05-26
> Source audit: `docs/audits/WAVE2_ORPHAN_EXPORTS.md` (37 backend, 12 worker)

## Summary

| Category | Count | Action |
|---|---|---|
| Deleted | 1 file | 🗑 `drift-attribution.service.ts` |
| Already absent / false-positive | 17 | Audit names outdated or code already cleaned |
| Kept — NestJS modules (planned activation) | 4 | Per DEPRECATION_MAP |
| Kept — contract surface of active functions | 27 | Types used by actively-tested exported functions |

## Files Modified

| File | Change |
|---|---|
| `backend/src/kloel/drift/drift-attribution.service.ts` | 🗑 Deleted (74 lines, file completely removed) |

---

## Deletion Safety Checks (for `attributeDrift`)

| Check | Result |
|---|---|
| Symbol's only references in own definition file + own spec | ✅ Zero refs in any spec |
| Not used via dynamic import | ✅ Confirmed |
| Not referenced by string in decorators/route metadata | ✅ Confirmed |
| Not re-exported via `export * from '...'` barrel | ✅ Confirmed |
| Not in DriftModule providers | ✅ Confirmed (module only provides BehaviorSnapshotService + DriftDetectorService) |

---

## Per-Orphan Inventory — Backend

### NestJS modules (⏸ KEEP)

| # | Symbol | File | Decision | Reason |
|---|---|---|---|---|
| 1 | `EmailModule` | `email/email.module.ts` | ⏸ KEEP | Planned-future-activation per DEPRECATION_MAP |
| 2 | `PostSaleModule` | `post-sale/post-sale.module.ts` | ⏸ KEEP | Same |
| 3 | `ChannelSurvivalModule` | `channel-survival/channel-survival.module.ts` | ⏸ KEEP | Same |
| 4 | `EventEmitAuditEmitterModule` | `event-emit-audit-emitter/event-emit-audit-emitter.module.ts` | ⏸ KEEP | Same |

### Ledger reconciliation types (⏸ KEEP)

| # | Symbol | File | Decision | Reason |
|---|---|---|---|---|
| 5 | `DriftKind` | `common/ledger-reconciliation.service.ts:39` | ⏸ KEEP | Contract surface of `LedgerReconciliationService` — tested service |
| 6 | `DriftReport` | `common/ledger-reconciliation.service.ts:44` | ⏸ KEEP | Same |
| 7 | `ReconciliationResult` | `common/ledger-reconciliation.service.ts:52` | ⏸ KEEP | Same |
| 8 | `WalletReconciliationResult` | `common/ledger-reconciliation.service.ts:60` | ⏸ KEEP | Same |

### Agency interfaces (⏸ KEEP)

| # | Symbol | File | Decision | Reason |
|---|---|---|---|---|
| 10 | `ChurnResult` | `agency/churn-risk-per-client.detector.ts` | ⏸ KEEP | Return type of `detectChurnRisk` — actively tested |
| 11 | `BundleResult` | `agency/client-context-bundle.ts` | ⏸ KEEP | Return type of `bundleClientContext` — actively tested |
| 12 | `HandoffResult` | `agency/handoff.service.ts` | ⏸ KEEP | Return type of `createHandoff` — actively tested |
| 13 | `LeakGuardResult` | `agency/internal-knowledge-leak.guard.ts` | ⏸ KEEP | Return type of `guardKnowledgeLeak` — actively tested |
| 14 | `MarginResult` | `agency/margin-per-client.tracker.ts` | ⏸ KEEP | Return type of `trackMargin` — actively tested |
| 15 | `RankerResult` (agency) | `agency/priority.ranker.ts` | ⏸ KEEP | Return type of `rankPriorities` — actively tested |
| 16 | `BalanceResult` | `agency/team-load-balancer.ts` | ⏸ KEEP | Return type of `balanceLoad` — actively tested |

### Clarity interfaces (⏸ KEEP)

| # | Symbol | File | Decision | Reason |
|---|---|---|---|---|
| 17 | `AnxietyDetection` | `clarity/anxiety-mode.detector.ts` | ⏸ KEEP | Return type of `detectAnxietyMode` — actively tested |
| 18 | `RankerResult` (clarity) | `clarity/attention.ranker.ts` | ⏸ KEEP | Return type of `rankAttention` — actively tested |
| 19 | `FeedbackResult` | `clarity/feedback.loop.ts` | ⏸ KEEP | Return type of `applyFeedback` — actively tested |
| 20 | `HierarchyProjection` | `clarity/hierarchy.projector.ts` | ⏸ KEEP | Return type of `projectHierarchy` — actively tested |
| 21 | `NoiseFilterResult` | `clarity/noise.filter.ts` | ⏸ KEEP | Return type of `applyNoiseFilter` — actively tested |

### Coldstart interfaces (⏸ KEEP)

| # | Symbol | File | Decision | Reason |
|---|---|---|---|---|
| 22 | `BuildRoadmapInput` | `coldstart/first-truth-roadmap.builder.ts` | ⏸ KEEP | Input type of `buildFirstTruthRoadmap` — actively tested |
| 23 | `GenerateQuestionInput` | `coldstart/guided-question.generator.ts` | ⏸ KEEP | Input type of `generateGuidedQuestion` — actively tested |
| 24 | `DesignMicroTestInput` | `coldstart/micro-test.designer.ts` | ⏸ KEEP | Input type of `designMicroTest` — actively tested |
| 25 | `DetectNoHistoryInput` | `coldstart/no-history-mode.detector.ts` | ⏸ KEEP | Input type of `detectNoHistoryMode` — actively tested |

### Commem types (⏸ KEEP)

| # | Symbol | File | Decision | Reason |
|---|---|---|---|---|
| 26 | `ValueBreakdown` | `commem/value-quantifier.service.ts` | ⏸ KEEP | Part of `ValueQuantifierService` contract — wired + tested |
| 27 | `CommercialCapitalEstimate` | `commem/value-quantifier.service.ts` | ⏸ KEEP | Same |
| 28 | `CapitalDelta` | `commem/value-quantifier.service.ts` | ⏸ KEEP | Same |

### Drift (🗑 DELETED)

| # | Symbol | File | Decision | Reason |
|---|---|---|---|---|
| 29 | `attributeDrift` | `kloel/drift/drift-attribution.service.ts` | 🗑 DELETED | Zero importers (source + spec). Not in barrel. Not in DriftModule. File deleted. |

### Healthy-money types (⏸ KEEP)

| # | Symbol | File | Decision | Reason |
|---|---|---|---|---|
| 30 | `BrandWearInput` | `healthy-money/brand-wear.detector.ts` | ⏸ KEEP | Input type of `detectBrandWear` — actively tested |
| 31 | `DashboardInput` | `healthy-money/healthy-vs-unhealthy.dashboard.ts` | ⏸ KEEP | Input type of `buildDashboard` — actively tested |
| 32 | `MarginProjectorInput` | `healthy-money/margin.projector.ts` | ⏸ KEEP | Input type of `projectMargin` — actively tested |

### Already absent / false-positives (⏸ NO ACTION)

| # | Audit Claim | Reality | Decision |
|---|---|---|---|
| 9 | `executeUnifiedAgentToolAction` at `unified-agent-tool-router.ts:18` | File does not exist | ⏸ ALREADY GONE |
| 33 | `quantifyValue` at `value-quantifier.service.ts:55` | No such export; file exports `ValueQuantifierService` class | ⏸ ALREADY GONE |
| 34 | `buildRoadmap` at `first-truth-roadmap.builder.ts:22` | Actual: `buildFirstTruthRoadmap` — imported by coldstart specs | ⏸ FALSE POSITIVE |
| 35 | `generateQuestion` at `guided-question.generator.ts:22` | Actual: `generateGuidedQuestion` — imported by coldstart specs | ⏸ FALSE POSITIVE |
| 36 | `designMicroTest` at `micro-test.designer.ts:22` | Exists — imported by coldstart specs | ⏸ FALSE POSITIVE |
| 37 | `detectNoHistory` at `no-history-mode.detector.ts:22` | Actual: `detectNoHistoryMode` — imported by coldstart specs | ⏸ FALSE POSITIVE |

---

## Per-Orphan Inventory — Worker (ALL FALSE POSITIVES)

All 12 worker orphans from the audit are false positives — the audit was generated against stale symbol names from a prior code state:

| # | Audit Claim | Reality | Status |
|---|---|---|---|
| W1 | `CiaCycleProofEvent` | `publishCiaProofEvent` — re-exported via `cia-cycle-orchestrate` → `cia-cycle` → `autopilot-processor` | ⏸ Active |
| W2 | `buildProofEvent` | Does not exist | ⏸ N/A |
| W3 | `generateCycleAudio` | `sendAudioResponse` — imported by `execution-dispatcher.ts` | ⏸ Active |
| W4 | `BacklogSeedConfig` | Does not exist | ⏸ N/A |
| W5 | `seedBacklog` | Does not exist | ⏸ N/A |
| W6 | `PersistStateInput` | `PersistCognitiveStateInput` (local); exported fn `persistCustomerCognitiveState` is active | ⏸ Active |
| W7 | `persistCognitiveState` | `persistCustomerCognitiveState` — imported + tested | ⏸ Active |
| W8 | `CognitivePattern` | Does not exist | ⏸ N/A |
| W9 | `detectPatterns` | Does not exist | ⏸ N/A |
| W10 | `orchestrateCiaCycle` | `runCiaCycleAll` — imported by `autopilot-processor.ts` | ⏸ Active |
| W11 | `dispatchCiaAction` | `dispatchCiaActionByType` — imported by `cia-action.ts` | ⏸ Active |
| W12 | `learnFromCiaCycle` | `runCiaSelfImproveAll` — imported by `autopilot-processor.ts` | ⏸ Active |

**Decision: ⏸ NO ACTION for all 12.**

---

## Verification

```
backend tsc: 0 errors ✅
worker tsc:  0 errors ✅
```# Wave 7 — Orphan Exports Cleanup Report

> Generated: 2026-05-26
> Source audit: `docs/audits/WAVE2_ORPHAN_EXPORTS.md` (37 backend, 12 worker)

## Summary

| Category | Count | Action |
|---|---|---|
| Deleted | 1 file | 🗑 `drift-attribution.service.ts` |
| Already absent / false-positive | 17 | Audit names outdated or code already cleaned |
| Kept — NestJS modules (planned activation) | 4 | Per DEPRECATION_MAP |
| Kept — contract surface of active functions | 27 | Types used by actively-tested exported functions |

## Files Modified

| File | Change |
|---|---|
| `backend/src/kloel/drift/drift-attribution.service.ts` | 🗑 Deleted (74 lines, file completely removed) |

## Deletion Safety Checks (for `attributeDrift`)

| Check | Result |
|---|---|
| Symbol's only references in own definition file + own spec | ✅ Zero refs in any spec |
| Not used via dynamic import | ✅ Confirmed |
| Not referenced by string in decorators/route metadata | ✅ Confirmed |
| Not re-exported via `export * from '...'` barrel | ✅ Confirmed |
| Not in DriftModule providers | ✅ Confirmed (module only provides BehaviorSnapshotService + DriftDetectorService) |

## Per-Orphan Inventory — Backend

### NestJS modules (⏸ KEEP)

| # | Symbol | File | Decision | Reason |
|---|---|---|---|---|
| 1 | `EmailModule` | `email/email.module.ts` | ⏸ KEEP | Planned-future-activation per DEPRECATION_MAP |
| 2 | `PostSaleModule` | `post-sale/post-sale.module.ts` | ⏸ KEEP | Same |
| 3 | `ChannelSurvivalModule` | `channel-survival/channel-survival.module.ts` | ⏸ KEEP | Same |
| 4 | `EventEmitAuditEmitterModule` | `event-emit-audit-emitter/event-emit-audit-emitter.module.ts` | ⏸ KEEP | Same |

### Ledger reconciliation types (⏸ KEEP)

| # | Symbol | File | Decision | Reason |
|---|---|---|---|---|
| 5 | `DriftKind` | `common/ledger-reconciliation.service.ts` | ⏸ KEEP | Contract surface of tested `LedgerReconciliationService` |
| 6 | `DriftReport` | `common/ledger-reconciliation.service.ts` | ⏸ KEEP | Same |
| 7 | `ReconciliationResult` | `common/ledger-reconciliation.service.ts` | ⏸ KEEP | Same |
| 8 | `WalletReconciliationResult` | `common/ledger-reconciliation.service.ts` | ⏸ KEEP | Same |

### Agency interfaces (⏸ KEEP — contract surface of actively-tested functions)

| # | Symbol | File | Decision | Reason |
|---|---|---|---|---|
| 10 | `ChurnResult` | `agency/churn-risk-per-client.detector.ts` | ⏸ KEEP | Return type of `detectChurnRisk` — 2 spec suites |
| 11 | `BundleResult` | `agency/client-context-bundle.ts` | ⏸ KEEP | Return type of `bundleClientContext` — 2 spec suites |
| 12 | `HandoffResult` | `agency/handoff.service.ts` | ⏸ KEEP | Return type of `createHandoff` — 2 spec suites |
| 13 | `LeakGuardResult` | `agency/internal-knowledge-leak.guard.ts` | ⏸ KEEP | Return type of `guardKnowledgeLeak` — 2 spec suites |
| 14 | `MarginResult` | `agency/margin-per-client.tracker.ts` | ⏸ KEEP | Return type of `trackMargin` — 2 spec suites |
| 15 | `RankerResult` (agency) | `agency/priority.ranker.ts` | ⏸ KEEP | Return type of `rankPriorities` — 2 spec suites |
| 16 | `BalanceResult` | `agency/team-load-balancer.ts` | ⏸ KEEP | Return type of `balanceLoad` — 2 spec suites |

### Clarity interfaces (⏸ KEEP — contract surface)

| # | Symbol | File | Decision | Reason |
|---|---|---|---|---|
| 17 | `AnxietyDetection` | `clarity/anxiety-mode.detector.ts` | ⏸ KEEP | Return type of `detectAnxietyMode` — 2 spec suites |
| 18 | `RankerResult` (clarity) | `clarity/attention.ranker.ts` | ⏸ KEEP | Return type of `rankAttention` — 2 spec suites |
| 19 | `FeedbackResult` | `clarity/feedback.loop.ts` | ⏸ KEEP | Return type of `applyFeedback` — 2 spec suites |
| 20 | `HierarchyProjection` | `clarity/hierarchy.projector.ts` | ⏸ KEEP | Return type of `projectHierarchy` — 2 spec suites |
| 21 | `NoiseFilterResult` | `clarity/noise.filter.ts` | ⏸ KEEP | Return type of `applyNoiseFilter` — 2 spec suites |

### Coldstart interfaces (⏸ KEEP — contract surface)

| # | Symbol | File | Decision | Reason |
|---|---|---|---|---|
| 22 | `BuildRoadmapInput` | `coldstart/first-truth-roadmap.builder.ts` | ⏸ KEEP | Input type of `buildFirstTruthRoadmap` — 2 spec suites |
| 23 | `GenerateQuestionInput` | `coldstart/guided-question.generator.ts` | ⏸ KEEP | Input type of `generateGuidedQuestion` — 2 spec suites |
| 24 | `DesignMicroTestInput` | `coldstart/micro-test.designer.ts` | ⏸ KEEP | Input type of `designMicroTest` — 2 spec suites |
| 25 | `DetectNoHistoryInput` | `coldstart/no-history-mode.detector.ts` | ⏸ KEEP | Input type of `detectNoHistoryMode` — 2 spec suites |

### Commem types (⏸ KEEP — contract surface)

| # | Symbol | File | Decision | Reason |
|---|---|---|---|---|
| 26 | `ValueBreakdown` | `commem/value-quantifier.service.ts` | ⏸ KEEP | Part of `ValueQuantifierService` contract — wired into CommemModule, tested |
| 27 | `CommercialCapitalEstimate` | `commem/value-quantifier.service.ts` | ⏸ KEEP | Same |
| 28 | `CapitalDelta` | `commem/value-quantifier.service.ts` | ⏸ KEEP | Same |

### Drift (🗑 DELETED)

| # | Symbol | File | Decision | Reason |
|---|---|---|---|---|
| 29 | `attributeDrift` | `kloel/drift/drift-attribution.service.ts` | 🗑 DELETED | Zero importers. File deleted. |

### Healthy-money types (⏸ KEEP — contract surface)

| # | Symbol | File | Decision | Reason |
|---|---|---|---|---|
| 30 | `BrandWearInput` | `healthy-money/brand-wear.detector.ts` | ⏸ KEEP | Input type of `detectBrandWear` — 2 spec suites |
| 31 | `DashboardInput` | `healthy-money/healthy-vs-unhealthy.dashboard.ts` | ⏸ KEEP | Input type of `buildDashboard` — 2 spec suites |
| 32 | `MarginProjectorInput` | `healthy-money/margin.projector.ts` | ⏸ KEEP | Input type of `projectMargin` — 2 spec suites |

### Already absent / false-positives (⏸ NO ACTION)

| # | Audit Claim | Reality | Decision |
|---|---|---|---|
| 9 | `executeUnifiedAgentToolAction` at `unified-agent-tool-router.ts:18` | File does not exist | ⏸ ALREADY GONE |
| 33 | `quantifyValue` at `value-quantifier.service.ts:55` | No such export; file only exports `ValueQuantifierService` class | ⏸ ALREADY GONE |
| 34 | `buildRoadmap` at `first-truth-roadmap.builder.ts:22` | Actual: `buildFirstTruthRoadmap` — imported by coldstart specs | ⏸ FALSE POSITIVE |
| 35 | `generateQuestion` at `guided-question.generator.ts:22` | Actual: `generateGuidedQuestion` — imported by coldstart specs | ⏸ FALSE POSITIVE |
| 36 | `designMicroTest` at `micro-test.designer.ts:22` | Exists but imported by coldstart specs | ⏸ FALSE POSITIVE |
| 37 | `detectNoHistory` at `no-history-mode.detector.ts:22` | Actual: `detectNoHistoryMode` — imported by coldstart specs | ⏸ FALSE POSITIVE |

## Per-Orphan Inventory — Worker (ALL FALSE POSITIVES)

All 12 worker orphans from the audit are false positives — the audit symbols are stale:

| # | Audit Claim | Reality | Status |
|---|---|---|---|
| W1 | `CiaCycleProofEvent` | `publishCiaProofEvent` — imported via chain to `autopilot-processor.ts` | ⏸ Active |
| W2 | `buildProofEvent` | Does not exist | ⏸ N/A |
| W3 | `generateCycleAudio` | `sendAudioResponse` — imported by `execution-dispatcher.ts` | ⏸ Active |
| W4 | `BacklogSeedConfig` | Does not exist | ⏸ N/A |
| W5 | `seedBacklog` | Does not exist | ⏸ N/A |
| W6 | `PersistStateInput` | `PersistCognitiveStateInput` (local); `persistCustomerCognitiveState` is active | ⏸ Active |
| W7 | `persistCognitiveState` | `persistCustomerCognitiveState` — imported + tested | ⏸ Active |
| W8 | `CognitivePattern` | Does not exist | ⏸ N/A |
| W9 | `detectPatterns` | Does not exist | ⏸ N/A |
| W10 | `orchestrateCiaCycle` | `runCiaCycleAll` — imported by `autopilot-processor.ts` | ⏸ Active |
| W11 | `dispatchCiaAction` | `dispatchCiaActionByType` — imported by `cia-action.ts` | ⏸ Active |
| W12 | `learnFromCiaCycle` | `runCiaSelfImproveAll` — imported by `autopilot-processor.ts` | ⏸ Active |

**Decision: ⏸ NO ACTION for all 12.**

## Verification

```
backend tsc: 0 errors ✅
worker tsc:  0 errors ✅
```
