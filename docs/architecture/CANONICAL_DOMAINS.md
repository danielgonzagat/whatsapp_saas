# Kloel Canonical Domains

> Evidence-based domain map of the KLOEL backend, scanned 2026-05-29.
> Companion docs: [CAPABILITY_MAP.md](./CAPABILITY_MAP.md),
> [EVENT_TAXONOMY.md](./EVENT_TAXONOMY.md),
> [SERVICE_CATALOG.md](./SERVICE_CATALOG.md),
> [MIND_SERVICES_CANONICAL.md](./MIND_SERVICES_CANONICAL.md),
> [OMNICORE_MISSION_COMPLETE.md](./OMNICORE_MISSION_COMPLETE.md).

A canonical domain is a unit of business semantics with one source of truth
for its data, its events, and its capability surface. Each canonical domain
maps to one or more backend source modules under `backend/src/`. Modules that
exist as deprecated aliases or as cross-cutting infrastructure are called out
explicitly in the migration notes section.

This file is the answer to: "where does this responsibility live, and who
owns it." It is not a feature list and it is not a tour of the codebase.

---

## Canonical Domains

Scale numbers below are non-spec TypeScript file counts (`.ts` excluding
`.spec.ts`/`.test.ts`) at depth two, measured directly with `find` on
2026-05-29. The kloel domain folder hosts the cognitive substrate plus many
domain-aligned emitter sub-folders, so its raw count is split per canonical
domain in the table.

