# Service Catalog

> Canonicalization Mission deliverable #3.
> Evidence-based inventory of NestJS `@Injectable()` services across `backend/src/`.
> All counts and LOC values verified via `rg` / `wc -l` against the working tree.

---

## Service Catalog Summary

**Total `@Injectable()` units in `backend/src/`: 606**
(scope includes services, guards, interceptors, processors, providers, registries
and explicit `@Injectable()` helper engines; raw source: `rg -l '@Injectable\(\)' backend/src --type ts | wc -l`).

Counts per top-level `backend/src/<dir>/` slice (verified):

| Top-level slice | `@Injectable()` units | Notes |
|---|---:|---|
| `kloel/` | 337 | Largest slice — Mind/Kloel agent runtime, CIA, autopilot tools, channel guards |
| `marketing/` | 49 | Channel adapters (WhatsApp/Email/Instagram/Facebook/TikTok), mailbox OAuth, campaigns helpers |
| `admin/` | 34 | Admin console subdomains (auth, audit, compliance, products, sales, support, KYC) |
| `common/` | 20 | Guards, interceptors, cache, throttler, idempotency, channel-dispatch registry |
| `auth/` | 15 | Login, OAuth providers, password, partner, verification, rate-limit, JWT, roles |
| `payments/` | 15 | Stripe, Mercado Pago, Connect, ledger, fraud, provider router |
| `checkout/` | 14 | Order, payment, catalog, product config, social lead/recovery, post-payment effects |
| `health/` | 11 | Liveness/readiness + 8 indicators (DB, Redis, Stripe, OpenAI, Meta, BullMQ, Anthropic, e-mail, backup) |
| `autopilot/` | 10 | Cycle executor, segmentation, analytics, ops-conversion |
| `integrations/` | 7 | Ads sync + cross-provider integrations |
| `analytics/` | 5 | Analytics, advanced, agent-performance, queue-stats, smart-time |
| `billing/` | 5 | Billing service, plan-limits, payment-method, Stripe, billing-webhook |
| `inbox/` | 4 | Inbox, inbox-events, omnichannel, smart-routing |
| `meta/` | 4 | Meta SDK, Meta WhatsApp, Meta Ads, connection-state |
| `marketplace-treasury/` | 4 | Treasury service, payout, reconcile, maturation |
| `metrics/` | 4 | Metrics, queue-health, observability-queries, interceptor |
| `scrapers/` | 3 | Scrapers, omni-scraper, strategies |
| `webhooks/` | 3 | Inbound webhook fan-out |
| `flows/` | 3 | Flows, flow-template, flow-optimizer |
| `contacts/` | 3 | Identity-resolver, identity-merge, channel-identifier |
| `reports/` | 3 | Reports, reports-orders, reports-affiliate |
| `audit/` | 2 | Audit log + interceptor |
| `pulse/` | 2 | Pulse service + artifact |
| `compliance/` | 2 | Compliance + JWT-set validator |
| `crm/` | 2 | CRM + Neuro-CRM |
| `gdpr/` | 2 | GDPR + Facebook callback |
| `kyc/` | 2 | KYC + KYC-approved guard |
| `media/` | 2 | Media + video |
| `notifications/` | 2 | Notifications + welcome-onboarding email |
| `omnichannel/` | 2 | Contact resolution + channel inbound hook |
| `workspaces/` | 1 | Workspace CRUD |
| `wallet/` | 1 | Prepaid wallet kernel |
| `products/` | 1 | Product CRUD |
| `plans/` | 1 | Plan CRUD |
| `affiliate/` | 1 | Affiliate config |
| `partnerships/` | 1 | Collaborators & affiliate links |
| `campaigns/` | 1 | Campaigns + queue |
| `sales/` | 1 | Sales / charge orchestration |
| `dashboard/` | 1 | Dashboard aggregations |
| `prisma/` | 1 | Prisma data access |
| `observability/` | 1 | Ops-alert |
| `email/` | 1 | Inbound email handler |
| `pipeline/` | 1 | Pipeline service |
| `chat/` | 1 | Chat service |
| `team/` | 1 | Team management |
| `voice/` | 1 | Voice service |
| `video/` | 1 | Video service |
| `member-area/` | 1 | Member-area stats |
| `marketplace/` | 1 | Marketplace service |
| `mass-send/` | 1 | Mass-send orchestrator |
| `growth/` | 1 | Money-machine service |
| `followup/` | 1 | Follow-up service |
| `unsubscribe/` | 1 | Unsubscribe service |
| `sites/` | 1 | Sites service |
| `i18n/` | 1 | i18n helper |
| `cookie-consent/` | 1 | Cookie consent |
| `copilot/` | 1 | Copilot service |
| `calendar/` | 1 | Calendar service |
| `launch/` | 1 | Launch service |
| `public-api/` | 1 | API-key guard |
| `anuncios/` | 1 | Anuncios service |
| `audio/` | 1 | Audio service |
| `product-categories/` | 1 | Product category CRUD |
| `app.service.ts` | 1 | App root service |

Mapping to the 14 canonical domains is in the next section.

### Distribution per canonical domain (rolled up)

| Canonical domain | Approx. service count | Anchor folders |
|---|---:|---|
| Auth & Identity | ~15 | `auth/` |
| Workspace & Tenant | ~21 | `workspaces/`, `common/`, `prisma/`, `health/` |
| Channel (transport) | ~30 | `marketing/channels/`, `common/channel-dispatch/`, `meta/`, `omnichannel/` |
| Conversation & Inbox | ~6 | `inbox/`, `chat/`, `omnichannel/` |
| Message dispatch | ~8 | `marketing/channels/whatsapp/`, `marketing/channels/email/`, `marketing/channels/instagram/`, `marketing/channels/facebook/` |
| Product & Catalog | ~3 | `products/`, `plans/`, `product-categories/` |
| Checkout | ~14 | `checkout/` |
| Payment & Ledger | ~20 | `payments/`, `wallet/`, `marketplace-treasury/` |
| Affiliate & Partnerships | ~2 | `affiliate/`, `partnerships/` |
| Campaign & Marketing | ~6 | `campaigns/`, `marketing/email-marketing.service.ts`, `marketing/tiktok-marketing.service.ts`, `marketing/google-ads-marketing.service.ts`, `marketing/facebook-messenger.service.ts` |
| Autopilot / Mind / Kloel | ~337 | `kloel/`, `autopilot/` |
| Analytics & Reporting | ~12 | `analytics/`, `dashboard/`, `reports/`, `metrics/` |
| Billing & Subscription | ~5 | `billing/` |
| Infrastructure / Cross-cutting | ~30 | `common/`, `health/`, `pulse/`, `observability/`, `audit/`, `notifications/`, `webhooks/`, `integrations/` |

Total above sums to roughly the verified 606. Differences are caused by minor overlap (e.g. `marketing/` rolls into both Channel and Campaign domains).

---

## Per-Domain Service Tables

LOC values measured via `wc -l <file>` against the live tree.
"Key dependencies" is the constructor injection list excluding `Logger`, value-only `ConfigService` knobs, and trivial helpers — capped at 8 entries per the spec.

