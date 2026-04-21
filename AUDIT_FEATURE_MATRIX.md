# KLOEL — AUDIT FEATURE MATRIX

> Updated: 2026-04-21 | Status: CERTIFIED | Score: 63% | BREAKS: 1454 | MODULES(resolved): 33

## Resolved Module Map

| Module | Kind | State | Critical | Resolution | Pages | Routes | Source |
|--------|------|-------|----------|------------|-------|--------|--------|
| **Account** | USER_FACING | PARTIAL | NO | DERIVED | 1 | account | CODEBASE |
| **Ads** | USER_FACING | PARTIAL | NO | MATCHED | 6 | anuncios | Anuncios/Ads |
| **Analytics** | USER_FACING | PARTIAL | NO | MATCHED | 2 | analytics, metrics | Analytics |
| **Auth** | USER_FACING | READY | YES | MATCHED | 2 | login, register | Auth |
| **Autopilot** | USER_FACING | PARTIAL | YES | MATCHED | 1 | autopilot | Autopilot |
| **Billing** | USER_FACING | PARTIAL | YES | MATCHED | 2 | billing, pricing | Billing |
| **Campaigns** | USER_FACING | PARTIAL | NO | MATCHED | 1 | campaigns | Campaigns |
| **Canvas** | USER_FACING | PARTIAL | NO | DERIVED | 5 | canvas | CODEBASE |
| **Chat** | USER_FACING | PARTIAL | YES | MATCHED | 1 | chat | Inbox/Chat |
| **Checkout** | USER_FACING | PARTIAL | YES | MATCHED | 9 | checkout, order, pay, preview, r | Checkout |
| **CIA/Agent** | USER_FACING | READY | YES | MATCHED | 1 | cia | CIA/Agent |
| **CRM/Leads** | USER_FACING | PARTIAL | NO | MATCHED | 1 | leads | CRM |
| **Dashboard** | USER_FACING | PARTIAL | NO | MATCHED | 1 | dashboard | Dashboard |
| **E2E/Internal** | INTERNAL | INTERNAL | NO | DERIVED | 2 | e2e | CODEBASE |
| **Flows** | USER_FACING | READY | YES | MATCHED | 2 | flow, funnels | Flows |
| **Followups** | USER_FACING | MOCKED | NO | MATCHED | 1 | followups | Followups |
| **Inbox/Chat** | USER_FACING | PARTIAL | YES | MATCHED | 1 | inbox | Inbox/Chat |
| **Marketing** | USER_FACING | PARTIAL | NO | MATCHED | 6 | marketing | Marketing |
| **Misc** | USER_FACING | SHELL_ONLY | NO | DERIVED | 7 | cookies, data-deletion, magic-link, reset-password, verify-email | CODEBASE |
| **Onboarding** | USER_FACING | PARTIAL | NO | MATCHED | 2 | onboarding, onboarding-chat | Onboarding |
| **Partnerships** | USER_FACING | READY | NO | MATCHED | 4 | parcerias | Partnerships |
| **Payments** | USER_FACING | PARTIAL | NO | DERIVED | 1 | payments | CODEBASE |
| **Products** | USER_FACING | PARTIAL | YES | MATCHED | 7 | products, produtos | Products |
| **Public Web** | USER_FACING | SHELL_ONLY | NO | DERIVED | 5 | /, privacy, terms | CODEBASE |
| **Sales** | USER_FACING | READY | NO | MATCHED | 6 | sales, vendas | Sales/Vendas |
| **Scrapers** | USER_FACING | PARTIAL | NO | MATCHED | 1 | scrapers | Scrapers |
| **Settings** | USER_FACING | READY | NO | MATCHED | 1 | settings | Settings |
| **Sites** | USER_FACING | READY | NO | DERIVED | 7 | sites | Public API |
| **Tools** | USER_FACING | PARTIAL | NO | DERIVED | 9 | ferramentas, tools | Launch |
| **Video/Voice** | USER_FACING | PARTIAL | NO | MATCHED | 1 | video | Video/Voice |
| **Wallet** | USER_FACING | PARTIAL | YES | MATCHED | 6 | carteira | Wallet |
| **Webinars** | USER_FACING | READY | NO | DERIVED | 1 | webinarios | Webinarios |
| **WhatsApp Core** | USER_FACING | READY | YES | MATCHED | 1 | whatsapp | WhatsApp Core |

