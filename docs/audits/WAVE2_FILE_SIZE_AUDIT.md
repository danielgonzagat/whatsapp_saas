# Wave 2 — File-Size Audit (Materialized from Subagent)

> Authored by PI atomic subagent `w2-file-size-audit` (DeepSeek V4 Pro,
> ~37k events, 5 atomic_author chunks totaling 79KB). Materialized by
> orchestrator from the worktree (the worktree was prematurely cleaned;
> recovered by reading atomic_author tool call args from the JSON log).
> Run date: 2026-05-26.


## Methodology

- Scanned `backend/src/` and `frontend/src/` recursively for `.ts` and `.tsx` files.
- Excluded `*.spec.ts`, `*.test.ts`, `*.d.ts`, `schema.prisma`, and `evol/`.
- Counted physical lines via `wc -l` (includes blank lines, comments, imports).
- Identified natural seams by reading structural summaries, section-header comments (`// ===`, `// ──`), class boundaries, and existing helper-file delegation patterns.
- Estimated edit frequency via `git log --since="90 days ago" --oneline -- <file> | wc -l`.
- Composite priority score = LOC × edit-frequency (churn × size).
- Skipped AI-model definition files (`ai-models.ts`, `openai-models.ts`) and `CLAUDE.md` / `AGENTS.md` per constraints.

## Summary

- **Files over 800 LOC**: 1
- **Files over 1200 LOC**: 0
- **Files over 2000 LOC**: 0
- **Total LOC over the 800-line cap**: 49 (849 − 800 in the single offending file)
- **Files 500–800 LOC**: 59 backend, 15 frontend

**Finding**: The codebase largely respects the 800-LOC cap. The only violator is `kloel-chat-tools.service.ts` at 849 LOC (+49 over). However, 74 files sit in the 500–800 LOC danger zone and will cross the cap with continued feature additions. The top-10 composite ranking (LOC × churn) identifies high-ROI decomposition targets even before they breach the cap.

---

## Backend top offenders

### 1. `backend/src/kloel/kloel-chat-tools.service.ts` — 849 LOC ⚠️ OVER CAP

- **Top 5 exports**: `centsFromUnknown`, `KloelChatToolsService` (class), interfaces `ToolSaveProductArgs`, `ToolDeleteProductArgs`, `ToolCreateFlowArgs`
- **Natural seams (by section header / class boundaries)**:
  1. **Imports + shared utils** (lines 1–122) — interfaces, `safeStr()`, `centsFromUnknown()`
  2. **Core product CRUD tools** (lines 125–202) — `toolSaveProduct`, `toolListProducts`, `toolDeleteProduct`
  3. **Settings/Policy tools** (lines 203–372) — `toolToggleAutopilot`, `toolSetBrandVoice`, `toolSetSalesPolicy`, `toolRememberUserInfo`
  4. **Flow + Dashboard tools** (lines 373–503) — `toolCreateFlow`, `toolListFlows`, `toolGetDashboardSummary`, `toolCreatePaymentLink`
  5. **Agent runtime delegation** (lines 504–668) — `toolCreateAgentJob`, `toolListAgentJobs`, `toolSetAgentJobEnabled`, `toolSearchAgentMemory`, `toolSearchAgentMemoryWithContacts`, `toolSearchAgentSessions`, `toolGetAgentArtifact`, `toolUpsertAgentSkill`, `toolRecordAgentSkillOutcome`, `toolRecordAgentDelegation`, `toolRecordAgentEvidence`, `toolSearchAgentEvidence`, `toolListAgentEvidence`, `toolVerifyAgentEvidence`
  6. **Product management delegators** (lines 669–706) — thin pass-through methods: `toolUpdateProduct`, `toolGetProductPlans`, `toolGetProductUrls`, etc.
  7. **Stub→real migration tools** (lines 708–800) — `toolUploadPlanImage`, `toolUploadProductImage`, `toolConfigurePixel`, `toolConfigureShipping`, `toolConfigureSocialProof`, `toolConfigureOrderBump`, `toolConfigureWarranty`, `toolConfigureExitIntent`, `toolConfigureAfterPay`, `toolBrowseMarketplace`, `toolSendChannelMessage`
  8. **Order creation** (lines 804–849) — `toolCreateOrder`, `toolListSubscriptions`
- **Proposed split**:
  - `kloel-chat-tools.service.ts` keeps the class shell, constructor, and the core product CRUD tools (seams 1–2) — ~200 LOC
  - `kloel-chat-tools.settings-policy.helpers.ts` extracts seam 3 (settings/policy tools) — ~170 LOC
  - `kloel-chat-tools.flow-dashboard.helpers.ts` extracts seam 4 (flow + dashboard tools) — ~130 LOC
  - `kloel-chat-tools.stub-migration.helpers.ts` extracts seam 7 (stub→real tools) — ~100 LOC
  - `kloel-chat-tools.order.helpers.ts` extracts seam 8 (order creation) — ~50 LOC
  - Seam 5 is already delegated to `kloel-chat-tools.agent-jobs.helpers.ts` and `kloel-chat-tools.agent-runtime.helpers.ts`; seam 6 already delegates to `kloel-chat-tools.product.helpers.ts` and `kloel-chat-tools.update-product.helper.ts` — extraction already done.
- **Estimated effort**: S — single PR, pure mechanical extraction. The file already follows the delegation pattern (5 existing helper files); this just extends it.
- **Risk**: low (pure mechanical) — the class methods are stateless dispatchers; DI is already handled via constructor injection of `PrismaService` and `SmartPaymentService` which the extracted helpers would also receive.

---

### 2. `backend/src/kloel/guest-chat.action-intent.helpers.ts` — 651 LOC

- **Top 5 exports**: `detectActionIntent`, `extractProductName`, `extractProductArgs`, `extractPlanArgs`, `extractCouponArgs`
- **Natural seams**:
  1. **Intent detection** (lines 1–480) — massive regexp cascade mapping Portuguese phrases → `{ tool, args }`; organized by section comments (`// ── PRODUTOS ──`, `// ── PLANOS ──`, `// ── CHECKOUTS ──`, `// ── PAGAMENTOS ──`, etc.)
  2. **Argument extractors** (lines 480–620) — `extractProductName`, `extractProductArgs`, `extractPlanArgs`, `extractPaymentArgs`, `extractCouponArgs`, `extractUrlArgs`, `extractAffiliateArgs`, `extractFiscalArgs`
  3. **Re-export** (line 651) — `formatToolResult` re-exported from `guest-chat.format-tool-result.helpers`
- **Proposed split**:
  - `guest-chat.action-intent.helpers.ts` keeps `detectActionIntent` only — ~480 LOC
  - `guest-chat.action-intent.extractors.ts` extracts all `extract*Args` functions — ~170 LOC
  - Alternatively, split the intent regex cascade by domain: `product-intents.ts`, `payment-intents.ts`, `settings-intents.ts`, etc.
- **Estimated effort**: S — single PR, pure function extraction.
- **Risk**: low (pure mechanical).

---

### 3. `backend/src/kloel/kloel-tool-dispatcher.service.ts` — 632 LOC

- **Top 5 exports**: `KloelToolDispatcherService` (class)
- **Natural seams**:
  1. **Imports + types** (lines 1–30) — `ApprovedToolExecutionResult` type, high-risk tool imports
  2. **Constructor + executeTool dispatcher** (lines 31–150) — large switch/if-else routing to sub-services
  3. **Audit logging** (lines 150–350) — transactional audit log wrapper for financial tool calls
  4. **High-risk tool gating** (lines 350–632) — approval flow for destructive operations
- **Proposed split**:
  - `kloel-tool-dispatcher.service.ts` keeps the class shell + `executeTool` dispatch logic — ~150 LOC
  - `kloel-tool-dispatcher.audit.helpers.ts` extracts audit logging — ~200 LOC
  - `kloel-tool-dispatcher.high-risk.helpers.ts` — already partially extracted; ensure the remaining inline approval logic moves here — ~280 LOC
- **Estimated effort**: S — single PR.
- **Risk**: medium (touches Nest DI) — the high-risk helpers already exist as a separate import; the audit path requires passing `AuditService` and `PrismaService`.

---

### 4. `backend/src/partnerships/partnerships.service.ts` — 599 LOC

- **Top 5 exports**: `PartnershipsService` (class)
- **Natural seams**:
  1. **Constants + crypto utilities** (lines 1–30) — `INVITABLE_PARTNER_TYPES`, `PARTNER_ROLE_LABELS`
  2. **Affiliate registration + link management** (lines 30–250)
  3. **Colaborator/coproducer management** (lines 250–400)
  4. **Commission calculation + payout triggers** (lines 400–599)
- **Proposed split**:
  - `partnerships.service.ts` keeps core orchestration — ~200 LOC
  - `partnerships.affiliate.helpers.ts` extracts affiliate flows — ~200 LOC
  - `partnerships.commission.helpers.ts` extracts commission + payout logic — ~200 LOC
- **Estimated effort**: M — single PR, some DTO types to keep consistent.
- **Risk**: medium (touches wallet/payout DTOs).

---

### 5. `backend/src/checkout/checkout-payment.service.ts` — 596 LOC

- **Top 5 exports**: `CheckoutPaymentService` (class), helper functions `mapStripePaymentStatus`, `extractPixDisplayData`, `toJsonValue`
- **Natural seams**:
  1. **Types + helpers** (lines 1–60) — `CheckoutPaymentMethod`, `CheckoutPaymentStatus`, `PixDisplayData`, `mapStripePaymentStatus`, `extractPixDisplayData`, `toJsonValue`
  2. **Stripe charge orchestration** (lines 60–300)
  3. **PIX payment handling** (lines 300–450)
  4. **Boleto payment handling** (lines 450–596)
- **Proposed split**:
  - `checkout-payment.service.ts` keeps the class + Stripe orchestration — ~240 LOC
  - `checkout-payment.pix.helpers.ts` extracts PIX handling — ~150 LOC
  - `checkout-payment.boleto.helpers.ts` extracts boleto handling — ~150 LOC
  - `checkout-payment.types.ts` extracts shared types — ~60 LOC
- **Estimated effort**: M — single PR.
- **Risk**: high (touches DTOs + Stripe integration + payment state machine).

---

### 6. `backend/src/kloel/kloel.controller.ts` — 594 LOC

- **Top 5 exports**: `KloelController` (class)
- **Natural seams**:
  1. **DTOs + constants** (lines 1–35) — `ThinkDto`, `MemoryDto`, `OnboardingChatDto`, `ApprovalDecisionDto`, MIME regexps
  2. **Chat endpoints** (lines 35–200) — `/think`, `/chat`, `/onboarding-chat`
  3. **Product/config endpoints** (lines 200–400) — product CRUD, settings
  4. **Upload endpoints** (lines 400–500) — file upload handlers with MIME validation
  5. **Approval/agent endpoints** (lines 500–594)
- **Proposed split**:
  - `kloel.controller.ts` keeps the main chat + upload endpoints — ~300 LOC
  - `kloel.controller.product.helpers.ts` extracts product/config handlers — ~200 LOC
  - `kloel.controller.approval.helpers.ts` extracts approval/agent handlers — ~100 LOC
- **Estimated effort**: M — single PR, NestJS controller refactoring.
- **Risk**: medium (touches route registration) — but NestJS supports delegating controller logic to helper classes cleanly.

---

### 7. `backend/src/kloel/guest-chat.service.ts` — 590 LOC

- **Top 5 exports**: `GuestChatService` (class)
- **Natural seams**:
  1. **Types + constants** (lines 1–20) — `GuestConversation`, `GUEST_CONVERSATION_TTL_SECONDS`
  2. **Redis conversation CRUD** (lines 20–250)
  3. **Fallback Map-based storage** (lines 250–400)
  4. **Message processing + intent dispatch** (lines 400–590)