| Domain | Responsibility | Backend module path | Scale (files) |
|---|---|---|---|
| identity-auth | Authentication, OAuth (Apple, Facebook, Google, TikTok), JWT, rate-limit on login, admin MFA, public API keys | `backend/src/auth/`, `backend/src/admin/auth/`, `backend/src/api-keys/`, `backend/src/public-api/` | 57 + 4 + 4 + 3 |
| tenant-workspace | Multi-tenant isolation, workspace CRUD, team membership, workspace context resolution | `backend/src/workspaces/`, `backend/src/team/`, `backend/src/kloel/agency/` | 7 + 4 + 13 |
| channel | Channel provisioning, session lifecycle, transport registry, ban-risk, health probes; WhatsApp/Meta/Instagram/TikTok | `backend/src/meta/`, `backend/src/marketing/channels/`, `backend/src/omnichannel/`, `backend/src/kloel/channel/`, `backend/src/kloel/channel-policy/`, `backend/src/kloel/channel-survival/`, `backend/src/kloel/whatsapp-emitter/` | 21 + (~49 marketing total) + 3 + 10 + 3 + 3 + 2 |
| conversation | Inbound message reception, routing, inbox threads, guest chat, reply engine | `backend/src/inbox/`, `backend/src/chat/`, `backend/src/kloel/` (guest-chat.*, kloel-thread.*, kloel-reply-engine.*, intent-router/) | 11 + 5 + 9 (intent-router) |
| message | Channel-agnostic OmniCore dispatch pipeline (supersedes the WhatsApp-only `sendMessage`), outbound queue, worker-side delivery | `backend/src/marketing/channel-message-dispatch.service.ts`, `backend/src/common/channel-dispatch/`, `backend/src/mass-send/`, `worker/outbound-dispatcher.ts`, `worker/whatsapp-engine.ts` | (facade) + (cross-cut) + 3 + worker |
| campaign | Marketing campaigns, mass sends, audience segmentation, Meta/Google/TikTok ads, marketing skills | `backend/src/campaigns/`, `backend/src/mass-send/`, `backend/src/marketing/`, `backend/src/anuncios/`, `backend/src/google-ads/`, `backend/src/tiktok-ads/`, `backend/src/kloel/campaign-emitter/`, `backend/src/kloel/marketing-skills/` | 6 + 3 + 49 + 3 + 1 + 2 + 1 + 6 |
| product | Product/plan catalog, categories, pricing | `backend/src/products/`, `backend/src/plans/`, `backend/src/product-categories/`, `backend/src/kloel/product-sub-resources/`, `backend/src/kloel/offer/` | 4 + 3 + 3 + 16 + 13 |
| checkout | Checkout sessions, order creation, social-lead enrichment, cart recovery | `backend/src/checkout/`, `backend/src/kloel/checkout-emitter/` | 72 + 1 |
| payment | Payment processing, provider routing (Stripe/MercadoPago), fraud, ledger, split, prepaid wallet, marketplace treasury | `backend/src/payments/`, `backend/src/wallet/`, `backend/src/marketplace-treasury/`, `backend/src/kloel/cash/`, `backend/src/kloel/healthy-money/` | 48 + 13 + 6 + 12 + 10 |
| billing | Platform subscriptions, payment methods, Stripe billing webhooks | `backend/src/billing/` | 23 |
| kyc-compliance | KYC verification, regulatory compliance, GDPR, cookie consent, unsubscribe, audit log | `backend/src/kyc/`, `backend/src/compliance/`, `backend/src/gdpr/`, `backend/src/cookie-consent/`, `backend/src/unsubscribe/`, `backend/src/audit/`, `backend/src/kloel/kyc-emitter/`, `backend/src/kloel/legit/` | 14 + 6 + 12 + 3 + 3 + 4 + 1 + 16 |
| affiliate-partnership | Affiliate discovery, commission, partnership program, marketplace listings | `backend/src/affiliate/`, `backend/src/partnerships/`, `backend/src/marketplace/`, `backend/src/kloel/affil/` | 6 + 10 + 3 + 15 |
| crm | Sales pipeline, deal tracking, neuro-CRM, contacts, sales | `backend/src/crm/`, `backend/src/pipeline/`, `backend/src/contacts/`, `backend/src/sales/`, `backend/src/kloel/crm-emitter/` | 12 + 4 + 5 + 13 + 1 |
| post-sale | Post-purchase flows, member area, follow-ups, launch sequences | `backend/src/post-sale/`, `backend/src/member-area/`, `backend/src/followup/`, `backend/src/launch/`, `backend/src/kloel/post-sale-emitter/`, `backend/src/kloel/postsale-consumers/`, `backend/src/kloel/member-area-emitter/`, `backend/src/kloel/commem/` | 1 + 8 + 3 + 4 + 1 + 15 + 1 + 11 |
| autopilot | Autonomous agent cycle loops, segmentation, budget-aware automation | `backend/src/autopilot/`, `backend/src/kloel/agent-runtime/` | 19 + 20 |
| commercial-intelligence | Mind substrate: perception, prediction, surprise, belief, policy, bandit, simulation, clarity, drift, lineage, hypotheses | `backend/src/kloel/mind/`, `backend/src/kloel/hypproof/`, `backend/src/kloel/capability-registry-v2/`, `backend/src/kloel/insight/`, `backend/src/kloel/wisdom/`, `backend/src/kloel/clarity/`, `backend/src/kloel/drift/`, `backend/src/kloel/lineage/`, `backend/src/kloel/goal-field/`, `backend/src/kloel/self-awareness/`, `backend/src/kloel/maturity/`, `backend/src/kloel/spine/`, `backend/src/kloel/evol/`, `backend/src/kloel/proof-level/`, `backend/src/kloel/role/`, `backend/src/kloel/trust/`, `backend/src/kloel/rules/`, `backend/src/kloel/owner-criterion/`, `backend/src/kloel/risk-class/`, `backend/src/kloel/recovery/`, `backend/src/kloel/wow/`, `backend/src/kloel/indispensability/` | 134 + 11 + 24 + 14 + 16 + 9 + 4 + 8 + 10 + 12 + 7 + 4 + 15 + 3 + 10 + 10 + 19 + 10 + 5 + 10 + 8 + 3 |
| flows-automation | Flow builder, low-code automation, prompt routing, tool planner | `backend/src/flows/`, `backend/src/kloel/toolplanner/`, `backend/src/kloel/intent-router/`, `backend/src/kloel/move/`, `backend/src/kloel/commercial-decision-orchestrator/`, `backend/src/kloel/delegation/`, `backend/src/kloel/incent/` | 16 + 2 + 9 + 4 + 6 + 8 + 10 |
| analytics-reports | Aggregate metrics, dashboards, observability of cognitive output, reports, lift attribution | `backend/src/analytics/`, `backend/src/dashboard/`, `backend/src/reports/`, `backend/src/kloel/daily-dashboard/`, `backend/src/kloel/observability/`, `backend/src/kloel/event-emit-audit-emitter/`, `backend/src/kloel/abi/`, `backend/src/kloel/abi-ab/` | 10 + 9 + 7 + 4 + 4 + 2 + 6 + 5 |
| platform-admin | Owner/admin console: support, sessions, Mind audit reading (`admin/brain/mind-audit.controller.ts` — class renamed to `MindAuditController`, route `admin/brain` kept), destructive operations | `backend/src/admin/` (minus admin/auth, which lives under identity-auth) | 106 |
| media-content | Audio, video, voice, image media pipeline, calendar, sites, scrapers | `backend/src/audio/`, `backend/src/video/`, `backend/src/voice/`, `backend/src/media/`, `backend/src/calendar/`, `backend/src/sites/`, `backend/src/scrapers/`, `backend/src/kloel/creator/`, `backend/src/kloel/generators/`, `backend/src/kloel/team/` | 3 + 3 + 5 + 7 + 6 + 7 + 5 + 8 + 6 + 9 |
| growth-onboarding | Growth experiments, coldstart, mercado-entrada, tipo-negocio, ecosys, defens | `backend/src/growth/`, `backend/src/kloel/coldstart/`, `backend/src/kloel/mercado-entrada/`, `backend/src/kloel/tipo-negocio/`, `backend/src/kloel/ecosys/`, `backend/src/kloel/defens/`, `backend/src/kloel/local-identity/`, `backend/src/kloel/v-tier/` | 4 + 10 + 1 + 3 + 8 + 12 + 7 + 4 |
| notifications-copilot | User-facing notifications, copilot UX assistant, email transactional, alerts | `backend/src/notifications/`, `backend/src/copilot/`, `backend/src/email/`, `backend/src/alerts/` | 4 + 4 + 2 + 1 |

