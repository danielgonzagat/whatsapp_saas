# Growth — Affiliate, Partnerships, Member-Area, Campaigns

One-line purpose: the four "grow your revenue with other people" capabilities — recruit
**affiliates** to sell your products, manage **partners/collaborators** of your workspace,
sell access to **courses/communities (member areas)**, and blast **campaigns** to your
contact list.

> This single doc covers all four territories because they share one product surface
> ("Parcerias / Crescimento") and one isolation model. Each has its own NestJS module under
> `backend/src/{affiliate,partnerships,member-area,campaigns}/`.
> **WAHA is intentionally excluded** from the campaign send path (deprecated provider — the
> live WhatsApp leg uses Meta Cloud API + the worker `flowQueue`). It is not a gap.

---

## What the user does

- **Affiliate (two sides):**
  - *As a producer:* list one of your products in the affiliate marketplace, set commission %,
    cookie window, approval mode (AUTO/MANUAL), attribution model. Approve/reject affiliate
    requests; see who is promoting you.
  - *As an affiliate:* browse the marketplace, AI-search products, request affiliation, get a
    tracking link, and see "my products / my links".
- **Partnerships:** invite **collaborators** (team agents with a role) into your workspace,
  manage **affiliate partners** (people selling for you — distinct from the marketplace
  `AffiliateProduct` flow, see vocabulary), and chat 1:1 with partners.
- **Member-area:** build a course / community / membership (modules + lessons), enroll
  students, track lesson completion + progress, and expose a public student-facing page
  (`/member-areas/public/:slug`) gated by an email-issued access token. Buyers are
  auto-enrolled when a checkout order completes for a linked product.
- **Campaigns:** create a mass-message campaign (email and/or WhatsApp), target by contact
  tags, launch it (optionally at a "smart time"), and run A/B "Darwin" variants. The send
  itself runs in the BullMQ worker.

---

## End-to-end flow (real paths)

### A. Affiliate — request affiliation (affiliate side)

```
UI  frontend/src/components/kloel/parcerias/AffiliateMarketplaceSearch.tsx
      + AffiliateProductSuggestions.tsx + AffiliateLinkManager.tsx
 ->  api client  frontend/src/lib/api/affiliate.ts            (apiFetch from lib/api/core.ts)
 ->  (no Next proxy — apiFetch hits the backend base URL directly)
 ->  Nest  AffiliateController  backend/src/affiliate/affiliate.controller.ts
        POST /affiliate/request/:productId   (@UseGuards JwtAuthGuard, WorkspaceGuard, KycApprovedGuard)
 ->  Prisma DIRECT in the controller (no service):
        affiliateProduct.findUnique -> affiliateRequest.findUnique (dedupe via
        @@unique[affiliateProductId, affiliateWorkspaceId]) -> affiliateRequest.create;
        if approvalMode==='AUTO' -> $transaction { affiliateLink.create + affiliateProduct.totalAffiliates++ }
 ->  models  AffiliateProduct / AffiliateRequest / AffiliateLink
 ->  tables  RAC_AffiliateProduct / RAC_AffiliateRequest / RAC_AffiliateLink
 ->  returns { request, link, success } -> UI shows link or "pending"
```

Producer-side config (`PUT /affiliate/config/:productId`, the marketplace `GET /affiliate/marketplace*`,
and the `/products/:productId/affiliates*` approve/reject routes) go through **`AffiliateService`**
(`affiliate.service.ts`) for the per-product toggles (commission %, cookie days, attribution model,
visibility, auto-approval). Marketplace listing/stats live in `AffiliateMarketplaceController`
+ `affiliate-helpers.ts` (`buildMarketplaceWhere`, `enrichAffiliateProducts`).

### B. Member-area — enroll a student (manual, producer side)

```
UI  frontend/src/app/(main)/produtos/area-membros/*  (+ preview/[areaId])
 ->  api client  frontend/src/lib/api/member-area.ts
 ->  Nest  MemberEnrollmentsController  backend/src/member-area/member-enrollments.controller.ts
        POST /member-areas/:id/students   (JwtAuthGuard, WorkspaceGuard)
 ->  memberArea.findFirst(scoped) -> memberEnrollment.findFirst(by email) -> memberEnrollment.create
        -> MemberAreaStatsService.recalculate(areaId, workspaceId)
        -> MemberAreaEventEmitterService.emitEnrolled(...)
 ->  models  MemberArea / MemberEnrollment   tables  RAC_MemberArea / RAC_MemberEnrollment
 ->  event   commerce.member_area.enrolled
```

### B'. Member-area — auto-enroll on purchase (the real revenue path)

```
Checkout payment confirmed
 ->  backend/src/checkout/checkout-post-payment-effects.service.ts :: autoEnrollInMemberAreas(...)
       memberArea.findMany(workspaceId, productId, active) -> per area:
       memberEnrollment.findFirst -> create -> memberArea counter update
 ->  ALSO  backend/src/prisma/prisma.service.ts (~line 290) — the canonical, race-safe path:
       pg_advisory_xact_lock + findFirst + create/reactivate inside one tx
```