- **Proposed split**:
  - `guest-chat.service.ts` keeps orchestration — ~200 LOC
  - `guest-chat.storage.helpers.ts` extracts Redis + fallback storage — ~200 LOC
  - `guest-chat.processing.helpers.ts` extracts message processing — ~190 LOC
- **Estimated effort**: S — single PR.
- **Risk**: low (pure mechanical).

---

### 8. `backend/src/calendar/calendar.service.ts` — 588 LOC

- **Top 5 exports**: `CalendarService` (class), `CalendarEvent` (interface)
- **Natural seams**:
  1. **Types + constants** (lines 1–40) — `AppointmentRecord`, `CalendarEvent`, `CalendarConfig`, `GoogleCalendarEventItem`
  2. **Google Calendar integration** (lines 40–350) — OAuth, event CRUD, sync
  3. **Appointment scheduling** (lines 350–500)
  4. **Provider calendar settings** (lines 500–588)
- **Proposed split**:
  - `calendar.service.ts` keeps core orchestration — ~200 LOC
  - `calendar.google.helpers.ts` extracts Google Calendar integration — ~310 LOC
  - `calendar.appointment.helpers.ts` extracts appointment logic — ~80 LOC
- **Estimated effort**: M — single PR.
- **Risk**: medium (touches OAuth flow).

---

### 9. `backend/src/meta/meta-whatsapp.service.ts` — 582 LOC

- **Top 5 exports**: `MetaWhatsAppService` (class)
- **Natural seams**:
  1. **Types + constants + normalizers** (lines 1–40) — `ResolvedMetaConnection`, `MetaChannel`, `COMMON_META_SCOPES`, `normalizeMetaChannel`, `readChannelConfigId`
  2. **Connection state management** (lines 40–250)
  3. **OAuth scope negotiation** (lines 250–400)
  4. **Channel provisioning** (lines 400–582)
- **Proposed split**:
  - `meta-whatsapp.service.ts` keeps orchestration — ~200 LOC
  - `meta-whatsapp.connection.helpers.ts` extracts connection state — ~210 LOC
  - `meta-whatsapp.scopes.helpers.ts` extracts scope negotiation — ~170 LOC
- **Estimated effort**: S — single PR.
- **Risk**: medium (touches Meta OAuth integration).

---

### 10. `backend/src/kloel/unified-agent.service.ts` — 562 LOC 🔥 Highest churn

- **Top 5 exports**: `UnifiedAgentService` (class), types re-exported from `unified-agent.types`
- **96 edits in 90 days** — the hottest file in the codebase.
- **Natural seams**:
  1. **Imports + helpers** (lines 1–40) — `isAllowedTool`, `UNIFIED_AGENT_PROVIDER_CONFIG_REQUIRED`, `formatPromptValue`
  2. **Prompt/context assembly** (lines 40–200)
  3. **Tool execution + action dispatch** (lines 200–400)
  4. **Response formatting + confidence** (lines 400–562)
- **Proposed split**:
  - `unified-agent.service.ts` keeps orchestration — ~200 LOC
  - `unified-agent.prompt.helpers.ts` extracts prompt assembly — ~160 LOC
  - `unified-agent.dispatch.helpers.ts` extracts tool execution — ~200 LOC
- **Estimated effort**: M — likely multi-PR due to high churn and ongoing work.
- **Risk**: medium (touches Nest DI + LLM integration).

---

### 11. `backend/src/kloel/agent-runtime/agent-runtime.skill-registry.ts` — 572 LOC

- **Top 5 exports**: `AgentRuntimeSkillRegistry` (class)
- **Natural seams**:
  1. **Constants + default skills** (lines 1–150) — `DEFAULT_SKILLS` large array
  2. **Skill CRUD + validation** (lines 150–350)
  3. **Skill usage tracking + statistics** (lines 350–572)
- **Proposed split**:
  - `agent-runtime.skill-registry.ts` keeps class shell + CRUD — ~200 LOC
  - `agent-runtime.skill-registry.defaults.ts` extracts default skill definitions — ~170 LOC
  - `agent-runtime.skill-registry.stats.ts` extracts usage tracking — ~200 LOC
- **Estimated effort**: S — single PR.
- **Risk**: low (pure mechanical).

---

### 12. `backend/src/crm/crm.service.ts` — 570 LOC

- **Top 5 exports**: `CrmService` (class)
- **Natural seams**:
  1. **Contact CRUD** (lines 1–200)
  2. **Deal pipeline management** (lines 200–400)
  3. **Lead scoring + sentiment** (lines 400–570)
- **Proposed split**:
  - `crm.service.ts` keeps orchestration — ~200 LOC
  - `crm.contacts.helpers.ts` extracts contact CRUD — ~200 LOC
  - `crm.deals.helpers.ts` extracts deal pipeline — ~170 LOC
- **Estimated effort**: M — single PR.
- **Risk**: medium (touches CRM event emitter).

---

### 13. `backend/src/checkout/checkout.controller.ts` — 570 LOC

- **Top 5 exports**: `CheckoutController` (class)
- **Natural seams**:
  1. **Checkout CRUD endpoints** (lines 1–250)
  2. **Checkout settings/pixel endpoints** (lines 250–450)
  3. **Checkout link generation** (lines 450–570)
- **Proposed split**:
  - `checkout.controller.ts` keeps CRUD — ~250 LOC
  - `checkout.controller.settings.ts` splits off settings endpoints — ~200 LOC
  - `checkout.controller.links.ts` splits off link generation — ~120 LOC
- **Estimated effort**: S — single PR.
- **Risk**: medium (touches NestJS route registration).

---

### 14. `backend/src/ai-brain/knowledge-base.service.ts` — 568 LOC

- **Top 5 exports**: `KnowledgeBaseService` (class)
- **Natural seams**:
  1. **Text chunking utilities** (lines 1–100) — `splitKnowledgeBaseText`, `findChunkEnd`, `findSentenceSplit`, `isSplitCandidate`
  2. **Wallet billing helpers** (lines 100–200) — `chargeUsageIfNeeded`, `refundUsageIfNeeded`, `estimateEmbeddingQuote`
  3. **Source ingestion** (lines 200–400) — `addSource` with URL fetch, HTML→text, PDF handling
  4. **KB CRUD + search** (lines 400–568)
- **Proposed split**:
  - `knowledge-base.service.ts` keeps orchestration — ~200 LOC
  - `knowledge-base.chunking.helpers.ts` extracts text splitting utilities — ~100 LOC
  - `knowledge-base.billing.helpers.ts` extracts wallet billing — ~100 LOC
  - `knowledge-base.ingestion.helpers.ts` extracts source ingestion — ~168 LOC
- **Estimated effort**: M — single PR.
- **Risk**: medium (touches wallet billing + URL fetch + vector service).

---

### 15. `backend/src/payments/ledger/ledger.service.ts` — 545 LOC

- **Top 5 exports**: `LedgerService` (class)
- **Natural seams**:
  1. **Credit operations** (lines 1–200)
  2. **Debit operations** (lines 200–380)
  3. **Balance reconciliation** (lines 380–545)
- **Proposed split**:
  - `ledger.service.ts` keeps class shell + orchestration — ~200 LOC
  - `ledger.credits.helpers.ts` extracts credit operations — ~180 LOC
  - `ledger.debits.helpers.ts` extracts debit operations — ~165 LOC
- **Estimated effort**: M — single PR. Already well-structured with dedicated spec files (`ledger.service.debits.spec.ts`, `ledger.service.invariants.spec.ts`).
- **Risk**: high (touches financial DTOs + dual-balance contract).

---

## Frontend top offenders

_NOTE: No frontend files exceed 800 LOC. These are the top files by size, listed for monitoring and proactive decomposition._

### 1. `frontend/src/components/kloel/settings/crm-settings-section.tsx` — 602 LOC

- **Top 5 exports**: `CrmSettingsSection` (component)
- **Natural seams**:
  1. **Imports + sub-components** (lines 1–20) — imports `ContactCard`, `SegmentationCard`, `StatCard` from `.parts`
  2. **Contact management UI** (lines 20–250)
  3. **Segmentation rules UI** (lines 250–450)
  4. **Pipeline/Stats cards** (lines 450–602)
- **Already partially decomposed**: has a `crm-settings-section.parts.tsx` file and `crm-settings-section.handlers.ts` and `crm-settings-section.helpers.ts`.
- **Proposed split**:
  - `crm-settings-section.tsx` keeps the shell/tabs — ~200 LOC
  - Move remaining inline sections to existing `.parts.tsx` file — ~400 LOC
- **Estimated effort**: S — single PR.
- **Risk**: low (pure UI extraction, no data-fetching changes).

---

### 2. `frontend/src/hooks/useWhatsAppSession.ts` — 591 LOC

- **Top 5 exports**: `useWhatsAppSession` (hook), likely internal sub-hooks
- **Natural seams**:
  1. **Session state machine** (lines 1–200)
  2. **QR code / pairing flow** (lines 200–400)
  3. **Diagnostics + health checks** (lines 400–591)
- **Proposed split**:
  - `useWhatsAppSession.ts` keeps the main hook — ~200 LOC
  - `useWhatsAppSession.qr.ts` extracts QR/pairing flow — ~200 LOC
  - `useWhatsAppSession.diagnostics.ts` extracts health checks — ~191 LOC
- **Estimated effort**: S — single PR.
- **Risk**: medium (touches real-time session state).

---

### 3. `frontend/src/components/kloel/dashboard/KloelDashboard.tsx` — 589 LOC 🔥 High churn

- **Top 5 exports**: `KloelDashboard` (default export)
- **Natural seams**:
  1. **Imports + sub-components** (lines 1–15)
  2. **Chat composer area** (lines 15–300) — message input, file drop, suggestions
  3. **Message display + agent stream** (lines 300–500)
  4. **Approval strip + sidebar** (lines 500–589)
- **Already partially split**: has `KloelChatComposer.tsx`, `KloelDashboard.message.tsx` (550 LOC!), `KloelDashboard.hooks.ts`, `KloelDashboard.helpers.ts`, `KloelDashboard.subcomponents.tsx`, `KloelDashboardSendMessage.ts`.
- **Proposed split**:
  - `KloelDashboard.tsx` keeps the layout shell — ~200 LOC
  - Push remaining inline sections to existing sub-files — ~389 LOC
  - **Note**: `KloelDashboard.message.tsx` at 550 LOC is itself a candidate for further decomposition.
- **Estimated effort**: M — single PR.
- **Risk**: medium (touches core dashboard UX).

---

### 4. `frontend/src/components/kloel/auth/auth-provider.tsx` — 589 LOC

- **Top 5 exports**: `AuthProvider`, `useAuth`
- **Natural seams**:
  1. **Types + constants** (lines 1–30) — `User`, `Workspace`, `Subscription`, `AuthState`, `AuthContextType`
  2. **Auth state management** (lines 30–250) — login, logout, token refresh
  3. **Workspace switching** (lines 250–450)
  4. **Bootstrap + hydration** (lines 450–589)
- **Proposed split**:
  - `auth-provider.tsx` keeps provider component + `useAuth` — ~200 LOC
  - `auth-provider.types.ts` extracts type definitions — ~50 LOC
  - `auth-provider.workspace.ts` extracts workspace switching — ~170 LOC
  - `auth-provider.bootstrap.ts` extracts bootstrap logic — ~169 LOC
- **Estimated effort**: M — single PR. Auth is critical path.
- **Risk**: high (touches auth state machine — every page depends on this).

---

### 5. `frontend/src/components/kloel/auth/kloel-auth-screen.tsx` — 584 LOC 🔥 High churn

