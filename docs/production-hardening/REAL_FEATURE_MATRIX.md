# Real Feature Matrix

**Generated:** 2026-04-27
**Source:** PULSE_HEALTH.json, PULSE_CAPABILITY_STATE.json, PULSE_CLI_DIRECTIVE.json

## Feature Status Legend

| Status   | Meaning                                        |
| -------- | ---------------------------------------------- |
| REAL     | Full structural chain: UI/API -> Service -> DB |
| PARTIAL  | Structure exists but missing roles or maturity |
| DISABLED | Code present but not wired or gated off        |
| PHANTOM  | Declared in manifest but no runtime code found |

## Feature Matrix

| Feature                                 | Frontend Route             | Backend Endpoint                                   | Prisma Models                          | Worker Jobs                     | Status  | Evidence Test                              | Production Risk |
| --------------------------------------- | -------------------------- | -------------------------------------------------- | -------------------------------------- | ------------------------------- | ------- | ------------------------------------------ | --------------- |
| **Authentication**                      |                            |                                                    |                                        |                                 |         |                                            |                 |
| Auth - Email Register                   | /auth/register             | POST /api/auth/register                            | Agent, Workspace, RefreshToken         | -                               | REAL    | auth.service.spec.ts                       | P1 - critical   |
| Auth - Email Login                      | /auth/login                | POST /api/auth/login                               | Agent, RefreshToken                    | -                               | REAL    | auth.service.spec.ts                       | P1 - critical   |
| Auth - OAuth (Google)                   | /auth/google               | POST /api/auth/oauth-google                        | Agent, SocialAccount                   | -                               | REAL    | auth.oauth-login.spec.ts                   | P1 - critical   |
| Auth - OAuth (Facebook)                 | /auth/facebook             | POST /api/auth/oauth-facebook                      | Agent, SocialAccount                   | -                               | REAL    | auth.oauth-login.spec.ts                   | P1 - critical   |
| Auth - OAuth (Apple)                    | /auth/apple                | POST /api/auth/oauth-apple                         | Agent, SocialAccount                   | -                               | REAL    | auth.oauth-login.spec.ts                   | P1 - critical   |
| Auth - OAuth (TikTok)                   | /auth/tiktok               | POST /api/auth/oauth-tiktok                        | Agent, SocialAccount                   | -                               | REAL    | auth.oauth-login.spec.ts                   | P1 - critical   |
| Auth - Anonymous Session                | /auth/anonymous            | POST /api/auth/anonymous                           | Agent, AnonymousSession                | -                               | REAL    | (inferred)                                 | P2 - medium     |
| Auth - Magic Link                       | /auth/magic-link           | POST /api/auth/magic-link-request/verify           | Agent, MagicLink                       | -                               | REAL    | (inferred)                                 | P1 - critical   |
| Auth - WhatsApp Verify                  | /auth/whatsapp             | POST /api/auth/whatsapp-send-code/verify           | Agent                                  | -                               | REAL    | (inferred)                                 | P1 - critical   |
| Auth - Forgot Password                  | /auth/forgot-password      | POST /api/auth/forgot-password                     | Agent, ResetToken                      | -                               | REAL    | (inferred)                                 | P1 - critical   |
| Auth - Reset Password                   | /auth/reset-password       | POST /api/auth/reset-password                      | Agent, ResetToken                      | -                               | REAL    | (inferred)                                 | P1 - critical   |
| Auth - Verify Email                     | /auth/verify-email         | POST /api/auth/verify-email                        | Agent                                  | -                               | REAL    | (inferred)                                 | P1 - critical   |
| Auth - Admin Login                      | /admin/login               | POST /admin/auth/login                             | AdminUser, AdminSession                | -                               | REAL    | admin-auth tests                           | P1 - critical   |
| Auth - Admin MFA                        | /admin/mfa                 | POST /admin/auth/mfa-\*                            | AdminUser                              | -                               | REAL    | admin-auth tests                           | P1 - critical   |
| **Billing**                             |                            |                                                    |                                        |                                 |         |                                            |                 |
| Checkout                                | /billing/checkout          | POST /billing/checkout                             | CheckoutOrder, Plan, Workspace         | -                               | REAL    | billing service specs                      | P0 - critical   |
| Subscription Status                     | /billing/subscription      | GET /billing/subscription                          | Workspace, Subscription                | -                               | REAL    | billing service specs                      | P0 - critical   |
| Payment Methods                         | /billing/payment-methods   | GET/POST/DELETE /billing/payment-methods           | PaymentMethod                          | -                               | REAL    | billing service specs                      | P0 - critical   |
| Activate Trial                          | /billing/activate-trial    | POST /billing/activate-trial                       | Workspace, Plan                        | -                               | REAL    | (inferred)                                 | P1 - high       |
| Cancel Subscription                     | /billing/cancel            | POST /billing/cancel                               | Subscription                           | -                               | REAL    | (inferred)                                 | P1 - high       |
| Usage                                   | /billing/usage             | GET /billing/usage                                 | PlanLimits, UsageRecord                | -                               | REAL    | (inferred)                                 | P1 - high       |
| Stripe Webhook                          | -                          | POST /billing/webhook                              | CheckoutOrder, Subscription, Ledger    | -                               | REAL    | payment-webhook-stripe spec                | P0 - critical   |
| **Checkout**                            |                            |                                                    |                                        |                                 |         |                                            |                 |
| Product Checkout                        | /checkout/:planId          | POST /checkout                                     | CheckoutOrder, CheckoutProduct, Plan   | -                               | REAL    | checkout service specs                     | P0 - critical   |
| Checkout Plans                          | /checkout/plans            | GET/POST /checkout/plans                           | CheckoutPlan, CheckoutProduct          | -                               | REAL    | (inferred)                                 | P0 - critical   |
| Checkout Bumps                          | /checkout/bumps            | GET/PUT /checkout/bumps                            | CheckoutBump, CheckoutProduct          | -                               | REAL    | (inferred)                                 | P1 - high       |
| Checkout Coupons                        | /checkout/coupons          | GET/POST/DELETE /checkout/coupons                  | CheckoutCoupon                         | -                               | REAL    | (inferred)                                 | P1 - high       |
| Checkout Social Recovery                | /checkout/social           | (internal service)                                 | CheckoutSocialSession                  | -                               | REAL    | (inferred)                                 | P2 - medium     |
| Checkout Pixels                         | /checkout/pixels           | (internal)                                         | CheckoutPixel                          | -                               | REAL    | (inferred)                                 | P2 - medium     |
| **Dashboard**                           |                            |                                                    |                                        |                                 |         |                                            |                 |
| Dashboard Home                          | /dashboard                 | GET /dashboard                                     | Workspace, Agent, CheckoutOrder        | -                               | REAL    | (inferred)                                 | P2 - medium     |
| Carteira (Wallet)                       | /carteira                  | GET /wallet                                        | Wallet, WalletTransaction              | -                               | REAL    | wallet service specs                       | P0 - critical   |
| Settings                                | /settings                  | GET/PUT /settings                                  | Workspace, WorkspaceSettings           | -                               | REAL    | (inferred)                                 | P2 - medium     |
| **CRM**                                 |                            |                                                    |                                        |                                 |         |                                            |                 |
| Contacts                                | /crm/contacts              | GET/POST/DELETE /crm/contacts                      | CrmContact, CrmTag                     | -                               | REAL    | (inferred)                                 | P2 - medium     |
| Deals                                   | /crm/deals                 | GET/PUT /crm/deals                                 | CrmDeal                                | -                               | REAL    | (inferred)                                 | P2 - medium     |
| Segmentation                            | /crm/segmentation          | POST /segmentation                                 | CrmContact, CrmSegment                 | -                               | REAL    | (inferred)                                 | P2 - medium     |
| **Vendas (Sales)**                      |                            |                                                    |                                        |                                 |         |                                            |                 |
| Orders                                  | /sales/orders              | GET/PUT /sales/orders                              | CheckoutOrder                          | -                               | REAL    | reports-orders service specs               | P0 - critical   |
| Subscriptions                           | /sales/subscriptions       | POST /sales/subscriptions/\*                       | Subscription                           | -                               | REAL    | (inferred)                                 | P0 - critical   |
| Refunds                                 | /sales/refunds             | POST /sales/:id/refund                             | CheckoutOrder, Refund                  | -                               | REAL    | (inferred)                                 | P0 - critical   |
| Alerts                                  | /sales/orders/alerts       | POST /sales/orders/alerts                          | OrderAlert                             | -                               | REAL    | (inferred)                                 | P2 - medium     |
| **Products**                            |                            |                                                    |                                        |                                 |         |                                            |                 |
| Product CRUD                            | /products                  | GET/POST /products                                 | Product                                | -                               | REAL    | (inferred)                                 | P1 - high       |
| Product Checkouts                       | /products/:id/checkouts    | POST /products/:id/checkouts                       | CheckoutProduct                        | -                               | REAL    | (inferred)                                 | P1 - high       |
| Product Campaigns                       | /products/:id/campaigns    | POST/DELETE /products/campaigns                    | Campaign, Product                      | -                               | REAL    | (inferred)                                 | P2 - medium     |
| Product Commissions                     | /products/:id/commissions  | GET/POST/DELETE /products/commissions              | Commission                             | -                               | REAL    | (inferred)                                 | P1 - high       |
| Product Coupons                         | /products/:id/coupons      | GET/POST/DELETE /products/coupons                  | Coupon                                 | -                               | REAL    | (inferred)                                 | P1 - high       |
| **Autopilot / AI**                      |                            |                                                    |                                        |                                 |         |                                            |                 |
| Autopilot Ask                           | /autopilot/ask             | POST /autopilot/ask                                | AutopilotSession, AutopilotAction      | autopilot-cycle                 | PARTIAL | (P1 capability - missing runtime evidence) | P1 - high       |
| Autopilot Toggle                        | /autopilot/toggle          | POST /autopilot/toggle                             | Workspace                              | -                               | REAL    | (inferred)                                 | P1 - high       |
| Autopilot Money Machine                 | /autopilot/money           | POST /autopilot/money-machine                      | AutopilotSession, Ledger               | autopilot-cycle-money           | REAL    | (inferred)                                 | P0 - critical   |
| Autopilot Send                          | /autopilot/send            | POST /autopilot/send                               | AutopilotAction, WhatsAppMessage       | autopilot-send                  | REAL    | (inferred)                                 | P1 - high       |
| Ai Assistant (Kloel)                    | /kloel/chat                | POST /kloel/onboarding/:id/chat-stream             | KloelChatSession, KloelMessage         | -                               | REAL    | kloel chat specs                           | P1 - high       |
| Agent Assist (Inbox)                    | /inbox                     | POST /inbox/conversations/:id/assist               | InboxConversation                      | -                               | REAL    | (inferred)                                 | P2 - medium     |
| **WhatsApp**                            |                            |                                                    |                                        |                                 |         |                                            |                 |
| WhatsApp Session                        | /whatsapp                  | GET /whatsapp/session                              | WhatsAppSession                        | -                               | REAL    | useWhatsAppSession hook spec               | P1 - high       |
| WhatsApp Send                           | /whatsapp                  | POST /whatsapp/api/session-action                  | WhatsAppMessage                        | -                               | REAL    | whatsapp providers spec                    | P1 - high       |
| WhatsApp Inbound                        | -                          | (internal webhook + polling)                       | WhatsAppMessage, InboxConversation     | whatsapp-catchup                | REAL    | whatsapp-catchup service spec              | P1 - high       |
| WhatsApp Watchdog                       | -                          | (cron service)                                     | WhatsAppSession                        | -                               | REAL    | (inferred)                                 | P1 - high       |
| CIA Runtime (Session Loop)              | -                          | POST /cia/\*                                       | CiaSession, CiaApproval                | cia-runtime                     | PARTIAL | (no runtime evidence)                      | P1 - high       |
| **Partnerships / Affiliates**           |                            |                                                    |                                        |                                 |         |                                            |                 |
| Affiliate Request                       | /parcerias                 | POST /affiliate/request                            | Affiliate, Product                     | -                               | REAL    | partnerships service spec                  | P1 - high       |
| Affiliate Links                         | /parcerias                 | PUT /products/:id/affiliates/links                 | AffiliateLink                          | -                               | REAL    | (inferred)                                 | P1 - high       |
| Team Invite                             | /settings/team             | POST/DELETE /team/invite/:id                       | TeamInvitation, Workspace              | -                               | REAL    | auth partner service spec                  | P1 - high       |
| Collaborator Management                 | /settings/team             | (team member CRUD)                                 | TeamMember                             | -                               | REAL    | (inferred)                                 | P2 - medium     |
| **Marketing**                           |                            |                                                    |                                        |                                 |         |                                            |                 |
| Marketing Email                         | /marketing                 | POST /marketing/connect/email                      | MarketingCampaign                      | -                               | REAL    | (inferred)                                 | P2 - medium     |
| Marketing WhatsApp                      | /marketing                 | POST /marketing/whatsapp                           | MarketingCampaign, WhatsAppSession     | -                               | REAL    | (inferred)                                 | P2 - medium     |
| Scrapers                                | /scrapers                  | GET/POST /scrapers                                 | Scraper, ScraperResult                 | -                               | REAL    | (inferred)                                 | P2 - medium     |
| **Admin**                               |                            |                                                    |                                        |                                 |         |                                            |                 |
| Admin Dashboard                         | /admin/dashboard           | GET /admin/dashboard                               | AdminUser, CheckoutOrder               | -                               | REAL    | admin dashboard query specs                | P1 - high       |
| Admin Accounts                          | /admin/contas              | GET/POST /admin/accounts                           | Workspace, Agent                       | -                               | REAL    | admin-accounts service spec                | P1 - high       |
| Admin KYC                               | /admin/contas/kyc          | GET/POST /admin/accounts/kyc                       | KycDocument, Agent                     | -                               | REAL    | admin-kyc service spec                     | P1 - high       |
| Admin Transactions                      | /admin/transactions        | GET/POST /admin/transactions                       | CheckoutOrder, WalletTransaction       | -                               | REAL    | admin-transactions spec                    | P0 - critical   |
| Admin Destructive Intents               | -                          | POST /admin/destructive-intents                    | DestructiveIntent                      | -                               | REAL    | (inferred)                                 | P1 - high       |
| Admin Support                           | /admin/support             | GET/POST /admin/support                            | AdminSupportThread                     | -                               | REAL    | (inferred)                                 | P2 - medium     |
| **Flows**                               |                            |                                                    |                                        |                                 |         |                                            |                 |
| Flow Editor                             | /flows                     | GET/POST/PUT /flows                                | Flow, FlowNode, FlowExecution          | -                               | REAL    | flow service specs                         | P2 - medium     |
| Flow Templates                          | /flows/templates           | GET/POST /flow/templates                           | FlowTemplate                           | -                               | REAL    | (inferred)                                 | P2 - medium     |
| Flow Execution                          | /flows/executions          | POST /flows/execution/:id/retry                    | FlowExecution                          | flow-executor                   | REAL    | (inferred)                                 | P1 - high       |
| **Payments / Ledger**                   |                            |                                                    |                                        |                                 |         |                                            |                 |
| Ledger                                  | -                          | (internal service)                                 | LedgerEntry, LedgerBatch               | ledger-reconciliation           | REAL    | ledger-reconciliation spec                 | P0 - critical   |
| Connect Ledger                          | -                          | (internal service)                                 | ConnectLedgerEntry                     | connect-ledger-maturation       | REAL    | connect-ledger spec                        | P0 - critical   |
| Split Payments                          | /split                     | POST /split/:workspaceId/preview                   | SplitRule, SplitPayout                 | -                               | REAL    | split controller spec                      | P0 - critical   |
| Wallet Topup                            | /wallet                    | POST /wallet/topup                                 | WalletTransaction                      | -                               | REAL    | wallet service specs                       | P0 - critical   |
| Wallet Withdraw                         | /wallet                    | POST /wallet/withdraw                              | WalletTransaction, BankAccount         | -                               | REAL    | wallet service specs                       | P0 - critical   |
| Stripe Connect Onboarding               | /settings/finance          | POST /connect/:workspaceId/accounts/:type/activate | StripeConnectAccount                   | -                               | REAL    | connect-onboarding service spec            | P0 - critical   |
| **Connect**                             |                            |                                                    |                                        |                                 |         |                                            |                 |
| Connect Payout                          | -                          | (internal service)                                 | ConnectPayout, ConnectLedgerEntry      | connect-payout                  | REAL    | connect-payout service spec                | P0 - critical   |
| Marketplace Treasury                    | -                          | (internal service)                                 | MarketplaceTreasury                    | marketplace-treasury-maturation | REAL    | marketplace-treasury spec                  | P1 - high       |
| **Media**                               |                            |                                                    |                                        |                                 |         |                                            |                 |
| Video Generation                        | /media/video               | POST /media/video                                  | MediaAsset                             | video-generation                | REAL    | (inferred)                                 | P2 - medium     |
| Voice Generation                        | /media/voice               | POST /voice/generate                               | MediaAsset                             | voice-generation                | REAL    | (inferred)                                 | P2 - medium     |
| Canvas AI                               | /canvas                    | POST /canvas/generate                              | CanvasDesign                           | -                               | REAL    | (inferred)                                 | P2 - medium     |
| **Member Areas**                        |                            |                                                    |                                        |                                 |         |                                            |                 |
| Member Areas                            | /member-areas              | GET/POST /member-areas                             | MemberArea, MemberModule, MemberLesson | -                               | REAL    | (inferred)                                 | P2 - medium     |
| Member Students                         | /member-areas/:id/students | GET/POST /member-areas/:id/students                | MemberStudent                          | -                               | REAL    | (inferred)                                 | P2 - medium     |
| **Meta Integration**                    |                            |                                                    |                                        |                                 |         |                                            |                 |
| Meta Auth Connect                       | /settings/whatsapp         | GET /meta/auth-url, POST /meta/auth-disconnect     | MetaAuth, WhatsAppSession              | -                               | REAL    | meta auth controller spec                  | P1 - high       |
| Meta Ads                                | /anuncios                  | GET/POST /meta/ads                                 | MetaAdCampaign                         | -                               | REAL    | (inferred)                                 | P2 - medium     |
| Instagram Integration                   | /inbox                     | (internal via Meta API)                            | InstagramSession                       | -                               | REAL    | (inferred)                                 | P2 - medium     |
| **KYC / Compliance**                    |                            |                                                    |                                        |                                 |         |                                            |                 |
| KYC Submit                              | /settings/kyc              | POST /kyc/status, POST /api/kyc/\*                 | KycDocument, KycVerification           | -                               | REAL    | kyc service spec                           | P1 - high       |
| KYC Bank Details                        | /settings/kyc/bank         | POST/DELETE /api/kyc/bank                          | BankAccount                            | -                               | REAL    | (inferred)                                 | P1 - high       |
| KYC Fiscal                              | /settings/kyc/fiscal       | POST/PUT /api/kyc/fiscal                           | KycFiscalData                          | -                               | REAL    | (inferred)                                 | P1 - high       |
| Compliance Deletion                     | -                          | POST /compliance/\*                                | (GDPR deletion ops)                    | -                               | REAL    | compliance controller spec                 | P1 - high       |
| **Phantom Surfaces (Not Materialized)** |                            |                                                    |                                        |                                 |         |                                            |                 |
| Pay                                     | -                          | -                                                  | -                                      | -                               | PHANTOM | -                                          | N/A             |
| Privacy                                 | -                          | -                                                  | -                                      | -                               | PHANTOM | -                                          | N/A             |
| Produtos                                | -                          | -                                                  | -                                      | -                               | PHANTOM | -                                          | N/A             |
| Terms                                   | -                          | -                                                  | -                                      | -                               | PHANTOM | -                                          | N/A             |
| Tools                                   | -                          | -                                                  | -                                      | -                               | PHANTOM | -                                          | N/A             |
| **Parity Gap**                          |                            |                                                    |                                        |                                 |         |                                            |                 |
| Marketing Skill                         | -                          | backend/src/kloel/marketing-skills/                | -                                      | -                               | PARTIAL | runtime without product surface            | P1 - high       |