The single number after the slash in the Scale column is the file count for
that path; when multiple paths are listed the counts are listed in the same
order, separated by `+`. Cross-cuts are flagged below and excluded from
domain totals.

---

## Infrastructure Cross-cuts (not domains)

These exist to serve all domains and have no business meaning of their own.
A capability that lives here cannot be the source of truth for any business
event.

| Cross-cut | Path | Scale | Notes |
|---|---|---:|---|
| common | `backend/src/common/` | 82 | DI helpers, prisma client wrapper, redis util, channel-dispatch, idempotency, throttler, observability primitives |
| prisma | `backend/src/prisma/` | 11 | Prisma client provider plus checkout-paid-effects fanout (a cross-cut listener, not an owner) |
| config | `backend/src/config/` | 3 | AppConfigModule wrapping `@nestjs/config` |
| webhooks | `backend/src/webhooks/` | 22 | Inbound webhook fan-out (Stripe, Meta, MercadoPago). Owner of webhook idempotency table only |
| queue | `backend/src/queue/` | 4 | BullMQ wiring; worker counterpart in `worker/` |
| health | `backend/src/health/` | 17 | Probes for DB, Redis, external providers |
| metrics | `backend/src/metrics/` | 6 | Prom-style counters and HTTP interceptor |
| observability | `backend/src/observability/` | 4 | Tracing and SLO helpers |
| logging | `backend/src/logging/` | 1 | Structured logger wrapper |
| i18n | `backend/src/i18n/` | 2 | Translation registry |
| ops | `backend/src/ops/` | 2 | Operations-only endpoints (protected scripts live in `scripts/ops/`, not here) |
| pulse | `backend/src/pulse/` | 14 | Self-diagnosis surface; not a business owner — read-only on every domain |
| certification | `backend/src/certification/` | 0 | Empty placeholder (see migration notes) |
| cia (top-level) | `backend/src/cia/` | 0 | Empty placeholder; canonical CIA lives at `backend/src/kloel/mind/cia/` |
| test-results | `backend/src/test-results/` | 0 | Empty placeholder |
| lib | `backend/src/lib/` | 7 | Prompt registry and AI-models contract; owned globally |
| integrations | `backend/src/integrations/` | 19 | External-provider adapters shared across domains |

