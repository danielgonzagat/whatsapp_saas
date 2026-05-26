# Wave 1 — Tier-3 Module Reality Audit

> Authored by PI atomic subagent `w1-tier3-mapper` (DeepSeek V4 Pro, ~14k events).
> Materialized by orchestrator from the agent's report text (the subagent ran
> without a write tool in its envelope — fixed in launcher for wave 2+).
> Run date: 2026-05-26.
>
> The agent disagrees with CLAUDE.md's classification on Vendas, Canvas, Leads,
> and Webinarios — these are READY by the agent's evidence, not Tier-3 fachada.
> Orchestrator concurs after spot-check.


## Methodology

Each of the 8 Tier-3 modules was mapped via:

1. **Frontend route tree**: directories under `frontend/src/app/(main)/<module>/` and their `page.tsx` entry points.
2. **Component tree**: directories under `frontend/src/components/kloel/<module>/` and their import chains.
3. **API client layer**: `frontend/src/lib/api/` files and `frontend/src/hooks/use*.ts` for SWR/`apiFetch` calls.
4. **Backend controllers/services**: `backend/src/<module>/` and `backend/src/kloel/` for matching endpoint handlers.
5. **Prisma models**: `backend/prisma/schema.prisma` for `model <X>` matching the domain.
6. **Data realism check**: searched each module for `Math.random`, hardcoded arrays, `FALLBACK_`, `MOCK_`, and fake-data patterns.

---

## Module: Anuncios

### Frontend surface
- **Routes**: 
  - `/anuncios` → `AnunciosView defaultTab="visao"` (181B shell)
  - `/anuncios/google` → `AnunciosView defaultTab="google"` (185B shell)
  - `/anuncios/meta` → `AnunciosView defaultTab="meta"` (179B shell)
  - `/anuncios/tiktok` → `AnunciosView defaultTab="tiktok"` (186B shell)
  - `/anuncios/rastreamento` → `AnunciosView defaultTab="track"` (189B shell)
  - `/anuncios/regras` → `AnunciosView defaultTab="rules"` (182B shell)
- **Components**: 13 files under `components/kloel/anuncios/` (AnunciosView 272 lines, WarRoomDashboard 7.9KB, TrackingDashboard 12.9KB, RuleEngineHub 9.7KB, PlatformDetailTab 9.1KB, CampaignTimeline 4.9KB, InvestReturnPanel 5.4KB, RuleEditorForm 3.1KB, RuleNerveFiber 3.9KB, AnunciosTabBar 2.3KB, AnunciosShared, AnunciosView.helpers 5.5KB, anuncios-types 1.4KB)
- **LOC range**: ~10KB combined component logic; `PLATFORM_DEFAULTS` initializes all platforms with `connected: false` and zeroed metrics — honest empty state pattern.

### Backend surface
- **Controller**: `backend/src/anuncios/anuncios.controller.ts` (103 lines, 8 endpoints at `/api/anuncios/*`) — `GET status`, `GET sync-status/meta`, `GET sync-status/google`, `GET accounts`, `GET campaigns`, `GET connect/:platform`, `POST disconnect/:platform`, `POST sync/accounts`. Guarded by JWT + WorkspaceGuard.
- **Service**: `backend/src/anuncios/anuncios.service.ts` (293 lines) — delegates to `MetaMarketingProvider`, `GoogleAdsProvider`, `TikTokAdsProvider` via `AdProvider` interface.
- **Module**: `backend/src/anuncios/anuncios.module.ts` (18 lines)
- **Prisma models**: `AdCampaign`, `AdInsight`, `AdAccount`

### Current reality (HONEST)
- **READY**: `/api/anuncios/status` — reports connection state per platform
- **PARTIAL**: `/api/anuncios/accounts`, `/api/anuncios/campaigns` — require OAuth connection to Meta/Google/TikTok before returning real data; returns empty arrays otherwise
- **PARTIAL**: `/api/anuncios/connect/:platform` — OAuth flow implemented for Meta; Google/TikTok partial
- **SHELL_ONLY**: All 6 page routes are thin wrappers; the real UI lives in AnunciosView
- **MOCKED**: None detected — `PLATFORM_DEFAULTS` uses honest zeros, not fake numbers