### Domain 1 — Auth & Identity

Login, OAuth, password, rate-limit, JWT, magic links, identity verification.

| Service | File | LOC | Responsibility | Key dependencies |
|---|---|---:|---|---|
| `AuthService` | `backend/src/auth/auth.service.ts` | 342 | Top-level login/register/JWT issuance — orchestrates the OAuth fan-out | `PrismaService`, `JwtService`, `EmailService`, `ConfigService`, `GoogleAuthService`, `AppleAuthService`, `FacebookAuthService`, `TikTokAuthService` |
| `AuthPasswordService` | `backend/src/auth/auth.password.service.ts` | 260 | Password hash / reset / strength | `PrismaService`, `EmailService` |
| `AuthOAuthService` | `backend/src/auth/auth-oauth.service.ts` | 307 | OAuth callback orchestration & account linking | `PrismaService`, `AuthService`, provider services |
| `AuthVerificationService` | `backend/src/auth/auth-verification.service.ts` | 388 | E-mail / WhatsApp verification + rate limit | `PrismaService`, `EmailService`, `ConfigService`, `AuthWhatsappPasswordService`, `OpsAlertService?`, `Redis?` |
| `GoogleAuthService` | `backend/src/auth/google-auth.service.ts` | 260 | Google OAuth2 token verify & profile fetch | `ConfigService`, `PrismaService` |
| `AppleAuthService` | `backend/src/auth/apple-auth.service.ts` | n/a | Apple Sign-In ID-token verify | Heavy: 25 constructor entries (anti-pattern, see watchlist) |
| `FacebookAuthService` | `backend/src/auth/facebook-auth.service.ts` | n/a | Facebook login ID-token verify | `ConfigService`, `PrismaService` |
| `TikTokAuthService` | `backend/src/auth/tiktok-auth.service.ts` | n/a | TikTok OAuth verify | `ConfigService`, `PrismaService` |
| `EmailService` | `backend/src/auth/email.service.ts` | 416 | Outbound transactional e-mail (SES / Resend / log) | `OpsAlertService?`, `PrismaService?` |
| `RateLimitService` | `backend/src/auth/rate-limit.service.ts` | 95 | Sliding-window rate limit per IP/account | `Redis` |
| `AuthPartnerService` | `backend/src/auth/auth-partner.service.ts` | n/a | Partner-grant SSO flow | `PrismaService` |
| `AuthWhatsappPasswordService` | `backend/src/auth/auth-whatsapp-password.service.ts` | n/a | WhatsApp OTP password reset | `PrismaService`, `MetaWhatsAppService` |
| `AuthOAuthResolverService` | `backend/src/auth/auth-oauth-resolver.service.ts` | n/a | Resolves OAuth provider config from request | `ConfigService` |
| `JwtAuthGuard` | `backend/src/auth/jwt-auth.guard.ts` | n/a | Bearer JWT auth guard | `JwtService` |
| `RolesGuard` | `backend/src/auth/roles.guard.ts` | n/a | Role/permission gate | `Reflector` |

### Domain 2 — Workspace & Tenant

Workspace CRUD, isolation, caching, plan limits, root-level plumbing.

| Service | File | LOC | Responsibility | Key dependencies |
|---|---|---:|---|---|
| `WorkspaceService` | `backend/src/workspaces/workspace.service.ts` | 457 | Workspace CRUD + provider settings + cache-wrapped reads | `PrismaService`, `CacheService` |
| `PrismaService` | `backend/src/prisma/prisma.service.ts` | 479 | DB access + delegate-level hooks (checkout paid → member-access) | — (extends `PrismaClient`) |
| `CacheService` | `backend/src/common/cache/cache.service.ts` | 86 | Redis JSON wrap/get/set with graceful degradation | `Redis` |
| `WorkspaceGuard` | `backend/src/common/guards/workspace.guard.ts` | n/a | Verifies workspaceId claim ↔ resource | `PrismaService` |
| `PlanLimitsService` | `backend/src/billing/plan-limits.service.ts` | n/a | Plan feature gate (max contacts, messages/day…) | `PrismaService`, `Redis`, `OpsAlertService?` |
| `OnboardingService` | `backend/src/kloel/onboarding.service.ts` | 356 | First-run workspace onboarding profile & checklist | `PrismaService` |
| `HealthService` | `backend/src/health/health.service.ts` | 175 | Aggregate queue/db/redis health | `Redis`, `PrismaService` |
| `SystemHealthService` | `backend/src/health/system-health.service.ts` | 242 | Liveness/readiness + external probes | `PrismaService`, `Redis`, `ConfigService`, `WhatsAppApiProvider`, `StorageService`, `ObservabilityQueriesService`, `QueueHealthService`, `StripeService?` |

### Domain 3 — Channel (transport)

Provider abstraction for WhatsApp / Email / Instagram / Facebook / TikTok / Meta.

| Service | File | LOC | Responsibility | Key dependencies |
|---|---|---:|---|---|
| `WhatsappService` | `backend/src/marketing/channels/whatsapp/whatsapp.service.ts` | 460 | High-level WhatsApp facade across providers (WAHA, Meta Cloud) | `PrismaService`, `WhatsAppProviderRegistry`, `WhatsAppCatchupService`, `CiaRuntimeService`, `WhatsappSessionService`, `WhatsappMessageDispatcherService`, `WhatsappReconcilerService`, `WhatsappChatMessagesService` |
| `WhatsappSessionService` | `backend/src/marketing/channels/whatsapp/whatsapp-session.service.ts` | 319 | Session QR / status / lifecycle | `PrismaService`, `WhatsAppProviderRegistry` |
| `WhatsappReconcilerService` | `backend/src/marketing/channels/whatsapp/whatsapp-reconciler.service.ts` | 393 | Reconcile WAHA/Meta state ↔ local DB | `PrismaService`, `WhatsAppProviderRegistry` |
| `WhatsappWatchdogService` | `backend/src/marketing/channels/whatsapp/whatsapp-watchdog.service.ts` | 396 | Session liveness watchdog | `PrismaService`, `WhatsappSessionService`, `WhatsappWatchdogRecoveryService` |
| `MetaWhatsAppService` | `backend/src/meta/meta-whatsapp.service.ts` | 379 | Meta Cloud API send / template / webhook ingest | `PrismaService`, `MetaSdkService`, `OpsAlertService?` |
| `MetaSdkService` | `backend/src/meta/meta-sdk.service.ts` | 286 | Low-level Meta Graph API client | `ConfigService` |
| `InstagramService` | `backend/src/marketing/channels/instagram/instagram.service.ts` | 126 | Instagram messaging adapter | `PrismaService`, `MetaSdkService` |
| `EmailDispatchAdapter` | `backend/src/marketing/channels/email/email-dispatch.adapter.ts` | 150 | E-mail channel send adapter | `EmailService` |
| `ChannelTransportRegistry` | `backend/src/kloel/channel-transport.registry.ts` | n/a | Maps channel key → transport adapter | transport providers |
| `ChannelDispatchRegistry` | `backend/src/common/channel-dispatch/channel-dispatch.registry.ts` | n/a | Cross-channel dispatch fan-out | per-channel adapters |
| `ContactResolutionService` | `backend/src/omnichannel/contact-resolution.service.ts` | 71 | Resolve sender → workspace contact | `PrismaService` |
| `ChannelInboundHookService` | `backend/src/omnichannel/channel-inbound-hook.service.ts` | n/a | Mind/spine hook on inbound message | `MindEventSpine?` |
| `ContactIdentityResolverService` | `backend/src/contacts/contact-identity-resolver.service.ts` | 162 | Phone/email/etc → canonical identity | `PrismaService` |
| `ContactIdentityMergeService` | `backend/src/contacts/contact-identity-merge.service.ts` | 123 | De-dupe / merge contact identities | `PrismaService` |
| `ChannelIdentifierService` | `backend/src/contacts/channel-identifier.service.ts` | n/a | Validate / normalize channel handles | — |

