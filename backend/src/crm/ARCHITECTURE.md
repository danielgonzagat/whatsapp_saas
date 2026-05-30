# CRM & Dashboard — Contacts, Sales Pipeline, and the Home/Stats overview

One-line purpose: lets a workspace store its **contacts**, move sales **deals** across a **pipeline** (Kanban), score/analyze leads with AI (NeuroCRM), and read a real-data **dashboard** (stats, home snapshot, post-payment effects).

This document covers four backend directories that together form the "crm-dashboard" territory:

- `backend/src/crm/` — contacts, tags, pipelines, deals, support tickets, NeuroCRM (AI).
- `backend/src/pipeline/` — a thinner, second pipeline/deal API used by the sales board.
- `backend/src/dashboard/` — stats, home snapshot, post-payment effects.
- `backend/src/contacts/` — cross-channel contact **identity resolution** (the layer that decides "is this the same person?").

> WAHA is intentionally excluded from scope (deprecated WhatsApp transport; not a gap here).

---

## What the user does

In the product (Terminator UI), the user:

1. Opens **Vendas → Pipeline** (`/vendas/pipeline`) and sees a Kanban board of sales **stages** with **deal** cards. They drag a deal to another stage, create a deal inline, open a deal detail modal, mark it WON/LOST.
2. Manages **contacts** — list/search, view a contact, add/remove **tags**.
3. Uses **NeuroCRM** AI features — analyze a contact (sentiment / buying intent / lead score), get a "next best action", cluster leads, or simulate a sales conversation.
4. Opens the **Dashboard / Home** and sees real aggregated numbers: contacts, campaigns, flows, message delivery/read/error rates, active conversations, flow funnel, revenue chart over a date range, and a post-payment effects panel (payments approved, member access granted, notifications sent, affiliate commissions).

Contacts here are the same people the WhatsApp inbox talks to — the CRM is the structured, sales-oriented view of the contact graph.

---

## End-to-end flow

### Flow A — Move a deal across the pipeline (the core CRM action)

```
UI:    frontend/src/components/kloel/crm/CRMPipelineView.tsx  (drag a card)
         rendered by → vendas/PipelineTab.tsx → VendasView.tsx
         page route   → frontend/src/app/(main)/vendas/pipeline/page.tsx
hook:  frontend/src/hooks/useSalesPipeline.ts   (SWR over /pipeline)
api:   frontend/src/lib/api/pipeline.ts  → pipelineApi.moveDeal/updateStage
   →   apiFetch (frontend/src/lib/api/core.ts)  [no Next proxy — direct to NEXT_PUBLIC_API_URL]
Nest:  PUT /pipeline/deals/:id/stage
         backend/src/pipeline/pipeline.controller.ts : PipelineController.updateStage
svc:   backend/src/pipeline/pipeline.service.ts : PipelineService.updateDealStage
         → validates deal+stage belong to workspaceId (via stage.pipeline.workspaceId)
Prisma: prisma.deal.update / prisma.stage / prisma.pipeline   (models Deal, Stage, Pipeline)
DB:     RAC_Deal, RAC_Stage, RAC_Pipeline
resp:   updated deal → SWR revalidates → board re-renders the moved card
UI states: loading (SWR), optimistic move, error toast, empty (NoPipelinesEmptyState.tsx)
```

There is a **second, parallel** deal API in `crm.controller.ts` (`PUT /crm/deals/:id/move`, `crm.deals.helpers.ts:moveDeal`) consumed by `frontend/src/lib/api/crm.ts:crmApi.moveDeal`. Both write the same `RAC_Deal` table. See "Canonical vocabulary" — this is a known duplication.

### Flow B — List/search contacts