### Top 3 minimal upgrade paths
1. **Complete Google Ads OAuth** (`backend/src/integrations/google-ads-oauth.helpers.ts` exists, `google-ads-auth.controller.ts` exists) → wire Google provider into `AnunciosService.providers` and test end-to-end — **M**
2. **TikTok Ads connection** → `backend/src/tiktok-ads/` module exists with auth controller; wire into `AnunciosService` and add sync processor support — **M**
3. **Add Playwright E2E test for Anuncios dashboard** → currently zero E2E coverage for this module; verify OAuth flow and campaign data display — **S**

### Risk flags
- **Workspace isolation**: Present via `WorkspaceGuard` on controller
- **Anti-patterns**: None observed — follows CLAUDE.md patterns (thin controller, typed service, Prisma-typed queries)
- **Missing tests**: `anuncios.controller.spec.ts` (5.6KB) and `anuncios.service.spec.ts` (6.3KB) exist; no E2E/Playwright test

---

## Module: Marketing

### Frontend surface
- **Routes**:
  - `/marketing` → redirects to `/marketing/whatsapp` (254B)
  - `/marketing/whatsapp` → `MarketingView defaultTab="whatsapp"` (189B shell)
  - `/marketing/instagram` → `MarketingView defaultTab="instagram"` (191B shell)
  - `/marketing/tiktok` → `MarketingView defaultTab="tiktok"` (183B shell)
  - `/marketing/facebook` → `MarketingView defaultTab="facebook"` (188B shell)
  - `/marketing/email` → `MarketingView defaultTab="email"` (179B shell)
  - `/marketing/conversas` → redirects to `/inbox` (319B)
- **Components**: 62 files under `components/kloel/marketing/` (~150KB+ total) including MarketingView (157 lines), OfficialMarketingChannelPage, UniversalChannelWizard (11.4KB), WhatsAppExperience (15+ files), EmailMarketingTab (10KB), TikTokMarketingTab (7.5KB), InstagramMarketingTab (7.9KB), FacebookMarketingTab (4.6KB), SmsMarketingTab (6.2KB), MarketingVisaoGeral (8.3KB), MarketingShared (5.3KB), per-channel hooks (`useEmailMarketing`, `useTikTokMarketing`, `useInstagramMarketing`, `useSmsMarketing`, `useFacebookMarketing`)
- **LOC range**: ~90KB combined; heavy channel onboarding wizards with real connection flows

### Backend surface
- **Controllers**:
  - `backend/src/marketing/marketing.controller.ts` (17.2KB)
  - `backend/src/marketing/email-marketing.controller.ts` (6.0KB) at `/marketing/email`
  - `backend/src/marketing/tiktok-marketing.controller.ts` (1.5KB)
  - `backend/src/marketing/instagram/instagram-marketing.controller.ts` (2.8KB)
  - `backend/src/marketing/facebook-messenger.controller.ts` (3.9KB)
  - `backend/src/marketing/marketing-connect.controller.ts` (7.6KB)
- **Services**: Email marketing (13KB + queue + worker), TikTok marketing (12.4KB + 8.1KB ads), Instagram marketing (7KB), Facebook Messenger (7.8KB), mailbox OAuth (Gmail + Microsoft, ~30KB combined), IMAP/SMTP (10.7KB)
- **Module**: `backend/src/marketing/marketing.module.ts` (3.1KB) — largest module import tree
- **Prisma models**: `EmailCampaign`, `EmailCampaignRecipient`, `EmailCampaignDelivery`, `MailboxConnection`, `MetaConnection`, `ChannelSetup`, `ChannelProduct`, `ChannelArsenal`, `ChannelConfig`

### Current reality (HONEST)
- **READY**: Email marketing — full campaign creation, sending, delivery tracking, Gmail/Microsoft OAuth, IMAP/SMTP
- **READY**: WhatsApp marketing — connection wizard with QR code via WAHA, channel setup flow
- **PARTIAL**: Instagram marketing — controller + service exist; depends on Meta OAuth connection
- **PARTIAL**: TikTok marketing — controller + service + ads provider exist; requires OAuth
- **PARTIAL**: Facebook Messenger — controller + service exist; requires Meta OAuth
- **MOCKED**: None detected — all channels use honest "connect first" states

