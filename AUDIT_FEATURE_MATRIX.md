# KLOEL — AUDIT FEATURE MATRIX

> Updated: 2026-04-20 | Status: PARTIAL | Score: 48% | BREAKS: 1439 | MODULES(resolved): 32

## Resolved Module Map

| Module            | Kind        | State      | Critical | Resolution | Pages | Routes                                                           | Source        |
| ----------------- | ----------- | ---------- | -------- | ---------- | ----- | ---------------------------------------------------------------- | ------------- |
| **Account**       | USER_FACING | PARTIAL    | NO       | DERIVED    | 1     | account                                                          | CODEBASE      |
| **Ads**           | USER_FACING | PARTIAL    | NO       | MATCHED    | 6     | anuncios                                                         | Anuncios/Ads  |
| **Analytics**     | USER_FACING | PARTIAL    | NO       | MATCHED    | 2     | analytics, metrics                                               | Analytics     |
| **Auth**          | USER_FACING | READY      | YES      | MATCHED    | 2     | login, register                                                  | Auth          |
| **Autopilot**     | USER_FACING | PARTIAL    | YES      | MATCHED    | 1     | autopilot                                                        | Autopilot     |
| **Billing**       | USER_FACING | PARTIAL    | YES      | MATCHED    | 2     | billing, pricing                                                 | Billing       |
| **Campaigns**     | USER_FACING | PARTIAL    | NO       | MATCHED    | 1     | campaigns                                                        | Campaigns     |
| **Canvas**        | USER_FACING | PARTIAL    | NO       | DERIVED    | 5     | canvas                                                           | CODEBASE      |
| **Chat**          | USER_FACING | PARTIAL    | YES      | MATCHED    | 1     | chat                                                             | Inbox/Chat    |
| **Checkout**      | USER_FACING | PARTIAL    | YES      | MATCHED    | 9     | checkout, order, pay, preview, r                                 | Checkout      |
| **CIA/Agent**     | USER_FACING | READY      | YES      | MATCHED    | 1     | cia                                                              | CIA/Agent     |
| **CRM/Leads**     | USER_FACING | PARTIAL    | NO       | MATCHED    | 1     | leads                                                            | CRM           |
| **Dashboard**     | USER_FACING | PARTIAL    | NO       | MATCHED    | 1     | dashboard                                                        | Dashboard     |
| **Flows**         | USER_FACING | READY      | YES      | MATCHED    | 2     | flow, funnels                                                    | Flows         |
| **Followups**     | USER_FACING | MOCKED     | NO       | MATCHED    | 1     | followups                                                        | Followups     |
| **Inbox/Chat**    | USER_FACING | PARTIAL    | YES      | MATCHED    | 1     | inbox                                                            | Inbox/Chat    |
| **Marketing**     | USER_FACING | PARTIAL    | NO       | MATCHED    | 6     | marketing                                                        | Marketing     |
| **Misc**          | USER_FACING | SHELL_ONLY | NO       | DERIVED    | 7     | cookies, data-deletion, magic-link, reset-password, verify-email | CODEBASE      |
| **Onboarding**    | USER_FACING | PARTIAL    | NO       | MATCHED    | 2     | onboarding, onboarding-chat                                      | Onboarding    |
| **Partnerships**  | USER_FACING | READY      | NO       | MATCHED    | 4     | parcerias                                                        | Partnerships  |
| **Payments**      | USER_FACING | PARTIAL    | NO       | DERIVED    | 1     | payments                                                         | CODEBASE      |
| **Products**      | USER_FACING | PARTIAL    | YES      | MATCHED    | 7     | products, produtos                                               | Products      |
| **Public Web**    | USER_FACING | SHELL_ONLY | NO       | DERIVED    | 5     | /, privacy, terms                                                | CODEBASE      |
| **Sales**         | USER_FACING | READY      | NO       | MATCHED    | 6     | sales, vendas                                                    | Sales/Vendas  |
| **Scrapers**      | USER_FACING | PARTIAL    | NO       | MATCHED    | 1     | scrapers                                                         | Scrapers      |
| **Settings**      | USER_FACING | READY      | NO       | MATCHED    | 1     | settings                                                         | Settings      |
| **Sites**         | USER_FACING | READY      | NO       | DERIVED    | 7     | sites                                                            | Public API    |
| **Tools**         | USER_FACING | PARTIAL    | NO       | DERIVED    | 9     | ferramentas, tools                                               | Launch        |
| **Video/Voice**   | USER_FACING | PARTIAL    | NO       | MATCHED    | 1     | video                                                            | Video/Voice   |
| **Wallet**        | USER_FACING | PARTIAL    | YES      | MATCHED    | 6     | carteira                                                         | Wallet        |
| **Webinars**      | USER_FACING | READY      | NO       | DERIVED    | 1     | webinarios                                                       | Webinarios    |
| **WhatsApp Core** | USER_FACING | READY      | YES      | MATCHED    | 1     | whatsapp                                                         | WhatsApp Core |