- **Top 5 exports**: `KloelAuthScreen` (component)
- **Natural seams**:
  1. **Types + constants** (lines 1–25) — `KloelAuthScreenProps`, `Mode`, font constants, `navigateCurrentWindow`, `resolveOAuthErrorMessage`
  2. **Login form** (lines 25–250)
  3. **Register form** (lines 250–450)
  4. **OAuth callback handling** (lines 450–584)
- **Already partially split**: uses `AuthFormFields` from `kloel-auth-screen.form-fields.tsx`.
- **Proposed split**:
  - `kloel-auth-screen.tsx` keeps the screen shell + mode switching — ~200 LOC
  - `kloel-auth-screen.login.tsx` extracts login flow — ~225 LOC
  - `kloel-auth-screen.register.tsx` extracts register flow — ~159 LOC
- **Estimated effort**: S — single PR.
- **Risk**: medium (touches auth UI — high-visibility path).

---

### 6. `frontend/src/components/canvas/EditorTopBar.tsx` — 578 LOC

- **Top 5 exports**: `EditorTopBar` (component)
- **Natural seams**:
  1. **File actions** (save, export, undo/redo) — lines 1–200
  2. **Canvas tools** (zoom, grid, alignment) — lines 200–400
  3. **Layer/property controls** — lines 400–578
- **Proposed split**:
  - `EditorTopBar.tsx` keeps the shell — ~200 LOC
  - `EditorTopBar.file-actions.tsx` extracts file actions — ~200 LOC
  - `EditorTopBar.canvas-tools.tsx` extracts canvas tools — ~178 LOC
- **Estimated effort**: S — single PR.
- **Risk**: low (pure UI extraction).

---

### 7. `frontend/src/components/products/ProductPlansTab.tsx` — 574 LOC

- **Top 5 exports**: `ProductPlansTab` (component)
- **Natural seams**: plan creation form, plan list, plan detail editing
- **Proposed split**: similar to `PlanPaymentTab.tsx` pattern (504 LOC) — extract form and list into separate files.
- **Estimated effort**: S — single PR.
- **Risk**: low (pure UI extraction).

---

### 8. `frontend/src/components/kloel/products/product-nerve-center.shared.tsx` — 574 LOC

- **Top 5 exports**: shared UI atoms, form fields, and types for product nerve center
- **Natural seams**: shared components, shared types, shared validators
- **Proposed split**: split into `product-nerve-center.shared.atoms.tsx`, `product-nerve-center.shared.types.ts`, `product-nerve-center.shared.validators.ts`
- **Estimated effort**: S — single PR.
- **Risk**: medium (shared across all product nerve center tabs — breaking changes propagate).

---

### 9. `frontend/src/lib/api/cia.ts` — 572 LOC

- **Top 5 exports**: CIA (Conversational Intelligence Agent) API client functions
- **Natural seams**: API endpoint groups — session management, message sending, context management, agent configuration
- **Proposed split**:
  - `api/cia.ts` keeps core client setup — ~150 LOC
  - `api/cia.session.ts` extracts session endpoints — ~140 LOC
  - `api/cia.messaging.ts` extracts message endpoints — ~140 LOC
  - `api/cia.config.ts` extracts configuration endpoints — ~142 LOC
- **Estimated effort**: S — single PR.
- **Risk**: low (API client — pure function extraction).

---

### 10. `frontend/src/app/(checkout)/hooks/useCheckoutExperienceSocial.ts` — 572 LOC

- **Top 5 exports**: `useCheckoutExperienceSocial` (hook)
- **Natural seams**: social identity resolution, WhatsApp session integration, lead enrichment
- **Proposed split**: extract identity resolution and lead enrichment into separate utilities.
- **Estimated effort**: M — single PR.
- **Risk**: medium (touches checkout flow).

---

## Recommended decomposition order

Top 10 files ranked by composite score (LOC × edit-frequency-in-90-days). Higher score = more benefit from reducing size to lower churn friction.

| Rank | File | LOC | Edits | Score | Status |
|------|------|-----|-------|-------|--------|
| 1 | `backend/src/kloel/kloel-chat-tools.service.ts` | 849 | 34 | 28,866 | ⚠️ Over cap |
| 2 | `backend/src/kloel/unified-agent.service.ts` | 562 | 96 | 53,952 | 🔥 Hottest file |
| 3 | `frontend/…/dashboard/KloelDashboard.tsx` | 589 | 71 | 41,819 | 🔥 High churn |
| 4 | `frontend/…/auth/kloel-auth-screen.tsx` | 584 | 69 | 40,296 | 🔥 High churn |
| 5 | `backend/src/kloel/kloel.service.ts` | 545 | 70 | 38,150 | |
| 6 | `frontend/…/checkout/CheckoutBlanc.tsx` | 558 | 57 | 31,806 | |
| 7 | `backend/src/kloel/kloel.controller.ts` | 594 | 50 | 29,700 | |
| 8 | `frontend/…/checkout/CheckoutNoir.tsx` | 571 | 52 | 29,692 | |
| 9 | `backend/…/providers/whatsapp-api.provider.ts` | 536 | 51 | 27,336 | |
| 10 | `backend/src/kloel/guest-chat.service.ts` | 590 | 41 | 24,190 | |

---

### Additional files 500–651 LOC worth monitoring

| File | LOC | Edits | Score |
|------|-----|-------|-------|
| `backend/src/kloel/guest-chat.action-intent.helpers.ts` | 651 | 17 | 11,067 |
| `backend/src/kloel/kloel-tool-dispatcher.service.ts` | 632 | 34 | 21,488 |
| `backend/src/partnerships/partnerships.service.ts` | 599 | 24 | 14,376 |
| `backend/src/checkout/checkout-payment.service.ts` | 596 | 36 | 21,456 |
| `backend/src/calendar/calendar.service.ts` | 588 | 26 | 15,288 |
| `backend/src/meta/meta-whatsapp.service.ts` | 582 | 38 | 22,116 |
| `backend/src/kloel/agent-runtime/agent-runtime.skill-registry.ts` | 572 | 5 | 2,860 |
| `backend/src/kloel/wallet.service.ts` | 572 | 35 | 20,020 |
| `backend/src/crm/crm.service.ts` | 570 | 27 | 15,390 |
| `backend/src/checkout/checkout.controller.ts` | 570 | 32 | 18,240 |
| `backend/src/ai-brain/knowledge-base.service.ts` | 568 | 28 | 15,904 |
| `backend/src/dashboard/dashboard.service.ts` | 566 | 19 | 10,754 |
| `backend/src/cia/cia.service.ts` | 564 | 23 | 12,972 |
| `backend/src/autopilot/segmentation.service.ts` | 564 | 24 | 13,536 |
| `backend/src/checkout/checkout-social-lead.service.ts` | 562 | 18 | 10,116 |
| `backend/src/inbox/inbox.service.ts` | 561 | 29 | 16,269 |
| `backend/src/kloel/unified-agent-actions-crm.service.ts` | 548 | 18 | 9,864 |
| `backend/src/pulse/pulse.service.ts` | 547 | 21 | 11,487 |
| `backend/src/payments/ledger/ledger.service.ts` | 545 | 9 | 4,905 |
| `backend/src/meta/meta-auth.controller.ts` | 542 | 35 | 18,970 |
| `backend/src/payments/connect/connect.controller.ts` | 540 | 17 | 9,180 |
| `backend/src/marketing/marketing.controller.ts` | 539 | 38 | 20,482 |
| `backend/src/whatsapp/account-agent.service.ts` | 539 | 29 | 15,631 |
| `frontend/…/auth/auth-provider.tsx` | 589 | 41 | 24,149 |
| `frontend/…/canvas/CanvasEditor.tsx` | 563 | 41 | 23,083 |
| `frontend/…/products/ProductPlansTab.tsx` | 574 | 35 | 20,090 |
| `frontend/hooks/useWhatsAppSession.ts` | 591 | 30 | 17,730 |
| `frontend/…/auth/auth-modal.tsx` | 571 | 30 | 17,130 |
| `frontend/…/settings/billing-settings-section.tsx` | 559 | 29 | 16,211 |
| `frontend/…/settings/crm-settings-section.tsx` | 602 | 22 | 13,244 |
| `frontend/hooks/useCheckoutExperience.ts` | 560 | 22 | 12,320 |
| `frontend/…/product-nerve-center.shared.tsx` | 574 | 20 | 11,480 |
| `frontend/hooks/useCheckoutExperienceSocial.ts` | 572 | 19 | 10,868 |
| `frontend/…/canvas/EditorTopBar.tsx` | 578 | 18 | 10,404 |
| `frontend/hooks/useCheckoutPlans.ts` | 584 | 16 | 9,344 |
| `frontend/lib/api/cia.ts` | 572 | 9 | 5,148 |

---

## Triage notes

### Skip (protected / design contracts)
- `backend/src/lib/ai-models.ts` — AI model definitions
- `backend/src/lib/openai-models.ts` — AI model definitions
- `backend/src/main.ts` (520 LOC) — NestJS bootstrap; inherently monolithic by framework design

### Already well-decomposed patterns
Several large files already exhibit strong decomposition discipline with dedicated helper files:
- `kloel-chat-tools.service.ts` already delegates to 6 helper files
- `KloelDashboard.tsx` already uses `KloelChatComposer.tsx`, `KloelDashboard.hooks.ts`, `KloelDashboard.helpers.ts`, etc.
- `crm-settings-section.tsx` already uses `crm-settings-section.parts.tsx`, `crm-settings-section.handlers.ts`, `crm-settings-section.helpers.ts`
- `kloel-auth-screen.tsx` already splits `AuthFormFields` into `kloel-auth-screen.form-fields.tsx`

The decomposition pattern is established — the remaining work is extending it consistently.

### Risk summary
- **Low risk (13 files)**: Pure mechanical extraction — `guest-chat.action-intent.helpers.ts`, `agent-runtime.skill-registry.ts`, `calendar.service.ts`, `EditorTopBar.tsx`, `ProductPlansTab.tsx`, API client files
- **Medium risk (14 files)**: Touches NestJS DI/OAuth/Meta integration — `kloel-tool-dispatcher.service.ts`, `kloel.controller.ts`, `knowledge-base.service.ts`, `crm.service.ts`, `checkout.controller.ts`, `meta-whatsapp.service.ts`, `partnerships.service.ts`, most frontend hooks/sections
- **High risk (3 files)**: Touches DTOs, payment state machine, or auth state — `checkout-payment.service.ts`, `payments/ledger/ledger.service.ts`, `auth-provider.tsx`

### Recommended first wave (lowest risk, highest impact)
1. **kloel-chat-tools.service.ts** — the only cap violator; already patterned for extraction; S effort
2. **guest-chat.action-intent.helpers.ts** — pure function extraction; S effort
3. **agent-runtime.skill-registry.ts** — defaults array extraction; S effort
4. **unified-agent.service.ts** — highest churn; extract prompt assembly; M effort (but highest ROI)
5. **kloel-auth-screen.tsx + auth-modal.tsx** — high churn auth UI; S–M effort# Wave 2 — File-Size Audit

## Methodology

- Scanned `backend/src/` and `frontend/src/` recursively for `.ts` and `.tsx` files.
- Excluded `*.spec.ts`, `*.test.ts`, `*.d.ts`, `schema.prisma`, and `evol/`.
- Counted physical lines via `wc -l` (includes blank lines, comments, imports).
- Identified natural seams by reading structural summaries, section-header comments (`// ===`, `// ──`), class boundaries, and existing helper-file delegation patterns.
- Estimated edit frequency via `git log --since="90 days ago" --oneline -- <file> | wc -l`.
- Composite priority score = LOC × edit-frequency (churn × size).
- Skipped AI-model definition files (`ai-models.ts`, `openai-models.ts`) and `CLAUDE.md` / `AGENTS.md` per constraints.

## Summary

