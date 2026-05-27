# Kloel Canonical Domains (Bounded Contexts)

> Domain map aligned with CLAUDE.md DAG phases. Each domain has a single
> canonical owner, a clear responsibility, and explicit boundaries.
>
> Generated 2026-05-21. Raw file-count scan in
> [/docs/architecture/_raw_domain_scan.md](_raw_domain_scan.md) if needed.

## Domain organization principles

1. **One domain owns one set of Prisma models** — no cross-domain writes
2. **Domains communicate via events** (Spine) and queues (BullMQ), not direct service calls across boundaries
3. **API surface per domain**: controllers expose what the domain offers; everything else is internal
4. **Naming convention**: domain name = directory name = module class name prefix (e.g., `WhatsappModule`, `auth/AuthModule`)

## Phase 0 — Infrastructure (foundation, all domains depend on these)

| Domain | Path | Files | Services | Owns models | Status |
|---|---|---:|---:|---|---|
| **auth** | `backend/src/auth` | 52 | 15 | User, Session, RefreshToken, MagicLink | ✅ 90% |
| **workspaces** | `backend/src/workspaces` | 7 | 1 | Workspace, Member, Invite | ✅ canonical |
| **kyc** | `backend/src/kyc` | 12 | 2 | KycRecord, KycDocument | ✅ 85% |
| **common** | `backend/src/common` | 65 | 20 | (cross-cutting helpers) | ✅ canonical home for: math, string, phone, types, idempotency, money, throttler, observability, decorators, prisma helpers |
| **prisma** | `backend/src/prisma` | 10 | 1 | PrismaService (singleton) | ✅ canonical |
| **health** | `backend/src/health` | 17 | 11 | (no models — probes) | ✅ canonical |
| **observability** | `backend/src/observability` | 4 | 1 | (no models — Sentry, OTel) | ✅ canonical |
| **pulse** | `backend/src/pulse` | 11 | 2 | PulseSignal, PulseGate | ✅ canonical |
| **config** | `backend/src/config` | 3 | 0 | (Joi schema, env loader) | ✅ canonical |
| **compliance** | `backend/src/compliance` | 5 | 2 | ComplianceLog | ✅ canonical |
| **gdpr** | `backend/src/gdpr` | 12 | 2 | GdprRequest, DataExportJob | ✅ 90% |
| **audit** | `backend/src/audit` | 4 | 2 | AuditLog | ✅ canonical |
| **alerts** | `backend/src/alerts` | 1 | 0 | — | ✅ thin wrapper |

## Phase 1 — Commerce Engine (money flow)

| Domain | Path | Files | Services | Owns models | Status |
|---|---|---:|---:|---|---|
| **products** (under kloel) | `backend/src/kloel/products` | (mixed) | (mixed) | Product, ProductPlan, ProductCoupon, ProductReview, ProductCategory | 🟡 70% |
| **checkout** | `backend/src/checkout` | 53 | 14 | CheckoutOrder, CheckoutSession, CartItem | ✅ 85% |
| **payments** | `backend/src/payments` | 31 | 10 | Payment, LedgerEntry, RefundRequest | ✅ 80% (Stripe + MP wired) |
| **billing** | `backend/src/billing` | 23 | 5 | BillingPlan, BillingInvoice, BillingSubscription | ✅ 85% |
| **wallet** | `backend/src/wallet` | 8 | 1 | Wallet, WalletTransaction, WithdrawalRequest | ✅ 80% |
| **marketplace-treasury** | `backend/src/marketplace-treasury` | 6 | 4 | TreasuryEntry, SplitRule | ✅ canonical |
| **product-categories** | `backend/src/product-categories` | 3 | 1 | (sub-domain of products) | ✅ canonical |

## Phase 2 — Communication (channels)

| Domain | Path | Files | Services | Owns models | Status |
|---|---|---:|---:|---|---|
| **whatsapp** | `backend/src/whatsapp` | 91 | 23 | WhatsAppSession, WhatsAppMessage, WhatsAppContact | ✅ 95% (Meta Cloud default; WAHA legacy) |
| **inbox** | `backend/src/inbox` | 10 | 4 | Conversation, Message, AssignedAgent | ✅ 85% |
| **autopilot** | `backend/src/autopilot` | 13 | 10 | AutopilotRun, AutopilotDecision | ✅ 90% |
| **flows** | `backend/src/flows` | 15 | 3 | Flow, FlowStep, FlowExecution | ✅ 90% |
| **chat** | `backend/src/chat` | 5 | 1 | ChatLog | ✅ canonical |
| **email** | `backend/src/email` | 3 | 1 | EmailLog, EmailTemplate | ✅ canonical |
| **media** | `backend/src/media` | 7 | 2 | Media | ✅ canonical |
| **audio** | `backend/src/audio` | 3 | 1 | (transient — uses Media model) | ✅ canonical |
| **video** | `backend/src/video` | 3 | 1 | (transient — uses Media model) | ✅ canonical |
| **voice** | `backend/src/voice` | 5 | 1 | VoiceTranscript | ✅ canonical |
| **omnichannel** | `backend/src/omnichannel` | 3 | 2 | (router, no models of its own) | ✅ canonical |
| **calendar** | `backend/src/calendar` | 5 | 1 | CalendarEvent | ✅ canonical |
| **mass-send** | `backend/src/mass-send` | 3 | 1 | MassSendBatch | ✅ canonical |
| **followup** | `backend/src/followup` | 3 | 1 | FollowUpRule | ✅ canonical |