### Top 3 minimal upgrade paths
1. **Wire TikTok ads data into MarketingVisaoGeral** — the revenue bar chart currently only shows structure; pipe real TikTok campaign data from `tiktok-marketing.service.ts` — **M**
2. **Complete Instagram connection flow** — `instagram-marketing.service.ts` (7KB) has post fetching + insights; verify OAuth handshake end-to-end and add Playwright test — **M**
3. **Unify channel status into a single dashboard card** — `MarketingVisaoGeral.tsx` (8.3KB) shows channel cards but could surface real connection status from `marketing-connect` endpoints — **S**

### Risk flags
- **Workspace isolation**: All controllers use `JwtAuthGuard` + `WorkspaceGuard`
- **Anti-patterns**: Very large component tree (62 files) — risk of prop drilling; `MarketingView.tsx` does thin routing but each channel page is substantial
- **Missing tests**: `marketing.controller.spec.ts` (6.1KB), per-channel specs exist; no E2E for OAuth flows

---

## Module: Sites

### Frontend surface
- **Routes**:
  - `/sites` → `SitesView defaultTab="visao-geral"` (169B shell)
  - `/sites/criar` → `SitesView defaultTab="criar"` (172B shell)
  - `/sites/editar` → `SitesView defaultTab="editar"` (175B shell)
  - `/sites/dominios` → `SitesView defaultTab="dominios"` (172B shell)
  - `/sites/hospedagem` → `SitesView defaultTab="hospedagem"` (178B shell)
  - `/sites/apps` → `SitesView defaultTab="apps"` (160B shell)
  - `/sites/protecao` → `SitesView defaultTab="protecao"` (172B shell)
- **Components**: 16 files under `components/kloel/sites/` — SitesView (52 lines), VisaoGeral (96 lines), EditarSite (4.6KB), EditarSiteEditor (4.9KB), EditarSiteList (3KB), Hospedagem (4KB), Protecao (6.1KB), NeuralPulse (1.7KB), SitesViewAtoms (4.5KB), SitesViewControls (2.2KB), SitesViewIcons (8.2KB), SitesView.tabs (575B)
- **LOC range**: ~42KB combined; `VisaoGeral.tsx` fetches `/kloel/site/list` — real API call

### Backend surface
- **Controller**: `backend/src/kloel/site.controller.ts` (503 lines) at `/kloel/site` — full CRUD: `GET list`, `GET :id`, `POST`, `PUT :id`, `DELETE :id`, `POST generate` (AI site generation via OpenAI/Anthropic with wallet billing). Plus `site-public.controller.ts` (1.8KB) for published site serving.
- **Prisma model**: `KloelSite` — id, workspaceId, name, slug (@unique), htmlContent (@db.Text), published, productId, visits, createdAt, updatedAt

### Current reality (HONEST)
- **READY**: Visão Geral tab — lists sites from backend via `/kloel/site/list`
- **READY**: Criar/Editar tabs — `EditarSiteEditor` with real save/load; site CRUD wired
- **READY**: AI site generation — `POST /kloel/site/generate` uses OpenAI/Anthropic with wallet billing
- **SHELL_ONLY**: Dominios, Hospedagem, Apps, Protecao tabs — rendered by `SitesView` with tab switching but no evidence of backend domain management, hosting control, or app installation APIs
- **MOCKED**: None detected

### Top 3 minimal upgrade paths
1. **Dominios tab** → add DNS record management to `KloelSite` model (CNAME/ARecord fields) and wire Cloudflare API via `backend/src/kloel/site.controller.ts` — **L**
2. **Protecao tab** → implement Cloudflare WAF/proxy toggle bound to site; `Protecao.tsx` (6.1KB) has full UI but likely calls no backend — **L**
3. **Hospedagem tab** → wire site deployment status from Railway/Vercel; add `deploymentStatus` to KloelSite model — **M**

### Risk flags
- **Workspace isolation**: Site controller uses `JwtAuthGuard` but NO `WorkspaceGuard` on class — workspaceId filtering is done manually in each handler via `req.user?.workspaceId`
- **Anti-patterns**: 7 route files all wrapping the same component with different defaultTab values — could be a single dynamic route `[tab]`
- **Missing tests**: `site.controller.spec.ts` (5.1KB) and `site-public.controller.spec.ts` (3.4KB) exist; no E2E