- **Files over 800 LOC**: 1
- **Files over 1200 LOC**: 0
- **Files over 2000 LOC**: 0
- **Total LOC over the 800-line cap**: 49 (849 − 800 in the single offending file)
- **Files 500–800 LOC**: 59 backend, 15 frontend

**Finding**: The codebase largely respects the 800-LOC cap. The only violator is `kloel-chat-tools.service.ts` at 849 LOC (+49 over). However, 74 files sit in the 500–800 LOC danger zone and will cross the cap with continued feature additions. The top-10 composite ranking (LOC × churn) identifies high-ROI decomposition targets even before they breach the cap.# Wave 2 — File-Size Audit

## Methodology

- Scanned `backend/src/` and `frontend/src/` recursively for `.ts` and `.tsx` files.
- Excluded `*.spec.ts`, `*.test.ts`, `*.d.ts`, `schema.prisma`, and `evol/`.
- Counted physical lines via `wc -l` (includes blank lines, comments, imports).
- Identified natural seams by reading structural summaries, section-header comments (`// ===`, `// ──`), class boundaries, and existing helper-file delegation patterns.
- Estimated edit frequency via `git log --since="90 days ago" --oneline -- <file> | wc -l`.
- Composite priority score = LOC × edit-frequency (churn × size).
- Skipped AI-model definition files (`ai-models.ts`, `openai-models.ts`) and `CLAUDE.md` / `AGENTS.md` per constraints.

## Summary

- **Files over 800 LOC**: 1
- **Files over 1200 LOC**: 0
- **Files over 2000 LOC**: 0
- **Total LOC over the 800-line cap**: 49 (849 − 800 in the single offending file)
- **Files 500–800 LOC**: 59 backend, 15 frontend

**Finding**: The codebase largely respects the 800-LOC cap. The only violator is `kloel-chat-tools.service.ts` at 849 LOC (+49 over). However, 74 files sit in the 500–800 LOC danger zone and will cross the cap with continued feature additions. The top-10 composite ranking (LOC × churn) identifies high-ROI decomposition targets even before they breach the cap.

---

## Backend top offenders

### 1. `backend/src/kloel/kloel-chat-tools.service.ts` — 849 LOC ⚠️ OVER CAP

- **Top 5 exports**: `centsFromUnknown`, `KloelChatToolsService` (class), interfaces `ToolSaveProductArgs`, `ToolDeleteProductArgs`, `ToolCreateFlowArgs`
- **Natural seams (by section header / class boundaries)**:
  1. **Imports + shared utils** (lines 1–122) — interfaces, `safeStr()`, `centsFromUnknown()`
  2. **Core product CRUD tools** (lines 125–202) — `toolSaveProduct`, `toolListProducts`, `toolDeleteProduct`
  3. **Settings/Policy tools** (lines 203–372) — `toolToggleAutopilot`, `toolSetBrandVoice`, `toolSetSalesPolicy`, `toolRememberUserInfo`
  4. **Flow + Dashboard tools** (lines 373–503) — `toolCreateFlow`, `toolListFlows`, `toolGetDashboardSummary`, `toolCreatePaymentLink`
  5. **Agent runtime delegation** (lines 504–668) — `toolCreateAgentJob` through `toolVerifyAgentEvidence` (14 methods)
  6. **Product management delegators** (lines 669–706) — thin pass-through methods (11 methods)
  7. **Stub→real migration tools** (lines 708–800) — `toolUploadPlanImage` through `toolSendChannelMessage` (11 methods)
  8. **Order creation** (lines 804–849) — `toolCreateOrder`, `toolListSubscriptions`
- **Proposed split**:
  - `kloel-chat-tools.service.ts` keeps the class shell, constructor, and core product CRUD tools (seams 1–2) — ~200 LOC
  - `kloel-chat-tools.settings-policy.helpers.ts` extracts seam 3 — ~170 LOC
  - `kloel-chat-tools.flow-dashboard.helpers.ts` extracts seam 4 — ~130 LOC
  - `kloel-chat-tools.stub-migration.helpers.ts` extracts seam 7 — ~100 LOC
  - `kloel-chat-tools.order.helpers.ts` extracts seam 8 — ~50 LOC
  - Seams 5–6 already delegated to 5 existing helper files; no action needed.
- **Estimated effort**: S — single PR, pure mechanical. The file already follows the delegation pattern.
- **Risk**: low (pure mechanical) — methods are stateless dispatchers; DI already injects services.

### 2. `backend/src/kloel/guest-chat.action-intent.helpers.ts` — 651 LOC

- **Top 5 exports**: `detectActionIntent`, `extractProductName`, `extractProductArgs`, `extractPlanArgs`, `extractCouponArgs`
- **Natural seams**:
  1. **Intent detection** (lines 1–480) — regex cascade mapping Portuguese phrases → `{ tool, args }`; organized by section headers (`// ── PRODUTOS ──`, `// ── PLANOS ──`, etc.)
  2. **Argument extractors** (lines 480–620) — `extractProductName`, `extractProductArgs`, `extractPlanArgs`, `extractPaymentArgs`, `extractCouponArgs`, `extractUrlArgs`, `extractAffiliateArgs`, `extractFiscalArgs`
  3. **Re-export** (line 651) — `formatToolResult` from `guest-chat.format-tool-result.helpers`
- **Proposed split**:
  - `guest-chat.action-intent.helpers.ts` keeps `detectActionIntent` — ~480 LOC
  - `guest-chat.action-intent.extractors.ts` extracts all `extract*Args` — ~170 LOC
- **Estimated effort**: S — single PR, pure function extraction.
- **Risk**: low.

### 3. `backend/src/kloel/kloel-tool-dispatcher.service.ts` — 632 LOC

- **Top 5 exports**: `KloelToolDispatcherService` (class)
- **Natural seams**:
  1. **Imports + types** (lines 1–30) — `ApprovedToolExecutionResult`
  2. **Constructor + executeTool** (lines 31–150) — large switch/if-else routing to sub-services
  3. **Audit logging** (lines 150–350) — transactional audit log for financial tool calls
  4. **High-risk tool gating** (lines 350–632) — approval flow for destructive operations
- **Proposed split**:
  - `kloel-tool-dispatcher.service.ts` keeps dispatch — ~150 LOC
  - `kloel-tool-dispatcher.audit.helpers.ts` extracts audit logging — ~200 LOC
  - `kloel-tool-dispatcher.high-risk.helpers.ts` — ensure remaining inline approval logic moves to the existing file — ~280 LOC
- **Estimated effort**: S — single PR.
- **Risk**: medium (touches Nest DI + audit path).

### 4. `backend/src/partnerships/partnerships.service.ts` — 599 LOC

- **Top 5 exports**: `PartnershipsService` (class)
- **Natural seams**:
  1. **Constants + crypto** (lines 1–30) — `INVITABLE_PARTNER_TYPES`, `PARTNER_ROLE_LABELS`
  2. **Affiliate registration + links** (lines 30–250)
  3. **Colaborator/coproducer management** (lines 250–400)
  4. **Commission + payout triggers** (lines 400–599)
- **Proposed split**:
  - `partnerships.service.ts` keeps orchestration — ~200 LOC
  - `partnerships.affiliate.helpers.ts` — ~200 LOC
  - `partnerships.commission.helpers.ts` — ~200 LOC
- **Estimated effort**: M — single PR.
- **Risk**: medium (touches wallet/payout DTOs).

### 5. `backend/src/checkout/checkout-payment.service.ts` — 596 LOC

- **Top 5 exports**: `CheckoutPaymentService`, `mapStripePaymentStatus`, `extractPixDisplayData`, `toJsonValue`
- **Natural seams**:
  1. **Types + helpers** (lines 1–60)
  2. **Stripe charge orchestration** (lines 60–300)
  3. **PIX payment handling** (lines 300–450)
  4. **Boleto payment handling** (lines 450–596)
- **Proposed split**:
  - `checkout-payment.service.ts` keeps Stripe — ~240 LOC
  - `checkout-payment.pix.helpers.ts` — ~150 LOC
  - `checkout-payment.boleto.helpers.ts` — ~150 LOC
  - `checkout-payment.types.ts` — ~60 LOC
- **Estimated effort**: M — single PR.
- **Risk**: high (touches DTOs + Stripe + payment state machine).

### 6. `backend/src/kloel/kloel.controller.ts` — 594 LOC

- **Top 5 exports**: `KloelController` (class)
- **Natural seams**:
  1. **DTOs + constants** (lines 1–35)
  2. **Chat endpoints** (lines 35–200) — `/think`, `/chat`, `/onboarding-chat`
  3. **Product/config endpoints** (lines 200–400)
  4. **Upload endpoints** (lines 400–500)
  5. **Approval/agent endpoints** (lines 500–594)
- **Proposed split**:
  - `kloel.controller.ts` keeps chat + upload — ~300 LOC
  - `kloel.controller.product.ts` — ~200 LOC
  - `kloel.controller.approval.ts` — ~100 LOC
- **Estimated effort**: M — single PR.
- **Risk**: medium (touches route registration).

### 7. `backend/src/kloel/guest-chat.service.ts` — 590 LOC

- **Top 5 exports**: `GuestChatService` (class)
- **Natural seams**:
  1. **Types + constants** (lines 1–20)
  2. **Redis conversation CRUD** (lines 20–250)
  3. **Fallback Map storage** (lines 250–400)
  4. **Message processing** (lines 400–590)
- **Proposed split**:
  - `guest-chat.service.ts` keeps orchestration — ~200 LOC
  - `guest-chat.storage.helpers.ts` — ~200 LOC
  - `guest-chat.processing.helpers.ts` — ~190 LOC
- **Estimated effort**: S — single PR.
- **Risk**: low.

### 8. `backend/src/calendar/calendar.service.ts` — 588 LOC

- **Top 5 exports**: `CalendarService`, `CalendarEvent`
- **Natural seams**:
  1. **Types + constants** (lines 1–40)
  2. **Google Calendar integration** (lines 40–350) — OAuth, event CRUD, sync
  3. **Appointment scheduling** (lines 350–500)
  4. **Provider calendar settings** (lines 500–588)
- **Proposed split**:
  - `calendar.service.ts` keeps orchestration — ~200 LOC
  - `calendar.google.helpers.ts` — ~310 LOC
  - `calendar.appointment.helpers.ts` — ~80 LOC
- **Estimated effort**: M — single PR.
- **Risk**: medium (touches OAuth flow).

### 9. `backend/src/meta/meta-whatsapp.service.ts` — 582 LOC

- **Top 5 exports**: `MetaWhatsAppService` (class)
- **Natural seams**:
  1. **Types + normalizers** (lines 1–40)
  2. **Connection state** (lines 40–250)
  3. **OAuth scope negotiation** (lines 250–400)
  4. **Channel provisioning** (lines 400–582)
- **Proposed split**:
  - `meta-whatsapp.service.ts` keeps orchestration — ~200 LOC
  - `meta-whatsapp.connection.helpers.ts` — ~210 LOC
  - `meta-whatsapp.scopes.helpers.ts` — ~170 LOC
- **Estimated effort**: S — single PR.
- **Risk**: medium (touches Meta OAuth).

### 10. `backend/src/kloel/unified-agent.service.ts` — 562 LOC 🔥 Highest churn (96 edits)

- **Top 5 exports**: `UnifiedAgentService` (class), types from `unified-agent.types`
- **Natural seams**:
  1. **Helpers** (lines 1–40) — `isAllowedTool`, `formatPromptValue`
  2. **Prompt/context assembly** (lines 40–200)
  3. **Tool execution + action dispatch** (lines 200–400)
  4. **Response formatting + confidence** (lines 400–562)
- **Proposed split**:
  - `unified-agent.service.ts` keeps orchestration — ~200 LOC
  - `unified-agent.prompt.helpers.ts` — ~160 LOC
  - `unified-agent.dispatch.helpers.ts` — ~200 LOC
