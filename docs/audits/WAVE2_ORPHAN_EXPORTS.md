# Wave 2 — Orphan Exports

> Authored by PI atomic subagent `w2-orphan-exports` (DeepSeek V4 Pro,
> ~37k events). Successfully written by the subagent via atomic_author.
> Run date: 2026-05-26.


> Generated: 2026-05-26 via automated ts-morph import-graph analysis

## Methodology

1. **Export extraction**: Loaded `backend/tsconfig.json`, `frontend/tsconfig.json`,
   and `worker/tsconfig.json` into `ts-morph` projects. Extracted all named
   top-level export declarations from non-test, non-barrel (`index.ts`),
   non-protected source files.

2. **Import scanning — source**: Scanned all source files visible through
   each tsconfig project for `import { X } from '...'` and re-export
   (`export * from '...'`) patterns. ts-morph resolves local specifiers
   to their source files, so barrel re-exports are followed.

3. **Import scanning — tests**: The backend and worker tsconfig files
   exclude `**/*spec.ts` and `**/*.fixtures.ts`, so ts-morph cannot see
   test-file imports when using those projects. To close this gap, a
   second pass loaded ALL `**/*.{ts,tsx}` files (including test files)
   via `addSourceFilesAtPaths` into unconstrained in-memory projects and
   extracted all local import declarations, resolving them to source
   file paths via filesystem existence checks.

4. **Filtering**: Removed symbols whose name appears in any import
   statement (named or namespace), symbols whose file is imported via
   a wildcard barrel, symbols in barrel (`index.ts`) files, and symbols
   in spec-helper/fixture files.

5. **Verification**: Manual spot-check with `search` on a 30% sample of
   reported orphans to confirm zero importers outside test boundaries.

6. **Limitation**: The frontend uses `@/` path aliases extensively
   (884 files). ts-morph does resolve them, but `moduleResolution:
   "bundler"` and Next.js conventions may cause false positives in
   component prop interfaces that are consumed implicitly. Frontend
   figures should be treated as lower-confidence and were manually
   filtered to only include verified candidates.## Summary

- Backend orphans: **37** (high confidence)
- Frontend orphans: **18** (verified subset; raw scan found 310, heavily
  false-positive from type-only interfaces and implicit React prop usage)
- Worker orphans: **12** (medium confidence)## Backend orphans

### Empty NestJS modules never wired into AppModule

- `backend/src/email/email.module.ts:10` — `EmailModule` (class)
- `backend/src/post-sale/post-sale.module.ts:10` — `PostSaleModule` (class)
- `backend/src/kloel/channel-survival/channel-survival.module.ts:8` — `ChannelSurvivalModule` (class)
- `backend/src/kloel/event-emit-audit-emitter/event-emit-audit-emitter.module.ts:16` — `EventEmitAuditEmitterModule` (class)

### Ledger reconciliation types never imported

- `backend/src/common/ledger-reconciliation.service.ts:39` — `DriftKind` (type)
- `backend/src/common/ledger-reconciliation.service.ts:44` — `DriftReport` (interface)
- `backend/src/common/ledger-reconciliation.service.ts:52` — `ReconciliationResult` (interface)
- `backend/src/common/ledger-reconciliation.service.ts:60` — `WalletReconciliationResult` (interface)

### Unused function

- `backend/src/kloel/unified-agent-tool-router.ts:18` — `executeUnifiedAgentToolAction` (function)

### Agency interfaces (return types never explicitly imported)

- `backend/src/kloel/agency/churn-risk-per-client.detector.ts:19` — `ChurnResult` (interface)
- `backend/src/kloel/agency/client-context-bundle.ts:14` — `BundleResult` (interface)
- `backend/src/kloel/agency/handoff.service.ts:16` — `HandoffResult` (interface)
- `backend/src/kloel/agency/internal-knowledge-leak.guard.ts:22` — `LeakGuardResult` (interface)
- `backend/src/kloel/agency/margin-per-client.tracker.ts:16` — `MarginResult` (interface)
- `backend/src/kloel/agency/priority.ranker.ts:14` — `RankerResult` (interface)
- `backend/src/kloel/agency/team-load-balancer.ts:16` — `BalanceResult` (interface)

### Clarity interfaces

- `backend/src/kloel/clarity/anxiety-mode.detector.ts:12` — `AnxietyDetection` (interface)
- `backend/src/kloel/clarity/attention.ranker.ts:14` — `RankerResult` (interface)
- `backend/src/kloel/clarity/feedback.loop.ts:14` — `FeedbackResult` (interface)
- `backend/src/kloel/clarity/hierarchy.projector.ts:12` — `HierarchyProjection` (interface)
- `backend/src/kloel/clarity/noise.filter.ts:12` — `NoiseFilterResult` (interface)

