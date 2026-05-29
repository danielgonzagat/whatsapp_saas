# Kloel Deprecation Map

> **PI Task K24** — Every deprecated symbol, with canonical replacement and migration deadline.
> Populated from `@deprecated` JSDoc annotations, re-export shims, and ADR-0013 alias window entries.

---

## Active Deprecations

| # | Deprecated symbol | Replacement | Source file | Deadline | Status |
|---|---|---|---|---|---|
| 1 | `AuthService.refreshToken()` (legacy function) | `AuthTokenService.refresh()` | `backend/src/auth/auth-service.tokens.ts:194` | ADR-0013 +4wk | 🔴 P0 |
| 2 | `CiaService` (legacy path `backend/src/cia/`) | `MindLearningAdapter` (`kloel/mind/cia/cia.service.ts`) | `backend/src/kloel/mind/cia/index.ts:24` | ADR-0013 +4wk | 🔴 P0 |
| 3 | `KloelLeadBrainService` | `LeadMindCoordinator` | `backend/src/kloel/mind/coordination/lead-mind-coordinator.service.ts:434` | ADR-0013 +4wk | 🔴 P0 |
| 4 | `BrainAutonomyService` | `MindAutonomyCoordinator` | `backend/src/kloel/mind/coordination/mind-autonomy-coordinator.service.ts:104` | ADR-0013 +4wk | 🔴 P0 |
| 5 | `BrainCapabilityExecutorService` | `MindCapabilityExecutor` | `backend/src/kloel/mind/coordination/mind-capability-executor.service.ts:534` | ADR-0013 +4wk | 🔴 P0 |
| 6 | `BrainCapabilityRegistryService` | `MindCapabilityRegistry` | `backend/src/kloel/mind/coordination/mind-capability-registry.service.ts:108` | ADR-0013 +4wk | 🔴 P0 |
| 7 | `BrainCommercialGraphService` | `MindCommercialGraph` | `backend/src/kloel/mind/coordination/mind-commercial-graph.service.ts:407` | ADR-0013 +4wk | 🔴 P0 |
| 8 | `BrainEventSpineService` | `MindEventSpine` | `backend/src/kloel/mind/coordination/mind-event-spine.service.ts:402` | ADR-0013 +4wk | 🔴 P0 |
| 9 | `BrainRuntimeService` | `MindRuntime` | `backend/src/kloel/mind/coordination/mind-runtime.service.ts:436` | ADR-0013 +4wk | 🔴 P0 |
| 10 | `WhatsAppBrainService` | `WhatsAppMindCoordinator` | `backend/src/kloel/mind/coordination/whatsapp-mind-coordinator.service.ts:198` | ADR-0013 +4wk | 🔴 P0 |
| 11 | `CapabilityRegistry` (v1) | `CapabilityRegistryV2Service` | `backend/src/kloel/capability-registry/capability-registry.service.spec.ts:9` | M5 | 🟡 P1 |
| 12 | `generate_pix` capability | `sales.create_pix` | `backend/src/kloel/intent-router/intent-router.integration.spec.ts:35` | M5 | 🟡 P1 |
| 13 | `generate_boleto` capability | `sales.create_boleto` | `backend/src/kloel/intent-router/intent-router.integration.spec.ts:41` | M5 | 🟡 P1 |
| 14 | `AuthController.oauth()` POST endpoint | Returns error (legacy OAuth removed) | `backend/src/auth/auth.controller.ts:144` | Now | 🟡 P1 |
| 15 | `refreshToken` DTO field | `accessToken` | `backend/src/auth/dto/refresh.dto.ts:12` | +2wk | 🟢 P2 |
| 16 | `PlanServiceDeprecated` → `PlanService` (param duplication) | `PlanService.create()` | `backend/src/plans/plan.service.ts` (inferred) | +4wk | 🟢 P2 |
| 17 | EventEmitter2 `.emit()` calls (product/plan) | `SpineEmitterService.emit()` | `backend/src/products/product.service.ts:107`, `backend/src/plans/plan.service.ts:120` | +8wk | 🟢 P2 |
| 18 | Legacy `kloel/` top-level Mind* services | `kloel/mind/<sub-area>/` per ADR-0013 M5 | 23 services listed in [MIND_SERVICES_CANONICAL.md](./MIND_SERVICES_CANONICAL.md) §1.2 | ADR-0013 M5 | 🟡 P1 |

---

## Completed Migrations (historical)

