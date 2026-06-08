# Kloel Deprecation Map

> Tracks each symbol marked `@deprecated` in the source, with its canonical
> replacement and status. Generated from `grep -rn "@deprecated" backend/src`
> (30 annotations as of HEAD). Most entries are **backwards-compat re-export
> aliases** kept during a migration window — the canonical symbol already exists;
> the alias is removed once all importers move over.

| Deprecated symbol | File:line | Replacement | Status |
|---|---|---|---|
| `BrainEventSpine` (class alias) | `kloel/mind/coordination/mind-event-spine.service.ts:399` | `MindEventSpine` | alias re-export window |
| legacy `MindEventName` alias | `kloel/mind/coordination/mind-event-taxonomy.ts:127` | `MindEventName` (canonical) | alias re-export window |
| legacy commercial-graph alias | `kloel/mind/coordination/mind-commercial-graph.service.ts:404` | `MindCommercialGraph` | alias re-export window |
| `MindRuntime` message DTO | `kloel/mind/coordination/mind-runtime.dto.ts:35` | `MindMessageDto` | alias re-export window |
| legacy autonomy-coordinator alias | `kloel/mind/coordination/mind-autonomy-coordinator.service.ts:104` | `MindAutonomyCoordinator` | alias re-export window |
| legacy whatsapp-coordinator alias | `kloel/mind/coordination/whatsapp-mind-coordinator.service.ts:252` | `WhatsAppMindCoordinator` | alias re-export window |
| legacy capability-registry alias | `kloel/mind/coordination/mind-capability-registry.service.ts:108` | `MindCapabilityRegistry` | alias re-export window |
| legacy capability-executor alias | `kloel/mind/coordination/mind-capability-executor.service.ts:534` | `MindCapabilityExecutor` | alias re-export window |
| legacy lead-coordinator alias | `kloel/mind/coordination/lead-mind-coordinator.service.ts:508` | `LeadMindCoordinator` | alias re-export window |
| legacy vector-store alias | `kloel/mind/knowledge/mind-vector-store.service.ts:12` | `MindVectorStore` | alias re-export window |
| legacy media-factory alias | `kloel/mind/knowledge/mind-media-factory.service.ts:15` | `MindMediaFactory` | alias re-export window |
| legacy knowledge-assist alias | `kloel/mind/knowledge/mind-knowledge-assist.service.ts:15` | `MindKnowledgeAssist` | alias re-export window |
| legacy knowledge-base alias | `kloel/mind/knowledge/mind-knowledge-base.service.ts:12` | `MindKnowledgeBase` | alias re-export window |
| `KnowledgeModule` | `kloel/mind/knowledge/knowledge.module.ts:53` | `MindKnowledgeModule` | alias re-export window |
| legacy hidden-data-extractor alias | `kloel/mind/knowledge/mind-hidden-data-extractor.service.ts:15` | `MindHiddenDataExtractor` | alias re-export window |
| legacy CIA learning-adapter alias | `kloel/mind/cia/index.ts:24` | `MindLearningAdapter` | 4-week alias window |
| `cia/cia.service.ts` shim | `kloel/mind/cia/cia.service.ts:8` | `kloel/mind/cia/*` (canonical CIA) | re-export shim |
| `coerceArgString` (inline) | `kloel/unified-agent-actions-crm.service.ts:73` | `coerceArgString` from helpers module | alias |
| `coerceArgNumber` (inline) | `kloel/unified-agent-actions-crm.service.ts:78` | `coerceArgNumber` from helpers module | alias |
| legacy ABI `context` field | `kloel/unified-agent-context.service.ts:116` | ManifestInjectionBuilder (UTP-ABI-009) | superseded |
| legacy ABI context helper | `kloel/kloel-thinker.abi.helpers.ts:107` | canonical ABI context assembly | superseded |
| legacy event-name keys | `kloel/event-taxonomy.canonical-aliases.ts:28,53` | canonical `commerce.*` / `cognition.*` names | removed post dual-emit window |
| tier-1 send overload | `sales/sales.service.ts:81` | tier-5 DTO-based overload | superseded |
| `refresh` DTO alias | `auth/dto/refresh.dto.ts:12` | `refreshToken` | alias |
| `refreshToken()` fn | `auth/auth-service.tokens.ts:195` | `AuthTokenService.refresh()` | superseded (dual path) |
| internal refresh fallback | `auth/auth.service.ts:132` | `AuthTokenService.refresh()` | deprecated fallback |
| legacy OAuth redirect builder | `meta/oauth/meta-oauth-url.helpers.ts:171` | `resolveOAuthRedirect` | superseded |

## Notes

- **Alias re-export window:** the canonical symbol is live; the legacy name is a
  thin re-export retained so existing importers keep compiling. Safe to delete
  once `grep` shows zero importers of the legacy name (most are already at zero —
  the alias is belt-and-suspenders). These are intentionally NOT churned per the
  "no cosmetic refactor" rule.
- **Superseded:** the deprecated path still runs but a canonical replacement is
  preferred for new code; removal is gated on migrating the remaining callers.
- This map is regenerated from source — do not hand-edit symbol rows; re-run the
  `@deprecated` grep and update.