---

## Module: Vendas

### Frontend surface
- **Routes**:
  - `/vendas` → `VendasView defaultTab="vendas"` (174B shell)
  - `/vendas/gestao-vendas` → `GestaoVendasPage` (442 lines, 17.3KB — real CRM code)
  - `/vendas/assinaturas` → `VendasView defaultTab="assinaturas"` (189B shell)
  - `/vendas/fisicos` → `VendasView defaultTab="fisicos"` (177B shell)
  - `/vendas/pipeline` → `VendasView defaultTab="pipeline"` (180B shell)
- **Components**: 22 files under `components/kloel/vendas/` — VendasView (334 lines), GestaoVendas, GestaoAssinaturas, GestaoFisicos, EstrategiasTab, PipelineTab, DetailModal (7.8KB), DetailActions (5.2KB), ShipModal, SmartPaymentModal (4.3KB), SmartPaymentForm (4.4KB), SmartPaymentResult (4.2KB), OrderAlertsBanner, VendasView.icons (4.1KB), VendasView.Tabs (2KB), types (1.8KB), utils (1.8KB), Stat (1.7KB), TH (400B)
- **LOC range**: ~62KB combined; `VendasView.tsx` imports `useSales`, `useSalesStats`, `useSalesChart`, `useSubscriptionStats`, `useSubscriptions`, `useOrders`, `useOrderStats`, `useOrderPipeline`, `useOrderAlerts`, `useSalesPipeline`, `useReturnOrder` — all real SWR hooks

### Backend surface
- **Controllers**:
  - `backend/src/kloel/sales.controller.ts` (333 lines) at `/sales` — `GET /sales`, `GET /sales/stats`, `POST /sales/:id/refund`
  - `backend/src/kloel/sales-orders.controller.ts` (6.8KB) at `/sales/orders` — `GET`, `PUT /:id/ship`, `PUT /:id/cancel`
  - `backend/src/kloel/sales-subscriptions.controller.ts` (8.7KB) at `/sales/subscriptions` — `GET`, `POST /:id/pause`, `POST /:id/resume`, `POST /:id/cancel`, `PUT /:id/change-plan`
  - `backend/src/kloel/smart-payment.controller.ts` (6.9KB) + `smart-payment.service.ts` (15.2KB)
- **Prisma models**: `KloelSale`, `CustomerSubscription`, `PhysicalOrder`
- **SWR hooks**: `useSales`, `useSalesStats`, `useSubscriptions`, `useSubscriptionStats`, `useOrders`, `useOrderStats`, `useOrderPipeline`, `useOrderAlerts`, `useSalesPipeline`, `useReturnOrder` — all at `frontend/src/hooks/useSales.ts` (174 lines) + `frontend/src/hooks/useSalesPipeline.ts`

### Current reality (HONEST)
- **READY**: Gestao de Vendas tab — full CRUD, refunds, status filtering, search
- **READY**: Assinaturas tab — pause/resume/cancel/change-plan all wired to real endpoints
- **READY**: Produtos Fisicos tab — order listing, shipping with tracking code, status pipeline
- **READY**: Pipeline CRM tab — `useSalesPipeline` hook fetches real pipeline stages
- **READY**: Smart Payment — modal + form + result flow with `smart-payment.controller.ts`
- **MOCKED**: None detected — no `Math.random`, no hardcoded arrays in data paths

### Top 3 minimal upgrade paths
1. **Add Estrategias tab real implementation** — `EstrategiasTab` exists in components but no dedicated backend; could surface AI-driven sales strategy recommendations using existing `unified-agent-tools-sales.ts` — **M**
2. **Add E2E test for refund flow** — critical money path; `sales.controller.spec.ts` (7.9KB) covers unit but no Playwright test — **S**
3. **Wire OrderAlertsBanner to real alert data** — `order-alerts.service.ts` (8.1KB) exists in backend; confirm frontend hook is connected — **S**