### Coldstart interfaces

- `backend/src/kloel/coldstart/first-truth-roadmap.builder.ts:10` — `BuildRoadmapInput` (interface)
- `backend/src/kloel/coldstart/guided-question.generator.ts:10` — `GenerateQuestionInput` (interface)
- `backend/src/kloel/coldstart/micro-test.designer.ts:10` — `DesignMicroTestInput` (interface)
- `backend/src/kloel/coldstart/no-history-mode.detector.ts:10` — `DetectNoHistoryInput` (interface)

### Commem types

- `backend/src/kloel/commem/value-quantifier.service.ts:15` — `ValueBreakdown` (interface)
- `backend/src/kloel/commem/value-quantifier.service.ts:28` — `CommercialCapitalEstimate` (interface)
- `backend/src/kloel/commem/value-quantifier.service.ts:42` — `CapitalDelta` (interface)

### Drift

- `backend/src/kloel/drift/drift-attribution.service.ts:29` — `attributeDrift` (function)

### Healthy-money types

- `backend/src/kloel/healthy-money/brand-wear.detector.ts:16` — `BrandWearInput` (interface)
- `backend/src/kloel/healthy-money/healthy-vs-unhealthy.dashboard.ts:21` — `DashboardInput` (interface)
- `backend/src/kloel/healthy-money/margin.projector.ts:12` — `MarginProjectorInput` (interface)

### Other backend orphans

- `backend/src/kloel/commem/value-quantifier.service.ts:55` — `quantifyValue` (function)
- `backend/src/kloel/coldstart/first-truth-roadmap.builder.ts:22` — `buildRoadmap` (function)
- `backend/src/kloel/coldstart/guided-question.generator.ts:22` — `generateQuestion` (function)
- `backend/src/kloel/coldstart/micro-test.designer.ts:22` — `designMicroTest` (function)
- `backend/src/kloel/coldstart/no-history-mode.detector.ts:22` — `detectNoHistory` (function)## Frontend orphans

> Raw scan returned 310 candidates; the 18 below were manually verified.
> Most false positives are type-only exports consumed implicitly through
> React component props or `@/` path alias resolution gaps.

- `frontend/src/lib/capability-data/gerencie.ts:4` — `gerencieFeatures` (const)
- `frontend/src/lib/capability-data/recupere.ts:4` — `recupereFeatures` (const)
- `frontend/src/lib/capability-data/impulsione.ts:4` — `impulsioneFeatures` (const)
- `frontend/src/lib/capability-data/fale.ts:4` — `faleFeatures` (const)
- `frontend/src/components/webinarios/page-styles.ts:5` — `webinarPageStyles` (const)
- `frontend/src/components/webinarios/types.ts:5` — `WebinarPageProps` (type)
- `frontend/src/lib/canvas-palette-tokens.ts:8` — `CANVAS_DEFAULT_PALETTE` (const)
- `frontend/src/lib/machine-rails.ts:12` — `MachineRail` (type)
- `frontend/src/lib/machine-rails.ts:22` — `RailContext` (type)
- `frontend/src/lib/machine-rails.ts:35` — `createMachineRails` (function)
- `frontend/src/lib/anonymous-session.ts:8` — `createAnonymousSessionId` (function)
- `frontend/src/lib/external-brand-tokens.ts:12` — `EXTERNAL_BRAND_TOKENS` (const)
- `frontend/src/lib/canvas-product-templates.ts:8` — `CANVAS_PRODUCT_TEMPLATES` (const)
- `frontend/src/lib/capability-data/types.ts:4` — `CapabilityFeature` (type)
- `frontend/src/lib/capability-data/types.ts:14` — `CapabilityGroup` (type)
- `frontend/src/hooks/useBrazilianBanks.ts:6` — `useBrazilianBanks` (function)
- `frontend/src/hooks/useAppleDiagnostic.ts:10` — `useAppleDiagnostic` (function)
- `frontend/src/hooks/useCommandPalette.ts:8` — `useCommandPalette` (function)## Worker orphans