- **Estimated effort**: M — likely multi-PR due to churn.
- **Risk**: medium (touches Nest DI + LLM integration).

### 11. `backend/src/kloel/agent-runtime/agent-runtime.skill-registry.ts` — 572 LOC

- **Top 5 exports**: `AgentRuntimeSkillRegistry` (class)
- **Natural seams**:
  1. **Default skills array** (lines 1–150) — `DEFAULT_SKILLS`
  2. **Skill CRUD + validation** (lines 150–350)
  3. **Usage tracking + stats** (lines 350–572)
- **Proposed split**:
  - `agent-runtime.skill-registry.ts` keeps CRUD — ~200 LOC
  - `agent-runtime.skill-registry.defaults.ts` — ~170 LOC
  - `agent-runtime.skill-registry.stats.ts` — ~200 LOC
- **Estimated effort**: S — single PR.
- **Risk**: low.

### 12. `backend/src/crm/crm.service.ts` — 570 LOC

- **Top 5 exports**: `CrmService` (class)
- **Natural seams**: contact CRUD / deal pipeline / lead scoring
- **Proposed split**:
  - `crm.service.ts` keeps orchestration — ~200 LOC
  - `crm.contacts.helpers.ts` — ~200 LOC
  - `crm.deals.helpers.ts` — ~170 LOC
- **Estimated effort**: M — single PR.
- **Risk**: medium (touches CRM event emitter).

### 13. `backend/src/ai-brain/knowledge-base.service.ts` — 568 LOC

- **Top 5 exports**: `KnowledgeBaseService` (class)
- **Natural seams**:
  1. **Text chunking** (lines 1–100) — `splitKnowledgeBaseText` and helpers
  2. **Wallet billing** (lines 100–200) — `chargeUsageIfNeeded`, `refundUsageIfNeeded`
  3. **Source ingestion** (lines 200–400) — URL fetch, HTML→text, PDF
  4. **KB CRUD + search** (lines 400–568)
- **Proposed split**:
  - `knowledge-base.service.ts` keeps orchestration — ~200 LOC
  - `knowledge-base.chunking.helpers.ts` — ~100 LOC
  - `knowledge-base.billing.helpers.ts` — ~100 LOC
  - `knowledge-base.ingestion.helpers.ts` — ~168 LOC
- **Estimated effort**: M — single PR.
- **Risk**: medium (touches wallet billing + URL fetch).

### 14. `backend/src/payments/ledger/ledger.service.ts` — 545 LOC

- **Top 5 exports**: `LedgerService` (class)
- **Natural seams**: credit ops / debit ops / balance reconciliation
- **Proposed split**:
  - `ledger.service.ts` keeps orchestration — ~200 LOC
  - `ledger.credits.helpers.ts` — ~180 LOC
  - `ledger.debits.helpers.ts` — ~165 LOC
- **Estimated effort**: M — single PR.
- **Risk**: high (touches financial DTOs + dual-balance contract).

### 15. `backend/src/checkout/checkout-social-lead.service.ts` — 562 LOC

- **Natural seams**: social identity resolution / lead enrichment / WhatsApp session
- **Estimated effort**: M — single PR.
- **Risk**: medium.

---

## Frontend top offenders

_NOTE: No frontend files exceed 800 LOC. Listed for monitoring and proactive decomposition._

### 1. `frontend/src/components/kloel/settings/crm-settings-section.tsx` — 602 LOC

- **Top 5 exports**: `CrmSettingsSection` (component)
- **Already partially decomposed**: has `.parts.tsx`, `.handlers.ts`, `.helpers.ts` files.
- **Natural seams**: contact mgmt UI / segmentation rules / pipeline cards
- **Proposed split**: push remaining inline sections to existing `.parts.tsx`
- **Estimated effort**: S — single PR.
- **Risk**: low (pure UI extraction).

### 2. `frontend/src/hooks/useWhatsAppSession.ts` — 591 LOC

- **Natural seams**: session state machine / QR pairing / diagnostics
- **Proposed split**:
  - `useWhatsAppSession.ts` keeps main hook — ~200 LOC
  - `useWhatsAppSession.qr.ts` — ~200 LOC
  - `useWhatsAppSession.diagnostics.ts` — ~191 LOC
- **Estimated effort**: S — single PR.
- **Risk**: medium (real-time session state).

### 3. `frontend/src/components/kloel/dashboard/KloelDashboard.tsx` — 589 LOC 🔥 High churn (71 edits)

- **Already partially split**: has `KloelChatComposer.tsx`, `KloelDashboard.message.tsx` (550 LOC!), `KloelDashboard.hooks.ts`, etc.
- **Natural seams**: chat composer / message display / approval strip
- **Proposed split**: extract remaining inline sections to existing sub-files
- **Note**: `KloelDashboard.message.tsx` at 550 LOC is itself a decomposition candidate.
- **Estimated effort**: M — single PR.
- **Risk**: medium (core dashboard UX).

### 4. `frontend/src/components/kloel/auth/auth-provider.tsx` — 589 LOC

- **Top 5 exports**: `AuthProvider`, `useAuth`
- **Natural seams**: types / auth state / workspace switching / bootstrap
- **Proposed split**:
  - `auth-provider.tsx` keeps provider + `useAuth` — ~200 LOC
  - `auth-provider.types.ts` — ~50 LOC
  - `auth-provider.workspace.ts` — ~170 LOC
  - `auth-provider.bootstrap.ts` — ~169 LOC
- **Estimated effort**: M — single PR.
- **Risk**: high (auth state machine — every page depends on this).

### 5. `frontend/src/components/kloel/auth/kloel-auth-screen.tsx` — 584 LOC 🔥 High churn (69 edits)

- **Already partially split**: uses `AuthFormFields` from `kloel-auth-screen.form-fields.tsx`
- **Natural seams**: login form / register form / OAuth callback
- **Proposed split**:
  - `kloel-auth-screen.tsx` keeps shell — ~200 LOC
  - `kloel-auth-screen.login.tsx` — ~225 LOC
  - `kloel-auth-screen.register.tsx` — ~159 LOC
- **Estimated effort**: S — single PR.
- **Risk**: medium (auth UI — high-visibility path).

### 6. `frontend/src/components/canvas/EditorTopBar.tsx` — 578 LOC

- **Natural seams**: file actions / canvas tools / layer controls
- **Proposed split**: extract file actions and canvas tools into separate components.
- **Estimated effort**: S — single PR.
- **Risk**: low (pure UI extraction).

### 7. `frontend/src/components/products/ProductPlansTab.tsx` — 574 LOC

- **Natural seams**: plan creation form / plan list / plan detail
- **Estimated effort**: S — single PR.
- **Risk**: low.

### 8. `frontend/src/components/kloel/products/product-nerve-center.shared.tsx` — 574 LOC

- **Natural seams**: shared atoms / shared types / shared validators
- **Proposed split**: `product-nerve-center.shared.atoms.tsx`, `.types.ts`, `.validators.ts`
- **Estimated effort**: S — single PR.
- **Risk**: medium (shared across all product nerve center tabs).

### 9. `frontend/src/lib/api/cia.ts` — 572 LOC

- **Natural seams**: session mgmt / messaging / config API groups
- **Proposed split**: `api/cia.ts` (core), `api/cia.session.ts`, `api/cia.messaging.ts`, `api/cia.config.ts`
- **Estimated effort**: S — single PR.
- **Risk**: low (pure function extraction).

### 10. `frontend/src/app/(checkout)/hooks/useCheckoutExperienceSocial.ts` — 572 LOC

- **Natural seams**: social identity / WhatsApp session / lead enrichment
- **Estimated effort**: M — single PR.
- **Risk**: medium (checkout flow).

---

## Recommended decomposition order

Top 10 files ranked by composite score (LOC × edit-frequency). Higher score = more benefit from reducing size.

| Rank | File | LOC | Edits | Score | Status |
|------|------|-----|-------|-------|--------|
| 1 | `backend/…/kloel-chat-tools.service.ts` | 849 | 34 | 28,866 | ⚠️ Over cap |
| 2 | `backend/…/unified-agent.service.ts` | 562 | 96 | 53,952 | 🔥 Hottest |
| 3 | `frontend/…/dashboard/KloelDashboard.tsx` | 589 | 71 | 41,819 | 🔥 High churn |
| 4 | `frontend/…/auth/kloel-auth-screen.tsx` | 584 | 69 | 40,296 | 🔥 High churn |
| 5 | `backend/…/kloel.service.ts` | 545 | 70 | 38,150 | |
| 6 | `frontend/…/checkout/CheckoutBlanc.tsx` | 558 | 57 | 31,806 | |
| 7 | `backend/…/kloel.controller.ts` | 594 | 50 | 29,700 | |
| 8 | `frontend/…/checkout/CheckoutNoir.tsx` | 571 | 52 | 29,692 | |
| 9 | `backend/…/whatsapp-api.provider.ts` | 536 | 51 | 27,336 | |
| 10 | `backend/…/guest-chat.service.ts` | 590 | 41 | 24,190 | |

---

## Risk summary

- **Low risk (13 files)**: Pure mechanical extraction — `guest-chat.action-intent.helpers.ts`, `agent-runtime.skill-registry.ts`, `calendar.service.ts`, `EditorTopBar.tsx`, `ProductPlansTab.tsx`, API client files
- **Medium risk (14 files)**: Touches NestJS DI/OAuth/Meta integration — `kloel-tool-dispatcher.service.ts`, `kloel.controller.ts`, `knowledge-base.service.ts`, `crm.service.ts`, `checkout.controller.ts`, `meta-whatsapp.service.ts`, `partnerships.service.ts`, most frontend hooks/sections
- **High risk (3 files)**: Touches DTOs, payment state machine, or auth state — `checkout-payment.service.ts`, `payments/ledger/ledger.service.ts`, `auth-provider.tsx`

### Skip list (protected / already well-decomposed)
- `backend/src/lib/ai-models.ts`, `openai-models.ts` — AI model definitions
- `backend/src/main.ts` (520 LOC) — NestJS bootstrap; inherently monolithic
- Files already well-decomposed with dedicated helpers: `kloel-chat-tools.service.ts` (6 helpers), `KloelDashboard.tsx` (5 sub-files), `crm-settings-section.tsx` (3 sub-files)

### Recommended first wave (lowest risk, highest impact)
1. **kloel-chat-tools.service.ts** — only cap violator; already patterned; S effort
2. **guest-chat.action-intent.helpers.ts** — pure function extraction; S effort
3. **agent-runtime.skill-registry.ts** — defaults array extraction; S effort
4. **unified-agent.service.ts** — highest churn; extract prompt assembly; M effort (highest ROI)
5. **kloel-auth-screen.tsx + auth-modal.tsx** — high churn auth UI; S–M effort# Wave 2 — File-Size Audit

## Methodology

- Scanned `backend/src/` and `frontend/src/` recursively for `.ts` and `.tsx` files.
- Excluded `*.spec.ts`, `*.test.ts`, `*.d.ts`, `schema.prisma`, and `evol/`.
- Counted physical lines via `wc -l` (includes blank lines, comments, imports).
- Identified natural seams by reading structural summaries, section-header comments (`// ===`, `// ──`), class boundaries, and existing helper-file delegation patterns.
- Estimated edit frequency via `git log --since="90 days ago" --oneline -- <file> | wc -l`.
- Composite priority score = LOC × edit-frequency (churn × size).
- Skipped AI-model definition files (`ai-models.ts`, `openai-models.ts`) and `CLAUDE.md` / `AGENTS.md` per constraints.

## Summary

- **Files over 800 LOC**: 1
- **Files over 1200 LOC**: 0
- **Files over 2000 LOC**: 0
- **Total LOC over the 800-line cap**: 49 (849 − 800 in the single offending file)
- **Files 500–800 LOC**: 59 backend, 15 frontend