---

## Domain Adjacency

Adjacency here means "domain A emits an event domain B consumes, or domain A
calls a service domain B owns." It does not mean "they share data shapes."
Edges are derived from the kloel emitter sub-folders, from `app.module.ts`
imports, and from the canonical `commerce.*` and `cognition.*` event
families documented in `EVENT_TAXONOMY.md`.

```
identity-auth ─────┬──── tenant-workspace
                   └──── public-api
tenant-workspace ──┬──── channel
                   ├──── billing
                   └──── platform-admin
channel ───────────┬──── conversation     (inbound message reception)
                   └──── message          (outbound dispatch)
conversation ──────┬──── crm              (lead replied, deal stage)
                   ├──── autopilot       (handoff, reply engine)
                   └──── commercial-intelligence (perception input)
campaign ──────────┬──── channel          (creative dispatch)
                   ├──── crm              (lead source attribution)
                   └──── analytics-reports
product ───────────┬──── checkout        (catalog → cart)
                   └──── post-sale       (entitlement after purchase)
checkout ──────────┬──── payment         (capture)
                   ├──── crm             (lead converted)
                   └──── post-sale       (paid → onboarding)
payment ───────────┬──── billing         (platform subscription bills)
                   ├──── kyc-compliance  (fraud / chargeback evidence)
                   ├──── affiliate-partnership (commission split)
                   └──── analytics-reports
crm ───────────────┬──── autopilot       (segments / triggers)
                   └──── commercial-intelligence
post-sale ─────────┬──── notifications-copilot
                   └──── analytics-reports
autopilot ─────────┬──── commercial-intelligence (mind decides next move)
                   ├──── message         (outbound execution)
                   └──── flows-automation (tool dispatch)
commercial-intelligence ──┬── analytics-reports (lift, drift, abi)
                          └── flows-automation  (policy → action)
flows-automation ──┬──── message
                   └──── channel
notifications-copilot ──── conversation (in-app prompts)
media-content ─────┬──── campaign
                   └──── product         (product gallery, video)
growth-onboarding ──┬── identity-auth    (signup funnel)
                    └── tenant-workspace (workspace creation)
analytics-reports ── platform-admin     (owner views)
```

Highest-fan-in domains (consumers of many domains): `analytics-reports`,
`commercial-intelligence`, `platform-admin`.

Highest-fan-out domains (emitters into many): `checkout`, `payment`,
`conversation`, `autopilot`.

---

## Migration Notes

Items below are observable mis-groupings or stale shells found during the
2026-05-29 scan. They are candidates for consolidation, not action items
that have already shipped.

1. **`backend/src/kloel/` is overloaded.** With 774 files at the top level
   and 134 more under `kloel/mind/`, it is the de-facto monorepo-within-the-
   monorepo. The canonical breakdown of which sub-folder belongs to which
   domain is listed above. Anything new added directly under `backend/src/
   kloel/` (rather than a sub-folder) is an instance of this drift.
2. **Two `healthy-money` folders.** `backend/src/kloel/healthy-money/` (10
   files) and `backend/src/kloel/healthymoney/` (3 files) coexist. One must
   absorb the other; the kebab-case form is the canonical winner.