### Domain 4 — Conversation & Inbox

Unified inbox, threading, routing.

| Service | File | LOC | Responsibility | Key dependencies |
|---|---|---:|---|---|
| `InboxService` | `backend/src/inbox/inbox.service.ts` | 388 | Agent + thread CRUD, inbox gateway plumb | `PrismaService`, `InboxGateway`, `WebhookDispatcherService`, `ChannelTransportRegistry` |
| `InboxEventsService` | `backend/src/inbox/inbox-events.service.ts` | 83 | Inbox event bus | `EventEmitter2` |
| `OmnichannelService` | `backend/src/inbox/omnichannel.service.ts` | 319 | Omnichannel message normalize/upsert | 16 deps (anti-pattern) |
| `SmartRoutingService` | `backend/src/inbox/smart-routing.service.ts` | 170 | Agent assignment heuristic | `PrismaService` |
| `ChatService` | `backend/src/chat/chat.service.ts` | 75 | Lean chat session helper | `PrismaService` |
| `EmailInboundService` | `backend/src/email/email-inbound.service.ts` | n/a | Inbound e-mail → inbox message | `OmnichannelService`, `PrismaService` |

### Domain 5 — Message dispatch

Per-provider send pipeline + idempotency + rate guard.

| Service | File | LOC | Responsibility | Key dependencies |
|---|---|---:|---|---|
| `WhatsappMessageDispatcherService` | `backend/src/marketing/channels/whatsapp/whatsapp-message-dispatcher.service.ts` | 355 | Canonical WhatsApp send pipeline (`sendMessage`) | `PlanLimitsService`, `WorkspaceService`, `PrismaService`, `WhatsAppProviderRegistry`, `IInboxService` (forwardRef), `WorkerRuntimeService`, `WhatsappSessionService`, `Redis` |
| `InboundProcessorService` | `backend/src/marketing/channels/whatsapp/inbound-processor.service.ts` | 398 | Canonical WhatsApp receive pipeline | `PrismaService`, `IInboxService` (forwardRef), `Redis`, `AccountAgentService`, `WorkerRuntimeService`, `UnifiedAgentService`, `IWhatsappMessaging`, `DecisionOutcomeService` |
| `WhatsappSendRateGuardService` | `backend/src/marketing/channels/whatsapp/whatsapp-send-rate-guard.service.ts` | n/a | Per-channel/per-workspace send rate limiter | `Redis`, `PlanLimitsService` |
| `EmailMarketingService` | `backend/src/marketing/email-marketing.service.ts` | 397 | E-mail marketing send + BullMQ worker | `PrismaService`, `EmailService`, `OpsAlertService?` |
| `MetaAdsService` | `backend/src/meta/ads/meta-ads.service.ts` | 106 | Meta ads send/list | `MetaSdkService` |
| `TiktokMarketingService` | `backend/src/marketing/tiktok-marketing.service.ts` | 301 | TikTok dispatch | `PrismaService`, `ConfigService` |
| `GoogleAdsMarketingService` | `backend/src/marketing/google-ads-marketing.service.ts` | n/a | Google Ads sync | 15 deps (watchlist) |
| `FacebookMessengerService` | `backend/src/marketing/facebook-messenger.service.ts` | n/a | Messenger send adapter | `MetaSdkService` |
| `MassSendService` | `backend/src/mass-send/...` (services count: 1) | n/a | Bulk send orchestration | `PrismaService`, channel adapters |

### Domain 6 — Product & Catalog

| Service | File | LOC | Responsibility | Key dependencies |
|---|---|---:|---|---|
| `ProductService` | `backend/src/products/product.service.ts` | 394 | Product CRUD + spine emit | `PrismaService`, `EventEmitter2`, `AuditService`, `MindEventSpine?` |
| `PlanService` | `backend/src/plans/plan.service.ts` | 393 | Product plan CRUD (price/recurrence) | `PrismaService` |
| `ProductCategoriesService` | `backend/src/product-categories/product-categories.service.ts` | n/a | Category CRUD | `PrismaService` |

### Domain 7 — Checkout

Checkout flow, order, payment, post-payment effects.

| Service | File | LOC | Responsibility | Key dependencies |
|---|---|---:|---|---|
| `CheckoutService` | `backend/src/checkout/checkout.service.ts` | 559 | Checkout facade — delegates to product/catalog/order | `PrismaService`, `CheckoutProductService`, `CheckoutCatalogService`, `CheckoutOrderService`, `CheckoutEventEmitterService` |
| `CheckoutOrderService` | `backend/src/checkout/checkout-order.service.ts` | 438 | Order create / advance / mark paid | `PrismaService`, `CheckoutPaymentService` (forwardRef), `CheckoutCatalogService`, `CheckoutOrderQueryService`, `CheckoutEventEmitterService?` |
| `CheckoutPaymentService` | `backend/src/checkout/checkout-payment.service.ts` | 416 | Payment method routing (Stripe/MP-PIX/MP-boleto) + idempotency | `PrismaService`, `StripeChargeService`, `MercadoPagoBoletoChargeService`, `MercadoPagoPixChargeService`, `PaymentProviderRouterService`, `ConnectService`, `FraudEngine`, `FinancialAlertService` |
| `CheckoutCatalogService` | `backend/src/checkout/checkout-catalog.service.ts` | 369 | Public catalog + plan resolve | `PrismaService` |
| `CheckoutCatalogConfigService` | `backend/src/checkout/checkout-catalog-config.service.ts` | n/a | Catalog config (themes, copy) | `PrismaService` |
| `CheckoutProductService` | `backend/src/checkout/checkout-product.service.ts` | n/a | Checkout-tier product CRUD | `PrismaService` |
| `CheckoutProductConfigService` | `backend/src/checkout/checkout-product-config.service.ts` | n/a | Product config per checkout | `PrismaService` |
| `CheckoutOrderQueryService` | `backend/src/checkout/checkout-order-query.service.ts` | n/a | Read-side order queries | `PrismaService` |
| `CheckoutPostPaymentEffectsService` | `backend/src/checkout/checkout-post-payment-effects.service.ts` | 304 | After paid: member access, e-mails, hooks | `PrismaService`, `EmailService` |
| `CheckoutSocialLeadService` | `backend/src/checkout/checkout-social-lead.service.ts` | n/a | Social-lead capture | `PrismaService` |
| `CheckoutSocialRecoveryService` | `backend/src/checkout/checkout-social-recovery.service.ts` | n/a | Abandoned cart social recovery | 14 deps (watchlist) |
| `MercadoPagoPixService` | `backend/src/checkout/mercado-pago-pix.service.ts` | n/a | Direct PIX flow | `ConfigService`, `PrismaService` |
| `FacebookCapiService` | `backend/src/checkout/facebook-capi.service.ts` | n/a | Facebook conversion API send | `MetaSdkService` |
| `CartRecoveryService` | `backend/src/kloel/cart-recovery.service.ts` | n/a | Cart-recovery orchestration via mind/channels | `MindPolicyService`, transports |