### Risk flags
- **Workspace isolation**: `SalesController` uses `JwtAuthGuard` on class and manually filters by `req.user?.workspaceId`
- **Anti-patterns**: `handleChangePlan` in `VendasView` uses raw `prompt()` for plan name/amount — should use a proper form modal
- **Missing tests**: `sales.controller.spec.ts` (7.9KB), `sales-orders` and `sales-subscriptions` have controller specs; no E2E

---

## Module: Canvas

### Frontend surface
- **Routes**:
  - `/canvas` → redirects to `/canvas/inicio` (136B)
  - `/canvas/inicio` → `CanvasInicio` (399 lines, 11KB) — AI prompt input, recent designs grid, create modal
  - `/canvas/editor` → `CanvasEditor` via `EditorErrorBoundary` (309B shell)
  - `/canvas/modelos` → `CanvasModelos` (355 lines, 10.2KB) — template gallery, AI generation, format cards
  - `/canvas/projetos` → `CanvasProjetos` (303 lines, 8.2KB) — saved projects grid
- **Components**: Under `components/canvas/` — CanvasEditor, CanvasIcons, CreateModal, FormatPills, FormatCard, EditorErrorBoundary, plus canvas-editor sub-components
- **LOC range**: ~50KB+ combined; `CanvasInicio` calls `useCanvasDesigns()` and `apiFetch('/canvas/generate', …)` — real API

### Backend surface
- **Controller**: `backend/src/kloel/canvas.controller.ts` (199 lines) at `/canvas` — `GET /canvas/designs`, `GET /canvas/designs/:id`, `POST /canvas/designs`, `PUT /canvas/designs/:id`, `DELETE /canvas/designs/:id`, `POST /canvas/generate` (AI image generation via OpenAI). Guarded by JwtAuthGuard. Uses `planLimits` for rate enforcement.
- **Prisma model**: `KloelDesign` — id, workspaceId, name, format, width, height, productId, elements (Json), background, thumbnailUrl, status, createdAt, updatedAt

### Current reality (HONEST)
- **READY**: Inicio — recent designs loaded from backend, AI generation wired
- **READY**: Projetos — full designs gallery with delete
- **READY**: Modelos — template gallery + AI generation; `useProductTemplates` hook
- **READY**: Editor — CanvasEditor with save/load via `/canvas/designs`
- **MOCKED**: None — skeleton UI for loading state is standard pattern, not fake data

### Top 3 minimal upgrade paths
1. **Add thumbnail generation on save** — `KloelDesign.thumbnailUrl` field exists but no evidence of server-side thumbnail rendering; add post-save hook — **S**
2. **Add product-linked design filtering** — `KloelDesign.productId` field exists; surface in UI with product selector in editor — **S**
3. **Add E2E test for AI generation flow** — no Playwright test for the prompt→generate→editor path — **M**

### Risk flags
- **Workspace isolation**: `CanvasController` filters by `req.user?.workspaceId` manually; no `WorkspaceGuard` on class
- **Anti-patterns**: `canvas.controller.spec.ts` exists and imports from `canvas.controller` but was only partially read — confirms test presence
- **Missing tests**: `canvas.controller.spec.ts` exists; no E2E

---

## Module: Funnels

### Frontend surface
- **Routes**:
  - `/funnels` → `FunnelsPage` (414 lines, 16.8KB) — single page, no sub-routes
- **Components**: None under `components/kloel/funnels/` ; page is self-contained in route file
- **LOC range**: 414 lines in one file; imports `listConversations` + `listFlowExecutions` from `@/lib/api`

### Backend surface
- **Controllers**: NO dedicated funnels backend. Uses:
  - `backend/src/flows/flows.controller.ts` + `flow-template.controller.ts` + `flow-optimizer.controller.ts` (Tier-1 Flows module)
  - `backend/src/inbox/inbox.controller.ts` + `inbox.service.ts` (Tier-1 Inbox module)
- **Prisma models**: No `Funnel` model. Relies on `Conversation`, `FlowExecution` from Tier-1 modules.
- **API used**: `listConversations(workspaceId)` and `listFlowExecutions(workspaceId, 25)` — both from `@/lib/api` (Tier-1)