3. **Two `capability-registry` folders.** `backend/src/kloel/capability-
   registry/` is empty (0 files), `backend/src/kloel/capability-registry-v2/`
   has 24 files. The empty folder is a leftover and should be removed; the
   v2 suffix should be dropped after deletion.
4. **`backend/src/cia/` and `backend/src/certification/` and
   `backend/src/test-results/` are empty top-level folders.** Per
   `OMNICORE_MISSION_COMPLETE.md` the canonical CIA is at `backend/src/
   kloel/mind/cia/`; the top-level shell is residual.
5. **`backend/src/kloel/middleware/` (2 files) duplicates `backend/src/
   common/middleware/`.** Domain-level middleware should live under `common/
   middleware/` unless it is genuinely kloel-internal cognitive plumbing.
6. **Two emitter conventions in kloel.** Most kloel emitters live in their
   own sub-folder (e.g. `checkout-emitter/`, `crm-emitter/`,
   `campaign-emitter/`), but some events fire from inline services. The
   canonical convention is "one emitter sub-folder per emitting domain";
   inline emitters violate it.
7. **`backend/src/mass-send/` overlaps with `backend/src/campaigns/`.** Both
   handle outbound campaign batches. Mass-send is currently a thin shell (3
   files); merging it into `campaigns/` would remove an artificial seam.
8. **`backend/src/email/` (2 files) is too thin to be its own domain.** It
   is in practice a transactional-email adapter and belongs under
   `notifications-copilot` or under `integrations/`.
9. **`backend/src/kloel/team/` (9 files) shadows `backend/src/team/` (4
   files).** They are not the same concept (kloel team is about cognitive
   role assignment, top-level team is workspace membership), but the name
   collision is risky and one should be renamed.
10. **`backend/src/admin/` (106 files) mixes identity (`admin/auth/`) with
    operations (`admin/destructive/`, `admin/operations/`).** `admin/auth/`
    is already attributed to `identity-auth`; the rest is the only path
    where `platform-admin` lives. Future moves should respect this split.
11. **`backend/src/contracts/` (2 files) is an orphan.** It contains DTOs
    used across domains; if it survives, it should move under `common/` as
    a cross-cut, not exist as a sibling of business domains.

---

## Source of Truth Pointers

For each canonical domain, the single service whose contract decides what
the domain means. If two services seem to do the same thing, the one listed
here wins and the other is by definition a deprecation candidate.