### Domain 8 — Payment & Ledger

Stripe, Mercado Pago, Connect, ledger, wallet, treasury, fraud.

| Service | File | LOC | Responsibility | Key dependencies |
|---|---|---:|---|---|
| `LedgerService` | `backend/src/payments/ledger/ledger.service.ts` | 522 | Append-only ledger entries + maturation | `PrismaService` |
| `ConnectLedgerMaturationService` | `backend/src/payments/ledger/connect-ledger-maturation.service.ts` | n/a | Pending → matured ledger transition | `PrismaService` |
| `ConnectLedgerReconciliationService` | `backend/src/payments/ledger/connect-ledger-reconciliation.service.ts` | n/a | Cross-source reconcile (`@Cron`) | `PrismaService`, `FinancialAlertService?`, `OpsAlertService?` |
| `ConnectService` | `backend/src/payments/connect/connect.service.ts` | 151 | Stripe Connect onboarding & balance | `StripeService`, `PrismaService` |
| `ConnectPayoutService` | `backend/src/payments/connect/connect-payout.service.ts` | n/a | Stripe Connect payout transfers | `StripeService`, `PrismaService` |
| `ConnectPayoutApprovalService` | `backend/src/payments/connect/connect-payout-approval.service.ts` | n/a | Payout approval workflow | `PrismaService` |
| `ConnectReversalService` | `backend/src/payments/connect/connect-reversal.service.ts` | n/a | Connect transfer reversal | `StripeService`, `PrismaService` |
| `FraudEngine` | `backend/src/payments/fraud/fraud.engine.ts` | 385 | Risk score + reasons + decision | `PrismaService`, `Redis` |
| `StripeChargeService` | `backend/src/payments/stripe/stripe-charge.service.ts` | 115 | Stripe PaymentIntent create / capture | `StripeService` |
| `StripeWebhookProcessor` | `backend/src/payments/stripe/stripe-webhook.processor.ts` | n/a | Stripe webhook BullMQ handler | `PrismaService`, `LedgerService` |
| `MercadoPagoBoletoChargeService` | `backend/src/payments/mercadopago/mercadopago-boleto-charge.service.ts` | n/a | Mercado Pago boleto create | `ConfigService`, `PrismaService` |
| `MercadoPagoPixChargeService` | `backend/src/payments/mercadopago/mercadopago-pix-charge.service.ts` | n/a | Mercado Pago PIX create | `ConfigService`, `PrismaService` |
| `MercadoPagoWebhookSignatureVerifier` | `backend/src/payments/mercadopago/mercadopago-webhook-signature.verifier.ts` | n/a | HMAC verify | `ConfigService` |
| `PaymentProviderRouterService` | `backend/src/payments/provider-router/provider-router.service.ts` | 52 | Pick Stripe vs Mercado Pago vs Wallet | `ConfigService` |
| `WalletService` (wallet/) | `backend/src/wallet/wallet.service.ts` | 517 | Prepaid wallet kernel — top-up via Stripe/MP-PIX | `StripeService`, `PrismaService`, `FraudEngine`, `MercadoPagoPixChargeService` |
| `WalletService` (kloel/) | `backend/src/kloel/wallet.service.ts` | 524 | Kloel-tier sales wallet — settle, payout (parallel to `wallet/`) | `PrismaService`, `FinancialAlertService`, `WalletLedgerService`, `OpsAlertService?` |
| `WalletLedgerService` | `backend/src/kloel/wallet-ledger.service.ts` | n/a | Wallet append-only ledger entries | `PrismaService` |
| `MarketplaceTreasuryService` | `backend/src/marketplace-treasury/marketplace-treasury.service.ts` | n/a | Treasury balance & operations | `PrismaService`, `StripeService` |
| `MarketplaceTreasuryPayoutService` | `backend/src/marketplace-treasury/marketplace-treasury-payout.service.ts` | n/a | Treasury payout schedule | `PrismaService`, `StripeService` |
| `MarketplaceTreasuryReconcileService` | `backend/src/marketplace-treasury/marketplace-treasury-reconcile.service.ts` | n/a | Treasury reconciliation cron | `PrismaService` |
| `MarketplaceTreasuryMaturationService` | `backend/src/marketplace-treasury/marketplace-treasury-maturation.service.ts` | n/a | Treasury hold/release maturation | `PrismaService` |

### Domain 9 — Affiliate & Partnerships

| Service | File | LOC | Responsibility | Key dependencies |
|---|---|---:|---|---|
| `AffiliateService` | `backend/src/affiliate/affiliate.service.ts` | 97 | Affiliate enable/commission/rules per product | `PrismaService` |
| `PartnershipsService` | `backend/src/partnerships/partnerships.service.ts` | 439 | Collaborator invites, public-code, partner accounts | `PrismaService`, `AuditService`, `ConfigService`, `EmailService` |

### Domain 10 — Campaign & Marketing

| Service | File | LOC | Responsibility | Key dependencies |
|---|---|---:|---|---|
| `CampaignsService` | `backend/src/campaigns/campaigns.service.ts` | 500 | Campaign CRUD, schedule, BullMQ queue, smart-time | `PrismaService`, `AuditService`, `SmartTimeService`, `CampaignEventEmitterService`, `OpsAlertService?`, `MetaWhatsAppService?` |
| `EmailMarketingService` | `backend/src/marketing/email-marketing.service.ts` | 397 | E-mail campaigns + worker | `PrismaService`, `EmailService`, `OpsAlertService?` |
| `TiktokMarketingService` | `backend/src/marketing/tiktok-marketing.service.ts` | 301 | TikTok marketing | `PrismaService`, `ConfigService` |
| `GoogleAdsMarketingService` | `backend/src/marketing/google-ads-marketing.service.ts` | n/a | Google Ads conversion sync | 15 deps (watchlist) |
| `WhatsappCatchupOrchestratorService` | `backend/src/marketing/channels/whatsapp/whatsapp-catchup-orchestrator.service.ts` | n/a | WhatsApp catch-up sweep (post-reconnect) | 15 deps (watchlist) |
| `WhatsappSummaryService` | `backend/src/marketing/marketing-connect/whatsapp-summary.service.ts` | n/a | WhatsApp summary digest | `PrismaService` |
| `LaunchService` | `backend/src/launch/launch.service.ts` | n/a | Launch flow orchestration | `PrismaService` |
| `FollowupService` | `backend/src/followup/followup.service.ts` | n/a | Follow-up scheduler | `PrismaService` |

