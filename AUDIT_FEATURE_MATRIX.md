# KLOEL — AUDIT FEATURE MATRIX

> Updated: 2026-04-02 | Status: PARTIAL | Score: 67% | BREAKS: 446 | MODULES(resolved): 33

## Resolved Module Map

| Module            | Kind        | State    | Critical | Resolution | Pages | Routes                           | Source        |
| ----------------- | ----------- | -------- | -------- | ---------- | ----- | -------------------------------- | ------------- |
| **Account**       | USER_FACING | PARTIAL  | NO       | DERIVED    | 1     | account                          | CODEBASE      |
| **Ads**           | USER_FACING | PARTIAL  | NO       | MATCHED    | 6     | anuncios                         | Anuncios/Ads  |
| **Analytics**     | USER_FACING | PARTIAL  | NO       | MATCHED    | 2     | analytics, metrics               | Analytics     |
| **Auth**          | USER_FACING | READY    | YES      | MATCHED    | 2     | login, register                  | Auth          |
| **Autopilot**     | USER_FACING | PARTIAL  | YES      | MATCHED    | 1     | autopilot                        | Autopilot     |
| **Billing**       | USER_FACING | PARTIAL  | YES      | MATCHED    | 2     | billing, pricing                 | Billing       |
| **Campaigns**     | USER_FACING | PARTIAL  | NO       | MATCHED    | 1     | campaigns                        | Campaigns     |
| **Canvas**        | USER_FACING | PARTIAL  | NO       | DERIVED    | 5     | canvas                           | CODEBASE      |
| **Chat**          | USER_FACING | PARTIAL  | YES      | MATCHED    | 1     | chat                             | Inbox/Chat    |
| **Checkout**      | USER_FACING | PARTIAL  | YES      | MATCHED    | 9     | checkout, order, pay, preview, r | Checkout      |
| **CIA/Agent**     | USER_FACING | READY    | YES      | MATCHED    | 1     | cia                              | CIA/Agent     |
| **CRM/Leads**     | USER_FACING | PARTIAL  | NO       | MATCHED    | 1     | leads                            | CRM           |
| **Dashboard**     | USER_FACING | PARTIAL  | NO       | MATCHED    | 1     | dashboard                        | Dashboard     |
| **E2E/Internal**  | INTERNAL    | INTERNAL | NO       | DERIVED    | 2     | e2e                              | CODEBASE      |
| **Flows**         | USER_FACING | READY    | YES      | MATCHED    | 2     | flow, funnels                    | Flows         |
| **Followups**     | USER_FACING | PARTIAL  | NO       | MATCHED    | 1     | followups                        | Followups     |
| **Inbox/Chat**    | USER_FACING | PARTIAL  | YES      | MATCHED    | 1     | inbox                            | Inbox/Chat    |
| **Marketing**     | USER_FACING | PARTIAL  | NO       | MATCHED    | 6     | marketing                        | Marketing     |
| **Misc**          | USER_FACING | PARTIAL  | NO       | DERIVED    | 2     | reset-password, verify-email     | CODEBASE      |
| **Onboarding**    | USER_FACING | PARTIAL  | NO       | MATCHED    | 2     | onboarding, onboarding-chat      | Onboarding    |
| **Partnerships**  | USER_FACING | READY    | NO       | MATCHED    | 4     | parcerias                        | Partnerships  |
| **Payments**      | USER_FACING | PARTIAL  | NO       | DERIVED    | 1     | payments                         | CODEBASE      |
| **Products**      | USER_FACING | READY    | YES      | MATCHED    | 7     | products, produtos               | Products      |
| **Public Web**    | USER_FACING | READY    | NO       | DERIVED    | 5     | /, privacy, terms                | CODEBASE      |
| **Sales**         | USER_FACING | READY    | NO       | MATCHED    | 6     | sales, vendas                    | Sales/Vendas  |
| **Scrapers**      | USER_FACING | PARTIAL  | NO       | MATCHED    | 1     | scrapers                         | Scrapers      |
| **Settings**      | USER_FACING | READY    | NO       | MATCHED    | 1     | settings                         | Settings      |
| **Sites**         | USER_FACING | READY    | NO       | DERIVED    | 7     | sites                            | Public API    |
| **Tools**         | USER_FACING | PARTIAL  | NO       | DERIVED    | 9     | ferramentas, tools               | Launch        |
| **Video/Voice**   | USER_FACING | PARTIAL  | NO       | MATCHED    | 1     | video                            | Video/Voice   |
| **Wallet**        | USER_FACING | PARTIAL  | YES      | MATCHED    | 6     | carteira                         | Wallet        |
| **Webinars**      | USER_FACING | READY    | NO       | DERIVED    | 1     | webinarios                       | Webinarios    |
| **WhatsApp Core** | USER_FACING | READY    | YES      | MATCHED    | 1     | whatsapp                         | WhatsApp Core |

