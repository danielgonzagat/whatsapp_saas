# KLOEL — AUDIT FEATURE MATRIX

> Updated: 2026-04-01 | Status: PARTIAL | Score: 47% | BREAKS: 958 | ROUTE_NO_CALLER: 1

## Module Status

| Domain | State | Notes |
|--------|-------|-------|
| **Auth** | READY | JWT + refresh + Google + Apple OAuth |
| **CIA/Agent** | READY | Advanced panels: approvals, work items, input sessions, proofs |
| **Autopilot** | READY | Money machine, AI insights, direct send, runtime config, segmentation |
| **WhatsApp Core** | READY | Session management, catalog, diagnostics, simulate, provider status |
| **Inbox/Chat** | READY | Fully connected |
| **Checkout** | READY | Pixels, orders, bumps, upsells, shipping, affiliate redirect |
| **Billing** | READY | Subscription, payment methods, MercadoPago + Asaas |
| **Wallet** | READY | Bank accounts CRUD, balance, transactions, withdrawals |
| **Sales/Vendas** | READY | Smart payment, alerts, returns, detail view, pipeline |
| **Products** | READY | All tabs connected, import |
| **CRM** | READY | Neuro AI features, contacts, pipeline |
| **Dashboard** | READY | Real data |
| **Analytics** | READY | Smart-time, stats, flow analytics, engagement tab |
| **Reports** | READY | All report types, ad-spend, NPS, email send |
| **Flows** | READY | Templates browser, AI optimizer |
| **Partnerships** | READY | Affiliate links, AI search, suggest, performance metrics |
| **Member Area** | READY | Students API |
| **Campaigns** | READY | Mass-send, channels |
| **Marketing** | READY | Channels connected |
| **Anuncios/Ads** | READY | Campaign toggle, ad rules edit, Meta API functions |
| **KYC** | READY | All mutations connected |
| **Settings** | READY | Team section, billing, brain settings, KB upload |
| **Pipeline** | READY | Stages + deals |
| **Followups** | READY | API functions |
| **Onboarding** | READY | Conversational onboarding API |
| **Webinarios** | READY | Edit + delete |
| **Scrapers** | READY | Create job + import results |
| **Video/Voice** | READY | Create, profiles, generate |
| **AI Brain** | READY | Sentiment, summarize, suggest, pitch, KB upload |
| **Launch** | READY | Create launcher + add groups |
| **Diagnostics** | INTERNAL | Admin/ops only |
| **Ops Queues** | INTERNAL | Admin/ops only |
| **Audio** | INTERNAL | Worker-only |
| **PDF Processor** | INTERNAL | Worker-only |
| **Copilot** | INTERNAL | Internal AI helper |
| **Public API** | INTERNAL | External API |

## Certification

| Gate | Status | Failure Class |
|------|--------|---------------|
| scopeClosed | PASS | — |
| adapterSupported | PASS | — |
| specComplete | PASS | — |
| staticPass | FAIL | product_failure |
| runtimePass | FAIL | product_failure |
| browserPass | FAIL | missing_evidence |
| flowPass | FAIL | missing_evidence |
| invariantPass | FAIL | product_failure |
| securityPass | FAIL | product_failure |
| isolationPass | PASS | — |
| recoveryPass | FAIL | product_failure |
| performancePass | PASS | — |
| observabilityPass | FAIL | product_failure |
| evidenceFresh | PASS | — |
| pulseSelfTrustPass | PASS | — |

## Summary
- READY modules: 30
- PARTIAL modules: 0
- SHELL_ONLY modules: 0
- MOCKED modules: 0
- BROKEN modules: 0
- INTERNAL modules: 6
- Total breaks: 958
- Certification status: PARTIAL