## Worker Jobs

| Job Name                        | Service File                                                  | Status  | Risk          |
| ------------------------------- | ------------------------------------------------------------- | ------- | ------------- |
| autopilot-cycle                 | backend/src/autopilot/autopilot-cycle-executor.service.ts     | REAL    | P1 - high     |
| autopilot-cycle-money           | backend/src/autopilot/autopilot-cycle-money.service.ts        | REAL    | P0 - critical |
| autopilot-send                  | backend/src/autopilot (via kloel-whatsapp-tools)              | REAL    | P1 - high     |
| ledger-reconciliation           | backend/src/payments/ledger/ledger-reconciliation.service     | REAL    | P0 - critical |
| connect-ledger-maturation       | backend/src/payments/ledger/connect-ledger-maturation.service | REAL    | P0 - critical |
| connect-payout                  | backend/src/payments/connect/connect-payout.service.ts        | REAL    | P0 - critical |
| marketplace-treasury-maturation | backend/src/marketplace-treasury/                             | REAL    | P1 - high     |
| whatsapp-catchup                | backend/src/whatsapp/whatsapp-catchup.service.ts              | REAL    | P1 - high     |
| whatsapp-watchdog               | backend/src/whatsapp/whatsapp-watchdog.service.ts             | REAL    | P1 - high     |
| cia-runtime                     | backend/src/whatsapp/cia-runtime.service.ts                   | PARTIAL | P1 - high     |
| flow-executor                   | backend/src/flows (inferred)                                  | REAL    | P1 - high     |
| followup                        | backend/src/followup/followup.service.ts                      | REAL    | P2 - medium   |
| memory-processor                | worker/processors/memory-processor.ts                         | REAL    | P2 - medium   |
| prepaid-wallet-settlement       | worker/processors/prepaid-wallet-settlement.ts                | REAL    | P0 - critical |