```
UI/hook: frontend/src/hooks/useCRM.ts : useContacts()
api:     frontend/src/lib/api/crm.ts : crmApi.listContacts → GET /crm/contacts?page&limit&search
Nest:    backend/src/crm/crm.controller.ts : CrmController.listContacts (DTO: dto/list-contacts.query.dto.ts)
svc:     backend/src/crm/crm.service.ts : CrmService.listContacts  (workspace-scoped, paginated, OR-search name/phone/email)
Prisma:  prisma.contact.findMany + count, include tags
DB:      RAC_Contact (+ _ContactToTag join, RAC_Tag)
resp:    { data: Contact[], meta: { total, page, limit, pages } }
```

### Flow C — NeuroCRM analyze a contact (AI)

```
api:   frontend/src/lib/api/crm.ts : neuroCrmApi.analyze → POST /crm/neuro/analyze/:contactId
Nest:  backend/src/crm/neuro-crm.controller.ts : NeuroCrmController.analyze
svc:   backend/src/crm/neuro-crm.service.ts : NeuroCrmService.analyzeContact
         → runAiAnalysis() calls OpenAI if OPENAI_API_KEY set; else buildFallbackAnalysis() (honest heuristic, no fake AI)
         → persistAnalysis() writes leadScore/sentiment/purchaseProbability/nextBestAction/aiSummary back onto the Contact
         → createInsightIfSignificant() may write a ContactInsight row
Prisma: prisma.contact.update + prisma.contactInsight.create
DB:     RAC_Contact (neuro columns), RAC_ContactInsight
```

### Flow D — Dashboard home + stats

```
hook:  frontend/src/hooks/useDashboardHome.ts
api:   frontend/src/lib/api/dashboard.ts → GET /dashboard/stats, GET /dashboard/home, GET /dashboard/post-payment
Nest:  backend/src/dashboard/dashboard.controller.ts : DashboardController.{getStats,getHome,getPostPayment}
svc:   backend/src/dashboard/dashboard.service.ts : DashboardService.{getStats,getHomeSnapshot}
         + helpers: dashboard.stats.helpers.ts, home-aggregation.util.ts, dashboard.product-rank.helpers.ts,
                    dashboard.recent-conversations.helpers.ts, dashboard.setup-checklist.helpers.ts
data:  real counts from prisma.{contact,campaign,flow,message,conversation,flowExecution,checkoutPayment,checkoutOrder,...}
         + operational health from Redis list `metrics:<workspaceId>`
DB:    RAC_Contact, RAC_Campaign, RAC_Flow, RAC_Message, RAC_Conversation, RAC_FlowExecution,
       RAC_CheckoutPayment, RAC_CheckoutOrder, RAC_MemberEnrollment, RAC_AuditLog, RAC_CheckoutSocialLead
UI states: loading skeleton, billingSuspended flag, setup checklist (honest "setup-required" when integrations missing)
```

---

## Canonical vocabulary

| Concept | Canonical name | Notes / lingering aliases |
|---|---|---|
| A person in a workspace | **Contact** (`RAC_Contact`) | Lead/customer are lifecycle labels, not separate models. |
| A sales opportunity | **Deal** (`RAC_Deal`) | UI sometimes calls it a "lead/card"; `CrmService.moveLead` is the canonical capability name used by the Kloel resolver and delegates to `moveDeal`. |
| Kanban column | **Stage** (`RAC_Stage`) | |
| Kanban board | **Pipeline** (`RAC_Pipeline`) | Distinct from `PipelineState` (`RAC_PipelineState`), which is a **Mind/cognition** model — NOT this territory. |
| Label on a contact | **Tag** (`RAC_Tag`, join `_ContactToTag`) | |
| AI lead signal row | **ContactInsight** (`RAC_ContactInsight`) | type: SENTIMENT_CHANGE / URGENCY_DETECTED / OBJECTION_RAISED. |
| Support ticket | **Conversation** (`RAC_Conversation`) | `CrmService.openSupportTicket` reuses Conversation as the canonical ticket entity — no separate Ticket model. |