### Domain 11 — Autopilot / Mind / Kloel

KLOEL's commercial agent runtime. Largest slice at 337 `@Injectable()` units; this catalog enumerates only the canonical anchors and high-LOC orchestrators — the full inventory lives in `docs/architecture/CAPABILITY_MAP.md`.

| Service | File | LOC | Responsibility | Key dependencies |
|---|---|---:|---|---|
| `KloelThinkerService` | `backend/src/kloel/kloel-thinker.service.ts` | 571 | Streaming SSE think loop (LLM gateway) | `PrismaService`, `PlanLimitsService`, `LLMBudgetService`, `KloelThreadService`, `KloelWorkspaceContextService`, `KloelComposerService`, `KloelReplyEngineService`, `KloelLLME2EGuard` |
| `KloelToolDispatcherService` | `backend/src/kloel/kloel-tool-dispatcher.service.ts` | 595 | Routes tool calls to sub-tool services (35 deps) | `PrismaService`, `PlanLimitsService`, `KloelChatToolsService`, `KloelBusinessConfigToolsService`, `KloelWhatsAppToolsService`, `KloelComposerService`, `AuditService`, `KloelCodeToolsService` |
| `KloelReplyEngineService` | `backend/src/kloel/kloel-reply-engine.service.ts` | 598 | AI reply generation with guardrails | `PrismaService`, `PlanLimitsService`, `KloelThreadService`, `KloelWorkspaceContextService`, `UnifiedAgentService` (forwardRef), `MarketingSkillService?`, `MindService?`, `AbiBuilderService?` |
| `GuestChatService` | `backend/src/kloel/guest-chat.service.ts` | 599 | Public/anonymous chat handler (30 deps) | `ConfigService`, `OpsAlertService?`, `Redis?`, `AbiBuilderService?`, `MindEventSpine?`, `MindObservabilityService?`, `UnifiedAgentService?`, `KloelToolDispatcherService?` |
| `ConversationalOnboardingService` | `backend/src/kloel/conversational-onboarding.service.ts` | 584 | Conversational onboarding flow (34 deps) | `PrismaService`, `PlanLimitsService`, `ConversationalOnboardingToolsService`, `AbiBuilderService?`, `IntentRouterService?`, plus ~20 mind/spine services |
| `MindService` | `backend/src/kloel/mind.service.ts` | 351 | Cognitive orchestrator: perceive → predict → resolve → decide (tick loop) | `MindPerceptionService`, `MindSurpriseService`, `MindBeliefService`, `MindPolicyService`, `MindWorkspaceStateService`, `MindEventProcessorService`, `MindCaseMemoryService` |
| `MindRuntime` | `backend/src/kloel/mind/coordination/mind-runtime.service.ts` | 437 | Mind capability registry runtime | `UnifiedAgentService` (forwardRef), `UnifiedAgentContextDataService`, `MindCapabilityRegistry`, `MindEventSpine`, `KloelThreadService`, `MindCommercialGraph`, `MindCapabilityExecutor` |
| `MindCapabilityExecutor` | `backend/src/kloel/mind/coordination/mind-capability-executor.service.ts` | 538 | Executes capability decisions | `PrismaService`, `MindEventSpine`, `PlanLimitsService`, `AbiBuilderService`, `MindPerceptionService`, `CapabilityRegistryV2Service`, `CodeAccessService`, `SafeQueryService` |
| `CiaService` | `backend/src/kloel/mind/cia/cia.service.ts` | 442 | CIA (Commercial Intelligence Agent) surface | `PrismaService`, `CiaRuntimeService`, `AgentEventsService`, `AccountAgentService`, `MindService` |
| `UnifiedAgentService` | `backend/src/kloel/unified-agent.service.ts` | n/a | Unified agent entrypoint (14 deps) | `PrismaService`, action/context services |
| `UnifiedAgentActionsService` | `backend/src/kloel/unified-agent-actions.service.ts` | 403 | Action surface (CRM/sales/messaging/billing/commerce) | `PrismaService`, `StorageService`, `IWhatsappMessaging` (forwardRef), `UnifiedAgentActionsMessagingService`, `UnifiedAgentActionsCrmService`, `UnifiedAgentActionsSalesService`, `UnifiedAgentActionsWorkspaceService`, `UnifiedAgentActionsBillingService` |
| `UnifiedAgentContextService` | `backend/src/kloel/unified-agent-context.service.ts` | 264 | Thin delegation over `UnifiedAgentContextDataService` | `UnifiedAgentContextDataService` |
| `CommercialDecisionOrchestratorService` | `backend/src/kloel/commercial-decision-orchestrator.service.ts` | 383 | Top-level commercial decision pipeline | `MindService`, `KloelComposerService`, `MindPolicyService` |
| `AccountService` | `backend/src/kloel/account.service.ts` | 54 | Account view aggregator | `PrismaService` |
| `PaymentService` (kloel/) | `backend/src/kloel/payment.service.ts` | 451 | Kloel payment helpers (legacy facade) | `PrismaService`, `StripeService`, `MercadoPagoPixChargeService`, `MercadoPagoBoletoChargeService` |
| `AutopilotOpsService` | `backend/src/autopilot/autopilot-ops.service.ts` | 376 | Autopilot ops (handoff/escalation/quality) | `PrismaService`, `AutopilotOpsConversionService` |
| `AutopilotCycleExecutorService` | `backend/src/autopilot/autopilot-cycle-executor.service.ts` | 375 | Autopilot tick executor | `PrismaService`, `ConfigService`, `PlanLimitsService`, `OpsAlertService?`, `MindPolicyService?` |
| `AutopilotAnalyticsService` | `backend/src/autopilot/autopilot-analytics.service.ts` | 254 | Autopilot KPI aggregation | `PrismaService` |
| `SegmentationService` | `backend/src/autopilot/segmentation.service.ts` | 221 | Audience segment compute | `PrismaService` |
| `CartRecoveryService` | `backend/src/kloel/cart-recovery.service.ts` | n/a | Cart recovery action surface | mind + transports |

### Domain 12 — Analytics & Reporting

| Service | File | LOC | Responsibility | Key dependencies |
|---|---|---:|---|---|
| `AnalyticsService` | `backend/src/analytics/analytics.service.ts` | 330 | Dashboard / sentiment / lead-score | `PrismaService`, `CacheService` |
| `AdvancedAnalyticsService` | `backend/src/analytics/advanced-analytics.service.ts` | 197 | Cohort / funnel | `PrismaService` |
| `AgentPerformanceService` | `backend/src/analytics/agent-performance.service.ts` | 94 | Per-agent performance KPIs | `PrismaService` |
| `QueueStatsService` | `backend/src/analytics/queue-stats.service.ts` | n/a | BullMQ stats projection | BullMQ |
| `SmartTimeService` | `backend/src/analytics/smart-time/smart-time.service.ts` | n/a | Smart-send window inference | `PrismaService` |
| `DashboardService` | `backend/src/dashboard/dashboard.service.ts` | 420 | Dashboard aggregator | `PrismaService`, `Redis` |
| `ReportsService` | `backend/src/reports/reports.service.ts` | 316 | Report builder facade | `PrismaService` |
| `ReportsOrdersService` | `backend/src/reports/reports-orders.service.ts` | n/a | Orders / sales reports | `PrismaService` |
| `ReportsAffiliateService` | `backend/src/reports/reports-affiliate.service.ts` | n/a | Affiliate reports | `PrismaService` |
| `MetricsService` | `backend/src/metrics/metrics.service.ts` | 90 | Prometheus metrics registry | — |
| `QueueHealthService` | `backend/src/metrics/queue-health.service.ts` | n/a | BullMQ queue health | BullMQ |
| `ObservabilityQueriesService` | `backend/src/metrics/observability-queries.service.ts` | n/a | Read-side observability queries | `PrismaService` |