## Resolved Flow Groups

| Flow Group | Kind | Resolution | Critical | Members | Module Scope | Matched Spec |
|------------|------|------------|----------|---------|--------------|--------------|
| ads-ad-rules-management | FEATURE_FLOW | GROUPED | YES | 3 | Ads | — |
| analytics-reports-send-email-send | FEATURE_FLOW | MATCHED | YES | 1 | Analytics | whatsapp-message-send |
| autopilot-runtime-management | FEATURE_FLOW | GROUPED | YES | 7 | Autopilot | — |
| canvas-auth-magic-link-management | FEATURE_FLOW | GROUPED | NO | 1 | Canvas | — |
| canvas-generation | SHARED_CAPABILITY | GROUPED | NO | 0 | Canvas | — |
| canvas-workspace-me-management | FEATURE_FLOW | GROUPED | NO | 1 | Canvas | — |
| chat-growth-money-machine-management | FEATURE_FLOW | GROUPED | YES | 1 | Chat | — |
| crm-auth-magic-link-management | FEATURE_FLOW | GROUPED | NO | 1 | CRM/Leads | — |
| flows-auth-magic-link-management | FEATURE_FLOW | GROUPED | YES | 1 | Flows | — |
| flows-cookie-consent-management | FEATURE_FLOW | GROUPED | YES | 1 | Flows | — |
| flows-execution-management | SHARED_CAPABILITY | GROUPED | YES | 0 | CRM/Leads, Campaigns, Flows, Followups | — |
| flows-products-management | FEATURE_FLOW | GROUPED | YES | 1 | Flows | — |
| inbox-auth-magic-link-management | FEATURE_FLOW | GROUPED | YES | 1 | Inbox/Chat | — |
| inbox-conversations-close-management | FEATURE_FLOW | GROUPED | YES | 1 | Inbox/Chat | — |
| inbox-conversations-messages-management | FEATURE_FLOW | GROUPED | YES | 1 | Inbox/Chat | — |
| legacy-auth-magic-link-request-create | LEGACY_NOISE | MATCHED | YES | 1 | Auth | auth-login |
| marketing-auth-magic-link-management | FEATURE_FLOW | GROUPED | NO | 1 | Marketing | — |
| marketing-cookie-consent-management | FEATURE_FLOW | GROUPED | NO | 1 | Marketing | — |
| marketing-inbox-conversations-management | FEATURE_FLOW | GROUPED | NO | 2 | Marketing | — |
| misc-growth-money-machine-management | FEATURE_FLOW | GROUPED | NO | 1 | Misc | — |
| partnerships-affiliate-discovery | FEATURE_FLOW | GROUPED | NO | 1 | Partnerships | — |
| products-auth-magic-link-management | FEATURE_FLOW | GROUPED | YES | 1 | Products | — |
| products-billing-checkout-management | FEATURE_FLOW | GROUPED | YES | 1 | Products | — |
| products-cookie-consent-management | FEATURE_FLOW | GROUPED | YES | 1 | Products | — |
| products-product-management | FEATURE_FLOW | MATCHED | YES | 11 | Products | product-create |
| products-workspace-jitter-management | FEATURE_FLOW | GROUPED | YES | 1 | Products | — |
| sales-auth-magic-link-management | FEATURE_FLOW | GROUPED | NO | 1 | Sales | — |
| sales-crm-contacts-management | FEATURE_FLOW | GROUPED | YES | 1 | Sales | — |
| settings-auth-magic-link-management | FEATURE_FLOW | GROUPED | NO | 1 | Settings | — |
| settings-cookie-consent-management | FEATURE_FLOW | GROUPED | NO | 1 | Settings | — |
| settings-crm-contacts-management | FEATURE_FLOW | GROUPED | YES | 1 | Settings | — |
| settings-team-management | FEATURE_FLOW | GROUPED | NO | 1 | Settings | — |
| settings-think-sync | FEATURE_FLOW | GROUPED | NO | 1 | Settings | — |
| settings-workspace-channels-management | FEATURE_FLOW | GROUPED | NO | 1 | Settings | — |
| shared-auth-oauth | SHARED_CAPABILITY | MATCHED | YES | 0 | Auth, Dashboard | auth-login |
| shared-auth-recovery | SHARED_CAPABILITY | GROUPED | YES | 5 | Analytics, Dashboard, Products, Settings, Tools | — |
| shared-auth-registration | SHARED_CAPABILITY | MATCHED | YES | 2 | Products, Sites | auth-login |
| shared-billing-payment-method-management | SHARED_CAPABILITY | MATCHED | YES | 7 | Auth, Autopilot, Chat, Marketing, Partnerships, Settings | auth-login |
| shared-campaign-execution | SHARED_CAPABILITY | GROUPED | NO | 1 | Ads | — |
| shared-crm-contact-management | SHARED_CAPABILITY | GROUPED | YES | 6 | Marketing, Products, Sales, Scrapers, Tools, Video/Voice | — |
| ... 15 more | — | — | — | — | — | — |