**Finding**: The codebase largely respects the 800-LOC cap. The only violator is `kloel-chat-tools.service.ts` at 849 LOC (+49 over). However, 74 files sit in the 500–800 LOC danger zone and will cross the cap with continued feature additions. The top-10 composite ranking (LOC × churn) identifies high-ROI decomposition targets even before they breach the cap.

---

## Backend top offenders

### 1. `backend/src/kloel/kloel-chat-tools.service.ts` — 849 LOC ⚠️ OVER CAP

- **Top 5 exports**: `centsFromUnknown`, `KloelChatToolsService` (class), interfaces `ToolSaveProductArgs`, `ToolDeleteProductArgs`, `ToolCreateFlowArgs`
- **Natural seams (by section header / class boundaries)**:
  1. **Imports + shared utils** (lines 1–122) — interfaces, `safeStr()`, `centsFromUnknown()`
  2. **Core product CRUD tools** (lines 125–202) — `toolSaveProduct`, `toolListProducts`, `toolDeleteProduct`
  3. **Settings/Policy tools** (lines 203–372) — `toolToggleAutopilot`, `toolSetBrandVoice`, `toolSetSalesPolicy`, `toolRememberUserInfo`
  4. **Flow + Dashboard tools** (lines 373–503) — `toolCreateFlow`, `toolListFlows`, `toolGetDashboardSummary`, `toolCreatePaymentLink`
  5. **Agent runtime delegation** (lines 504–668) — `toolCreateAgentJob` through `toolVerifyAgentEvidence` (14 methods)
  6. **Product management delegators** (lines 669–706) — thin pass-through methods (11 methods)
  7. **Stub→real migration tools** (lines 708–800) — `toolUploadPlanImage` through `toolSendChannelMessage` (11 methods)
  8. **Order creation** (lines 804–849) — `toolCreateOrder`, `toolListSubscriptions`
- **Proposed split**:
  - `kloel-chat-tools.service.ts` keeps the class shell, constructor, and core product CRUD tools (seams 1–2) — ~200 LOC
  - `kloel-chat-tools.settings-policy.helpers.ts` extracts seam 3 — ~170 LOC
  - `kloel-chat-tools.flow-dashboard.helpers.ts` extracts seam 4 — ~130 LOC
  - `kloel-chat-tools.stub-migration.helpers.ts` extracts seam 7 — ~100 LOC
  - `kloel-chat-tools.order.helpers.ts` extracts seam 8 — ~50 LOC
  - Seams 5–6 already delegated to 5 existing helper files; no action needed.
- **Estimated effort**: S — single PR, pure mechanical. The file already follows the delegation pattern.
- **Risk**: low (pure mechanical) — methods are stateless dispatchers; DI already injects services.

### 2. `backend/src/kloel/guest-chat.action-intent.helpers.ts` — 651 LOC

- **Top 5 exports**: `detectActionIntent`, `extractProductName`, `extractProductArgs`, `extractPlanArgs`, `extractCouponArgs`
- **Natural seams**:
  1. **Intent detection** (lines 1–480) — regex cascade mapping Portuguese phrases → `{ tool, args }`; organized by section headers (`// ── PRODUTOS ──`, `// ── PLANOS ──`, etc.)
  2. **Argument extractors** (lines 480–620) — `extractProductName`, `extractProductArgs`, `extractPlanArgs`, `extractPaymentArgs`, `extractCouponArgs`, `extractUrlArgs`, `extractAffiliateArgs`, `extractFiscalArgs`
  3. **Re-export** (line 651) — `formatToolResult` from `guest-chat.format-tool-result.helpers`
- **Proposed split**:
  - `guest-chat.action-intent.helpers.ts` keeps `detectActionIntent` — ~480 LOC
  - `guest-chat.action-intent.extractors.ts` extracts all `extract*Args` — ~170 LOC
- **Estimated effort**: S — single PR, pure function extraction.
- **Risk**: low.

### 3. `backend/src/kloel/kloel-tool-dispatcher.service.ts` — 632 LOC

- **Top 5 exports**: `KloelToolDispatcherService` (class)
- **Natural seams**:
  1. **Imports + types** (lines 1–30) — `ApprovedToolExecutionResult`
  2. **Constructor + executeTool** (lines 31–150) — large switch/if-else routing to sub-services
  3. **Audit logging** (lines 150–350) — transactional audit log for financial tool calls
  4. **High-risk tool gating** (lines 350–632) — approval flow for destructive operations
- **Proposed split**:
  - `kloel-tool-dispatcher.service.ts` keeps dispatch — ~150 LOC
  - `kloel-tool-dispatcher.audit.helpers.ts` extracts audit logging — ~200 LOC
  - `kloel-tool-dispatcher.high-risk.helpers.ts` — ensure remaining inline approval logic moves to the existing file — ~280 LOC
- **Estimated effort**: S — single PR.
- **Risk**: medium (touches Nest DI + audit path).

### 4. `backend/src/partnerships/partnerships.service.ts` — 599 LOC

- **Top 5 exports**: `PartnershipsService` (class)
- **Natural seams**:
  1. **Constants + crypto** (lines 1–30) — `INVITABLE_PARTNER_TYPES`, `PARTNER_ROLE_LABELS`
  2. **Affiliate registration + links** (lines 30–250)
  3. **Colaborator/coproducer management** (lines 250–400)
  4. **Commission + payout triggers** (lines 400–599)
- **Proposed split**:
  - `partnerships.service.ts` keeps orchestration — ~200 LOC
  - `partnerships.affiliate.helpers.ts` — ~200 LOC
  - `partnerships.commission.helpers.ts` — ~200 LOC
- **Estimated effort**: M — single PR.
- **Risk**: medium (touches wallet/payout DTOs).

### 5. `backend/src/checkout/checkout-payment.service.ts` — 596 LOC

- **Top 5 exports**: `CheckoutPaymentService`, `mapStripePaymentStatus`, `extractPixDisplayData`, `toJsonValue`
- **Natural seams**:
  1. **Types + helpers** (lines 1–60)
  2. **Stripe charge orchestration** (lines 60–300)
  3. **PIX payment handling** (lines 300–450)
  4. **Boleto payment handling** (lines 450–596)
- **Proposed split**:
  - `checkout-payment.service.ts` keeps Stripe — ~240 LOC
  - `checkout-payment.pix.helpers.ts` — ~150 LOC
  - `checkout-payment.boleto.helpers.ts` — ~150 LOC
  - `checkout-payment.types.ts` — ~60 LOC
- **Estimated effort**: M — single PR.
- **Risk**: high (touches DTOs + Stripe + payment state machine).

### 6. `backend/src/kloel/kloel.controller.ts` — 594 LOC

- **Top 5 exports**: `KloelController` (class)
- **Natural seams**:
  1. **DTOs + constants** (lines 1–35)
  2. **Chat endpoints** (lines 35–200) — `/think`, `/chat`, `/onboarding-chat`
  3. **Product/config endpoints** (lines 200–400)
  4. **Upload endpoints** (lines 400–500)
  5. **Approval/agent endpoints** (lines 500–594)
- **Proposed split**:
  - `kloel.controller.ts` keeps chat + upload — ~300 LOC
  - `kloel.controller.product.ts` — ~200 LOC
  - `kloel.controller.approval.ts` — ~100 LOC
- **Estimated effort**: M — single PR.
- **Risk**: medium (touches route registration).
### 7. `backend/src/kloel/guest-chat.service.ts` — 590 LOC

- **Top 5 exports**: `GuestChatService` (class)
- **Natural seams**:
  1. **Types + constants** (lines 1–20)
  2. **Redis conversation CRUD** (lines 20–250)
  3. **Fallback Map storage** (lines 250–400)
  4. **Message processing** (lines 400–590)
- **Proposed split**:
  - `guest-chat.service.ts` keeps orchestration — ~200 LOC
  - `guest-chat.storage.helpers.ts` — ~200 LOC
  - `guest-chat.processing.helpers.ts` — ~190 LOC
- **Estimated effort**: S — single PR.
- **Risk**: low.

### 8. `backend/src/calendar/calendar.service.ts` — 588 LOC

- **Top 5 exports**: `CalendarService`, `CalendarEvent`
- **Natural seams**:
  1. **Types + constants** (lines 1–40)
  2. **Google Calendar integration** (lines 40–350) — OAuth, event CRUD, sync
  3. **Appointment scheduling** (lines 350–500)
  4. **Provider calendar settings** (lines 500–588)
- **Proposed split**:
  - `calendar.service.ts` keeps orchestration — ~200 LOC
  - `calendar.google.helpers.ts` — ~310 LOC
  - `calendar.appointment.helpers.ts` — ~80 LOC
- **Estimated effort**: M — single PR.
- **Risk**: medium (touches OAuth flow).

### 9. `backend/src/meta/meta-whatsapp.service.ts` — 582 LOC

- **Top 5 exports**: `MetaWhatsAppService` (class)
- **Natural seams**:
  1. **Types + normalizers** (lines 1–40)
  2. **Connection state** (lines 40–250)
  3. **OAuth scope negotiation** (lines 250–400)
  4. **Channel provisioning** (lines 400–582)
- **Proposed split**:
  - `meta-whatsapp.service.ts` keeps orchestration — ~200 LOC
  - `meta-whatsapp.connection.helpers.ts` — ~210 LOC
  - `meta-whatsapp.scopes.helpers.ts` — ~170 LOC
- **Estimated effort**: S — single PR.
- **Risk**: medium (touches Meta OAuth).

### 10. `backend/src/kloel/unified-agent.service.ts` — 562 LOC 🔥 Highest churn (96 edits)

- **Top 5 exports**: `UnifiedAgentService` (class), types from `unified-agent.types`
- **Natural seams**:
  1. **Helpers** (lines 1–40) — `isAllowedTool`, `formatPromptValue`
  2. **Prompt/context assembly** (lines 40–200)
  3. **Tool execution + action dispatch** (lines 200–400)
  4. **Response formatting + confidence** (lines 400–562)
- **Proposed split**:
  - `unified-agent.service.ts` keeps orchestration — ~200 LOC
  - `unified-agent.prompt.helpers.ts` — ~160 LOC
  - `unified-agent.dispatch.helpers.ts` — ~200 LOC
- **Estimated effort**: M — likely multi-PR due to churn.
- **Risk**: medium (touches Nest DI + LLM integration).

### 11. `backend/src/kloel/agent-runtime/agent-runtime.skill-registry.ts` — 572 LOC

- **Top 5 exports**: `AgentRuntimeSkillRegistry` (class)
- **Natural seams**:
  1. **Default skills array** (lines 1–150) — `DEFAULT_SKILLS`
  2. **Skill CRUD + validation** (lines 150–350)
  3. **Usage tracking + stats** (lines 350–572)
- **Proposed split**:
  - `agent-runtime.skill-registry.ts` keeps CRUD — ~200 LOC
  - `agent-runtime.skill-registry.defaults.ts` — ~170 LOC
  - `agent-runtime.skill-registry.stats.ts` — ~200 LOC
- **Estimated effort**: S — single PR.
- **Risk**: low.

### 12. `backend/src/crm/crm.service.ts` — 570 LOC

- **Top 5 exports**: `CrmService` (class)
- **Natural seams**: contact CRUD / deal pipeline / lead scoring
- **Proposed split**:
  - `crm.service.ts` keeps orchestration — ~200 LOC
  - `crm.contacts.helpers.ts` — ~200 LOC
  - `crm.deals.helpers.ts` — ~170 LOC
- **Estimated effort**: M — single PR.
- **Risk**: medium (touches CRM event emitter).

### 13. `backend/src/ai-brain/knowledge-base.service.ts` — 568 LOC

