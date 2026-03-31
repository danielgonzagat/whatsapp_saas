# KLOEL — AUDIT FEATURE MATRIX

> Updated: 2026-03-31 | PULSE: 96% | ROUTE_NO_CALLER: 88

## Module Status

| Domain | State | Routes Connected | Routes Remaining | Notes |
|--------|-------|-----------------|------------------|-------|
| **Auth** | READY | 95% | send-verification | Pre-existing, functional |
| **CIA/Agent** | READY | 90% | agent/process, simulate (internal) | Advanced panels added to CIA page |
| **Autopilot** | READY | 95% | process (internal) | Money machine, ask, send, runtime-config wired |
| **WhatsApp Core** | READY | 90% | send/:phone, incoming (internal) | Session mgmt + catalog panels added |
| **Inbox/Chat** | READY | 100% | — | Fully connected |
| **Checkout** | READY | 85% | public routes (server-side) | Pixels, orders, bumps, upsells wired |
| **Billing** | READY | 100% | — | Fully connected |
| **Wallet** | READY | 90% | — | Bank accounts CRUD wired |
| **Sales/Vendas** | READY | 90% | sales/:id | Alerts + returns wired |
| **Products** | READY | 95% | import | All tabs connected |
| **CRM** | READY | 85% | — | Neuro AI features wired to contact drawer |
| **Dashboard** | READY | 90% | — | Real data |
| **Analytics** | READY | 85% | — | Smart-time, stats, flow analytics wired |
| **Reports** | READY | 90% | ad-spend, send-email | buildUrl hooks, NPS wired |
| **Flows** | READY | 90% | — | Templates + AI optimizer wired |
| **Partnerships** | READY | 85% | affiliates/:id/performance | Affiliate links, AI search, suggest wired |
| **Member Area** | READY | 95% | — | Students API wired |
| **Campaigns** | READY | 85% | — | Mass-send wired |
| **Marketing** | PARTIAL | 70% | channels | Channel selector needs wiring |
| **Anuncios/Ads** | PARTIAL | 60% | Most Meta routes | Campaign toggle wired, needs setup state |
| **KYC** | READY | 80% | auto-check, approve (admin) | KYC mutations via kycMutation wrapper |
| **Settings** | READY | 90% | — | Team section added to ContaView |
| **Pipeline** | READY | 100% | — | Stages + deals wired to VendasView |
| **Followups** | READY | 80% | followups (detection gap) | API functions added |
| **Onboarding** | PARTIAL | 50% | 3 routes (conversational) | Needs streaming chat wiring |
| **Sites/Canvas** | PARTIAL | 60% | — | Basic CRUD works, editor needs verification |
| **Funnels** | SHELL_ONLY | 0% | — | No backend |
| **Webinarios** | PARTIAL | 40% | PUT/DELETE webinars | Create works, update/delete need wiring |
| **Scrapers** | PARTIAL | 40% | jobs, import | Basic list works |
| **Video/Voice** | SHELL_ONLY | 0% | create, profiles, generate | Backend exists, no frontend consumer |
| **MercadoPago** | SHELL_ONLY | 0% | 8 routes | Full payment gateway, needs settings page |
| **Diagnostics** | INTERNAL | N/A | 5 routes | Admin/ops only |
| **Ops Queues** | INTERNAL | N/A | 5 routes | Admin/ops only |
| **Audio** | INTERNAL | N/A | 5 routes | Worker-only |
| **PDF Processor** | INTERNAL | N/A | 2 routes | Worker-only |
| **Copilot** | INTERNAL | N/A | 2 routes | Internal AI helper |
| **Public API** | INTERNAL | N/A | 1 route | External API |
| **Onboarding Legacy** | DEPRECATED | N/A | 3 routes | Replaced by conversational |

## Legend
- **READY**: Core functionality connected, real data flows
- **PARTIAL**: Some features connected, some remaining
- **SHELL_ONLY**: UI exists but no API connections
- **INTERNAL**: Backend-only routes, not meant for frontend
- **DEPRECATED**: Legacy code, should be removed
