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