## Resolved Flow Groups

| Flow Group                               | Kind              | Resolution | Critical | Members | Module Scope                                                 | Matched Spec          |
| ---------------------------------------- | ----------------- | ---------- | -------- | ------- | ------------------------------------------------------------ | --------------------- |
| ads-ad-rules-management                  | FEATURE_FLOW      | GROUPED    | YES      | 3       | Ads                                                          | —                     |
| analytics-billing-checkout-management    | FEATURE_FLOW      | GROUPED    | NO       | 1       | Analytics                                                    | —                     |
| analytics-reports-send-email-send        | FEATURE_FLOW      | MATCHED    | YES      | 1       | Analytics                                                    | whatsapp-message-send |
| autopilot-runtime-management             | FEATURE_FLOW      | GROUPED    | YES      | 7       | Autopilot                                                    | —                     |
| canvas-generation                        | FEATURE_FLOW      | GROUPED    | NO       | 1       | Canvas                                                       | —                     |
| canvas-products-management               | FEATURE_FLOW      | GROUPED    | NO       | 1       | Canvas                                                       | —                     |
| canvas-workspace-me-management           | FEATURE_FLOW      | GROUPED    | NO       | 1       | Canvas                                                       | —                     |
| flows-execution-management               | FEATURE_FLOW      | GROUPED    | YES      | 1       | Flows                                                        | —                     |
| flows-products-management                | FEATURE_FLOW      | GROUPED    | YES      | 1       | Flows                                                        | —                     |
| inbox-conversations-close-management     | FEATURE_FLOW      | GROUPED    | YES      | 1       | Inbox/Chat                                                   | —                     |
| partnerships-affiliate-discovery         | FEATURE_FLOW      | GROUPED    | NO       | 1       | Partnerships                                                 | —                     |
| products-crm-pipelines-management        | FEATURE_FLOW      | GROUPED    | YES      | 1       | Products                                                     | —                     |
| products-memory-save                     | FEATURE_FLOW      | GROUPED    | YES      | 1       | Products                                                     | —                     |
| products-payments-report-management      | FEATURE_FLOW      | GROUPED    | YES      | 1       | Products                                                     | —                     |
| products-product-management              | FEATURE_FLOW      | MATCHED    | YES      | 9       | Products                                                     | product-create        |
| products-think-sync                      | FEATURE_FLOW      | GROUPED    | YES      | 1       | Products                                                     | —                     |
| public-video-create-management           | FEATURE_FLOW      | GROUPED    | YES      | 1       | Public Web                                                   | —                     |
| sales-crm-contacts-management            | FEATURE_FLOW      | GROUPED    | YES      | 1       | Sales                                                        | —                     |
| sales-workspace-me-management            | FEATURE_FLOW      | GROUPED    | NO       | 1       | Sales                                                        | —                     |
| settings-crm-contacts-management         | FEATURE_FLOW      | GROUPED    | YES      | 1       | Settings                                                     | —                     |
| settings-products-management             | FEATURE_FLOW      | GROUPED    | NO       | 1       | Settings                                                     | —                     |
| settings-team-management                 | FEATURE_FLOW      | GROUPED    | NO       | 1       | Settings                                                     | —                     |
| settings-think-sync                      | FEATURE_FLOW      | GROUPED    | YES      | 1       | Settings                                                     | —                     |
| settings-workspace-channels-management   | FEATURE_FLOW      | GROUPED    | NO       | 1       | Settings                                                     | —                     |
| shared-auth-oauth                        | SHARED_CAPABILITY | MATCHED    | YES      | 9       | CRM/Leads, Canvas, Flows, Inbox/Chat, Marketing, Products... | auth-login            |
| shared-auth-recovery                     | SHARED_CAPABILITY | MATCHED    | YES      | 7       | Analytics, Auth, Marketing, Products, Public Web, Setting... | auth-login            |
| shared-billing-payment-method-management | SHARED_CAPABILITY | GROUPED    | YES      | 5       | Autopilot, Marketing, Partnerships, Settings                 | —                     |
| shared-campaign-execution                | SHARED_CAPABILITY | GROUPED    | NO       | 3       | Ads, Marketing, Sales                                        | —                     |
| shared-crm-contact-management            | SHARED_CAPABILITY | GROUPED    | YES      | 6       | Marketing, Products, Sales, Scrapers, Tools, Video/Voice     | —                     |
| shared-crm-deal-management               | SHARED_CAPABILITY | GROUPED    | YES      | 23      | CIA/Agent, CRM/Leads, Canvas, Checkout, Flows, Followups,... | —                     |
| shared-kyc-management                    | SHARED_CAPABILITY | GROUPED    | NO       | 4       | Canvas, Settings                                             | —                     |
| shared-member-area-management            | SHARED_CAPABILITY | GROUPED    | YES      | 10      | Canvas, Flows, Followups, Products, Settings, Webinars       | —                     |
| shared-member-area-student-management    | SHARED_CAPABILITY | GROUPED    | YES      | 7       | Checkout, Products, Public Web, Settings                     | —                     |
| shared-message-send                      | SHARED_CAPABILITY | MATCHED    | YES      | 6       | Canvas, Checkout, Dashboard, Inbox/Chat, Marketing, Onboa... | whatsapp-message-send |
| shared-payment-creation                  | SHARED_CAPABILITY | MATCHED    | YES      | 2       | Sales, Video/Voice                                           | checkout-payment      |
| shared-provider-connection-management    | SHARED_CAPABILITY | GROUPED    | NO       | 1       | Settings                                                     | —                     |
| shared-voice-generation                  | SHARED_CAPABILITY | GROUPED    | NO       | 3       | Sales, Video/Voice                                           | —                     |
| shared-whatsapp-session-management       | SHARED_CAPABILITY | GROUPED    | YES      | 8       | Ads, Partnerships, Products, Sales, Scrapers, Settings, V... | —                     |
| sites-crm-pipelines-management           | FEATURE_FLOW      | GROUPED    | YES      | 1       | Sites                                                        | —                     |
| sites-site-management                    | FEATURE_FLOW      | GROUPED    | YES      | 5       | Sites                                                        | —                     |
| ... 6 more                               | —                 | —          | —        | —       | —                                                            | —                     |