- **Top 5 exports**: `KnowledgeBaseService` (class)
- **Natural seams**:
  1. **Text chunking** (lines 1–100) — `splitKnowledgeBaseText` and helpers
  2. **Wallet billing** (lines 100–200) — `chargeUsageIfNeeded`, `refundUsageIfNeeded`
  3. **Source ingestion** (lines 200–400) — URL fetch, HTML→text, PDF
  4. **KB CRUD + search** (lines 400–568)
- **Proposed split**:
  - `knowledge-base.service.ts` keeps orchestration — ~200 LOC
  - `knowledge-base.chunking.helpers.ts` — ~100 LOC
  - `knowledge-base.billing.helpers.ts` — ~100 LOC
  - `knowledge-base.ingestion.helpers.ts` — ~168 LOC
- **Estimated effort**: M — single PR.
- **Risk**: medium (touches wallet billing + URL fetch).

### 14. `backend/src/payments/ledger/ledger.service.ts` — 545 LOC

- **Top 5 exports**: `LedgerService` (class)
- **Natural seams**: credit ops / debit ops / balance reconciliation
- **Proposed split**:
  - `ledger.service.ts` keeps orchestration — ~200 LOC
  - `ledger.credits.helpers.ts` — ~180 LOC
  - `ledger.debits.helpers.ts` — ~165 LOC
- **Estimated effort**: M — single PR.
- **Risk**: high (touches financial DTOs + dual-balance contract).

### 15. `backend/src/checkout/checkout-social-lead.service.ts` — 562 LOC

- **Natural seams**: social identity resolution / lead enrichment / WhatsApp session
- **Estimated effort**: M — single PR.
- **Risk**: medium.# Wave 2 — File-Size Audit

## Methodology

- Scanned `backend/src/` and `frontend/src/` recursively for `.ts` and `.tsx` files.
- Excluded `*.spec.ts`, `*.test.ts`, `*.d.ts`, `schema.prisma`, and `evol/`.
- Counted physical lines via `wc -l` (includes blank lines, comments, imports).
- Identified natural seams by reading structural summaries, section-header comments (`// ===`, `// ──`), class boundaries, and existing helper-file delegation patterns.
- Estimated edit frequency via `git log --since="90 days ago" --oneline -- <file> | wc -l`.
- Composite priority score = LOC × edit-frequency (churn × size).
- Skipped AI-model definition files (`ai-models.ts`, `openai-models.ts`) and `CLAUDE.md` / `AGENTS.md` per constraints.

## Summary

- **Files over 800 LOC**: 1
- **Files over 1200 LOC**: 0
- **Files over 2000 LOC**: 0
- **Total LOC over the 800-line cap**: 49 (849 − 800 in the single offending file)
- **Files 500–800 LOC**: 59 backend, 15 frontend

**Finding**: The codebase largely respects the 800-LOC cap. The only violator is `kloel-chat-tools.service.ts` at 849 LOC (+49 over). However, 74 files sit in the 500–800 LOC danger zone and will cross the cap with continued feature additions. The top-10 composite ranking (LOC × churn) identifies high-ROI decomposition targets even before they breach the cap.

---

## Backend top offenders

### 1. `backend/src/kloel/kloel-chat-tools.service.ts` — 849 LOC ⚠️ OVER CAP

- **Top 5 exports**: `centsFromUnknown`, `KloelChatToolsService` (class), interfaces `ToolSaveProductArgs`, `ToolDeleteProductArgs`, `ToolCreateFlowArgs`
- **Natural seams (by section header / class boundaries)**:
  1. **Imports + shared utils** (lines 1–122) — interfaces, `safeStr()`, `centsFromUnknown()`
  2. **Core product CRUD tools** (lines 125–202) — `toolSaveProduct`, `toolListProducts`, `toolDeleteProduct`
  3. **Settings/Policy tools** (lines 203–372) — `toolToggleAutopilot`, `toolSetBrandVoice`, `toolSetSalesPolicy`, `toolRememberUserInfo`
  4. **Flow + Dashboard tools** (lines 373–503) — `toolCreateFlow`, `toolListFlows`, `toolGetDashboardSummary`, `toolCreatePaymentLink`
  5. **Agent runtime delegation** (lines 504–668) — `toolCreateAgentJob` through `toolVerifyAgentEvidence` (14 methods)
  6. **Product management delegators** (lines 669–706) — thin pass-through methods (11 methods)
  7. **Stub→real migration tools** (lines 708–800) — `toolUploadPlanImage` through `toolSendChannelMessage` (11 methods)
  8. **Order creation** (lines 804–849) — `toolCreateOrder`, `toolListSubscriptions`
- **Proposed split**:
  - `kloel-chat-tools.service.ts` keeps the class shell, constructor, and core product CRUD tools (seams 1–2) — ~200 LOC
  - `kloel-chat-tools.settings-policy.helpers.ts` extracts seam 3 — ~170 LOC
  - `kloel-chat-tools.flow-dashboard.helpers.ts` extracts seam 4 — ~130 LOC
  - `kloel-chat-tools.stub-migration.helpers.ts` extracts seam 7 — ~100 LOC
  - `kloel-chat-tools.order.helpers.ts` extracts seam 8 — ~50 LOC
  - Seams 5–6 already delegated to 5 existing helper files; no action needed.
- **Estimated effort**: S — single PR, pure mechanical. The file already follows the delegation pattern.
- **Risk**: low (pure mechanical) — methods are stateless dispatchers; DI already injects services.

### 2. `backend/src/kloel/guest-chat.action-intent.helpers.ts` — 651 LOC

- **Top 5 exports**: `detectActionIntent`, `extractProductName`, `extractProductArgs`, `extractPlanArgs`, `extractCouponArgs`
- **Natural seams**:
  1. **Intent detection** (lines 1–480) — regex cascade mapping Portuguese phrases → `{ tool, args }`; organized by section headers (`// ── PRODUTOS ──`, `// ── PLANOS ──`, etc.)
  2. **Argument extractors** (lines 480–620) — `extractProductName`, `extractProductArgs`, `extractPlanArgs`, `extractPaymentArgs`, `extractCouponArgs`, `extractUrlArgs`, `extractAffiliateArgs`, `extractFiscalArgs`
  3. **Re-export** (line 651) — `formatToolResult` from `guest-chat.format-tool-result.helpers`
- **Proposed split**:
  - `guest-chat.action-intent.helpers.ts` keeps `detectActionIntent` — ~480 LOC
  - `guest-chat.action-intent.extractors.ts` extracts all `extract*Args` — ~170 LOC
- **Estimated effort**: S — single PR, pure function extraction.
- **Risk**: low.

### 3. `backend/src/kloel/kloel-tool-dispatcher.service.ts` — 632 LOC

- **Top 5 exports**: `KloelToolDispatcherService` (class)
- **Natural seams**:
  1. **Imports + types** (lines 1–30) — `ApprovedToolExecutionResult`
  2. **Constructor + executeTool** (lines 31–150) — large switch/if-else routing to sub-services
  3. **Audit logging** (lines 150–350) — transactional audit log for financial tool calls
  4. **High-risk tool gating** (lines 350–632) — approval flow for destructive operations
- **Proposed split**:
  - `kloel-tool-dispatcher.service.ts` keeps dispatch — ~150 LOC
  - `kloel-tool-dispatcher.audit.helpers.ts` extracts audit logging — ~200 LOC
  - `kloel-tool-dispatcher.high-risk.helpers.ts` — ensure remaining inline approval logic moves to the existing file — ~280 LOC
- **Estimated effort**: S — single PR.
- **Risk**: medium (touches Nest DI + audit path).

### 4. `backend/src/partnerships/partnerships.service.ts` — 599 LOC

- **Top 5 exports**: `PartnershipsService` (class)
- **Natural seams**:
  1. **Constants + crypto** (lines 1–30) — `INVITABLE_PARTNER_TYPES`, `PARTNER_ROLE_LABELS`
  2. **Affiliate registration + links** (lines 30–250)
  3. **Colaborator/coproducer management** (lines 250–400)
  4. **Commission + payout triggers** (lines 400–599)
- **Proposed split**:
  - `partnerships.service.ts` keeps orchestration — ~200 LOC
  - `partnerships.affiliate.helpers.ts` — ~200 LOC
  - `partnerships.commission.helpers.ts` — ~200 LOC
- **Estimated effort**: M — single PR.
- **Risk**: medium (touches wallet/payout DTOs).

### 5. `backend/src/checkout/checkout-payment.service.ts` — 596 LOC

- **Top 5 exports**: `CheckoutPaymentService`, `mapStripePaymentStatus`, `extractPixDisplayData`, `toJsonValue`
- **Natural seams**:
  1. **Types + helpers** (lines 1–60)
  2. **Stripe charge orchestration** (lines 60–300)
  3. **PIX payment handling** (lines 300–450)
  4. **Boleto payment handling** (lines 450–596)
- **Proposed split**:
  - `checkout-payment.service.ts` keeps Stripe — ~240 LOC
  - `checkout-payment.pix.helpers.ts` — ~150 LOC
  - `checkout-payment.boleto.helpers.ts` — ~150 LOC
  - `checkout-payment.types.ts` — ~60 LOC
- **Estimated effort**: M — single PR.
- **Risk**: high (touches DTOs + Stripe + payment state machine).

### 6. `backend/src/kloel/kloel.controller.ts` — 594 LOC

- **Top 5 exports**: `KloelController` (class)
- **Natural seams**:
  1. **DTOs + constants** (lines 1–35)
  2. **Chat endpoints** (lines 35–200) — `/think`, `/chat`, `/onboarding-chat`
  3. **Product/config endpoints** (lines 200–400)
  4. **Upload endpoints** (lines 400–500)
  5. **Approval/agent endpoints** (lines 500–594)
- **Proposed split**:
  - `kloel.controller.ts` keeps chat + upload — ~300 LOC
  - `kloel.controller.product.ts` — ~200 LOC
  - `kloel.controller.approval.ts` — ~100 LOC
- **Estimated effort**: M — single PR.
- **Risk**: medium (touches route registration).

### 7. `backend/src/kloel/guest-chat.service.ts` — 590 LOC

- **Top 5 exports**: `GuestChatService` (class)
- **Natural seams**:
  1. **Types + constants** (lines 1–20)
  2. **Redis conversation CRUD** (lines 20–250)
  3. **Fallback Map storage** (lines 250–400)
  4. **Message processing** (lines 400–590)
- **Proposed split**:
  - `guest-chat.service.ts` keeps orchestration — ~200 LOC
  - `guest-chat.storage.helpers.ts` — ~200 LOC
  - `guest-chat.processing.helpers.ts` — ~190 LOC
- **Estimated effort**: S — single PR.
- **Risk**: low.

### 8. `backend/src/calendar/calendar.service.ts` — 588 LOC

- **Top 5 exports**: `CalendarService`, `CalendarEvent`
- **Natural seams**:
  1. **Types + constants** (lines 1–40)
  2. **Google Calendar integration** (lines 40–350) — OAuth, event CRUD, sync
  3. **Appointment scheduling** (lines 350–500)
  4. **Provider calendar settings** (lines 500–588)
- **Proposed split**:
  - `calendar.service.ts` keeps orchestration — ~200 LOC
  - `calendar.google.helpers.ts` — ~310 LOC
  - `calendar.appointment.helpers.ts` — ~80 LOC
- **Estimated effort**: M — single PR.
- **Risk**: medium (touches OAuth flow).

### 9. `backend/src/meta/meta-whatsapp.service.ts` — 582 LOC

- **Top 5 exports**: `MetaWhatsAppService` (class)
- **Natural seams**:
  1. **Types + normalizers** (lines 1–40)
  2. **Connection state** (lines 40–250)
  3. **OAuth scope negotiation** (lines 250–400)
  4. **Channel provisioning** (lines 400–582)