## Phase 3 — Intelligence (KLOEL cognitive organism)

| Domain | Path | Files | Services | Owns models | Status |
|---|---|---:|---:|---|---|
| **kloel** (cognitive core) | `backend/src/kloel` | 694 | 285 | KloelMemory, KloelDecision, KloelEvidence, MindPolicy, AbiState, BehaviorTag, Belief, Valence, Mission, etc. | 🟡 75% — god-module, split candidate |
| **cia** (unified agent) | `backend/src/cia` | 14 | 9 | CIASession, CIAContext | 🟡 75% |
| **ai-brain** | `backend/src/ai-brain` | 8 | 5 | (uses kloel models) | ✅ 85% |
| **brain** | `backend/src/brain` | 1 | 1 | (thin wrapper) | ✅ canonical |
| **crm** | `backend/src/crm` | 10 | 2 | CrmContact, CrmStage, CrmDeal | ✅ 80% |
| **copilot** | `backend/src/copilot` | 4 | 1 | CopilotSuggestion | ✅ canonical |
| **dashboard** | `backend/src/dashboard` | 5 | 1 | (read-only aggregations) | ✅ canonical |
| **analytics** | `backend/src/analytics` | 9 | 5 | AnalyticsEvent | ✅ 75% |
| **reports** | `backend/src/reports` | 7 | 3 | Report, ReportRun | ✅ 75% |
| **metrics** | `backend/src/metrics` | 6 | 4 | MetricSnapshot | ✅ canonical |
| **contacts** | `backend/src/contacts` | 5 | 3 | Contact, ContactTag | ✅ canonical |

## Phase 4 — Growth (acquisition + retention)

| Domain | Path | Files | Services | Owns models | Status |
|---|---|---:|---:|---|---|
| **marketing** | `backend/src/marketing` | 44 | 17 | MarketingChannel, MarketingCampaign | 🟡 |
| **campaigns** | `backend/src/campaigns` | 4 | 1 | Campaign, CampaignExecution | ✅ |
| **affiliate** | `backend/src/affiliate` | 4 | 0 | AffiliateLink, Commission | 🟡 |
| **partnerships** | `backend/src/partnerships` | 5 | 1 | Partnership, PartnerCommission | 🟡 |
| **member-area** | `backend/src/member-area` | 8 | 1 | MemberEnrollment, MemberProgress | 🟡 |
| **growth** | `backend/src/growth` | 4 | 1 | GrowthExperiment | ✅ canonical |
| **launch** | `backend/src/launch` | 4 | 1 | LaunchEvent | ✅ canonical |
| **post-sale** | `backend/src/post-sale` | 1 | 0 | (uses kloel models) | ✅ thin |
| **pipeline** | `backend/src/pipeline` | 4 | 1 | PipelineStage | ✅ canonical |

## Phase 5 — Platform Advanced (ads + integrations)

| Domain | Path | Files | Services | Owns models | Status |
|---|---|---:|---:|---|---|
| **meta** | `backend/src/meta` | 21 | 6 | MetaAccount, MetaAdAccount | ✅ |
| **anuncios** | `backend/src/anuncios` | 3 | 1 | AdCampaign | 🔴 Tier 3 (shell) |
| **google-ads** | (in admin/integrations) | 1 | 0 | (sub of integrations) | 🔴 |
| **tiktok-ads** | `backend/src/tiktok-ads` | 2 | 0 | (sub of integrations) | 🔴 |
| **integrations** | `backend/src/integrations` | 17 | 7 | IntegrationToken | ✅ |
| **scrapers** | `backend/src/scrapers` | 5 | 5 | ScraperJob | ✅ canonical |

## Phase 6 — Operations (admin + ops)