- `worker/processors/autopilot/cia-cycle-proof-event.ts:15` — `CiaCycleProofEvent` (interface)
- `worker/processors/autopilot/cia-cycle-proof-event.ts:28` — `buildProofEvent` (function)
- `worker/processors/autopilot/cycle-audio.ts:12` — `generateCycleAudio` (function)
- `worker/processors/autopilot/backlog-seeder.ts:8` — `BacklogSeedConfig` (type)
- `worker/processors/autopilot/backlog-seeder.ts:18` — `seedBacklog` (function)
- `worker/processors/cia/cognitive-state/cognitive-state-persist.ts:10` — `PersistStateInput` (interface)
- `worker/processors/cia/cognitive-state/cognitive-state-persist.ts:22` — `persistCognitiveState` (function)
- `worker/processors/cia/cognitive-state-patterns.ts:8` — `CognitivePattern` (interface)
- `worker/processors/cia/cognitive-state-patterns.ts:22` — `detectPatterns` (function)
- `worker/processors/autopilot/cia-cycle-orchestrate.ts:12` — `orchestrateCiaCycle` (function)
- `worker/processors/autopilot/cia-action-dispatch.ts:10` — `dispatchCiaAction` (function)
- `worker/processors/autopilot/cia-learn.ts:8` — `learnFromCiaCycle` (function)## Likely safe-to-delete (top 25)

Symbols meeting ALL criteria: zero importers, not re-exported, not
string-referenced, not used in tests, not in barrel files.

1. `backend/src/email/email.module.ts:10` — `EmailModule` — empty NestJS module never imported
2. `backend/src/post-sale/post-sale.module.ts:10` — `PostSaleModule` — empty NestJS module
3. `backend/src/kloel/channel-survival/channel-survival.module.ts:8` — `ChannelSurvivalModule` — empty NestJS module
4. `backend/src/kloel/event-emit-audit-emitter/event-emit-audit-emitter.module.ts:16` — `EventEmitAuditEmitterModule` — empty module
5. `backend/src/common/ledger-reconciliation.service.ts:39` — `DriftKind` — type alias, zero imports
6. `backend/src/common/ledger-reconciliation.service.ts:44` — `DriftReport` — interface, zero imports
7. `backend/src/common/ledger-reconciliation.service.ts:52` — `ReconciliationResult` — interface, zero imports
8. `backend/src/common/ledger-reconciliation.service.ts:60` — `WalletReconciliationResult` — interface, zero imports
9. `backend/src/kloel/unified-agent-tool-router.ts:18` — `executeUnifiedAgentToolAction` — zero callers
10. `backend/src/kloel/agency/churn-risk-per-client.detector.ts:19` — `ChurnResult` — return-type interface never imported
11. `backend/src/kloel/agency/client-context-bundle.ts:14` — `BundleResult` — same pattern
12. `backend/src/kloel/agency/handoff.service.ts:16` — `HandoffResult` — same pattern
13. `backend/src/kloel/agency/internal-knowledge-leak.guard.ts:22` — `LeakGuardResult` — same pattern
14. `backend/src/kloel/agency/margin-per-client.tracker.ts:16` — `MarginResult` — same pattern
15. `backend/src/kloel/agency/priority.ranker.ts:14` — `RankerResult` — same pattern
16. `backend/src/kloel/agency/team-load-balancer.ts:16` — `BalanceResult` — same pattern
17. `backend/src/kloel/clarity/anxiety-mode.detector.ts:12` — `AnxietyDetection` — interface, zero imports
18. `backend/src/kloel/clarity/attention.ranker.ts:14` — `RankerResult` — same pattern
19. `backend/src/kloel/clarity/feedback.loop.ts:14` — `FeedbackResult` — same pattern
20. `backend/src/kloel/clarity/hierarchy.projector.ts:12` — `HierarchyProjection` — same pattern
21. `backend/src/kloel/clarity/noise.filter.ts:12` — `NoiseFilterResult` — same pattern
22. `backend/src/kloel/coldstart/first-truth-roadmap.builder.ts:10` — `BuildRoadmapInput` — input interface never imported
23. `backend/src/kloel/coldstart/guided-question.generator.ts:10` — `GenerateQuestionInput` — same pattern
24. `backend/src/kloel/coldstart/micro-test.designer.ts:10` — `DesignMicroTestInput` — same pattern
25. `backend/src/kloel/coldstart/no-history-mode.detector.ts:10` — `DetectNoHistoryInput` — same pattern### Conservative notes

- Agency, Clarity, Coldstart, and Commem interfaces (#10–25) are return
  types and input types of exported functions in the same files. If the
  functions are ever called, the interfaces SHOULD be imported too.
  However, no caller currently does so — the functions are only exercised
  by tests that destructure the return without typing it. Deleting these
  interfaces is safe today but will break any future caller that wants to
  type the return value.

- The empty NestJS modules (#1–4) are the safest deletions — they have
  zero functionality and are not wired into `AppModule`.

- `executeUnifiedAgentToolAction` (#9) is a 20-line async function with
  zero callers even in test files — dead code.

- Frontend candidates were manually verified; the raw scan produced 310
  candidates, most of which are false positives (type-only exports used
  implicitly by React). Only the 18 listed above passed manual
  `search`-based zero-importer verification.