## Resolution Gaps

- Unresolved modules: 0
- Unresolved flow groups: 0
- Orphan manual modules: 0
- Legacy manual modules: 13
- Orphan flow specs: 0
- Shared capability groups: 14
- Legacy-noise flow groups: 0

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

| Gate                  | Status | Failure Class   |
| --------------------- | ------ | --------------- |
| scopeClosed           | PASS   | —               |
| adapterSupported      | PASS   | —               |
| specComplete          | PASS   | —               |
| truthExtractionPass   | PASS   | —               |
| staticPass            | FAIL   | product_failure |
| runtimePass           | PASS   | —               |
| browserPass           | FAIL   | product_failure |
| flowPass              | PASS   | —               |
| invariantPass         | PASS   | —               |
| securityPass          | FAIL   | product_failure |
| isolationPass         | PASS   | —               |
| recoveryPass          | PASS   | —               |
| performancePass       | PASS   | —               |
| observabilityPass     | PASS   | —               |
| customerPass          | FAIL   | product_failure |
| operatorPass          | FAIL   | product_failure |
| adminPass             | FAIL   | product_failure |
| soakPass              | FAIL   | product_failure |
| syntheticCoveragePass | PASS   | —               |
| evidenceFresh         | PASS   | —               |
| pulseSelfTrustPass    | PASS   | —               |

## Summary

- READY modules: 11
- PARTIAL modules: 21
- SHELL_ONLY modules: 0
- MOCKED modules: 0
- BROKEN modules: 0
- INTERNAL modules: 1
- Resolved modules: 33
- Resolved flow groups: 46
- Unresolved modules: 0
- Unresolved flow groups: 0
- Shared capability groups: 14
- Grouped semantic flow groups: 39
- Legacy manual modules: 13
- Total breaks: 446
- Certification status: PARTIAL
- Human replacement status: NOT_READY
