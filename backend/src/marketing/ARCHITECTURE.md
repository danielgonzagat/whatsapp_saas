# Advanced Marketing, Ads & Sites — paid-acquisition, multi-channel marketing, lead scraping, and the site/launch growth surface

> One-line purpose: this territory lets a workspace **connect external marketing channels and ad platforms (Meta / Google Ads / TikTok / email), pull real campaign spend & performance into KLOEL, scrape leads from Google Maps & Instagram, build & publish hosted sites, and run WhatsApp launch/group funnels** — the "growth & acquisition" half of the product, sitting alongside the commerce engine.
>
> This is the **suspected-facade tier**. Some sub-domains are genuinely wired end-to-end (Sites CRUD, Meta Ads read, the BullMQ ads-sync engine, the Google Maps scraper); others are honest-setup or partial. This doc is brutally honest about which is which — see [Honest status](#honest-status).

---

## What the user does

A workspace owner who wants to **acquire and re-engage customers** uses these screens:

- **Anúncios (Ads War Room)** — connect Meta Ads / Google Ads / TikTok Ads accounts, see campaigns with spend / ROAS / conversions, pause/activate Meta campaigns (behind a human-approval gate), view tracking & "AI rules".
- **Marketing (Command Center)** — aggregate stats across channels (messages, leads, sales, revenue), connect channels (WhatsApp, Instagram, Messenger, Email/Gmail/Outlook/IMAP, TikTok), and watch a live message feed.
- **Sites** — create a hosted site, edit content/SEO, attach custom domains, toggle app integrations, publish/unpublish.
- **Scrapers / Leads** — kick off a lead-scraping job (Google Maps real, Instagram real-ish, others honest-unavailable) and import the valid scraped leads into Contacts.
- **Lançamento (Launch)** — create a "group launcher": a rotating set of WhatsApp group invite links behind one short slug, so a launch links one CTA that load-balances people across groups.
- **Growth / Money Machine** — one-click "reactivation" that finds dormant contacts and auto-creates a re-engagement campaign + flow.

These map to the real frontend shells (preserved UX contract):
`frontend/src/components/kloel/anuncios/AnunciosView.tsx` (2157 LOC across 12 files),
`frontend/src/components/kloel/sites/SitesView.tsx` (1624 LOC across 17 files),
`frontend/src/app/(main)/marketing/*`.
The Next.js page files (`app/(main)/anuncios/page.tsx` etc.) are intentionally thin wrappers that render these View components with a `defaultTab` — the stub-inventory "tiny-1-loc" flag on them is a false alarm for this territory.

---

## End-to-end flow

### A. Ads War Room — list Meta/Google/TikTok campaigns

```
AnunciosView.tsx
  -> hook  frontend/src/hooks/useAnuncios.ts (useAnunciosStatus / useAnunciosCampaigns)
  -> api   frontend/src/lib/api/meta.ts (metaAdsApi) + SWR fetch of /api/anuncios/*
  -> Nest  AnunciosController  backend/src/anuncios/anuncios.controller.ts
             GET  /api/anuncios/status            -> AnunciosService.getPlatformStatuses
             GET  /api/anuncios/campaigns         -> AnunciosService.getCampaigns
             POST /api/anuncios/sync/campaigns     -> AnunciosService.syncCampaigns
  -> svc   AnunciosService  backend/src/anuncios/anuncios.service.ts
             holds 3 AdProvider implementations (meta/google/tiktok)
  -> prov  backend/src/integrations/meta-marketing.provider.ts (MetaMarketingProvider)
           backend/src/integrations/google-ads.provider.ts     (GoogleAdsProvider)
           backend/src/integrations/tiktok-ads.provider.ts     (TikTokAdsProvider)
             provider.syncCampaigns() -> Meta Graph API / Google Ads API / TikTok API
  -> db    AnunciosService upserts into Prisma AdCampaign / AdAccount (tables RAC_AdCampaign / RAC_AdAccount)
  -> read  GET /campaigns reads RAC_AdCampaign (DB is the source of truth for the UI; live API only runs on sync)
  -> UI    WarRoomDashboard.tsx / PlatformDetailTab.tsx render rows; empty -> honest "connect" CTA
```

The token is **never** taken from the client. `MetaAdsController` (`backend/src/meta/ads/meta-ads.controller.ts`, route prefix `meta/ads`) resolves the access token from `MetaWhatsAppService.resolveConnection(workspaceId, 'facebook')` (DB-stored, encrypted) for live insights/campaign reads, and routes a **PATCH `meta/ads/campaigns/:id/status`** through an `ApprovalRequest` human-in-the-loop gate (high-risk media-spend change → must be APPROVED before execution).

### B. Background ads sync (the real engine)

```
AnunciosService.syncAccounts/syncCampaigns  (synchronous, on-demand)  OR
AdsSyncProcessor  backend/src/integrations/ads-sync.processor.ts (BullMQ worker, MAX_CONCURRENCY=2)
  - googleWorker  reads queue googleAdsSyncQueue (retry x5)
  - metaWorker    reads queue metaAdsSyncQueue   (retry x5, rate-limited 200/hr)
  - persists via ads-sync-persistence.helpers.ts -> RAC_AdAccount / RAC_AdCampaign / RAC_AdInsight
  - on Meta auth error (code 190 / 401) -> enqueue refresh-meta-token; same for google
```

### C. Sites — create & publish a hosted site

```
SitesView.tsx / CriarSite.tsx / EditarSite.tsx
  -> hook  frontend/src/hooks/useSites.ts
  -> api   frontend/src/lib/api/sites.ts (sitesApi)
  -> Nest  SitesController  backend/src/sites/sites.controller.ts  (prefix `sites`)
             POST   /sites                 -> SitesService.create
             PUT    /sites/:id             -> SitesService.update  (content/seoMeta)
             POST   /sites/:id/publish      -> SitesService.publish (DRAFT->PUBLISHED, sets publishedAt)
             POST   /sites/:id/domains      -> SitesService.addDomain
             PUT    /sites/:id/apps/:appKey -> SitesService.upsertApp
  -> svc   SitesService  backend/src/sites/sites.service.ts (status machine + workspace isolation)
  -> db    Prisma Site / SiteDomain / SiteAppIntegration (RAC_Site / RAC_SiteDomain / RAC_SiteAppIntegration)
  -> UI    VisaoGeral / Dominios / Apps tabs render real rows; loading/empty/error states present
```

### D. Scrapers — scrape leads, import to Contacts

```
Scrapers UI -> frontend/src/lib/api/scrapers.ts (scrapersApi)
  -> Nest  ScrapersController  backend/src/scrapers/scrapers.controller.ts
             POST /scrapers/jobs           -> ScrapersService.createJob
             POST /scrapers/jobs/:id/import -> ScrapersService.importLeads
  -> svc   ScrapersService  backend/src/scrapers/scrapers.service.ts
             createJob writes RAC_ScrapingJob + enqueues BullMQ "scraper-jobs"
  -> WORKER worker/scraper-processor.ts (separate process)
             type MAPS      -> worker/scrapers/google-maps.ts  (REAL puppeteer-extra + stealth)
             type INSTAGRAM -> worker/scrapers/instagram.ts     (REAL puppeteer)
             type GROUP     -> throws SCRAPER_NOT_IMPLEMENTED (honest)
             writes RAC_ScrapedLead
  -> import ScrapersService.importLeads upserts valid leads into Contact (RAC_Contact) by workspaceId+phone
```

### E. Launch — group-launcher rotation

```
Launch UI -> frontend/src/lib/api/launch.ts (launchApi)
  -> Nest  LaunchController  backend/src/launch/launch.controller.ts
  -> svc   LaunchService  backend/src/launch/launch.service.ts
             createLauncher -> GroupLauncher (RAC_GroupLauncher, ACTIVE, slug)
             addGroup       -> LaunchGroup   (RAC_LaunchGroup, invite link + capacity)
             getRedirectLink(slug) -> first non-full active group's inviteLink, else waiting-list
```

---

## Canonical vocabulary

| Concept | Canonical name | Where | Lingering aliases / notes |
|---|---|---|---|
| Paid-ads dashboard domain | **Anúncios** | `backend/src/anuncios/` | UI calls it "War Room"; both fine. |
| One ad-platform integration | **AdProvider** | `backend/src/integrations/ad-provider.interface.ts` | meta / google / tiktok implement it. `platform` string is the discriminator. |
| Stored ad account | **AdAccount** (`RAC_AdAccount`) | schema.prisma | |
| Stored ad campaign w/ metrics | **AdCampaign** (`RAC_AdCampaign`) | schema.prisma | spend/revenue/roas are `Float` (NOT money-cents-bigint — these are reported provider metrics, not KLOEL ledger money). |
| Daily ad metric rollup | **AdInsight** (`RAC_AdInsight`) | schema.prisma | written only by `AdsSyncProcessor` insights path. |
| Meta platform connection (token, page, ad account) | **MetaConnection** (`RAC_MetaConnection`) | schema.prisma | keyed `@@unique([workspaceId, channel])`; ads use `channel='facebook'`, WhatsApp uses `channel='whatsapp'`. Single canonical Meta credential store. |
| Background ad sync engine | **AdsSyncProcessor** | `backend/src/integrations/ads-sync.processor.ts` | |
| Hosted site | **Site** (`RAC_Site`) | schema.prisma | status machine DRAFT/PUBLISHED/ARCHIVED. |
| Lead-scraping job | **ScrapingJob** (`RAC_ScrapingJob`) | schema.prisma | also "OmniScraper". |
| Scraped raw lead | **ScrapedLead** (`RAC_ScrapedLead`) | schema.prisma | promoted to `Contact` on import. |
| Launch group rotation | **GroupLauncher** + **LaunchGroup** | schema.prisma | |
| Google Ads OAuth+API service | **GoogleAdsMarketingService** | `backend/src/marketing/google-ads-marketing.service.ts` | stores tokens in `Workspace.providerSettings.googleAds` (JSON). NOTE the parallel `GoogleAdsProvider` (`integrations/`) instead reads `IntegrationCredential`/its own creds — two Google-Ads code paths exist (see gaps). |

Google Ads token storage is the main **duplication**: `GoogleAdsMarketingService` persists in `Workspace.providerSettings.googleAds`, while the `AdProvider`-shaped `GoogleAdsProvider` uses `IntegrationCredential` + `integrations/google-ads.helpers.ts`. These are not unified.

---

## Key services & single responsibility

| Service | Owns | One line |
|---|---|---|
| `AnunciosService` (`anuncios/anuncios.service.ts`) | Ads aggregation | Fans status/connect/sync out to the 3 AdProviders; reads campaigns/accounts back from Prisma. |
| `MetaMarketingProvider` (`integrations/meta-marketing.provider.ts`) | Meta ads integration | OAuth code→token, encrypt+store in MetaConnection, sync ad accounts/campaigns/insights from Graph API. |
| `GoogleAdsProvider` (`integrations/google-ads.provider.ts`) | Google Ads integration (AdProvider) | Uses `google-ads-api` SDK; throws `NotConfiguredException` when creds absent (honest). |
| `TikTokAdsProvider` (`integrations/tiktok-ads.provider.ts`) | TikTok ads integration | TikTok Marketing API account/campaign sync. |
| `AdsSyncProcessor` (`integrations/ads-sync.processor.ts`) | Async sync engine | Two BullMQ workers with retry/backoff + token-refresh-on-auth-error + rate limit. |
| `MetaAdsService` (`meta/ads/meta-ads.service.ts`) | Live Meta Ads reads | Thin wrapper over `MetaSdkService.graphApiGet/Post` for campaigns, insights, lead forms, leads. |
| `MetaSdkService` (`meta/meta-sdk.service.ts`) | Meta Graph API client | Fetch + URL allow-list + 30s timeout + Redis rate limiter + webhook HMAC validation + token exchange. |
| `GoogleAdsMarketingService` (`marketing/google-ads-marketing.service.ts`) | Google Ads OAuth (marketing path) | Signed-state OAuth, `searchStream` campaign query; stores tokens in providerSettings JSON. |
| `MarketingController` (`marketing/marketing.controller.ts`) | Command-center read API | Aggregate stats, per-channel status, live feed; reads Message/Contact/KloelSale. |
| `MarketingConnectController` (`marketing/marketing-connect.controller.ts`) | Channel connect API | WhatsApp/email(Gmail/MS/IMAP)/TikTok connect+status under prefix `marketing/connect/*`. |
| `InstagramMarketingService` (`marketing/instagram/instagram-marketing.service.ts`) | IG marketing | Posts/insights via MetaConnection; honest empty state where no IgMessage model exists. |
| `SitesService` (`sites/sites.service.ts`) | Site builder CRUD | Sites/domains/apps with status machine + strict workspace ownership checks. |
| `ScrapersService` (`scrapers/scrapers.service.ts`) | Scrape orchestration | Create job → enqueue BullMQ; import valid leads → Contacts. |
| `LaunchService` (`launch/launch.service.ts`) | Launch funnels | Group launcher CRUD + slug→non-full-group redirect rotation. |
| `MoneyMachineService` (`growth/money-machine.service.ts`) | Growth automation | Find dormant contacts, auto-create reactivation campaign + flow. |

---

## Data & events

**Prisma models owned by this territory** (all `@@map`-prefixed `RAC_`, all `workspaceId`-scoped, cascade-on-workspace-delete):
`AdAccount`, `AdCampaign`, `AdInsight`, `MetaConnection` (shared with WhatsApp via `channel`), `Site`, `SiteDomain`, `SiteAppIntegration`, `ScrapingJob`, `ScrapedLead`, `GroupLauncher`, `LaunchGroup`, `Webinar` (model here; controller lives in `kloel/webinar.controller.ts`). Google-Ads-marketing tokens live denormalized in `Workspace.providerSettings` (JSON), not a dedicated model.

**Events:** This territory does **not** emit domain events directly — there are **no `eventBus.emit`/`.publish` calls** in `anuncios/`, `sites/`, `scrapers/`, `growth/`, `launch/`, `integrations/`, or `meta/ads/` (verified by grep). The AsyncAPI commerce-domain spine lists aspirational `commerce.campaign.*` events (`campaign.clicked`, `campaign.performance_drop_detected`, `campaign.creative_swapped`, etc.) but those are part of the cognitive/event taxonomy and are **not wired to emitters in this code** today. Inbound webhooks (Meta lead-gen / messenger) land in `backend/src/meta/webhooks/meta-webhook.controller.ts` and `backend/src/marketing/email-marketing-webhook.controller.ts`; those are HTTP webhook handlers, not the event spine.

---

## Workspace isolation

Every read/write is scoped by `workspaceId`, resolved from the JWT by `JwtAuthGuard` + `WorkspaceGuard` (or `resolveWorkspaceId(req)` in the Sites/Meta-ads controllers). Patterns observed:

- Ads/Sites Prisma queries always include `where: { workspaceId }`; `SitesService` additionally re-checks `existing.workspaceId !== workspaceId` and throws `ForbiddenException` (defence in depth) and uses `ensureOwnership` for domains/apps.
- `LaunchService.ensureLauncherOwnedByWorkspace` guards group adds.
- `MetaConnection` is uniquely keyed `[workspaceId, channel]`, so ad tokens never leak across workspaces or between WhatsApp vs Facebook channels.
- Ad tokens are encrypted at rest (`meta-token-crypto.ts` / `google-ads-token-crypto.ts`) and never returned to or accepted from the client.

---

## Honest status

**Genuinely works end-to-end (deliver):**
- **Sites CRUD** — full controller→service→Prisma, status machine, domain uniqueness, app integrations, workspace isolation, spec coverage (`sites.service.spec.ts`, `sites.test.ts`). Real.
- **Meta Ads read path** — `MetaAdsController` resolves DB token, calls real Graph API via `MetaSdkService`; campaign status change is gated behind a real `ApprovalRequest`. Real, contingent on `META_APP_ID/SECRET` + a connected `MetaConnection`.
- **Ads sync engine** — `AdsSyncProcessor` is a real dual-worker BullMQ pipeline with retry/backoff/rate-limit/token-refresh. Real plumbing.
- **Google Maps scraper** — `worker/scrapers/google-maps.ts` is genuine `puppeteer-extra`+stealth browser automation; job lifecycle + import-to-Contacts is real.
- **Launch / group rotation, Growth/Money-Machine** — real Prisma CRUD + redirect logic / dormant-contact reactivation.

**Honest-setup (correct behaviour, but needs external config / connection to produce data):**
- **Google Ads & TikTok ads** — providers throw `NotConfiguredException` / return honest `clientConfigured:false` status when env creds are absent; UI shows connect CTA. Not a facade — it's an honest gate, but the live data path is **unproven** without configured developer tokens + a connected account.
- **Instagram marketing** — real Graph calls for posts/insights; explicit honest empty state for inbound IG messages (no `IgMessage` model yet).

**Facade / gap (be skeptical):**
- **Ads OAuth completion loop is broken.** `AnunciosService.getConnectUrl` builds a redirect to `/api/anuncios/callback/:platform`, but **`AnunciosController` has no callback route** — there is no registered endpoint that calls `AnunciosService.completeOAuth` for Meta/TikTok. The only caller of `completeOAuth` is `GoogleAdsAuthController`, which (next point) isn't registered. So a user can start ad-account OAuth but the code-exchange has nowhere to land in this territory's controllers.
- **`GoogleAdsAuthController` is a dead controller.** `backend/src/google-ads/google-ads-auth.controller.ts` is not imported by any NestJS module (verified: zero `.module.ts` references). Its `/api/google-ads/connect|callback|status|disconnect` routes never reach DI — they 404 at runtime even though they appear in static route extraction.
- **Google Ads two-store split** — `GoogleAdsMarketingService` (providerSettings JSON) vs `GoogleAdsProvider` (IntegrationCredential). Two parallel, un-unified Google-Ads paths invite drift.
- **MoneyMachineService copy is hardcoded** — the reactivation message is a literal string with a `// Mocked for speed` comment (`"Oi! Faz um tempo..."`), not AI-generated despite the comment claiming so.
- **Webinars / Funnels** — `Webinar` model + a `webinarApi` (update/delete only, no create/list client) exist; the controller lives in `kloel/webinar.controller.ts`. There is **no dedicated funnels backend** at all (no `funnels`/`funil` module). Frontend funnel/webinar surfaces are largely shell.

PULSE: `pulse_health_by_module` returned no per-module artifact for this territory at scan time (303 artifacts indexed, none name-matched), so module-level PULSE health here is **not independently measured** in this pass — status above is from direct code reading.

---

## Start here

1. **`backend/src/integrations/ad-provider.interface.ts`** — the `AdProvider` contract is the keystone; once you understand it, `AnunciosService` and all three providers click into place.
2. **`backend/src/anuncios/anuncios.service.ts`** — the orchestrator that fans out to providers and reads back from Prisma; shows the "sync-then-read-from-DB" pattern the whole ads UI depends on.
3. **`backend/src/sites/sites.service.ts`** — the cleanest, fully-real reference implementation in this territory (status machine + workspace isolation done right); use it as the template for what "done" looks like here.