## Resolution Gaps

- Unresolved modules: 0
- Unresolved flow groups: 0
- Orphan manual modules: 0
- Legacy manual modules: 13
- Orphan flow specs: 0
- Shared capability groups: 17
- Legacy-noise flow groups: 1

## Legacy Manifest Compatibility

| Module | State | Notes |
|--------|-------|-------|
| **AI Brain** | READY | Legacy manual taxonomy entry for knowledge, sentiment, summarize, suggest and pitch surfaces. |
| **Audio** | INTERNAL | Legacy worker-only taxonomy entry. |
| **Copilot** | INTERNAL | Legacy internal AI helper taxonomy entry. |
| **Diagnostics** | INTERNAL | Legacy admin and ops taxonomy entry. |
| **KYC** | READY | Legacy compliance taxonomy entry now represented across Settings and payment-related surfaces. |
| **Launch** | READY | Legacy launcher taxonomy entry now represented inside Tools surfaces. |
| **Member Area** | READY | Legacy member area taxonomy entry now represented as shared capability flows across Products, Flows and related modules. |
| **Ops Queues** | INTERNAL | Legacy ops queue taxonomy entry. |
| **PDF Processor** | INTERNAL | Legacy worker-only PDF taxonomy entry. |
| **Pipeline** | READY | Legacy pipeline taxonomy entry now represented across CRM and Sales surfaces. |
| **Public API** | INTERNAL | Legacy external API taxonomy entry. |
| **Reports** | READY | Legacy reports taxonomy entry now represented inside Analytics and related reporting surfaces. |
| **Webinarios** | READY | Legacy spelling retained for compatibility; canonical resolved module is Webinars. |

## Certification

| Gate | Status | Failure Class |
|------|--------|---------------|
| scopeClosed | PASS | — |
| adapterSupported | PASS | — |
| specComplete | PASS | — |
| truthExtractionPass | PASS | — |
| staticPass | FAIL | product_failure |
| runtimePass | PASS | — |
| browserPass | PASS | — |
| flowPass | PASS | — |
| invariantPass | FAIL | product_failure |
| securityPass | PASS | — |
| isolationPass | PASS | — |
| recoveryPass | FAIL | product_failure |
| performancePass | PASS | — |
| observabilityPass | FAIL | product_failure |
| customerPass | PASS | — |
| operatorPass | PASS | — |
| adminPass | PASS | — |
| soakPass | PASS | — |
| syntheticCoveragePass | PASS | — |
| evidenceFresh | PASS | — |
| pulseSelfTrustPass | PASS | — |

## Summary
- READY modules: 9
- PARTIAL modules: 20
- SHELL_ONLY modules: 2
- MOCKED modules: 1
- BROKEN modules: 0
- INTERNAL modules: 1
- Resolved modules: 33
- Resolved flow groups: 55
- Unresolved modules: 0
- Unresolved flow groups: 0
- Shared capability groups: 17
- Grouped semantic flow groups: 45
- Legacy manual modules: 13
- Total breaks: 1454
- Certification status: CERTIFIED
- Human replacement status: NOT_READY