**Two pipeline/deal services exist (DUPLICATION):**
- `PipelineService` (`backend/src/pipeline/`) — `getPipeline`, `updateDealStage`, `createDeal`. Used by the **live sales board** (`useSalesPipeline` → `/pipeline`).
- `CrmService` + `crm.deals.helpers.ts` (`backend/src/crm/`) — fuller deal CRUD (`createDeal/updateDeal/deleteDeal/moveDeal/listDeals`) + WON/LOST event emission. Used by `crmApi` (`/crm/deals`).
Both mutate `RAC_Deal`. The CRM path is the richer/canonical one (it emits CRM events); the Pipeline path is the leaner board read/write. Consolidation is a future canonicalization item, not a correctness bug — both are workspace-isolated.

**Identity resolution** (`backend/src/contacts/`): `ContactIdentityResolverService` (decide same-person across channels), `ContactIdentityMergeService` (merge two Contacts), `ChannelIdentifierService` (manage `RAC_ChannelIdentifier` rows). This is the canonical answer to "which Contact does this WhatsApp/IG/email sender map to?".

---

## Key services & single responsibility

| Service | File | Owns (one line) |
|---|---|---|
| `CrmService` | `crm/crm.service.ts` | Contacts CRUD, tags, pipelines/deals (delegates to helpers), `getPipeline`, `moveLead`, support tickets. |
| `crm.deals.helpers.ts` | `crm/crm.deals.helpers.ts` | Pure deal/pipeline functions (createDeal/updateDeal/moveDeal/listDeals) + WON revenue webhook + autopilot event. |
| `NeuroCrmService` | `crm/neuro-crm.service.ts` | AI contact analysis, next-best-action, lead clustering (k-means), conversation simulation; OpenAI-or-honest-fallback. |
| `PipelineService` | `pipeline/pipeline.service.ts` | Sales-board pipeline read + deal create + stage move (leaner duplicate of CRM deal path). |
| `DashboardService` | `dashboard/dashboard.service.ts` | Real aggregated stats + home snapshot (revenue/messages over date range) from Prisma + Redis. |
| `ContactIdentityResolverService` | `contacts/contact-identity-resolver.service.ts` | Resolve an inbound channel identity → existing or new Contact. |
| `ContactIdentityMergeService` | `contacts/contact-identity-merge.service.ts` | Merge duplicate Contacts (move deals/messages/identifiers). |
| `ChannelIdentifierService` | `contacts/channel-identifier.service.ts` | CRUD/verify per-channel identifiers (`RAC_ChannelIdentifier`). |
| `CrmEventEmitterService` | `kloel/crm-emitter/crm-event-emitter.service.ts` | Emit `commerce.crm.*` events onto the spine (best-effort). |

---

## Data & events

**Prisma models owned by this territory** (all `@@map("RAC_*")`):
`Contact` (incl. neuro columns leadScore/sentiment/purchaseProbability/nextBestAction/aiSummary), `ContactInsight`, `Tag` (+ `_ContactToTag`), `Pipeline`, `Stage`, `Deal`, `ChannelIdentifier`, `ContactIdentityLink`. The dashboard **reads** many models it does not own (Campaign, Flow, Message, Conversation, CheckoutPayment/Order, MemberEnrollment, AuditLog).

> Money note: `Deal.value` is a Prisma `Float` (reais), and `CrmService.getPipeline` converts to cents via `BigInt(Math.round(value*100))` only for the returned `totalValue`. Deals are not the financial ledger — actual money lives in checkout/wallet/ledger tables. Keep Deal.value display-only.

**Events emitted** (`commerce.crm.*`, via `CrmEventEmitterService` → spine; confirmed in asyncapi index):
`commerce.crm.deal_won`, `commerce.crm.deal_lost` (emitted from `updateDeal` when status WON/LOST), `commerce.crm.stage_changed`, `commerce.crm.owner_assigned`, `commerce.crm.next_step_defined`.
Related lead-lifecycle events (`commerce.lead.*`) are emitted by other territories, not here.
WON deals also create a `RAC_AutopilotEvent` (action `DEAL_WON`) when the contact carries a `lastCampaignId`, and best-effort POST a revenue webhook (`AUTOPILOT_ALERT_WEBHOOK`/`OPS_WEBHOOK_URL`) with SSRF guard.