| Domain | Canonical service | Path |
|---|---|---|
| identity-auth | `AuthService` | `backend/src/auth/auth.service.ts` |
| tenant-workspace | `WorkspaceService` | `backend/src/workspaces/workspace.service.ts` |
| channel | `ChannelTransportRegistry` | `backend/src/kloel/channel-transport.registry.ts` |
| conversation | `KloelReplyEngineService` | `backend/src/kloel/kloel-reply-engine.service.ts` |
| message | `ChannelMessageDispatchService` (OmniCore facade) over `ChannelDispatchRegistry` + `ChannelDispatchPort` | `backend/src/marketing/channel-message-dispatch.service.ts`, `backend/src/common/channel-dispatch/channel-dispatch.{registry,port}.ts` |
| campaign | `CampaignsService` | `backend/src/campaigns/campaigns.service.ts` |
| product | `ProductService` | `backend/src/products/product.service.ts` |
| checkout | `CheckoutService` | `backend/src/checkout/checkout.service.ts` |
| payment | `PaymentService` (kloel facade) over `StripeChargeService` + `LedgerService` | `backend/src/kloel/payment.service.ts`, `backend/src/payments/stripe/`, `backend/src/payments/ledger/ledger.service.ts` |
| billing | `BillingSubscriptionService` | `backend/src/billing/billing-subscription.service.ts` |
| kyc-compliance | `KycService` + `ComplianceService` (peers, neither subsumes the other) | `backend/src/kyc/`, `backend/src/compliance/` |
| affiliate-partnership | `AffilDiscoveryLoopService` for affiliate, `PartnershipsService` for B2B | `backend/src/kloel/affil/affil-discovery.loop.ts`, `backend/src/partnerships/` |
| crm | `CrmService` (transactional) + `NeuroCrmService` (cognitive layer) | `backend/src/crm/crm.service.ts`, `backend/src/crm/neuro-crm.service.ts` |
| post-sale | `PostSaleEventEmitterService` over `MemberAreaService` and `FollowUpService` | `backend/src/kloel/post-sale-emitter/`, `backend/src/member-area/`, `backend/src/followup/` |
| autopilot | `AutopilotCycleExecutorService` | `backend/src/autopilot/autopilot-cycle-executor.service.ts` |
| commercial-intelligence | `MindService` (entry point) over the substrate listed below | `backend/src/kloel/mind.service.ts`, `backend/src/kloel/mind/` |
| flows-automation | `FlowsService` | `backend/src/flows/flows.service.ts` |
| analytics-reports | `AnalyticsService` + `DashboardService` (peers; analytics for raw metrics, dashboard for aggregation) | `backend/src/analytics/`, `backend/src/dashboard/` |
| platform-admin | `AdminCommonModule` exports; no single service — admin sub-domains own their data | `backend/src/admin/` |
| media-content | `MediaService` + `CalendarService` (peers per medium) | `backend/src/media/`, `backend/src/calendar/`, `backend/src/voice/`, `backend/src/video/`, `backend/src/audio/` |
| growth-onboarding | `GrowthService` | `backend/src/growth/` |
| notifications-copilot | `NotificationsService` + `CopilotService` (peers; notifications for inbound, copilot for outbound advice) | `backend/src/notifications/`, `backend/src/copilot/` |

A few domains intentionally list more than one service. This is honest: the
domain has multiple legitimate entry points and forcing them to nest would
hide the real shape.

---

## Uncertainty Surface

The following kloel sub-folders were not confidently classified into a
single domain by this scan and need a human reading to lock down:

- `backend/src/kloel/v-tier/` (4 files) — name suggests "verification tier"
  but the contents straddle growth-onboarding and kyc-compliance.
- `backend/src/kloel/spine/` (4 files) — emitter spine: cross-cut or
  commercial-intelligence? Tentatively classified under
  commercial-intelligence because all listeners are mind services.
- `backend/src/kloel/pulse-gates/` (19 files) — gate logic that intercepts
  emissions before they reach the spine. Currently attributed to
  commercial-intelligence; could equally be a cross-cut.
- `backend/src/kloel/dto/` (4 files) — shared DTOs without a clear owner.
- `backend/src/kloel/guards/` (1 file) — NestJS guard; cross-cut candidate.
- `backend/src/kloel/observability/` (4 files) — duplicates
  `backend/src/observability/`; one should win.
- `backend/src/kloel/middleware/` (2 files) — see migration note 5.

These are flagged here so a future canonicalization wave does not silently
move them and call the migration finished.

---

## Scanning Reproducibility

To regenerate the file counts in this document:

```sh
cd /Users/danielpenin/whatsapp_saas/backend/src
for d in $(find . -type d -mindepth 1 -maxdepth 1 | sort); do
  count=$(find "$d" -maxdepth 2 -name "*.ts" \
    -not -name "*.spec.ts" -not -name "*.test.ts" 2>/dev/null | wc -l | tr -d ' ')
  printf "%4d %s\n" "$count" "$d"
done

cd /Users/danielpenin/whatsapp_saas/backend/src/kloel
for d in $(find . -type d -mindepth 1 -maxdepth 1 | sort); do
  count=$(find "$d" -maxdepth 2 -name "*.ts" \
    -not -name "*.spec.ts" -not -name "*.test.ts" 2>/dev/null | wc -l | tr -d ' ')
  printf "%4d %s\n" "$count" "$d"
done
```

Last scan: 2026-05-29.