### Domain 13 — Billing & Subscription

| Service | File | LOC | Responsibility | Key dependencies |
|---|---|---:|---|---|
| `BillingService` | `backend/src/billing/billing.service.ts` | 89 | Stripe subscription wrapper | `PrismaService`, `ConfigService`, `ModuleRef`, `FinancialAlertService?` |
| `StripeService` (billing/) | `backend/src/billing/stripe.service.ts` | 81 | Stripe SDK adapter for billing | `ConfigService` |
| `PaymentMethodService` | `backend/src/billing/payment-method.service.ts` | n/a | Stripe customer + payment-method CRUD | `PrismaService`, `ConfigService` |
| `PlanLimitsService` | `backend/src/billing/plan-limits.service.ts` | n/a | Plan limit gate (also feeds dispatcher) | `PrismaService`, `Redis`, `OpsAlertService?` |
| `BillingWebhookService` | `backend/src/billing/billing-webhook.service.ts` | n/a | Stripe billing-webhook dispatch | `PrismaService`, `LedgerService` |

### Domain 14 — Infrastructure / Cross-cutting

Guards, interceptors, idempotency, audit, ops-alert, notifications, webhooks, integrations.

| Service | File | LOC | Responsibility | Key dependencies |
|---|---|---:|---|---|
| `OpsAlertService` | `backend/src/observability/ops-alert.service.ts` | 225 | Critical error → ops alert + persist | `PrismaService?` |
| `AuditService` | `backend/src/audit/...` | n/a | Audit log writer | `PrismaService` |
| `IdempotencyGuard` | `backend/src/common/idempotency.guard.ts` | n/a | Per-request idempotency dedup | `Redis` |
| `RouteClassGuard` | `backend/src/common/throttler/route-class.guard.ts` | n/a | Route-class throttler | `Reflector`, `Throttler` |
| `HttpTracingInterceptor` | `backend/src/common/http-tracing.interceptor.ts` | n/a | HTTP request tracing | — |
| `PromptSanitizerMiddleware` | `backend/src/common/middleware/prompt-sanitizer.middleware.ts` | n/a | LLM prompt sanitizer | — |
| `MetricsInterceptor` | `backend/src/metrics/metrics.interceptor.ts` | n/a | Per-request Prometheus metrics | `MetricsService` |
| `NotificationsService` | `backend/src/notifications/notifications.service.ts` | 267 | Push notifications (FCM init) + persist | `PrismaService`, `AuditService`, `ConfigService`, `OpsAlertService?` |
| `WelcomeAndOnboardingEmailService` | `backend/src/notifications/welcome-onboarding-email.service.ts` | n/a | Welcome / onboarding e-mail | `EmailService`, `PrismaService` |
| `UnsubscribeService` | `backend/src/unsubscribe/unsubscribe.service.ts` | n/a | Unsubscribe token + handler | `PrismaService` |
| `KycService` | `backend/src/kyc/kyc.service.ts` | 392 | KYC profile + document workflow | `PrismaService`, `StorageService`, `AuditService`, `ConnectService`, `KycEventEmitterService` |
| `GdprService` | `backend/src/gdpr/gdpr.service.ts` | n/a | GDPR export / delete | `PrismaService` |
| `GdprFacebookCallbackService` | `backend/src/gdpr/gdpr-facebook-callback.service.ts` | n/a | Facebook data-deletion callback | `PrismaService` |
| `ComplianceService` | `backend/src/compliance/compliance.service.ts` | n/a | Compliance attestation | `PrismaService` |
| `PulseService` | `backend/src/pulse/pulse.service.ts` | n/a | Pulse runtime adapter | `PrismaService` |
| `PulseArtifactService` | `backend/src/pulse/pulse-artifact.service.ts` | n/a | Pulse artifact persistence | `PrismaService` |
| `WebhooksService` | `backend/src/webhooks/...` | n/a | Inbound webhook fan-out / outbound dispatch | `PrismaService` |
| `ScrapersService` | `backend/src/scrapers/scrapers.service.ts` | n/a | Scraping orchestrator | `PrismaService` |
| `OmniScraperService` | `backend/src/scrapers/omni-scraper.service.ts` | n/a | Omni-scraper provider | strategies |
| `ApiKeysService` | `backend/src/api-keys/api-keys.service.ts` | n/a | API key issuance & validation | `PrismaService` |
| `ApiKeyGuard` | `backend/src/public-api/api-key.guard.ts` | n/a | Public-API key guard | `ApiKeysService` |
| `MediaService` | `backend/src/media/media.service.ts` | n/a | Media storage adapter | storage |
| `VideoService` | `backend/src/video/video.service.ts` | n/a | Video upload/process | storage |
| `VoiceService` | `backend/src/voice/voice.service.ts` | n/a | Voice transcription/TTS | provider |
| `SitesService` | `backend/src/sites/sites.service.ts` | n/a | Public sites/builder | `PrismaService` |
| `MarketplaceService` | `backend/src/marketplace/marketplace.service.ts` | n/a | Marketplace listing | `PrismaService` |
| `MemberAreaStatsService` | `backend/src/member-area/member-area-stats.service.ts` | n/a | Member-area stats | `PrismaService` |
| `MoneyMachineService` | `backend/src/growth/money-machine.service.ts` | n/a | Growth/automations | `PrismaService` |
| `PipelineService` | `backend/src/pipeline/pipeline.service.ts` | n/a | Sales pipeline | `PrismaService` |
| `CalendarService` | `backend/src/calendar/calendar.service.ts` | n/a | Calendar bookings | `PrismaService` |

LOC `n/a` cells are services that were not directly opened during this audit; they exist (verified by `rg` index) but their LOC was not measured to keep this catalog within scope. Dependencies were extracted from the constructor when measured, otherwise inferred from imports/module wiring.

---

## Canonical Services per Capability

Maps a capability to the **single canonical service** owners should route to.
"Migration note" entries call out parallel implementations that the
Canonicalization Mission must reconcile (per `DEPRECATION_MAP.md`).