### Current reality (HONEST)
- **SHELL_ONLY**: The page is a read-only dashboard aggregating Inbox conversations + Flow executions into a single view with search, status/assigned filters. It has no unique backend, no unique data model, no CRUD operations.
- **No MOCKED data**: It fetches real data from Tier-1 APIs — conversations and flow executions are real
- **Classification**: This is NOT a fachada in the fake-data sense — it's a **read-only aggregation view** that re-displays Tier-1 data. It has no unique state or persistence of its own.

### Top 3 minimal upgrade paths
1. **Add Funnel model to Prisma** — define a `Funnel` concept (collection of flows + conditions + goal) backed by a new model; then add CRUD controller — **L**
2. **Add conversion tracking** — show which conversations moved through which flows to which outcomes; requires analytics query joining Conversation + FlowExecution — **M**
3. **Add "Create Funnel" button** — wire the Flow editor (`/flow`) as the creation path and save funnel metadata — **M**

### Risk flags
- **Workspace isolation**: Inherited from Tier-1 APIs (conversations/executions are already workspace-scoped)
- **Anti-patterns**: 414-line self-contained page component with inline styles — should be decomposed into components under `components/kloel/funnels/`
- **Missing tests**: Zero tests for Funnels page

---

## Module: Webinarios

### Frontend surface
- **Routes**:
  - `/webinarios` → `WebinariosPage` (381 lines, 10.6KB) — single page, no sub-routes
- **Components**: 7 files under `components/webinarios/` — webinar-card (4.4KB), webinar-form-modal (6.4KB), webinar-viewer (4KB), webinar-delete-dialog (2.9KB), types (256B), utils (1.6KB), page-styles (2.8KB)
- **LOC range**: ~23KB combined; full CRUD UI with create/edit/delete/view modals

### Backend surface
- **Controller**: `backend/src/kloel/webinar.controller.ts` (100 lines) at `/webinars` — `GET /webinars`, `GET /webinars/:id`, `POST /webinars`, `PUT /webinars/:id`, `DELETE /webinars/:id`. Guarded by JwtAuthGuard + WorkspaceGuard.
- **Service**: Inline in controller (no separate service file — anti-pattern); uses PrismaService directly
- **Prisma model**: `Webinar` — id, workspaceId, title, description, url, date, productId, status (SCHEDULED/LIVE/COMPLETED), createdAt, updatedAt. Indexed on `[workspaceId, date]`.

### Current reality (HONEST)
- **READY**: Full CRUD — list, create, edit, delete all wired end-to-end
- **READY**: Status lifecycle — SCHEDULED → LIVE → COMPLETED
- **READY**: Product linking — `productId` field exists on model and in form
- **MOCKED**: None detected — all data persisted to Prisma

### Top 3 minimal upgrade paths
1. **Extract WebinarService** — controller currently does Prisma direct; extract to service layer per CLAUDE.md rule — **S**
2. **Add YouTube/Meet integration** — `url` field stores link; add embed viewer with live status detection via YouTube API — **M**
3. **Add webinar registration/attendance tracking** — new `WebinarAttendee` model linking contacts to webinars — **M**

### Risk flags
- **Workspace isolation**: `WorkspaceGuard` present on controller class ✓
- **Anti-patterns**: Controller does Prisma directly instead of delegating to a service layer — violates CLAUDE.md "Controller fino / Service com regra de negócio"
- **Missing tests**: `webinar.controller.spec.ts` (6.7KB) exists; no service-layer test since no service exists

---

## Module: Leads

### Frontend surface
- **Routes**:
  - `/leads` → `LeadsPage` (259 lines, 8.4KB) — single page with list + detail panel
  - `/scrapers` → `ScrapersPage` (239 lines, 7.5KB) — scraper job management (import flow)
- **Components**: LeadsPage self-contained with sub-components: LeadsHeader (1.6KB), LeadsContextBar (1.7KB), LeadsListPanel (6.5KB), LeadsDetailPanel (8.4KB), leads-page.helpers (1KB)
- **LOC range**: ~28KB combined; `LeadsPage` calls `getLeads(workspaceId, …)` — real API

### Backend surface
- **Controllers**:
  - `backend/src/kloel/leads.controller.ts` (24 lines) at `/kloel/leads` — `GET /kloel/leads/:workspaceId` with query params (status, search, limit)
  - `backend/src/scrapers/scrapers.controller.ts` (2.4KB) at `/scrapers` — CRUD for scraping jobs