| Domain | Path | Files | Services | Owns models | Status |
|---|---|---:|---:|---|---|
| **admin** | `backend/src/admin` | 160 | 35 | AdminUser, AdminSession | ✅ |
| **team** | `backend/src/team` | 4 | 1 | (uses workspaces.Member) | ✅ |
| **api-keys** | `backend/src/api-keys` | 4 | 1 | ApiKey | ✅ canonical |
| **webhooks** | `backend/src/webhooks` | 19 | 3 | WebhookEvent | ✅ |
| **notifications** | `backend/src/notifications` | 4 | 2 | Notification | ✅ |
| **marketplace** | `backend/src/marketplace` | 3 | 1 | MarketplaceListing | 🟡 |
| **public-api** | `backend/src/public-api` | 3 | 1 | (read-only) | ✅ |
| **unsubscribe** | `backend/src/unsubscribe` | 3 | 1 | UnsubscribeRecord | ✅ |
| **cookie-consent** | `backend/src/cookie-consent` | 3 | 1 | CookieConsent | ✅ |
| **i18n** | `backend/src/i18n` | 2 | 1 | (config-driven) | ✅ |
| **ops** | `backend/src/ops` | 2 | 0 | (admin tools) | ✅ |
| **queue** | `backend/src/queue` | 4 | 0 | (BullMQ wrapper) | ✅ |
| **logging** | `backend/src/logging` | 1 | 0 | (Pino setup) | ✅ |

## Frontend domains (Next.js app router)

| Domain | Path | Files | Purpose |
|---|---|---:|---|
| **frontend/kloel** | `frontend/src/components/kloel` | 539 | KLOEL design system — buttons, forms, dialogs |
| **frontend/page-main** | `frontend/src/app/(main)` | 201 | Authenticated app shell pages |
| **frontend/lib** | `frontend/src/lib` | 123 | API clients, hooks, utils |
| **frontend/api-proxy** | `frontend/src/app/api` | 76 | Next.js → backend proxy routes |
| **frontend/checkout** | `frontend/src/app/(checkout)` | 74 | Public checkout pages |
| **frontend/products** | `frontend/src/components/products` | 32 | Product UI components |
| **frontend/public** | `frontend/src/app/(public)` | 27 | Public marketing pages |
| **frontend/plans** | `frontend/src/components/plans` | 26 | Pricing/plan components |
| **frontend/canvas** | `frontend/src/components/canvas` | 25 | Visual editor (Fabric.js) |
| **frontend/flow** | `frontend/src/components/flow` | 21 | Flow builder UI |
| **frontend/webinarios** | `frontend/src/components/webinarios` | 7 | Webinar UI |
| **frontend/ui** | `frontend/src/components/ui` | 7 | Generic primitives (shadcn-like) |

## Admin frontend domains

| Domain | Path | Files | Purpose |
|---|---|---:|---|
| **admin/app** | `frontend-admin/src/app` | 47 | Admin pages |
| **admin/components** | `frontend-admin/src/components` | 32 | Admin UI |
| **admin/lib** | `frontend-admin/src/lib` | 29 | Admin API clients |

## Worker domains

| Domain | Path | Files | Purpose |
|---|---|---:|---|
| **worker/processors** | `worker/src/processors` | (varies) | BullMQ queue consumers — see [QUEUES_CATALOG.md](QUEUES_CATALOG.md) |
| **worker/utils** | `worker/src/utils` | 1 | Shared helpers (use `backend/src/common` instead going forward) |

## Cross-domain communication rules

1. **No direct service imports across phase boundaries**: e.g., `payments` MUST NOT import `marketing` directly. Communicate via Spine event (`commerce.payment.approved` → marketing listener) or queue.
2. **Same-phase imports allowed** if the domain owns a clearly subordinate concept (e.g., `wallet` may import from `payments` since wallet operations originate from payments).
3. **Common/Prisma/Health/Pulse are dependency-free for all other domains** — they have no upstream domain.
4. **`kloel` (cognitive core) reads from all phase 1-4 domains** but writes only its own cognitive models. Cross-domain writes via Spine events.

## Renaming candidates (semantic canonicalization)

| Current name | Proposed canonical | Reason |
|---|---|---|
| `anuncios` | `ads` | English consistency, matches `meta`, `tiktok-ads` |
| `cia` | `unified-agent` | "CIA" is opaque; "Unified Agent" matches CLAUDE.md DAG |
| `omnichannel` | merge into `messaging` (new) | `inbox`, `whatsapp`, `email`, `chat`, `omnichannel` overlap |
| `member-area` | `member-portal` | Avoid "area" — too generic |
| `mercado_entrada` | `commerce.onboarding` (events) | Non-canonical namespace per [EVENT_TAXONOMY](EVENT_TAXONOMY.md) |

## Related

- [CANONICAL_VOCABULARY.md](CANONICAL_VOCABULARY.md) — term-level naming
- [CAPABILITY_MAP.md](CAPABILITY_MAP.md) — what each domain DOES
- [SERVICE_CATALOG.md](SERVICE_CATALOG.md) — service-level inventory
- [EVENT_TAXONOMY.md](EVENT_TAXONOMY.md) — cross-domain events
- [QUEUES_CATALOG.md](QUEUES_CATALOG.md) — async work
- [PRISMA_USAGE.md](PRISMA_USAGE.md) — model ownership per domain
- CLAUDE.md "ORDEM DE CONSTRUÇÃO (DAG)" — phase definitions