- **Proposed split**:
  - `meta-whatsapp.service.ts` keeps orchestration — ~200 LOC
  - `meta-whatsapp.connection.helpers.ts` — ~210 LOC
  - `meta-whatsapp.scopes.helpers.ts` — ~170 LOC
- **Estimated effort**: S — single PR.
- **Risk**: medium (touches Meta OAuth).

### 10. `backend/src/kloel/unified-agent.service.ts` — 562 LOC 🔥 Highest churn (96 edits)

- **Top 5 exports**: `UnifiedAgentService` (class), types from `unified-agent.types`
- **Natural seams**:
  1. **Helpers** (lines 1–40) — `isAllowedTool`, `formatPromptValue`
  2. **Prompt/context assembly** (lines 40–200)
  3. **Tool execution + action dispatch** (lines 200–400)
  4. **Response formatting + confidence** (lines 400–562)
- **Proposed split**:
  - `unified-agent.service.ts` keeps orchestration — ~200 LOC
  - `unified-agent.prompt.helpers.ts` — ~160 LOC
  - `unified-agent.dispatch.helpers.ts` — ~200 LOC
- **Estimated effort**: M — likely multi-PR due to churn.
- **Risk**: medium (touches Nest DI + LLM integration).

### 11. `backend/src/kloel/agent-runtime/agent-runtime.skill-registry.ts` — 572 LOC

- **Top 5 exports**: `AgentRuntimeSkillRegistry` (class)
- **Natural seams**:
  1. **Default skills array** (lines 1–150) — `DEFAULT_SKILLS`
  2. **Skill CRUD + validation** (lines 150–350)
  3. **Usage tracking + stats** (lines 350–572)
- **Proposed split**:
  - `agent-runtime.skill-registry.ts` keeps CRUD — ~200 LOC
  - `agent-runtime.skill-registry.defaults.ts` — ~170 LOC
  - `agent-runtime.skill-registry.stats.ts` — ~200 LOC
- **Estimated effort**: S — single PR.
- **Risk**: low.

### 12. `backend/src/crm/crm.service.ts` — 570 LOC

- **Top 5 exports**: `CrmService` (class)
- **Natural seams**: contact CRUD / deal pipeline / lead scoring
- **Proposed split**:
  - `crm.service.ts` keeps orchestration — ~200 LOC
  - `crm.contacts.helpers.ts` — ~200 LOC
  - `crm.deals.helpers.ts` — ~170 LOC
- **Estimated effort**: M — single PR.
- **Risk**: medium (touches CRM event emitter).

### 13. `backend/src/ai-brain/knowledge-base.service.ts` — 568 LOC

- **Top 5 exports**: `KnowledgeBaseService` (class)
- **Natural seams**:
  1. **Text chunking** (lines 1–100) — `splitKnowledgeBaseText` and helpers
  2. **Wallet billing** (lines 100–200) — `chargeUsageIfNeeded`, `refundUsageIfNeeded`
  3. **Source ingestion** (lines 200–400) — URL fetch, HTML→text, PDF
  4. **KB CRUD + search** (lines 400–568)
- **Proposed split**:
  - `knowledge-base.service.ts` keeps orchestration — ~200 LOC
  - `knowledge-base.chunking.helpers.ts` — ~100 LOC
  - `knowledge-base.billing.helpers.ts` — ~100 LOC
  - `knowledge-base.ingestion.helpers.ts` — ~168 LOC
- **Estimated effort**: M — single PR.
- **Risk**: medium (touches wallet billing + URL fetch).

### 14. `backend/src/payments/ledger/ledger.service.ts` — 545 LOC

- **Top 5 exports**: `LedgerService` (class)
- **Natural seams**: credit ops / debit ops / balance reconciliation
- **Proposed split**:
  - `ledger.service.ts` keeps orchestration — ~200 LOC
  - `ledger.credits.helpers.ts` — ~180 LOC
  - `ledger.debits.helpers.ts` — ~165 LOC
- **Estimated effort**: M — single PR.
- **Risk**: high (touches financial DTOs + dual-balance contract).

### 15. `backend/src/checkout/checkout-social-lead.service.ts` — 562 LOC

- **Natural seams**: social identity resolution / lead enrichment / WhatsApp session
- **Estimated effort**: M — single PR.
- **Risk**: medium.---

## Frontend top offenders

_NOTE: No frontend files exceed 800 LOC. Listed for monitoring and proactive decomposition._

### 1. `frontend/src/components/kloel/settings/crm-settings-section.tsx` — 602 LOC

- **Top 5 exports**: `CrmSettingsSection` (component)
- **Already partially decomposed**: has `.parts.tsx`, `.handlers.ts`, `.helpers.ts` files.
- **Natural seams**: contact mgmt UI / segmentation rules / pipeline cards
- **Proposed split**: push remaining inline sections to existing `.parts.tsx`
- **Estimated effort**: S — single PR.
- **Risk**: low (pure UI extraction).

### 2. `frontend/src/hooks/useWhatsAppSession.ts` — 591 LOC

- **Natural seams**: session state machine / QR pairing / diagnostics
- **Proposed split**:
  - `useWhatsAppSession.ts` keeps main hook — ~200 LOC
  - `useWhatsAppSession.qr.ts` — ~200 LOC
  - `useWhatsAppSession.diagnostics.ts` — ~191 LOC
- **Estimated effort**: S — single PR.
- **Risk**: medium (real-time session state).

### 3. `frontend/src/components/kloel/dashboard/KloelDashboard.tsx` — 589 LOC 🔥 High churn (71 edits)

- **Already partially split**: has `KloelChatComposer.tsx`, `KloelDashboard.message.tsx` (550 LOC!), `KloelDashboard.hooks.ts`, etc.
- **Natural seams**: chat composer / message display / approval strip
- **Proposed split**: extract remaining inline sections to existing sub-files
- **Note**: `KloelDashboard.message.tsx` at 550 LOC is itself a decomposition candidate.
- **Estimated effort**: M — single PR.
- **Risk**: medium (core dashboard UX).

### 4. `frontend/src/components/kloel/auth/auth-provider.tsx` — 589 LOC

- **Top 5 exports**: `AuthProvider`, `useAuth`
- **Natural seams**: types / auth state / workspace switching / bootstrap
- **Proposed split**:
  - `auth-provider.tsx` keeps provider + `useAuth` — ~200 LOC
  - `auth-provider.types.ts` — ~50 LOC
  - `auth-provider.workspace.ts` — ~170 LOC
  - `auth-provider.bootstrap.ts` — ~169 LOC
- **Estimated effort**: M — single PR.
- **Risk**: high (auth state machine — every page depends on this).

### 5. `frontend/src/components/kloel/auth/kloel-auth-screen.tsx` — 584 LOC 🔥 High churn (69 edits)

- **Already partially split**: uses `AuthFormFields` from `kloel-auth-screen.form-fields.tsx`
- **Natural seams**: login form / register form / OAuth callback
- **Proposed split**:
  - `kloel-auth-screen.tsx` keeps shell — ~200 LOC
  - `kloel-auth-screen.login.tsx` — ~225 LOC
  - `kloel-auth-screen.register.tsx` — ~159 LOC
- **Estimated effort**: S — single PR.
- **Risk**: medium (auth UI — high-visibility path).

### 6. `frontend/src/components/canvas/EditorTopBar.tsx` — 578 LOC

- **Natural seams**: file actions / canvas tools / layer controls
- **Proposed split**: extract file actions and canvas tools into separate components.
- **Estimated effort**: S — single PR.
- **Risk**: low (pure UI extraction).

### 7. `frontend/src/components/products/ProductPlansTab.tsx` — 574 LOC

- **Natural seams**: plan creation form / plan list / plan detail
- **Estimated effort**: S — single PR.
- **Risk**: low.

### 8. `frontend/src/components/kloel/products/product-nerve-center.shared.tsx` — 574 LOC

- **Natural seams**: shared atoms / shared types / shared validators
- **Proposed split**: `product-nerve-center.shared.atoms.tsx`, `.types.ts`, `.validators.ts`
- **Estimated effort**: S — single PR.
- **Risk**: medium (shared across all product nerve center tabs).

### 9. `frontend/src/lib/api/cia.ts` — 572 LOC

- **Natural seams**: session mgmt / messaging / config API groups
- **Proposed split**: `api/cia.ts` (core), `api/cia.session.ts`, `api/cia.messaging.ts`, `api/cia.config.ts`
- **Estimated effort**: S — single PR.
- **Risk**: low (pure function extraction).

### 10. `frontend/src/app/(checkout)/hooks/useCheckoutExperienceSocial.ts` — 572 LOC

- **Natural seams**: social identity / WhatsApp session / lead enrichment
- **Estimated effort**: M — single PR.
- **Risk**: medium (checkout flow).---

## Recommended decomposition order

Top 10 files ranked by composite score (LOC × edit-frequency). Higher score = more benefit from reducing size.

| Rank | File | LOC | Edits | Score | Status |
|------|------|-----|-------|-------|--------|
| 1 | `backend/…/kloel-chat-tools.service.ts` | 849 | 34 | 28,866 | ⚠️ Over cap |
| 2 | `backend/…/unified-agent.service.ts` | 562 | 96 | 53,952 | 🔥 Hottest |
| 3 | `frontend/…/dashboard/KloelDashboard.tsx` | 589 | 71 | 41,819 | 🔥 High churn |
| 4 | `frontend/…/auth/kloel-auth-screen.tsx` | 584 | 69 | 40,296 | 🔥 High churn |
| 5 | `backend/…/kloel.service.ts` | 545 | 70 | 38,150 | |
| 6 | `frontend/…/checkout/CheckoutBlanc.tsx` | 558 | 57 | 31,806 | |
| 7 | `backend/…/kloel.controller.ts` | 594 | 50 | 29,700 | |
| 8 | `frontend/…/checkout/CheckoutNoir.tsx` | 571 | 52 | 29,692 | |
| 9 | `backend/…/whatsapp-api.provider.ts` | 536 | 51 | 27,336 | |
| 10 | `backend/…/guest-chat.service.ts` | 590 | 41 | 24,190 | |

---

## Risk summary

- **Low risk (13 files)**: Pure mechanical extraction — `guest-chat.action-intent.helpers.ts`, `agent-runtime.skill-registry.ts`, `calendar.service.ts`, `EditorTopBar.tsx`, `ProductPlansTab.tsx`, API client files
- **Medium risk (14 files)**: Touches NestJS DI/OAuth/Meta integration — `kloel-tool-dispatcher.service.ts`, `kloel.controller.ts`, `knowledge-base.service.ts`, `crm.service.ts`, `checkout.controller.ts`, `meta-whatsapp.service.ts`, `partnerships.service.ts`, most frontend hooks/sections
- **High risk (3 files)**: Touches DTOs, payment state machine, or auth state — `checkout-payment.service.ts`, `payments/ledger/ledger.service.ts`, `auth-provider.tsx`

### Skip list (protected / already well-decomposed)
- `backend/src/lib/ai-models.ts`, `openai-models.ts` — AI model definitions
- `backend/src/main.ts` (520 LOC) — NestJS bootstrap; inherently monolithic
- Files already well-decomposed with dedicated helpers: `kloel-chat-tools.service.ts` (6 helpers), `KloelDashboard.tsx` (5 sub-files), `crm-settings-section.tsx` (3 sub-files)

### Recommended first wave (lowest risk, highest impact)
1. **kloel-chat-tools.service.ts** — only cap violator; already patterned; S effort
2. **guest-chat.action-intent.helpers.ts** — pure function extraction; S effort
3. **agent-runtime.skill-registry.ts** — defaults array extraction; S effort
4. **unified-agent.service.ts** — highest churn; extract prompt assembly; M effort (highest ROI)
5. **kloel-auth-screen.tsx + auth-modal.tsx** — high churn auth UI; S–M effort
