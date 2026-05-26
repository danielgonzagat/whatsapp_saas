# Kloel Canonical Domains

> Authored by PI atomic subagent `w5-canonical-domains` (DeepSeek V4 Pro,
> ~44k events). Artifact #1 of the Architectural Semantic Canonicalization
> mission. Materialized 2026-05-26.


> **Wave 5 · ID: w5-canonical-domains**  
> **Artifact #1** of the Architectural Semantic Canonicalization mission.  
> Generated: 2026-05-26 from live codebase scan.

## Methodology

Each domain was identified by clustering backend source directories
(`backend/src/<dir>`), Prisma models (`backend/prisma/schema.prisma`),
frontend routes (`frontend/src/app/(main)/<route>`), admin surfaces
(`frontend-admin/src/app/(admin)/<route>`), and worker processors
(`worker/processors/`).

A domain is a **coherent business capability** with its own controller,
service, and Prisma models — not a utility directory or a cross-cutting
concern. Cross-cutting infrastructure (logging, i18n, common utils, queue,
health, pulse) is grouped under **Infrastructure** (domain #28).

### Legend

- **Owning backend root directories** — NestJS module directory under
  `backend/src/` that owns the domain.
- **Prisma models** — models from `backend/prisma/schema.prisma` whose
  primary lifecycle is governed by this domain.
- **Status**: `STABLE` (core, well-tested), `EVOLVING` (active development),
  `CONTESTED` (naming dispute or overlapping ownership).

---

## 1. Identity & Auth

- **Canonical name**: `IdentityAuth`
- **One-line responsibility**: Agent and admin authentication, OAuth, tokens,
  session management, and role-based access control.
- **Owning backend root directories**:
  - `backend/src/auth/`
  - `backend/src/api-keys/`
- **Frontend surfaces**:
  - `frontend/src/app/auth/`
  - `frontend/src/app/(public)/login/`
  - `frontend/src/app/(public)/register/`
  - `frontend/src/app/(public)/magic-link/`
  - `frontend/src/app/(public)/reset-password/`
  - `frontend/src/app/(public)/onboarding/`
- **Prisma models**:
  - Agent, RefreshToken, DeviceToken, PasswordResetToken, MagicLinkToken,
    SocialAccount, DataDeletionRequest, Invitation, CollaboratorInvite
- **Boundaries with other domains**:
  - MUST NOT own workspace lifecycle — that belongs to Workspace.
  - MUST NOT own KYC document upload — that belongs to KYC.
  - MUST NOT own admin IAM — see Admin IAM domain (#27).
- **Aliases / informal names found in code that should converge to this name**:
  - `user` / `users` (various; `Agent` is the canonical model in
    `backend/prisma/schema.prisma:303`)
  - `oauth` (`backend/src/auth/oauth/` — subdomain, not a domain)
  - `login` (`backend/src/auth/auth.service.ts` — auth flow, not a domain)
- **Status**: STABLE

## 2. Workspace

- **Canonical name**: `Workspace`
- **One-line responsibility**: Tenant isolation boundary — workspace CRUD,
  provider settings, custom domain, and global configuration.
- **Owning backend root directories**:
  - `backend/src/workspaces/`
- **Frontend surfaces**:
  - `frontend/src/app/(main)/settings/`
  - `frontend/src/app/(main)/account/`
- **Prisma models**:
  - Workspace
- **Boundaries with other domains**:
  - MUST NOT own billing/subscription — that belongs to Billing.
  - MUST NOT own agent lifecycle — that belongs to Identity & Auth.
  - Workspace DELETION must cascade through all domain-owned models.
- **Aliases / informal names found in code that should converge to this name**:
  - `tenant` (conceptual alias; no code uses it)
- **Status**: STABLE

## 3. Channel

- **Canonical name**: `Channel`
- **One-line responsibility**: Omnichannel provider management — WhatsApp,
  Instagram, Facebook Messenger, TikTok — including connections, setup
  wizards, channel configuration, and inbound hook routing.
- **Owning backend root directories**:
  - `backend/src/omnichannel/`
  - `backend/src/meta/`
  - `backend/src/whatsapp/`
  - `backend/src/google-ads/`
  - `backend/src/tiktok-ads/`
- **Frontend surfaces**:
  - `frontend/src/app/(main)/whatsapp/`
- **Prisma models**:
  - MetaConnection, ChannelSetup, ChannelProduct, ChannelArsenal,
    ChannelConfig, MonitoredGroup, GroupMember, BannedKeyword
- **Boundaries with other domains**:
  - MUST NOT own message sending/receiving — that belongs to Message.
  - MUST NOT own conversation state — that belongs to Conversation.
  - MUST NOT own ad campaign data — that belongs to Marketing.
- **Aliases / informal names found in code that should converge to this name**:
  - `whatsapp` (`backend/src/whatsapp/` — a channel, not a domain)
  - `meta` (`backend/src/meta/` — a provider, not a domain)
  - `omnichannel` (`backend/src/omnichannel/` — the strategy, not a domain)
  - `integrations` (`backend/src/integrations/` — token crypto infra, not a domain)
- **Status**: EVOLVING

## 4. Conversation

- **Canonical name**: `Conversation`
- **One-line responsibility**: Conversation lifecycle — open/close/assign,
  priority, unread tracking, mode switching (AI/HUMAN/PAUSED).
- **Owning backend root directories**:
  - `backend/src/inbox/` (conversation management)
  - `backend/src/chat/`
- **Frontend surfaces**:
  - `frontend/src/app/(main)/inbox/`
  - `frontend/src/app/(main)/chat/`
- **Prisma models**:
  - Conversation, Queue, AgentQueue, RoutingRule
- **Boundaries with other domains**:
  - MUST NOT own message content — that belongs to Message.
  - MUST NOT own contact identity — that belongs to Contact.
  - MUST NOT own agent auth — that belongs to Identity & Auth.
- **Aliases / informal names found in code that should converge to this name**:
  - `chat` (`backend/src/chat/` — just a view of conversations)
  - `inbox` (`backend/src/inbox/` — the UI entry point, not the domain)
  - `thread` (`backend/src/kloel/kloel-thread.service.ts` — Kloel's
    abstraction over conversations)
- **Status**: STABLE

## 5. Message

- **Canonical name**: `Message`
- **One-line responsibility**: Message sending, receiving, persistence,
  idempotency, and delivery status tracking across all channels.
- **Owning backend root directories**:
  - `backend/src/inbox/` (message routing + events)
  - `backend/src/whatsapp/` (WhatsApp message sending)
- **Worker processors**:
  - `worker/send-message-handler.ts`
  - `worker/send-message.persist-failure.ts`
  - `worker/send-message.persist-success.ts`
- **Prisma models**:
  - Message, FbMessage, KloelMessage, KloelConversation
- **Boundaries with other domains**:
  - MUST NOT own conversation state — that belongs to Conversation.
  - MUST NOT own contact data — that belongs to Contact.
  - MUST NOT own channel provider config — that belongs to Channel.
- **Aliases / informal names found in code that should converge to this name**:
  - `send-message` (`worker/send-message-handler.ts` — a handler)
  - `fb-message` (`backend/prisma/schema.prisma` — channel-specific model)
  - `kloel-message` (`backend/prisma/schema.prisma` — agent-facing model)
- **Status**: STABLE

## 6. Contact

- **Canonical name**: `Contact`
- **One-line responsibility**: Contact identity, phone/email resolution,
  identity merging, custom fields, tags, and opt-in/opt-out consent.
- **Owning backend root directories**:
  - `backend/src/contacts/`
- **Frontend surfaces**:
  - `frontend/src/app/(main)/leads/` (contact list view)
- **Prisma models**:
  - Contact, ContactInsight, ContactIdentityLink, ChannelIdentifier, Tag
- **Boundaries with other domains**:
  - MUST NOT own conversation routing — that belongs to Conversation.
  - MUST NOT own lead scoring — that belongs to Commerce (#25).
  - MUST NOT own CRM pipeline — that belongs to CRM.
- **Aliases / informal names found in code that should converge to this name**:
  - `lead` (ambiguous; `Contact` is the canonical model)
  - `customer` (commercial term; `Contact` is the data model)
  - `contact-identity` (`backend/src/contacts/contact-identity-resolver.service.ts`
    — a sub-capability)
- **Status**: STABLE

## 7. Automation

- **Canonical name**: `Automation`
- **One-line responsibility**: Flow-based conversation automation (Flows),
  autonomous agent execution (Autopilot), segmentation, and scheduled
  follow-ups.
- **Owning backend root directories**:
  - `backend/src/flows/`
  - `backend/src/autopilot/`
  - `backend/src/followup/`
  - `backend/src/pipeline/`
- **Frontend surfaces**:
  - `frontend/src/app/(main)/flow/`
  - `frontend/src/app/(main)/autopilot/`
  - `frontend/src/app/(main)/followups/`
- **Worker processors**:
  - `worker/autopilot-scanner.engine.ts`
  - `worker/autopilot-processor.ts`
  - `worker/scheduled-followup-handler.ts`
  - `worker/flow-engine-global.ts`
  - `worker/flow-node-executor.ts`
  - `worker/decision-outcome-resolver.ts`
- **Prisma models**:
  - Flow, FlowVersion, FlowTemplate, FlowExecution, Campaign,
    AutopilotEvent, AutonomyRun, AutonomyExecution, AgentWorkItem,
    ApprovalRequest, InputCollectionSession, AccountProofSnapshot,
    ConversationProofSnapshot, FollowUp, PipelineState,
    DecisionShadow, DecisionOutcome, DecisionOutcomeEvent
- **Boundaries with other domains**:
  - MUST NOT own message sending mechanics — that belongs to Message.
  - MUST NOT own contact identity — that belongs to Contact.
  - MUST NOT own Commercial Intelligence (CIA) reasoning — that belongs
    to Commercial Intelligence (#8).
  - MUST NOT own email/marketing campaigns — that belongs to Marketing.
- **Aliases / informal names found in code that should converge to this name**:
  - `autopilot` (`backend/src/autopilot/` — the autonomous subdomain)
  - `flow` (`backend/src/flows/` — the deterministic subdomain)
  - `pipeline` (`backend/src/pipeline/` — flow execution pipeline)
  - `followup` (`backend/src/followup/` — scheduled follow-ups)
  - `segmentation` (`backend/src/autopilot/segmentation.service.ts` —
    a sub-capability)
- **Status**: EVOLVING

## 8. Commercial Intelligence

- **Canonical name**: `CommercialIntelligence`
- **One-line responsibility**: The CIA (Commercial Intelligence Agent)
  runtime — autonomous commercial decision-making, send helpers, remote
  backlog management, and proof-level accountability for agent actions.
- **Owning backend root directories**:
  - `backend/src/cia/`
- **Frontend surfaces**:
  - `frontend/src/app/(main)/cia/`
- **Worker processors**:
  - `worker/processors/cia/`
- **Prisma models**:
  - (uses Automation models: AutonomyRun, AutonomyExecution,
    AgentWorkItem, AccountProofSnapshot, ConversationProofSnapshot)
- **Boundaries with other domains**:
  - MUST NOT own flow execution — that belongs to Automation.
  - MUST NOT own message sending — that belongs to Message.
  - MUST NOT own contact data — that belongs to Contact.
  - MUST NOT own Kloel chat agent — that belongs to AI Copilot (#26).
- **Aliases / informal names found in code that should converge to this name**:
  - `cia` (`backend/src/cia/` — the acronym; canonical expansion is
    Commercial Intelligence Agent)
  - `agent-runtime` (`backend/src/cia/cia-runtime.service.ts` —
    a sub-capability)
- **Status**: EVOLVING

## 9. Marketing

- **Canonical name**: `Marketing`
- **One-line responsibility**: Email campaigns, social media publishing
  (Instagram, TikTok), ad platform integration (Meta Ads, Google Ads,
  TikTok Ads), ROAS tracking, and marketing skills catalog.
- **Owning backend root directories**:
  - `backend/src/marketing/`
  - `backend/src/campaigns/`
  - `backend/src/mass-send/`
  - `backend/src/anuncios/`
- **Frontend surfaces**:
  - `frontend/src/app/(main)/marketing/`
  - `frontend/src/app/(main)/anuncios/`
  - `frontend/src/app/(main)/campaigns/`
- **Worker processors**:
  - `worker/campaign-processor.ts`
- **Prisma models**:
  - EmailCampaign, EmailCampaignRecipient, EmailCampaignDelivery,
    MailboxConnection, IgPost, IgInsight, AdAccount, AdCampaign,
    AdInsight, AdSpend, AdRule, IntegrationCredential
- **Boundaries with other domains**:
  - MUST NOT own WhatsApp channel configuration — that belongs to Channel.
  - MUST NOT own Checkout pixels — that belongs to Checkout.
  - MUST NOT own Product catalog — that belongs to Product.
  - MUST NOT own affiliate tracking — that belongs to Affiliate.
- **Aliases / informal names found in code that should converge to this name**:
  - `campaigns` (`backend/src/campaigns/` — WhatsApp campaigns; sub-capability)
  - `ads` (ad platform sub-capability)
  - `anuncios` (Portuguese; `frontend/src/app/(main)/anuncios/`)
  - `email-marketing` (`backend/src/marketing/email-marketing.service.ts` —
    sub-capability)
- **Status**: EVOLVING

## 10. Product

- **Canonical name**: `Product`
- **One-line responsibility**: Product catalog — products, plans, coupons,
  reviews, commissions, AI configuration, and affiliate product marketplace.
- **Owning backend root directories**:
  - `backend/src/product-categories/`
  - `backend/src/kloel/` (product.controller.ts, product-sub-resources/)
- **Frontend surfaces**:
  - `frontend/src/app/(main)/products/`
  - `frontend/src/app/(main)/produtos/`
  - `frontend-admin/src/app/(admin)/produtos/`
- **Prisma models**:
  - Product, ProductPlan, ProductCheckout, ProductCoupon, ProductReview,
    ProductCommission, ProductUrl, ProductCampaign, ProductAIConfig,
    AffiliateProduct (shared with Affiliate)
- **Boundaries with other domains**:
  - MUST NOT own checkout page rendering — that belongs to Checkout.
  - MUST NOT own affiliate link tracking — that belongs to Affiliate.
  - MUST NOT own order lifecycle — that belongs to Commerce.
  - MUST NOT own payment processing — that belongs to Payment.
- **Aliases / informal names found in code that should converge to this name**:
  - `catalog` (`backend/src/checkout/checkout-catalog.service.ts` —
    checkout's view)
  - `produtos` (Portuguese; `frontend/src/app/(main)/produtos/`)
  - `product-categories` (`backend/src/product-categories/` — sub-capability)
- **Status**: STABLE

## 11. Checkout

- **Canonical name**: `Checkout`
- **One-line responsibility**: Checkout pages — configuration, themes,
  coupons, pixels, order bumps, upsells, plan links, social lead capture,
  and checkout order lifecycle.
- **Owning backend root directories**:
  - `backend/src/checkout/`
- **Frontend surfaces**:
  - `frontend/src/app/(checkout)/`
  - `frontend/src/app/(main)/checkout/`
- **Prisma models**:
  - CheckoutProductPlan, CheckoutPlanLink, CheckoutConfig, CheckoutCoupon,
    CheckoutPixel, CheckoutOrder, CheckoutPayment, CheckoutSocialLead,
    OrderBump, Upsell, UpsellOrder
- **Boundaries with other domains**:
  - MUST NOT own payment gateway integration — that belongs to Payment.
  - MUST NOT own product catalog — that belongs to Product.
  - MUST NOT own wallet crediting — that belongs to Wallet.
  - MUST NOT own marketplace treasury fee capture — that belongs to
    Marketplace Treasury.
- **Aliases / informal names found in code that should converge to this name**:
  - `order` (CheckoutOrder is the model; "order" alone is ambiguous)
  - `checkout-public` (`backend/src/checkout/checkout-public.controller.ts` —
    the public-facing surface)
- **Status**: STABLE

## 12. Payment

- **Canonical name**: `Payment`
- **One-line responsibility**: Payment gateway integration — Stripe,
  MercadoPago, provider routing, payment webhooks, split engine, ledger,
  Stripe Connect, and fraud detection.
- **Owning backend root directories**:
  - `backend/src/payments/`
  - `backend/src/webhooks/` (payment webhooks only)
- **Prisma models**:
  - Payment, ExternalPaymentLink, WebhookEvent,
    ConnectAccountBalance, ConnectLedgerEntry, ConnectMaturationRule,
    FraudBlacklist
- **Boundaries with other domains**:
  - MUST NOT own checkout order state — that belongs to Checkout.
  - MUST NOT own wallet balance — that belongs to Wallet.
  - MUST NOT own marketplace treasury balance — that belongs to
    Marketplace Treasury.
  - MUST NOT own billing subscription — that belongs to Billing.
- **Aliases / informal names found in code that should converge to this name**:
  - `stripe` (`backend/src/payments/stripe/` — a provider)
  - `mercadopago` (`backend/src/payments/mercadopago/` — a provider)
  - `connect` (`backend/src/payments/connect/` — Stripe Connect sub-capability)
  - `ledger` (`backend/src/payments/ledger/` — the ledger sub-capability)
  - `split` (`backend/src/payments/split/` — payment split sub-capability)
- **Status**: EVOLVING

## 13. Wallet

- **Canonical name**: `Wallet`
- **One-line responsibility**: Producer wallet — balance management,
  transactions, append-only ledger, withdrawals, anticipations, and
  prepaid wallet for usage-metered services.
- **Owning backend root directories**:
  - `backend/src/wallet/`
  - `backend/src/kloel/` (wallet.service.ts, wallet.controller.ts,
    wallet-ledger.service.ts)
- **Frontend surfaces**:
  - `frontend/src/app/(main)/carteira/`
- **Worker processors**:
  - `worker/processors/prepaid-wallet-settlement.ts`
- **Prisma models**:
  - KloelWallet, KloelWalletTransaction, KloelWalletLedger,
    PrepaidWallet, PrepaidWalletTransaction, UsagePrice,
    WalletAnticipation, BankAccount
- **Boundaries with other domains**:
  - MUST NOT own marketplace treasury — that belongs to Marketplace
    Treasury.
  - MUST NOT own payment processing — that belongs to Payment.
  - MUST NOT own billing subscription — that belongs to Billing.
  - MUST NOT own KYC verification — that belongs to KYC (but KYC
    status gates wallet operations).
- **Aliases / informal names found in code that should converge to this name**:
  - `carteira` (Portuguese; `frontend/src/app/(main)/carteira/`)
  - `kloel-wallet` (`backend/prisma/schema.prisma` — the Prisma model)
  - `prepaid-wallet` (`backend/src/wallet/prepaid-wallet.controller.ts` —
    a sub-capability)
- **Status**: EVOLVING

## 14. Marketplace Treasury

- **Canonical name**: `MarketplaceTreasury`
- **One-line responsibility**: Kloel marketplace operator treasury —
  fee capture, chargeback reserves, payout orchestration, maturation,
  reconciliation, and fee schedule management.
- **Owning backend root directories**:
  - `backend/src/marketplace-treasury/`
- **Prisma models**:
  - MarketplaceTreasury, MarketplaceTreasuryLedger, MarketplaceFee
- **Boundaries with other domains**:
  - MUST NOT own producer wallet — that belongs to Wallet.
  - MUST NOT own payment processing — that belongs to Payment.
  - MUST NOT own checkout order lifecycle — that belongs to Checkout.
- **Aliases / informal names found in code that should converge to this name**:
  - `treasury` (`backend/src/marketplace-treasury/` — abbreviated form)
  - `marketplace` (`backend/src/marketplace/` — a separate, simpler domain)
- **Status**: EVOLVING

## 15. Affiliate

- **Canonical name**: `Affiliate`
- **One-line responsibility**: Affiliate/partnership management —
  affiliate product listing, requests, links, commissions, partner
  messaging, and collaborator invitations.
- **Owning backend root directories**:
  - `backend/src/partnerships/`
- **Frontend surfaces**:
  - `frontend/src/app/(main)/parcerias/`
- **Prisma models**:
  - AffiliateProduct, AffiliateRequest, AffiliateLink, AffiliatePartner,
    PartnerMessage, CollaboratorInvite
- **Boundaries with other domains**:
  - MUST NOT own product catalog — that belongs to Product.
  - MUST NOT own payment splits — that belongs to Payment.
  - MUST NOT own wallet crediting — that belongs to Wallet.
- **Aliases / informal names found in code that should converge to this name**:
  - `partnerships` (`backend/src/partnerships/` — the directory name)
  - `parcerias` (Portuguese; `frontend/src/app/(main)/parcerias/`)
- **Status**: EVOLVING

## 16. CRM

- **Canonical name**: `CRM`
- **One-line responsibility**: Sales pipeline management — pipelines,
  stages, deals, contact scoring, sentiment analysis, and neuro-CRM
  AI-driven insights.
- **Owning backend root directories**:
  - `backend/src/crm/`
- **Frontend surfaces**:
  - `frontend/src/app/(main)/vendas/`
  - `frontend/src/app/(main)/sales/`
  - `frontend-admin/src/app/(admin)/vendas/`
- **Worker processors**:
  - `worker/processors/crm-processor.ts`
- **Prisma models**:
  - Pipeline, Stage, Deal, Contact (CRM fields: leadScore, sentiment,
    purchaseProbability, nextBestAction, aiSummary)
- **Boundaries with other domains**:
  - MUST NOT own contact identity — that belongs to Contact.
  - MUST NOT own checkout orders — that belongs to Checkout.
  - MUST NOT own Commercial Intelligence (CIA) — that belongs to
    Commercial Intelligence (#8).
- **Aliases / informal names found in code that should converge to this name**:
  - `neuro-crm` (`backend/src/crm/neuro-crm.service.ts` — AI-enhanced
    CRM sub-capability)
  - `pipeline` (`backend/src/crm/` — sub-capability; not the domain)
  - `vendas` (Portuguese; `frontend/src/app/(main)/vendas/` — sales view)
- **Status**: EVOLVING

## 17. Analytics

- **Canonical name**: `Analytics`
- **One-line responsibility**: Business analytics — dashboards, reports
  (orders, affiliates, campaigns), home aggregation, agent performance,
  advanced analytics, and smart-time scheduling.
- **Owning backend root directories**:
  - `backend/src/analytics/`
  - `backend/src/dashboard/`
  - `backend/src/reports/`
- **Frontend surfaces**:
  - `frontend/src/app/(main)/analytics/`
  - `frontend/src/app/(main)/dashboard/`
  - `frontend/src/app/(main)/metrics/`
  - `frontend-admin/src/app/(admin)/relatorios/`
- **Prisma models**:
  - SystemInsight
- **Boundaries with other domains**:
  - MUST NOT own infrastructure metrics — that belongs to Infrastructure.
  - MUST NOT own CI/CD observability — that belongs to Infrastructure.
  - MUST NOT own financial ledger — that belongs to Wallet /
    Marketplace Treasury.
- **Aliases / informal names found in code that should converge to this name**:
  - `dashboard` (`backend/src/dashboard/` — a view, not a domain)
  - `reports` (`backend/src/reports/` — a sub-capability)
  - `metrics` (`backend/src/metrics/` — infra metrics, not business analytics)
  - `relatorios` (Portuguese; `frontend-admin/src/app/(admin)/relatorios/`)
- **Status**: EVOLVING

## 18. Billing

- **Canonical name**: `Billing`
- **One-line responsibility**: Subscription plans, Stripe billing,
  payment methods, plan limits enforcement, invoice management, and
  usage tracking.
- **Owning backend root directories**:
  - `backend/src/billing/`
- **Frontend surfaces**:
  - `frontend/src/app/(main)/billing/`
  - `frontend/src/app/(main)/pricing/`
- **Prisma models**:
  - Subscription, Invoice, DailyMessageCounter, DailyLimitCounter
- **Boundaries with other domains**:
  - MUST NOT own payment processing — that belongs to Payment.
  - MUST NOT own Stripe Connect — that belongs to Payment.
  - MUST NOT own prepaid wallet — that belongs to Wallet.
  - MUST NOT own workspace lifecycle — that belongs to Workspace.
- **Aliases / informal names found in code that should converge to this name**:
  - `subscription` (`backend/src/billing/` — a sub-capability)
  - `plan` (`backend/src/billing/plan-limits.service.ts` — plan limits)
  - `pricing` (`frontend/src/app/(main)/pricing/` — the public page)
  - `stripe` (`backend/src/billing/stripe.service.ts` — the provider)
- **Status**: STABLE

## 19. KYC

- **Canonical name**: `KYC`
- **One-line responsibility**: Know Your Customer — fiscal data collection
  (CPF/CNPJ), document upload and verification, KYC status gating, and
  Stripe Connect onboarding.
- **Owning backend root directories**:
  - `backend/src/kyc/`
- **Frontend surfaces**:
  - `frontend/src/app/api/kyc/`
- **Prisma models**:
  - KycDocument, FiscalData
- **Boundaries with other domains**:
  - MUST NOT own agent identity — that belongs to Identity & Auth.
  - MUST NOT own wallet access — KYC status gates wallet but KYC
    does not own wallet.
  - MUST NOT own compliance/GDPR — that belongs to Compliance (#20).
- **Aliases / informal names found in code that should converge to this name**:
  - `fiscal-data` (`backend/prisma/schema.prisma` — a sub-model)
  - `kyc` (already canonical; `backend/src/kyc/`)
- **Status**: EVOLVING

## 20. Compliance & GDPR

- **Canonical name**: `Compliance`
- **One-line responsibility**: Regulatory compliance — GDPR data export
  and deletion requests, Facebook data deletion callbacks, cookie consent,
  RISK event processing (Meta), and policy enforcement.
- **Owning backend root directories**:
  - `backend/src/compliance/`
  - `backend/src/gdpr/`
  - `backend/src/cookie-consent/`
  - `backend/src/unsubscribe/`
- **Frontend surfaces**:
  - `frontend/src/app/(public)/privacy/`
  - `frontend/src/app/(public)/terms/`
  - `frontend/src/app/(public)/data-deletion/`
  - `frontend-admin/src/app/(admin)/compliance/`
- **Prisma models**:
  - GdprRequest, CookieConsent, RiscEvent
- **Boundaries with other domains**:
  - MUST NOT own contact opt-in/out — that belongs to Contact.
  - MUST NOT own KYC verification — that belongs to KYC.
  - MUST NOT own audit logging — that belongs to Infrastructure (Audit).
- **Aliases / informal names found in code that should converge to this name**:
  - `gdpr` (`backend/src/gdpr/` — a regulation; Compliance is the domain)
  - `cookie-consent` (`backend/src/cookie-consent/` — sub-capability)
  - `lgpd` (Brazilian GDPR equivalent; not used in code but implied)
- **Status**: STABLE

## 21. Member Area

- **Canonical name**: `MemberArea`
- **One-line responsibility**: Membership sites — member areas, modules,
  lessons, enrollments, progress tracking, certificates, and gamification.
- **Owning backend root directories**:
  - `backend/src/member-area/`
- **Frontend surfaces**:
  - `frontend/src/app/(main)/produtos/area-membros/`
- **Prisma models**:
  - MemberArea, MemberEnrollment, MemberModule, MemberLesson
- **Boundaries with other domains**:
  - MUST NOT own product catalog — that belongs to Product.
  - MUST NOT own checkout/purchase — that belongs to Checkout.
  - MUST NOT own site building — that belongs to Sites.
- **Aliases / informal names found in code that should converge to this name**:
  - `member-areas` (`backend/src/member-area/` — plural directory name)
  - `area-membros` (Portuguese; `frontend/src/app/(main)/produtos/area-membros/`)
  - `courses` (conceptual; MemberArea is canonical)
- **Status**: EVOLVING

## 22. Sites

- **Canonical name**: `Sites`
- **One-line responsibility**: Site builder — Kloel site creation,
  HTML editing, custom domains, publishing, and hosting.
- **Owning backend root directories**:
  - `backend/src/kloel/` (site.controller.ts, site-public.controller.ts)
- **Frontend surfaces**:
  - `frontend/src/app/(main)/sites/`
- **Prisma models**:
  - KloelSite
- **Boundaries with other domains**:
  - MUST NOT own design editor — that belongs to Canvas.
  - MUST NOT own member area — that belongs to Member Area.
  - MUST NOT own checkout pages — that belongs to Checkout.
- **Aliases / informal names found in code that should converge to this name**:
  - `kloel-site` (`backend/prisma/schema.prisma` — the Prisma model)
  - `site-builder` (conceptual; Sites is canonical)
- **Status**: EVOLVING

## 23. Canvas

- **Canonical name**: `Canvas`
- **One-line responsibility**: Visual design editor — Kloel Designs for
  social media posts, banners, thumbnails, and marketing assets.
- **Owning backend root directories**:
  - `backend/src/kloel/` (design-related services; KloelDesign model)
- **Frontend surfaces**:
  - `frontend/src/app/(main)/canvas/`
- **Prisma models**:
  - KloelDesign
- **Boundaries with other domains**:
  - MUST NOT own site building — that belongs to Sites.
  - MUST NOT own media processing — that belongs to Infrastructure
    (Media).
  - MUST NOT own product image management — that belongs to Product.
- **Aliases / informal names found in code that should converge to this name**:
  - `design` (`backend/prisma/schema.prisma` — KloelDesign model)
  - `kloel-design` (the Prisma model; Canvas is the domain)
- **Status**: EVOLVING

## 24. Webinars

- **Canonical name**: `Webinars`
- **One-line responsibility**: Webinar scheduling and management —
  YouTube Live, Google Meet integration, product-linked webinars.
- **Owning backend root directories**:
  - `backend/src/kloel/` (webinar.controller.ts)
- **Frontend surfaces**:
  - `frontend/src/app/(main)/webinarios/`
- **Prisma models**:
  - Webinar
- **Boundaries with other domains**:
  - MUST NOT own product catalog — that belongs to Product.
  - MUST NOT own marketing campaigns — that belongs to Marketing.
- **Aliases / informal names found in code that should converge to this name**:
  - `webinarios` (Portuguese; `frontend/src/app/(main)/webinarios/`)
- **Status**: EVOLVING

## 25. Commerce

- **Canonical name**: `Commerce`
- **One-line responsibility**: Sales and subscriptions management —
  Kloel leads, Kloel sales, customer subscriptions, physical orders,
  order alerts, documents, and post-sale consumer lifecycle.
- **Owning backend root directories**:
  - `backend/src/kloel/` (leads.controller.ts, sales.controller.ts,
    sales-orders.controller.ts, sales-subscriptions.controller.ts,
    kloel-lead-brain.service.ts, kloel-lead-processor.service.ts,
    order-alerts.service.ts)
  - `backend/src/post-sale/`
- **Frontend surfaces**:
  - `frontend/src/app/(main)/vendas/`
  - `frontend/src/app/(main)/sales/`
  - `frontend-admin/src/app/(admin)/vendas/`
- **Prisma models**:
  - KloelLead, KloelSale, CustomerSubscription, PhysicalOrder,
    OrderAlert, Document
- **Boundaries with other domains**:
  - MUST NOT own checkout order lifecycle — that belongs to Checkout.
  - MUST NOT own product catalog — that belongs to Product.
  - MUST NOT own CRM pipeline — that belongs to CRM.
  - MUST NOT own payment processing — that belongs to Payment.
  - MUST NOT own wallet credit — that belongs to Wallet.
- **Aliases / informal names found in code that should converge to this name**:
  - `sales` (`backend/src/kloel/sales.controller.ts` — sub-capability)
  - `leads` (`backend/src/kloel/leads.controller.ts` — sub-capability)
  - `orders` (`backend/src/kloel/sales-orders.controller.ts` — sub-capability)
  - `subscriptions` (`backend/src/kloel/sales-subscriptions.controller.ts` —
    sub-capability)
  - `vendas` (Portuguese; `frontend/src/app/(main)/vendas/`)
  - `post-sale` (`backend/src/post-sale/` — post-sale consumer lifecycle)
- **Status**: EVOLVING

## 26. AI Copilot

- **Canonical name**: `AICopilot`
- **One-line responsibility**: AI-assisted business operations — Kloel
  chat agent, knowledge base, vector search, agent assist, copilot
  gateway, admin AI chat, persona management, PDF processing, and the
  MIND cognitive runtime.
- **Owning backend root directories**:
  - `backend/src/ai-brain/`
  - `backend/src/copilot/`
  - `backend/src/kloel/` (kloel-composer.service.ts,
    kloel-reply-engine.service.ts, kloel-thinker.service.ts,
    kloel-chat-tools.service.ts, unified-agent*.ts,
    kloel-tool-executor*.ts, kloel-tool-dispatcher*.ts,
    kloel-workspace-context*.ts, mind*.ts)
- **Frontend surfaces**:
  - `frontend/src/app/(main)/ferramentas/`
  - `frontend/src/app/(main)/chat/`
- **Prisma models**:
  - KnowledgeBase, KnowledgeSource, Vector, Persona, ChatThread,
    ChatMessage, KloelMemory, AdminChatSession, AdminChatMessage,
    MindBelief, MindPrediction, MindPolicy, MindWorkspaceState,
    MindCase, MindConceptDetection, MindGraphNode, MindGraphEdge,
    MindOutboxEvent, MindBanditArm, MindGuardAudit, MindDailyReport,
    MindGlobalPrior, KloelGlobalPrior
- **Boundaries with other domains**:
  - MUST NOT own Commercial Intelligence (CIA) — that belongs to
    Commercial Intelligence (#8).
  - MUST NOT own Automation (Autopilot/Flows) — that belongs to
    Automation (#7).
  - MUST NOT own message sending — that belongs to Message.
  - MUST NOT own product catalog — that belongs to Product.
- **Aliases / informal names found in code that should converge to this name**:
  - `kloel` (`backend/src/kloel/` — the entire Kloel agent subsystem is
    in this domain's scope)
  - `ai-brain` (`backend/src/ai-brain/` — knowledge base sub-capability)
  - `copilot` (`backend/src/copilot/` — admin copilot sub-capability)
  - `unified-agent` (`backend/src/kloel/unified-agent.service.ts` —
    the agent implementation)
  - `mind` (`backend/src/kloel/mind/` — the MIND cognitive runtime)
  - `ferramentas` (Portuguese; `frontend/src/app/(main)/ferramentas/`)
- **Status**: EVOLVING

## 27. Admin IAM

- **Canonical name**: `AdminIAM`
- **One-line responsibility**: Admin panel identity and access management —
  admin users, roles, permissions, sessions, MFA, audit logging, and
  destructive intent safety layer.
- **Owning backend root directories**:
  - `backend/src/middleware/` (audit-log.middleware.ts)
  - `frontend-admin/src/app/login/`
  - `frontend-admin/src/app/mfa/`
  - `frontend-admin/src/app/(admin)/`
- **Prisma models**:
  - AdminUser, AdminPermission, AdminSession, AdminAuditLog,
    AdminLoginAttempt, DestructiveIntent
- **Boundaries with other domains**:
  - MUST NOT own agent (end-user) auth — that belongs to Identity & Auth.
  - MUST NOT own workspace management — that belongs to Workspace.
  - MUST NOT own audit logging for end-user actions — that belongs to
    Infrastructure (Audit).
- **Aliases / informal names found in code that should converge to this name**:
  - `admin` (`frontend-admin/` — the entire admin panel)
  - `adm` (abbreviation; `frontend-admin/src/app/(admin)/`)
  - `destructive-intent` (`backend/prisma/schema.prisma` — safety
    layer sub-capability)
- **Status**: STABLE

## 28. Infrastructure

- **Canonical name**: `Infrastructure`
- **One-line responsibility**: Cross-cutting technical infrastructure —
  health checks, queue management, structured logging, audit trail,
  configuration, i18n, infrastructure metrics, media processing,
  scrapers, PULSE observability, email inbound, notifications, public
  API gateway, WebSocket gateways, and the worker runtime.
- **Owning backend root directories**:
  - `backend/src/common/`
  - `backend/src/config/`
  - `backend/src/health/`
  - `backend/src/logging/`
  - `backend/src/metrics/`
  - `backend/src/queue/`
  - `backend/src/audit/`
  - `backend/src/i18n/`
  - `backend/src/media/`
  - `backend/src/video/`
  - `backend/src/voice/`
  - `backend/src/audio/`
  - `backend/src/email/`
  - `backend/src/notifications/`
  - `backend/src/scrapers/`
  - `backend/src/pulse/`
  - `backend/src/observability/`
  - `backend/src/public-api/`
  - `backend/src/ops/`
  - `backend/src/alerts/`
  - `backend/src/prisma/`
  - `backend/src/lib/`
  - `worker/` (queue runtime, providers, flow engine, metrics)
- **Prisma models**:
  - AuditLog, OpsEvent, WebhookSubscription, ApiKey, Integration,
    ScrapingJob, ScrapedLead, MediaJob, VoiceProfile, VoiceJob,
    IntegrationCredential, LineageEntry
- **Boundaries with other domains**:
  - Infrastructure MUST NOT own any business domain logic. It provides
    plumbing only.
- **Aliases / informal names found in code that should converge to this name**:
  - `common` (`backend/src/common/` — shared utils)
  - `config` (`backend/src/config/` — app configuration)
  - `health` (`backend/src/health/` — health checks)
  - `queue` (`backend/src/queue/` — job infrastructure)
  - `pulse` (`backend/src/pulse/` — observability framework)
  - `scrapers` (`backend/src/scrapers/` — data scraping infra)
  - `media` (`backend/src/media/` — file/media infra)
  - `i18n` (`backend/src/i18n/` — internationalization)
  - `notifications` (`backend/src/notifications/` — notification delivery)
  - `public-api` (`backend/src/public-api/` — API key infrastructure)
  - `audit` (`backend/src/audit/` — audit trail infrastructure)
- **Status**: STABLE

---

## Quick Reference

| # | Domain | Backend Dir(s) | Key Prisma Models | Status |
|---|--------|---------------|-------------------|--------|
| 1 | Identity & Auth | `auth/`, `api-keys/` | Agent, RefreshToken, MagicLinkToken, SocialAccount | STABLE |
| 2 | Workspace | `workspaces/` | Workspace | STABLE |
| 3 | Channel | `omnichannel/`, `meta/`, `whatsapp/` | MetaConnection, ChannelSetup, ChannelConfig | EVOLVING |
| 4 | Conversation | `inbox/`, `chat/` | Conversation, Queue, RoutingRule | STABLE |
| 5 | Message | `inbox/`, `whatsapp/` | Message, FbMessage, KloelMessage | STABLE |
| 6 | Contact | `contacts/` | Contact, ContactIdentityLink, ChannelIdentifier | STABLE |
| 7 | Automation | `flows/`, `autopilot/`, `followup/`, `pipeline/` | Flow, FlowExecution, AutonomyRun, AgentWorkItem, FollowUp | EVOLVING |
| 8 | Commercial Intelligence | `cia/` | (uses Automation models) | EVOLVING |
| 9 | Marketing | `marketing/`, `campaigns/`, `mass-send/`, `anuncios/` | EmailCampaign, AdCampaign, AdInsight, IgPost | EVOLVING |
| 10 | Product | `product-categories/`, `kloel/` (product) | Product, ProductPlan, ProductCoupon, ProductAIConfig | STABLE |
| 11 | Checkout | `checkout/` | CheckoutProductPlan, CheckoutConfig, CheckoutOrder, CheckoutSocialLead | STABLE |
| 12 | Payment | `payments/`, `webhooks/` | Payment, ConnectAccountBalance, FraudBlacklist | EVOLVING |
| 13 | Wallet | `wallet/`, `kloel/` (wallet) | KloelWallet, KloelWalletLedger, PrepaidWallet | EVOLVING |
| 14 | Marketplace Treasury | `marketplace-treasury/` | MarketplaceTreasury, MarketplaceTreasuryLedger | EVOLVING |
| 15 | Affiliate | `partnerships/` | AffiliateProduct, AffiliateLink, AffiliatePartner | EVOLVING |
| 16 | CRM | `crm/` | Pipeline, Stage, Deal | EVOLVING |
| 17 | Analytics | `analytics/`, `dashboard/`, `reports/` | SystemInsight | EVOLVING |
| 18 | Billing | `billing/` | Subscription, Invoice, DailyMessageCounter | STABLE |
| 19 | KYC | `kyc/` | KycDocument, FiscalData | EVOLVING |
| 20 | Compliance & GDPR | `compliance/`, `gdpr/`, `cookie-consent/`, `unsubscribe/` | GdprRequest, CookieConsent, RiscEvent | STABLE |
| 21 | Member Area | `member-area/` | MemberArea, MemberEnrollment, MemberModule | EVOLVING |
| 22 | Sites | `kloel/` (site) | KloelSite | EVOLVING |
| 23 | Canvas | `kloel/` (design) | KloelDesign | EVOLVING |
| 24 | Webinars | `kloel/` (webinar) | Webinar | EVOLVING |
| 25 | Commerce | `kloel/` (sales, leads), `post-sale/` | KloelLead, KloelSale, CustomerSubscription, PhysicalOrder | EVOLVING |
| 26 | AI Copilot | `ai-brain/`, `copilot/`, `kloel/` (agent, mind) | KnowledgeBase, Persona, KloelMemory, MindBelief, MindPolicy | EVOLVING |
| 27 | Admin IAM | `middleware/`, `frontend-admin/` | AdminUser, AdminPermission, AdminSession, DestructiveIntent | STABLE |
| 28 | Infrastructure | `common/`, `config/`, `health/`, `logging/`, `queue/`, `audit/`, `i18n/`, `media/`, `pulse/`, `observability/`, `worker/` | AuditLog, OpsEvent, ApiKey, ScrapingJob, MediaJob, LineageEntry | STABLE |

---

_End of CANONICAL_DOMAINS.md — canonical as of 2026-05-26. All claims cited
from `backend/src/`, `backend/prisma/schema.prisma`, `frontend/src/app/`,
`frontend-admin/src/app/`, and `worker/`._