## Resolved Flow Groups

| Flow Group                               | Kind              | Resolution | Critical | Members | Module Scope                                                 | Matched Spec          |
| ---------------------------------------- | ----------------- | ---------- | -------- | ------- | ------------------------------------------------------------ | --------------------- |
| ads-ad-rules-management                  | FEATURE_FLOW      | GROUPED    | YES      | 3       | Ads                                                          | —                     |
| analytics-reports-send-email-send        | FEATURE_FLOW      | MATCHED    | YES      | 1       | Analytics                                                    | whatsapp-message-send |
| autopilot-runtime-management             | FEATURE_FLOW      | GROUPED    | YES      | 7       | Autopilot                                                    | —                     |
| canvas-auth-magic-link-management        | FEATURE_FLOW      | GROUPED    | NO       | 1       | Canvas                                                       | —                     |
| canvas-workspace-me-management           | FEATURE_FLOW      | GROUPED    | NO       | 1       | Canvas                                                       | —                     |
| chat-growth-money-machine-management     | FEATURE_FLOW      | GROUPED    | YES      | 1       | Chat                                                         | —                     |
| crm-auth-magic-link-management           | FEATURE_FLOW      | GROUPED    | NO       | 1       | CRM/Leads                                                    | —                     |
| flows-auth-magic-link-management         | FEATURE_FLOW      | GROUPED    | YES      | 1       | Flows                                                        | —                     |
| flows-cookie-consent-management          | FEATURE_FLOW      | GROUPED    | YES      | 1       | Flows                                                        | —                     |
| flows-products-management                | FEATURE_FLOW      | GROUPED    | YES      | 1       | Flows                                                        | —                     |
| inbox-auth-magic-link-management         | FEATURE_FLOW      | GROUPED    | YES      | 1       | Inbox/Chat                                                   | —                     |
| inbox-conversations-close-management     | FEATURE_FLOW      | GROUPED    | YES      | 1       | Inbox/Chat                                                   | —                     |
| inbox-conversations-messages-management  | FEATURE_FLOW      | GROUPED    | YES      | 1       | Inbox/Chat                                                   | —                     |
| legacy-auth-magic-link-request-create    | LEGACY_NOISE      | MATCHED    | YES      | 1       | Auth                                                         | auth-login            |
| marketing-auth-magic-link-management     | FEATURE_FLOW      | GROUPED    | NO       | 1       | Marketing                                                    | —                     |
| marketing-cookie-consent-management      | FEATURE_FLOW      | GROUPED    | NO       | 1       | Marketing                                                    | —                     |
| marketing-inbox-conversations-management | FEATURE_FLOW      | GROUPED    | NO       | 2       | Marketing                                                    | —                     |
| misc-growth-money-machine-management     | FEATURE_FLOW      | GROUPED    | NO       | 1       | Misc                                                         | —                     |
| partnerships-affiliate-discovery         | FEATURE_FLOW      | GROUPED    | NO       | 1       | Partnerships                                                 | —                     |
| products-auth-magic-link-management      | FEATURE_FLOW      | GROUPED    | YES      | 1       | Products                                                     | —                     |
| products-billing-checkout-management     | FEATURE_FLOW      | GROUPED    | YES      | 1       | Products                                                     | —                     |
| products-cookie-consent-management       | FEATURE_FLOW      | GROUPED    | YES      | 1       | Products                                                     | —                     |
| products-product-management              | FEATURE_FLOW      | MATCHED    | YES      | 11      | Products                                                     | product-create        |
| products-workspace-jitter-management     | FEATURE_FLOW      | GROUPED    | YES      | 1       | Products                                                     | —                     |
| sales-auth-magic-link-management         | FEATURE_FLOW      | GROUPED    | NO       | 1       | Sales                                                        | —                     |
| sales-crm-contacts-management            | FEATURE_FLOW      | GROUPED    | YES      | 1       | Sales                                                        | —                     |
| settings-auth-magic-link-management      | FEATURE_FLOW      | GROUPED    | NO       | 1       | Settings                                                     | —                     |
| settings-cookie-consent-management       | FEATURE_FLOW      | GROUPED    | NO       | 1       | Settings                                                     | —                     |
| settings-crm-contacts-management         | FEATURE_FLOW      | GROUPED    | YES      | 1       | Settings                                                     | —                     |
| settings-team-management                 | FEATURE_FLOW      | GROUPED    | NO       | 1       | Settings                                                     | —                     |
| settings-think-sync                      | FEATURE_FLOW      | GROUPED    | NO       | 1       | Settings                                                     | —                     |
| settings-workspace-channels-management   | FEATURE_FLOW      | GROUPED    | NO       | 1       | Settings                                                     | —                     |
| shared-auth-recovery                     | SHARED_CAPABILITY | GROUPED    | YES      | 5       | Analytics, Dashboard, Products, Settings, Tools              | —                     |
| shared-auth-registration                 | SHARED_CAPABILITY | MATCHED    | YES      | 2       | Products, Sites                                              | auth-login            |
| shared-billing-payment-method-management | SHARED_CAPABILITY | MATCHED    | YES      | 7       | Auth, Autopilot, Chat, Marketing, Partnerships, Settings     | auth-login            |
| shared-campaign-execution                | SHARED_CAPABILITY | GROUPED    | NO       | 1       | Ads                                                          | —                     |
| shared-crm-contact-management            | SHARED_CAPABILITY | GROUPED    | YES      | 6       | Marketing, Products, Sales, Scrapers, Tools, Video/Voice     | —                     |
| shared-crm-deal-management               | SHARED_CAPABILITY | MATCHED    | YES      | 26      | Ads, Auth, CIA/Agent, CRM/Leads, Canvas, Chat, Checkout, ... | auth-login            |
| shared-kyc-management                    | SHARED_CAPABILITY | GROUPED    | NO       | 4       | Canvas, Marketing, Settings                                  | —                     |
| shared-member-area-management            | SHARED_CAPABILITY | GROUPED    | YES      | 9       | Canvas, Chat, Products, Settings, Webinars                   | —                     |
| ... 12 more                              | —                 | —          | —        | —       | —                                                            | —                     |