| # | Deprecated symbol | Replacement | Date | ADR |
|---|---|---|---|---|
| C1 | `HiddenDataExtractorService` (`ai-brain/hidden-data.service.ts`) | `MindHiddenDataExtractor` (`kloel/mind/knowledge/`) | Wave M2 | ADR-0013 |
| C2 | `AgentAssistService` (`ai-brain/agent-assist.service.ts`) | `MindKnowledgeAssist` (`kloel/mind/knowledge/`) | Wave M2 | ADR-0013 |
| C3 | `KnowledgeBaseService` (`ai-brain/knowledge-base.service.ts`) | `MindKnowledgeBase` (`kloel/mind/knowledge/`) | Wave M2 | ADR-0013 |
| C4 | `MediaFactoryService` (`ai-brain/media-factory.service.ts`) | `MindMediaFactory` (`kloel/mind/knowledge/`) | Wave M2 | ADR-0013 |
| C5 | `VectorService` (`ai-brain/vector.service.ts`) | `MindVectorStore` (`kloel/mind/knowledge/`) | Wave M2 | ADR-0013 |
| C6 | `BrainSpineAuditService` (`brain/brain-spine-audit.service.ts`) | `MindSpineAudit` (`kloel/mind/observability/`) | Wave M3 | ADR-0013 |
| C7 | `ExperimentRunnerService` (`kloel/hypproof/`) | Retired (feature decommissioned) | Wave 35 | [CANONICAL_MOVES.md](./CANONICAL_MOVES.md) |
| C8 | `ProofEvaluatorService` (`kloel/hypproof/`) | Retired (feature decommissioned) | Wave 35 | [CANONICAL_MOVES.md](./CANONICAL_MOVES.md) |
| C9 | `mercado-pago-webhook.controller.spec.ts` | Consolidated into `mercado-pago-webhook-signature.util.spec.ts` | Wave 21 | PR #462 |
| C10 | `email-inbound.controller.spec.ts` | Consolidated into `email-inbound.service.spec.ts` | Wave 21 | PR #462 |

---

## Canonical Moves (from PR #462)

See [CANONICAL_MOVES.md](./CANONICAL_MOVES.md) for the human-authored delete manifesto.

---

## Migration Cadence

1. **P0 (ADR-0013 aliases)**: 4-week alias window — remove deprecated re-exports after zero grep hits.
2. **P1 (capability + top-level)**: M5 Wave — move remaining 23 Mind* services under `kloel/mind/`.
3. **P2 (cleanup)**: Remove dead EventEmitter2 emissions, legacy DTO fields, retired features.

---

## Brain* identifiers retained for backwards compatibility

These `Brain*`-named exports survive after the Mind unification because external callers (frontend-admin, observability metric keys, audit-log SQL filters, and re-exported tests) still bind to the legacy names. Each entry below was verified live via `rg`.

| Identifier | Kind | Declared at | Reason kept | Sunset target | Replacement |
|---|---|---|---|---|---|
| `BrainCapabilityRisk` | type alias | `backend/src/kloel/mind/coordination/mind-capability-policy.ts:3` | Used by `unified-agent-predecided-actions.part.ts:3` and risk-class mapping (`mapBrainRiskToRiskClass`). Renaming touches the production risk-router. | Indefinite — load-bearing | None planned; surface stays under the `Brain*` family for risk semantics. |
| `BrainCapabilityRiskClass` | type alias | `backend/src/kloel/mind/coordination/mind-capability-policy.ts:4` | Pairs with the above. | Indefinite — load-bearing | n/a |
| `BrainCapabilityDelegationMode` | type alias | `backend/src/kloel/mind/coordination/mind-capability-policy.ts:5` | Defines `'allowed_alone' \| 'owner_review'` consumed by delegation contract callers. | Indefinite — load-bearing | n/a |
| `BrainCapabilityDelegationContract` | interface | `backend/src/kloel/mind/coordination/mind-capability-policy.ts:7` | Public DI contract returned by `getBrainCapabilityDelegationContract`. | Indefinite — load-bearing | n/a |
| `getBrainCapabilityRisk` | function | `backend/src/kloel/mind/coordination/mind-capability-policy.ts:46` | Public consumer in `unified-agent-predecided-actions.part.ts`. | Indefinite — load-bearing | n/a |
| `getBrainCapabilityDelegationContract` | function | `backend/src/kloel/mind/coordination/mind-capability-policy.ts:56` | Public consumer in `mind-capability-registry.service.ts:22`. | Indefinite — load-bearing | n/a |
| `isBrainCapabilityAllowed` | function | `backend/src/kloel/mind/coordination/mind-capability-policy.ts:92` | Guard called from the unified-agent action path. | Indefinite — load-bearing | n/a |
| `BrainEventName` | type alias | `backend/src/kloel/mind/coordination/mind-event-taxonomy.ts:73` | Union derived from `BRAIN_EVENT_TAXONOMY`. Referenced by `mind-event-spine.helpers.spec.ts` and the audit-log row decoder. | Indefinite — load-bearing | n/a |
| `BrainRuntimeController` | class | `backend/src/kloel/mind/coordination/mind-runtime.controller.ts:37` | Registered in `kloel.module.ts:287`. Renaming changes the public HTTP class name observed in stack traces and Sentry. | ADR-0013 M5 (renamed file, not symbol) | `MindRuntimeController` (symbol rename when M5 finalises). |
| `BrainMessageDto` | class | `backend/src/kloel/mind/coordination/mind-runtime.dto.ts:27` | DTO type referenced by `messages?: BrainMessageDto[]` at line 49 of the same file. Renaming breaks `class-validator` decorators registered against the class identity. | ADR-0013 M5 | `MindMessageDto` |
| `BrainAuditController` | class | `backend/src/admin/brain/brain-audit.controller.ts:16` | Registered in `admin-brain.module.ts:9`. Admin route `GET /admin/brain/audit` is part of the frontend-admin runtime contract. | Indefinite — load-bearing | URL-stable rename requires a coordinated frontend-admin release. |
| `BrainCapabilityExecutorService` (alias) | class re-export | `backend/src/kloel/mind/coordination/mind-capability-executor.service.ts:538` | Re-exports `MindCapabilityExecutor` under the legacy name for the ADR-0013 alias window. Already tracked in the active deprecations table as row #5. | ADR-0013 +4wk | `MindCapabilityExecutor` |