| Capability | Canonical service | Migration note |
|---|---|---|
| User login / JWT issuance | `AuthService` (`backend/src/auth/auth.service.ts`) | Provider services (`Google`, `Apple`, `Facebook`, `TikTok`) compose into it. |
| Password reset / strength | `AuthPasswordService` | Old shared helpers under `auth/legacy-*` already deleted. |
| E-mail / WhatsApp verification | `AuthVerificationService` | OTP path consolidated. |
| Transactional e-mail send | `EmailService` (`backend/src/auth/email.service.ts`) | Moved out of `auth/` namespace remains pending — folder mismatch is OK but it is the single e-mail kernel. |
| Workspace CRUD | `WorkspaceService` | Single canonical. |
| Plan-limit gate | `PlanLimitsService` | Single canonical, consumed by dispatcher + kloel. |
| Cache wrap | `CacheService` (`common/cache`) | Single canonical. |
| WhatsApp send (outbound) | `WhatsappMessageDispatcherService` | Canonical pipeline; `WhatsappService` is the facade — DO NOT introduce ad-hoc `provider.send()` calls. |
| WhatsApp inbound processing | `InboundProcessorService` | Single canonical receive pipeline. |
| Meta Cloud API send | `MetaWhatsAppService` | Provider-level — wrapped behind `WhatsAppProviderRegistry` for the dispatcher. |
| Instagram send | `InstagramService` | Single canonical. |
| E-mail dispatch (transactional) | `EmailService` + `EmailDispatchAdapter` | Single kernel + channel-bound adapter. |
| Inbox thread / agent CRUD | `InboxService` | Single canonical. |
| Omnichannel normalization | `OmnichannelService` | Watchlist (16 deps). |
| Contact identity resolve | `ContactIdentityResolverService` | Single canonical; `ChannelIdentifierService` is a pure helper. |
| Product CRUD | `ProductService` | Single canonical. |
| Plan CRUD | `PlanService` | Single canonical. |
| Checkout flow orchestration | `CheckoutService` (facade) | Delegates to `CheckoutOrderService` / `CheckoutPaymentService`. |
| Checkout order lifecycle | `CheckoutOrderService` | Single canonical. |
| Checkout payment routing | `CheckoutPaymentService` | Routes Stripe / MP-PIX / MP-boleto. |
| Post-payment side effects | `CheckoutPostPaymentEffectsService` | Single canonical hook surface. |
| Cart recovery | `CartRecoveryService` (`kloel/`) | Canonical via mind/policy; `CheckoutSocialRecoveryService` is social-channel adapter only. |
| Stripe charge create | `StripeChargeService` | Single canonical. |
| Stripe Connect onboarding | `ConnectService` | Single canonical. |
| Stripe Connect payout | `ConnectPayoutService` | Single canonical. |
| Mercado Pago PIX | `MercadoPagoPixChargeService` | Single canonical (replaces direct `mercado-pago-pix.service.ts` callers). |
| Mercado Pago Boleto | `MercadoPagoBoletoChargeService` | Single canonical. |
| Payment provider routing | `PaymentProviderRouterService` | Single canonical. |
| Ledger entry write | `LedgerService` | Append-only; never UPDATE. |
| Ledger maturation | `ConnectLedgerMaturationService` | Cron-driven. |
| Ledger reconciliation | `ConnectLedgerReconciliationService` | Single canonical (`@Cron('0 */15 * * * *')`). |
| Fraud evaluation | `FraudEngine` | Single canonical. |
| Prepaid wallet (top-up / balance) | `WalletService` (`backend/src/wallet/wallet.service.ts`) | **Migration**: parallel `backend/src/kloel/wallet.service.ts` (524 LOC) is the kloel-tier settle/payout — DEPRECATION_MAP must reconcile. |
| Marketplace treasury | `MarketplaceTreasuryService` | Single canonical. |
| Affiliate config | `AffiliateService` | Single canonical. |
| Partnership / collaborator | `PartnershipsService` | Single canonical. |
| Campaign CRUD | `CampaignsService` | Single canonical. |
| Campaign send (e-mail) | `EmailMarketingService` | Single canonical. |
| Campaign send (TikTok) | `TiktokMarketingService` | Single canonical. |
| Autopilot tick / executor | `AutopilotCycleExecutorService` | Single canonical (`AutopilotCycleService` is the wrapping coordinator; the executor is the kernel). |
| Autopilot ops handoff | `AutopilotOpsService` | Single canonical. |
| LLM streaming reply | `KloelThinkerService` | Single canonical SSE think loop. |
| AI reply generation | `KloelReplyEngineService` | Single canonical reply engine. |
| Tool dispatch | `KloelToolDispatcherService` | Single canonical (35 deps, watchlist). |
| Guest / public chat | `GuestChatService` | Single canonical (30 deps, watchlist). |
| Conversational onboarding | `ConversationalOnboardingService` | Single canonical (34 deps, watchlist). |
| Mind tick (perceive → decide) | `MindService` | Single canonical. |
| Mind capability registry | `MindCapabilityRegistry` (via `MindRuntime`) | Single canonical. |
| Mind capability execution | `MindCapabilityExecutor` | Single canonical. |
| Mind event spine | `MindEventSpine` | Append-only outbox — never mutate existing rows. |
| CIA surface | `CiaService` | Single canonical. |
| Unified agent action surface | `UnifiedAgentActionsService` | Delegates to per-area `UnifiedAgentActions*` services. |
| Analytics dashboard stats | `AnalyticsService` | Cache-wrapped. |
| Dashboard aggregator | `DashboardService` | Single canonical. |
| Reports facade | `ReportsService` | Delegates to `reports-orders` / `reports-affiliate`. |
| BullMQ queue stats | `QueueStatsService` | Single canonical. |
| Billing (Stripe subscription) | `BillingService` | Single canonical (`stripe.service.ts` is the SDK adapter, not a peer). |
| Webhook fan-out | `WebhooksService` | Single canonical. |
| KYC profile + document | `KycService` | Single canonical. |
| GDPR export/delete | `GdprService` | Single canonical. |
| Notifications (FCM + persist) | `NotificationsService` | Single canonical. |
| Health probes | `SystemHealthService` (readiness) + `HealthService` (queue/db/redis aggregate) | Two canonical surfaces — DO NOT collapse, they serve different probe contracts. |
| Ops critical-error alert | `OpsAlertService` | Single canonical — every `@Optional` injection across the codebase routes here. |
| Audit log write | `AuditService` | Single canonical. |
| Idempotency gate | `IdempotencyGuard` | Single canonical (request-level); ledger has its own idempotent keys at row level. |

---

## Anti-pattern Watchlist

### Services with LOC > 500 (verified)

These services have crossed the "split me" threshold per the Big Tech Level rule (rule §1). They should be decomposed into focused sub-services as the Canonicalization Mission progresses.