## Key Prisma Models (Production-Critical)

| Model                | Gates                       |
| -------------------- | --------------------------- |
| Agent                | Auth, KYC, Workspace        |
| Workspace            | Multi-tenant isolation      |
| CheckoutOrder        | Billing, Sales, Ledger      |
| CheckoutProduct      | Products, Checkout          |
| CheckoutPlan         | Billing, Products           |
| Subscription         | Billing, Stripe webhook     |
| LedgerEntry          | Financial audit             |
| WalletTransaction    | Wallet, Withdrawals         |
| StripeConnectAccount | Connect onboarding, Payouts |
| KycDocument          | Compliance, Admin           |
| WhatsAppSession      | Meta auth, messaging        |
| WhatsAppMessage      | Inbox, Autopilot            |
| CrmContact           | CRM, Segmentation           |
| Flow / FlowExecution | Automation                  |
| AutopilotSession     | AI agent loops              |

## Stats Summary

| Metric                        | Value |
| ----------------------------- | ----- |
| Total Capabilities            | 311   |
| Real Capabilities             | 277   |
| Partial Capabilities          | 24    |
| Latent Capabilities           | 10    |
| Phantom Capabilities          | 0     |
| Production-Ready Capabilities | 137   |
| Real Surfaces                 | 32    |
| Phantom Surfaces              | 9     |
| Real Flows                    | 120   |
| Structural Parity Gaps        | 1     |