## Resolution Gaps

- Unresolved modules: 0
- Unresolved flow groups: 0
- Orphan manual modules: 0
- Legacy manual modules: 13
- Orphan flow specs: 0
- Shared capability groups: 14
- Legacy-noise flow groups: 1

## Legacy Manifest Compatibility

| Module            | State    | Notes                                                                                                                    |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| **AI Brain**      | READY    | Legacy manual taxonomy entry for knowledge, sentiment, summarize, suggest and pitch surfaces.                            |
| **Audio**         | INTERNAL | Legacy worker-only taxonomy entry.                                                                                       |
| **Copilot**       | INTERNAL | Legacy internal AI helper taxonomy entry.                                                                                |
| **Diagnostics**   | INTERNAL | Legacy admin and ops taxonomy entry.                                                                                     |
| **KYC**           | READY    | Legacy compliance taxonomy entry now represented across Settings and payment-related surfaces.                           |
| **Launch**        | READY    | Legacy launcher taxonomy entry now represented inside Tools surfaces.                                                    |
| **Member Area**   | READY    | Legacy member area taxonomy entry now represented as shared capability flows across Products, Flows and related modules. |
| **Ops Queues**    | INTERNAL | Legacy ops queue taxonomy entry.                                                                                         |
| **PDF Processor** | INTERNAL | Legacy worker-only PDF taxonomy entry.                                                                                   |
| **Pipeline**      | READY    | Legacy pipeline taxonomy entry now represented across CRM and Sales surfaces.                                            |
| **Public API**    | INTERNAL | Legacy external API taxonomy entry.                                                                                      |
| **Reports**       | READY    | Legacy reports taxonomy entry now represented inside Analytics and related reporting surfaces.                           |
| **Webinarios**    | READY    | Legacy spelling retained for compatibility; canonical resolved module is Webinars.                                       |

## Certification

| Gate                  | Status | Failure Class    |
| --------------------- | ------ | ---------------- |
| scopeClosed           | PASS   | —                |
| adapterSupported      | PASS   | —                |
| specComplete          | PASS   | —                |
| truthExtractionPass   | PASS   | —                |
| staticPass            | FAIL   | product_failure  |
| runtimePass           | FAIL   | missing_evidence |
| browserPass           | PASS   | —                |
| flowPass              | PASS   | —                |
| invariantPass         | FAIL   | product_failure  |
| securityPass          | FAIL   | product_failure  |
| isolationPass         | PASS   | —                |
| recoveryPass          | FAIL   | product_failure  |
| performancePass       | FAIL   | missing_evidence |
| observabilityPass     | FAIL   | product_failure  |
| customerPass          | FAIL   | checker_gap      |
| operatorPass          | FAIL   | checker_gap      |
| adminPass             | FAIL   | missing_evidence |
| soakPass              | FAIL   | checker_gap      |
| syntheticCoveragePass | PASS   | —                |
| evidenceFresh         | PASS   | —                |
| pulseSelfTrustPass    | PASS   | —                |

## Summary

- READY modules: 9
- PARTIAL modules: 20
- SHELL_ONLY modules: 2
- MOCKED modules: 1
- BROKEN modules: 0
- INTERNAL modules: 0
- Resolved modules: 32
- Resolved flow groups: 52
- Unresolved modules: 0
- Unresolved flow groups: 0
- Shared capability groups: 14
- Grouped semantic flow groups: 43
- Legacy manual modules: 13
- Total breaks: 1439
- Certification status: PARTIAL
- Human replacement status: NOT_READY