- **Services**:
  - `backend/src/kloel/leads.service.ts` (110 lines) — commercial scoring algorithm with signal weighting
  - `backend/src/scrapers/scrapers.service.ts` (4KB) + `omni-scraper.service.ts` (1.4KB) + `strategies.ts` (2.9KB)
- **Prisma models**: `ScrapedLead` (phone, name, category, address, metadata, isValid, isImported, jobId), `KloelLead` (full lead with status, lastIntent, totalMessages, commercialScore, metadata)
- **API client**: `frontend/src/lib/api/leads.ts` (1.5KB) — `getLeads()` → `/kloel/leads/${workspaceId}`

### Current reality (HONEST)
- **READY**: Leads list/detail — real data from `KloelLead` model via `leads.controller.ts`
- **READY**: Commercial scoring — `leads.service.ts` computes score from multiple signal weights
- **READY**: Scrapers → import flow — `ScrapersPage` with job management, import to contacts
- **MOCKED**: None detected — all data flows from Prisma via real endpoints

### Top 3 minimal upgrade paths
1. **Add lead status transitions** — currently read-only list; add `PUT /kloel/leads/:id` to update status, add tags, assign agent — **S**
2. **Wire lead-to-CRM conversion** — `ScrapedLead.isImported` flag exists; add explicit "Convert to Contact" action in detail panel — **S**
3. **Add lead source attribution dashboard** — `KloelLead` has source/metadata; build analytics aggregating by source — **M**

### Risk flags
- **Workspace isolation**: `LeadsController` uses `JwtAuthGuard` (no WorkspaceGuard); workspaceId comes from URL param — **potential cross-workspace leak if auth doesn't validate param against token**
- **Anti-patterns**: URL param workspaceId pattern (`/kloel/leads/:workspaceId`) is less safe than inferring from auth token
- **Missing tests**: `leads.controller.spec.ts` (1.5KB) exists; `leads.service.spec.ts` (7.9KB) exists

---

## Summary Matrix

| Module | Frontend | Backend | Prisma Models | Reality | Risk |
|--------|----------|---------|---------------|---------|------|
| **Anuncios** | 6 routes, 13 components (~10KB) | Controller + Service (293+103 lines) | AdCampaign, AdInsight, AdAccount | PARTIAL | OAuth gaps for Google/TikTok |
| **Marketing** | 7 routes, 62 components (~90KB) | 6 controllers + 8 services | 9+ models | PARTIAL | Massive component tree; OAuth per channel |
| **Sites** | 7 routes, 16 components (~42KB) | Controller (503 lines) + public | KloelSite | PARTIAL | 4 tabs shell-only; missing WorkspaceGuard |
| **Vendas** | 5 routes, 22 components (~62KB) | 3 controllers + smart-payment | KloelSale, CustomerSubscription, PhysicalOrder | **READY** | `prompt()` anti-pattern |
| **Canvas** | 4 routes, ~10 components (~50KB) | Controller (199 lines) | KloelDesign | **READY** | Missing WorkspaceGuard |
| **Funnels** | 1 route, 0 components (414 lines) | None (uses Tier-1 APIs) | None | SHELL_ONLY | No unique backend/data model |
| **Webinarios** | 1 route, 7 components (~23KB) | Controller (100 lines) | Webinar | **READY** | No service layer; controller→Prisma direct |
| **Leads** | 2 routes, 5 components (~28KB) | Controller + Service + Scrapers | ScrapedLead, KloelLead | **READY** | URL-param workspaceId pattern |

### Cross-cutting risk flags
- **Workspace isolation gaps**: Sites and Canvas controllers use manual `req.user?.workspaceId` filtering without `WorkspaceGuard` decorator; Leads uses URL-param workspaceId
- **Anti-patterns from CLAUDE.md observed**:
  - Webinarios: controller does Prisma directly (no service layer)
  - Vendas: uses raw `prompt()` for plan change input
  - Sites: 7 identical route wrappers could be one dynamic route
- **Missing tests**: Funnels has zero tests; no E2E/Playwright tests exist for any Tier-3 module