### Brain* identifier search — full verification

`rg -n 'BrainCapability' backend/src/ --type ts -g '!*.spec.ts'` returns 16 production hits across 4 files (`unified-agent-predecided-actions.part.ts`, `mind-capability-policy.ts`, `mind-capability-executor.service.ts`, `mind-capability-registry.service.ts`). `rg -n 'BrainEventName'` returns hits only in a single spec file (`mind-event-spine.helpers.spec.ts`); the runtime audit decoder no longer types-annotates against the alias. `rg -n 'BrainRuntimeController|BrainMessageDto|BrainAuditController'` returns hits in module wiring, spec files, and the DTO self-reference described above.

> Note: the task brief listed a `BrainCapabilityPolicy` interface at `mind-capability-policy.ts:7`. That exact identifier does not exist in the file. Line 7 declares `BrainCapabilityDelegationContract` (the canonical contract type). Row 4 of this table reflects the actual source-of-truth identifier; no `BrainCapabilityPolicy` shim exists and none should be created.

---

## `brain.*` event string literals retained intentionally

The Mind unification kept four production event-name string literals on the `brain.*` namespace because metrics keys, audit-log SQL filters, and historical rows in `AuditLog.action` already bind to them. Renaming them would break dashboards and rewrite-historicals semantics that ADR-0013 explicitly forbids.

| Literal | Producers | Consumers | Retention reason |
|---|---|---|---|
| `'brain.decide'` | `mind-runtime.service.ts:217,344`, `mind-runtime.controller.ts:87-92` | `observability/metrics.ts:150-154` (`increment`, `histogram`), Sentry, Grafana dashboards | Metric-key historical continuity. |
| `'brain.observe'` | `mind-runtime.service.ts:406`, `mind-runtime.controller.ts:129-134` | Same metrics path | Metric-key historical continuity. |
| `'brain.stream'` | `mind-runtime.controller.ts:177-181` | Same metrics path | Metric-key historical continuity. |
| `'brain.autonomy.propose'` | `mind-autonomy-coordinator.service.ts:70`, `mind-event-taxonomy.ts:4` | Audit log; spine emitter | Historical audit rows. |
| `'brain.capability.invoked'` | `mind-capability-executor.service.ts:494,518`, `mind-event-taxonomy.ts:5` | `mind-spine-audit.service.ts:65` (literal SQL: `WHERE action IN ('brain.capability.invoked', ...)`) and the row decoder at line 93 | Audit-log SQL filter literal; renaming requires a data migration. |
| `'brain.commercial_graph.build'` / `'brain.commercial_graph.recommendations'` | `mind-commercial-graph.service.ts:110,378` | Operation-name tag on logger/tracing spans | Trace continuity. |

| Sunset target | Indefinite |
|---|---|
| Replacement | None planned. The `mind.*` namespace is for new events; `brain.*` is frozen as the legacy audit/metric surface. |
| Enforcement | New event literals MUST be `mind.*` per `EVENT_TAXONOMY.md`. Adding a new `brain.*` literal requires an ADR amendment. |

---

## Legacy paths

| Path | Status | Verified | Notes |
|---|---|---|---|
| `backend/src/whatsapp/` | Removed | `ls backend/src/whatsapp` → `No such file or directory` (verified during K62 and re-verified for this entry) | Canonical location is `backend/src/marketing/channels/whatsapp/`. The frontend proxy path `/api/whatsapp-api/*` (e.g. `frontend/src/app/api/whatsapp-api/agent/stream/route.ts`) is retained for URL stability — it forwards to the new backend location. |
| `backend/src/ai-brain/` | Removed | Wave M2 (see Completed Migrations C1–C5) | Renamed to `backend/src/kloel/mind/knowledge/`. |
| `backend/src/brain/` | Removed | Wave M3 (see Completed Migrations C6) | `BrainSpineAuditService` moved to `kloel/mind/observability/`. |
| `backend/src/cia/` | Removed | Active deprecation row #2 | Replaced by `backend/src/kloel/mind/cia/`. |
| `backend/src/kloel/hypproof/` | Removed | Wave 35 (Completed Migrations C7–C8) | Feature decommissioned; see `CANONICAL_MOVES.md`. |
| `backend/src/admin/brain/` | Retained | `BrainAuditController` lives here | Kept to preserve the admin URL `/admin/brain/audit` until a coordinated frontend-admin release renames the route. |