---

## Workspace isolation

Multi-tenant scoping is enforced consistently:

- Every controller uses `@UseGuards(JwtAuthGuard, WorkspaceGuard)` and resolves the tenant via `resolveWorkspaceId(req, bodyWorkspaceId)` (`backend/src/auth/workspace-access.ts`) — the body/query `workspaceId` cannot override the authenticated workspace.
- Every Prisma query filters by `workspaceId` directly, or by traversing the relation for indirect entities: deals are checked through `stage.pipeline.workspaceId` and `contact.workspaceId` before any mutation (see `crm.deals.helpers.ts:createDeal/updateDeal/moveDeal`, which throw `ForbiddenException` on cross-workspace access).
- `Contact` has `@@unique([workspaceId, phone])` and `@@unique([id, workspaceId])`; `Tag` has `@@unique([workspaceId, name])` — upserts use these compound keys so tenants never collide.

---

## Honest status

Brutally honest, evidence-based:

- **Works in production (real data, real persistence, workspace-isolated, tested):**
  - Contacts CRUD + tags + paginated search — `crm.service.spec.ts` covers it; real Prisma writes to `RAC_Contact`/`RAC_Tag`.
  - Pipeline board: `getPipeline`, `createDeal`, `moveDeal`/`updateDealStage`, WON/LOST with event emission + autopilot event — covered by `pipeline.service.spec.ts`, `crm.service.spec.ts`, and `neuro-crm.*.spec.ts`. Cross-workspace access is explicitly rejected (Forbidden) — proven by the guard checks in `crm.deals.helpers.ts`.
  - Dashboard `getStats`/`getHome`/`post-payment` return **real counts** from Prisma + Redis ops metrics; no `Math.random`, honest `setup-required`/`billingSuspended` states. Covered by `dashboard.service.spec.ts` + helper specs.
  - NeuroCRM: when `OPENAI_API_KEY` is absent it uses `buildFallbackAnalysis` (a deterministic heuristic), and the result is clearly heuristic, not faked AI — this is an honest-degraded state, not a facade.

- **Facade / orphan / unproven:**
  - **CRM contact-drawer is DEAD CODE (orphan).** `frontend/src/components/kloel/crm/ContactDetailLoadingBody.tsx` is the only importer of `crm-drawer-parts.tsx`, and `ContactDetailLoadingBody` itself has **zero importers** anywhere under `frontend/src/app` or `frontend/src/components`. The live board (`CRMPipelineView`) opens `DealDetailModal`, not a contact drawer. So the contact-detail drawer is unreachable UI.
  - **Standalone `/crm` route does not exist** — the CRM board is reached only via `/vendas/pipeline` (`VendasView`). The `crmApi` deal endpoints (`/crm/deals`) overlap with `/pipeline` (the board actually uses `/pipeline`), so part of `crmApi` deal surface is lightly exercised by the live UI.
  - NeuroCRM `simulateConversation` and `clusterLeads` are real algorithms but lightly wired into the UI; verify a UI consumer before claiming end-to-end.
  - PULSE per-module health was not retrievable in this pass (`pulse_health_by_module` returned no matching artifact; run `pulse_scan` first). Status above is from code + specs, not a fresh PULSE run.

---

## Start here

For a newcomer, read these 3 files first:

1. `backend/src/crm/crm.service.ts` — the heart of the territory: contacts, tags, pipeline read, the `moveLead`/`openSupportTicket` canonical methods.
2. `backend/src/crm/crm.deals.helpers.ts` — where deal mutations + workspace-isolation guards + WON/LOST events actually happen.
3. `backend/src/dashboard/dashboard.service.ts` (`getStats` + `getHomeSnapshot`) — how the dashboard turns raw Prisma/Redis data into the home overview.

Then glance at `frontend/src/components/kloel/crm/CRMPipelineView.tsx` (the live board) and `frontend/src/lib/api/crm.ts` + `frontend/src/lib/api/pipeline.ts` to see the two deal API paths.