### C. Campaign — create + launch (backend exists; UI is NOT mounted, see Honest status)

```
UI component  frontend/src/components/kloel/campaigns/CampaignsView.tsx  (built, ORPHANED)
 ->  api client  frontend/src/lib/api/campaigns.ts  (listCampaigns/createCampaign/launchCampaign/…)
 ->  Nest  CampaignsController  backend/src/campaigns/campaigns.controller.ts
        POST /campaigns, POST /campaigns/:id/launch, /pause, /darwin/variants, /darwin/evaluate
 ->  service  CampaignsService.launch()  backend/src/campaigns/campaigns.service.ts
        findOne -> ensureCampaignDeliveryReady (email/whatsapp provider check) ->
        campaign.updateMany(status SCHEDULED) ->
        campaignQueue.add('process-campaign', {campaignId, workspaceId}, { jobId: `process-campaign:${id}` })
 ->  WORKER consumer  worker/campaign-processor.ts  (Worker on queue 'campaign-jobs')
        idempotent (checkIdempotent) -> resolve audience by tags -> fan out into flowQueue
        (run-flow OR send-message per contact, jittered) -> status COMPLETED + stats.sent
 ->  models  Campaign (self-relation parent/variants)   table  RAC_Campaign
 ->  event   commerce.campaign.audience_reached (emitted by CampaignEventEmitterService)
```

> Note: `CampaignsService.processCampaignJob()` is a *separate, dead* email/WhatsApp-direct
> dispatcher in the backend — **no backend BullMQ Worker is registered to consume
> `campaign-jobs`**, so it never runs. The live engine is the worker `campaign-processor.ts`.

---

## Canonical vocabulary

| Concept | Canonical name | Notes / aliases |
|---|---|---|
| A product offered for affiliation in the marketplace | **AffiliateProduct** | `RAC_AffiliateProduct`; keyed by `productId` (1:1 with `Product`) |
| An affiliate's request to promote a product | **AffiliateRequest** | dedup `@@unique[affiliateProductId, affiliateWorkspaceId]` |
| A tracking link issued to an approved affiliate | **AffiliateLink** | `code` unique |
| A person selling for / partnering with a workspace | **AffiliatePartner** | `RAC_AffiliatePartner`; the partnerships-side entity. **Distinct** from the marketplace `AffiliateProduct/Request/Link` triple — partnerships manages *people*, affiliate-marketplace manages *product listings*. Both are called "affiliate" in the UI. |
| A workspace team member with a role | **CollaboratorInvite** + **Agent** | invite row = `RAC_CollaboratorInvite`; accepted collaborator = `Agent` (`RAC_Agent`) |
| 1:1 message between workspace and partner | **PartnerMessage** | `RAC_PartnerMessage`, relates to `AffiliatePartner` |
| A course/community/membership shell | **MemberArea** | `RAC_MemberArea`; types COURSE/COMMUNITY/HYBRID/MEMBERSHIP |
| A student's access to a member area | **MemberEnrollment** | `RAC_MemberEnrollment` |
| Content tree | **MemberModule** -> **MemberLesson** | |
| A mass-message blast | **Campaign** | `RAC_Campaign`; A/B variants via self-relation `parentId` ("Darwin") |

Lingering ambiguity to be aware of: the word **"affiliate"** maps to two unrelated model
families (marketplace listings vs. `AffiliatePartner`). They are surfaced under different
routes (`/affiliate/*` and `/products/:id/affiliates*` vs `/partnerships/affiliates*`).

---

## Key services & single responsibility

| Service / file | Owns (one line) |
|---|---|
| `AffiliateService` (`affiliate.service.ts`) | Per-product affiliate config: commission %, cookie days, attribution model, visibility, auto-approval; merchant/chat listing. |
| `AffiliateController` (`affiliate.controller.ts`) | Affiliate-side actions (request/my-products/my-links/list-product/save) — **does Prisma directly**, not via the service. |
| `AffiliateMarketplaceController` + `affiliate-helpers.ts` | Marketplace browse/stats/categories/recommended + AI-search/suggest. |
| `PartnershipsService` (`partnerships.service.ts`) | Collaborators (invite/role/remove), affiliate-partners (create/approve/revoke/performance), chat — over `AffiliatePartner`/`CollaboratorInvite`/`Agent`. |
| `partnerships.chat.helpers.ts` | Partner chat read/list/send/mark-read over `PartnerMessage`. |
| `MemberAreasController` | Member-area CRUD + stats + AI structure generation. |
| `MemberModulesController` | Modules + lessons CRUD. |
| `MemberStructureController` | `POST :id/generate-structure` — template-seeds modules per area type. |
| `MemberEnrollmentsController` | Students CRUD, enroll, lesson completion + progress. |
| `MemberAreaStatsService` | Recompute denormalized `totalStudents` / `avgCompletion`. |
| `MemberAreaPublicController` | Public, token-gated student access (`/member-areas/public/:slug*`) — issues HMAC-signed access tokens, no JWT. |
| `CampaignsService` | Campaign CRUD, launch (enqueue), delivery-readiness gate, Darwin A/B variant generation + evaluation. |
| `worker/campaign-processor.ts` | **The live send engine** — consumes `campaign-jobs`, fans out to `flowQueue`. |