| Service | LOC | File | Reason at-risk |
|---|---:|---|---|
| `GuestChatService` | 599 | `backend/src/kloel/guest-chat.service.ts` | Also 30 deps — see below |
| `KloelReplyEngineService` | 598 | `backend/src/kloel/kloel-reply-engine.service.ts` | 33 deps — fan-out into mind/spine |
| `KloelToolDispatcherService` | 595 | `backend/src/kloel/kloel-tool-dispatcher.service.ts` | 35 deps — split per tool family |
| `ConversationalOnboardingService` | 584 | `backend/src/kloel/conversational-onboarding.service.ts` | 34 deps — onboarding state should split from mind/spine fan-out |
| `KloelThinkerService` | 571 | `backend/src/kloel/kloel-thinker.service.ts` | Streaming SSE loop tangled with composer/budget |
| `CheckoutService` | 559 | `backend/src/checkout/checkout.service.ts` | Facade with too many `Parameters<>` re-delegations |
| `MindCapabilityExecutor` | 538 | `backend/src/kloel/mind/coordination/mind-capability-executor.service.ts` | Executor + memory projector merged |
| `UnifiedAgentActionsCrmService` | 528 | `backend/src/kloel/unified-agent-actions-crm.service.ts` | CRM action surface too broad |
| `WalletService` (kloel/) | 524 | `backend/src/kloel/wallet.service.ts` | Parallel to `wallet/wallet.service.ts` — see canonical reconcile |
| `LedgerService` | 522 | `backend/src/payments/ledger/ledger.service.ts` | Core financial primitive — borderline acceptable but split helper kernels recommended |
| `WalletService` (wallet/) | 517 | `backend/src/wallet/wallet.service.ts` | Provider-router knobs mixed with kernel — split provider arms |
| `AgentAssistService` | 512 | `backend/src/kloel/mind/knowledge/agent-assist.service.ts` | Knowledge + assist merged |

### Services with > 10 constructor dependencies (verified)

Constructor deps were counted via `awk '/constructor\s*\(/,/\)\s*\{/' | grep -c 'private\|@Inject\|@Optional'`. Anything above ~10 indicates a missing facade or god-service.

| Service | Constructor entries | File |
|---|---:|---|
| `KloelToolDispatcherService` | 35 | `backend/src/kloel/kloel-tool-dispatcher.service.ts` |
| `ConversationalOnboardingService` | 34 | `backend/src/kloel/conversational-onboarding.service.ts` |
| `KloelReplyEngineService` | 33 | `backend/src/kloel/kloel-reply-engine.service.ts` |
| `GuestChatService` | 30 | `backend/src/kloel/guest-chat.service.ts` |
| `AppleAuthService` | 25 | `backend/src/auth/apple-auth.service.ts` |
| `VTierCertifierService` | 24 | `backend/src/kloel/v-tier/v-tier-certifier.service.ts` |
| `WhatsappService` | 22 | `backend/src/marketing/channels/whatsapp/whatsapp.service.ts` |
| `InboundProcessorService` | 20 | `backend/src/marketing/channels/whatsapp/inbound-processor.service.ts` |
| `AgentRuntimeJobRunner` | 19 | `backend/src/kloel/agent-runtime/agent-runtime.job-runner.ts` |
| `CheckoutPaymentService` | 19 | `backend/src/checkout/checkout-payment.service.ts` |
| `MindConsciousnessService` | 18 | `backend/src/kloel/mind/consciousness/mind-consciousness.service.ts` |
| `AuthService` | 18 | `backend/src/auth/auth.service.ts` |
| `MindEventProcessorService` | 17 | `backend/src/kloel/mind/runtime/mind-event-processor.service.ts` |
| `AdsSyncProcessor` | 17 | `backend/src/integrations/ads-sync.processor.ts` |
| `WhatsappMessageDispatcherService` | 16 | `backend/src/marketing/channels/whatsapp/whatsapp-message-dispatcher.service.ts` |
| `OmnichannelService` | 16 | `backend/src/inbox/omnichannel.service.ts` |
| `AutopilotCycleService` | 16 | `backend/src/autopilot/autopilot-cycle.service.ts` |
| `MailboxMicrosoftOauthService` | 15 | `backend/src/marketing/mailbox-microsoft-oauth.service.ts` |
| `GoogleAdsMarketingService` | 15 | `backend/src/marketing/google-ads-marketing.service.ts` |
| `WhatsappReconcilerService` | 15 | `backend/src/marketing/channels/whatsapp/whatsapp-reconciler.service.ts` |
| `WhatsappCatchupOrchestratorService` | 15 | `backend/src/marketing/channels/whatsapp/whatsapp-catchup-orchestrator.service.ts` |
| `AutopilotCycleExecutorService` | 15 | `backend/src/autopilot/autopilot-cycle-executor.service.ts` |
| `UnifiedAgentService` | 14 | `backend/src/kloel/unified-agent.service.ts` |
| `KloelToolExecutorService` | 14 | `backend/src/kloel/kloel-tool-executor.service.ts` |
| `ChannelTransportProviders` | 14 | `backend/src/kloel/channel-transport.providers.ts` |
| `CheckoutSocialRecoveryService` | 14 | `backend/src/checkout/checkout-social-recovery.service.ts` |
| `AdminChatService` | 14 | `backend/src/admin/chat/admin-chat.service.ts` |
| `KloelService` | 13 | `backend/src/kloel/kloel.service.ts` |
| `AgentRuntimeMemoryManager` | 13 | `backend/src/kloel/agent-runtime/agent-runtime.memory-manager.ts` |
| `SalesService` | 12 | `backend/src/sales/sales.service.ts` |

Notes on these counts: `@Optional()` injections (heavy in `kloel/` "mind" services) are still counted — they create implicit fan-out coupling even when DI permits a `null` resolve, so they belong on the watchlist for canonicalization.

### Cross-cutting risks (call out separately)

- **Two `WalletService` classes**: `backend/src/wallet/wallet.service.ts` (517 LOC, prepaid wallet) and `backend/src/kloel/wallet.service.ts` (524 LOC, kloel-tier sales). Their `wallet` name collision is a canonicalization debt — `DEPRECATION_MAP.md` must specify the merge or the rename.
- **`PaymentService` (`backend/src/kloel/payment.service.ts`, 451 LOC) vs `CheckoutPaymentService`**: kloel-tier `PaymentService` keeps a legacy facade; canonical for new code is `CheckoutPaymentService` plus the per-provider charge services.
- **`AppleAuthService` 25 deps** is a clear outlier in the auth slice — every other provider service is < 5 deps. Owner should audit whether feature flags or guard chains have been smuggled into the DI list.
- **`forwardRef()` density** in `kloel/` and `marketing/channels/whatsapp/` (InboundProcessorService ↔ InboxService ↔ WhatsappService ↔ UnifiedAgentService) indicates circular module wiring; documented for cleanup in a future canonicalization batch.

---

## Sources & methodology

- Total count: `rg -l '@Injectable\(\)' backend/src --type ts | wc -l` → **606**.
- Per-folder counts: same command grouped by `awk -F/` of the path's `src/<dir>/` segment.
- LOC: `wc -l <file>` on each service file individually (no estimation).
- Constructor dep count: `awk '/constructor\s*\(/,/\)\s*\{/' <file> | grep -c 'private\|@Inject\|@Optional'`.
- Canonical-service mapping cross-referenced against `docs/architecture/CAPABILITY_MAP.md`, `docs/architecture/DEPRECATION_MAP.md`, and `docs/adr/0001-whatsapp-source-of-truth.md`.

This catalog is a snapshot taken on the canonicalization branch and must be re-run when any of the watchlist services are decomposed.