---

## Data & events

**Prisma models owned:** `Campaign`, `AffiliateProduct`, `AffiliateRequest`, `AffiliateLink`,
`AffiliatePartner`, `CollaboratorInvite`, `PartnerMessage`, `MemberArea`, `MemberEnrollment`,
`MemberModule`, `MemberLesson`. (Tables prefixed `RAC_*`, confirmed live in Postgres.)
`PartnershipsService` also reads `Agent`, `Workspace`, `CheckoutOrder`.

**Events emitted** (commerce domain, via the `kloel/*-emitter` services + the spine):
- `commerce.affiliate.{click_registered, commission_calculated, commission_received, link_created, performance_measured}`
- `commerce.campaign.{audience_reached, clicked, conversion_associated, creative_swapped, performance_drop_detected}` — `audience_reached` is emitted on campaign completion.
- `commerce.member_area.{enrolled, progressed, dropped_out}` — emitted by `MemberAreaEventEmitterService` from the enrollment controller.

**Consumed:** member-area auto-enroll is triggered by checkout completion (payment-approved path),
not by a direct event subscription in this territory.

---

## Workspace isolation

- Every authenticated route is guarded by `JwtAuthGuard` + `WorkspaceGuard`; the controller
  reads `req.user.workspaceId` and **every** Prisma `where` includes `workspaceId` (or scopes
  through a parent that does, e.g. enrollment via `memberArea` -> `workspaceId`).
- Affiliate marketplace is intentionally cross-workspace for *browsing*, but a `request` always
  records the requesting `affiliateWorkspaceId` and writes are dedup-constrained per workspace.
- `MemberAreaPublicController` is `@Public()` (no workspace JWT). It substitutes a per-area
  **HMAC-signed, TTL'd access token** keyed to the student email; content is only returned for
  the slug the token was minted for. This is the one path that is deliberately unauthenticated.
- `AffiliatePartner` enforces `@@unique[workspaceId, partnerEmail]`.

---

## Honest status (brutally honest, evidence-cited)

**Works end-to-end (real persistence + isolation + tests present):**
- **Affiliate marketplace + request/approve/link issuance** — real Prisma, dedup constraint,
  KYC-gated, auto-approve issues a real `AffiliateLink` in a transaction
  (`affiliate.controller.ts:102-174`). Frontend components wired via `lib/api/affiliate.ts`.
- **Partnerships collaborators + affiliate-partners + chat** — real CRUD with `@@unique`
  on partner email, performance aggregation from `CheckoutOrder`; spec files present.
- **Member-area CRUD, modules/lessons, manual enroll, lesson completion, public token access,
  and auto-enroll on purchase** — all real Prisma + events; the checkout-driven enroll in
  `prisma.service.ts` is race-safe via `pg_advisory_xact_lock`.

**Facade / unmounted / gaps:**
1. **Campaigns UI is NOT mounted.** `frontend/src/app/(main)/campaigns/page.tsx` renders a
   pure honest-state placeholder ("ainda nao esta disponivel"). The fully-built
   `CampaignsView.tsx` component + typed `lib/api/campaigns.ts` client exist but
   `CampaignsView` is **imported nowhere** in `frontend/src/app` (orphaned). The backend
   controller/service AND the worker engine are real and wired — only the route page is a stub.
   So: backend "engine" is real and mounted in `app.module.ts` + the worker; the *frontend
   surface* is the dead leg.
2. **`CampaignsService.processCampaignJob()` is dead code** — no backend `new Worker('campaign-jobs')`
   exists (only `autopilot-cycle-money.service.ts` *enqueues*; the worker `campaign-processor.ts`
   is the only consumer). The backend method duplicates send logic that never runs.
3. **MemberEnrollment idempotency is inconsistent across 3 write paths.** `MemberEnrollment`
   has only `@@index([studentEmail])`, **no `@@unique[workspaceId, memberAreaId, studentEmail]`**.
   - `prisma.service.ts` enroll: race-safe (advisory lock). ✅
   - `checkout-post-payment-effects.service.ts::autoEnrollInMemberAreas`: check-then-create
     with **no lock/tx** -> duplicate enrollment possible on webhook replay / concurrent payments.
   - `member-enrollments.controller.ts::enrollStudent`: check-then-create with **no lock/tx**
     -> duplicate possible on double-submit. Idempotency relies on the soft check only.

---

## Start here (newcomer reading order)

1. `backend/src/affiliate/affiliate.controller.ts` — the clearest end-to-end affiliate flow
   (request -> dedupe -> auto-approve -> link), shows the guard + isolation pattern.
2. `backend/src/campaigns/campaigns.service.ts` (`launch` + the comment on `processCampaignJob`)
   paired with `worker/campaign-processor.ts` — shows the enqueue-here / consume-in-worker split.
3. `backend/src/member-area/member-enrollments.controller.ts` (`enrollStudent`) +
   `backend/src/prisma/schema.prisma` (`MemberEnrollment`, ~line 2451) — shows the enrollment
   model and the missing unique constraint behind gap #3.
