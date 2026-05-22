# Frontend Main App (Next.js) — Codebase Exploration

> **Generated:** 2026-05-19  
> **App:** `frontend/` — Next.js 15 App Router  
> **Design System:** "Monitor" — Monochrome + Ember (`rgb(232, 93, 48)`)  
> **Files:** 1,286 TypeScript/TSX files in `src/`  
> **Language:** pt-BR (i18n gated via `kloelT()` shim → next-intl ready)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     Next.js App Router                           │
│                                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────────────┐ │
│  │ (public) │  │  (main)  │  │(checkout)│  │    api/          │ │
│  │ Landing, │  │ App Shell│  │ Public   │  │  Proxy routes    │ │
│  │ Auth,    │  │ Sidebar  │  │ Checkout │  │  → Railway       │ │
│  │ Legal    │  │ +Routes  │  │ Pages    │  │  Backend        │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────────────┘ │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                  components/kloel/                           ││
│  │  Design System, UI Primitives, Feature Components           ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                   lib/api/                                   ││
│  │  API client modules → fetcher (SWR-compatible)               ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                  │
│  Middleware: Subdomain routing                                   │
│  (app.kloel.com, auth.kloel.com, marketing.kloel.com,           │
│   pay.kloel.com) → shared cookie auth                           │
└──────────────────────────────────────────────────────────────────┘
```

### Provider Stack (wrapped in `AppRootEnhancers`)

```
CookieProvider → AuthProvider → SWRProvider → ConversationHistoryProvider → ToastProvider → ThemeProvider
```

All providers are `'use client'` components.

---

## 1. Route Map

### Root Layout (`layout.tsx`)
- Wraps in `<html>` with Sora + JetBrains Mono fonts
- Injects `DatadogRumRouter`, `NextIntlClientProvider` (next-intl), `AppRootEnhancers`
- Metadata: OpenGraph, Twitter cards, apple-touch-icon

### Route Groups (Next.js Route Groups)

#### `(public)/` — Public/unauthenticated routes
| Path | Page | Description |
|------|------|-------------|
| `/` | `page.tsx` | Landing page (`KloelLanding` + `FloatingChat`) |
| `/login` | `login/page.tsx` | Auth screen (login mode) |
| `/register` | `register/page.tsx` | Auth screen (register mode) |
| `/magic-link` | `magic-link/page.tsx` | Magic link handler |
| `/reset-password` | `reset-password/page.tsx` | Password reset |
| `/verify-email` | `verify-email/page.tsx` | Email verification |
| `/onboarding` | `onboarding/page.tsx` | Post-registration onboarding flow |
| `/onboarding-chat` | `onboarding-chat/page.tsx` | Chat-based onboarding |
| `/privacy` | `privacy/page.tsx` | Privacy policy (PT) |
| `/privacy/en` | `privacy/en/page.tsx` | Privacy policy (EN) |
| `/terms` | `terms/page.tsx` | Terms of service (PT) |
| `/terms/en` | `terms/en/page.tsx` | Terms of service (EN) |
| `/cookies` | `cookies/page.tsx` | Cookie policy |
| `/data-deletion` | `data-deletion/page.tsx` | Data deletion (PT) |
| `/data-deletion/en` | `data-deletion/en/page.tsx` | Data deletion (EN) |
| `/data-deletion/status/[code]` | Dynamic | GDPR deletion status |
| `/pay` | `pay/page.tsx` | Payment redirect |
| `/pay/[id]` | Dynamic | Payment page |
| `/area/[slug]` | Dynamic | Public member area |

**Layout:** `PublicLayoutShell` — applies dark background, wraps in `AuthProvider`

#### `(main)/` — Authenticated app shell
| Path | Page | Description |
|------|------|-------------|
| `/analytics` | `analytics/page.tsx` | Analytics dashboard with 16 tab views |
| `/anuncios` | `anuncios/page.tsx` | Ad management hub |
| `/anuncios/google` | | Google Ads |
| `/anuncios/meta` | | Meta Ads |
| `/anuncios/tiktok` | | TikTok Ads |
| `/anuncios/rastreamento` | | Tracking |
| `/anuncios/regras` | | AI rules |
| `/autopilot` | `autopilot/page.tsx` | AI Autopilot control center |
| `/billing` | `billing/page.tsx` | Billing management |
| `/campaigns` | `campaigns/page.tsx` | Campaigns list |
| `/canvas` | 301→`/canvas/inicio` | Canvas redirect |
| `/canvas/inicio` | | Canvas home |
| `/canvas/editor` | | Canvas editor |
| `/canvas/modelos` | | Templates |
| `/canvas/projetos` | | Projects |
| `/carteira` | `carteira/page.tsx` | Wallet overview |
| `/carteira/saldo` | | Balance |
| `/carteira/extrato` | | Statement |
| `/carteira/saques` | | Withdrawals |
| `/carteira/antecipacoes` | | Advances |
| `/carteira/movimentacoes` | | Transactions |
| `/chat` | `chat/page.tsx` | AI chat (main interface) |
| `/cia` | `cia/page.tsx` | CIA (AI agent cognitive interface) |
| `/dashboard` | `dashboard/page.tsx` | Dashboard home (KPIs + post-payment panel) |
| `/ferramentas` | `ferramentas/page.tsx` | Tools hub |
| `/ferramentas/fale` | | "Speak" tools |
| `/ferramentas/gerencie` | | "Manage" tools |
| `/ferramentas/impulsione` | | "Boost" tools |
| `/ferramentas/recupere` | | "Recover" tools |
| `/ferramentas/launchpad` | | Campaign launcher |
| `/ferramentas/ver-todas` | | All tools |
| `/flow` | `flow/page.tsx` | Visual flow builder (ReactFlow) |
| `/followups` | `followups/page.tsx` | Follow-up management |
| `/funnels` | `funnels/page.tsx` | Funnels view |
| `/inbox` | `inbox/page.tsx` | Unified inbox |
| `/leads` | `leads/page.tsx` | Lead management (list + detail) |
| `/marketing` | `marketing/page.tsx` | Marketing overview |
| `/marketing/email` | | Email marketing |
| `/marketing/facebook` | | Facebook marketing |
| `/marketing/instagram` | | Instagram marketing |
| `/marketing/tiktok` | | TikTok marketing |
| `/marketing/whatsapp` | | WhatsApp marketing |
| `/metrics` | `metrics/page.tsx` | Metrics (redirects to analytics) |
| `/parcerias` | `parcerias/page.tsx` | Partnerships hub |
| `/parcerias/afiliados` | | Affiliate management |
| `/parcerias/colaboradores` | | Collaborator management |
| `/parcerias/chat` | | Partner chat |
| `/payments` | `payments/page.tsx` | Payments view |
| `/pricing` | `pricing/page.tsx` | Pricing page |
| `/products` | `products/page.tsx` | Product list |
| `/products/new` | Multi-step | Product creation wizard (8 steps) |
| `/products/[id]` | Dynamic | Product detail |
| `/products/[id]/plans/[planId]` | Dynamic | Plan detail |
| `/produtos` | `produtos/page.tsx` | Products (PT alias) |
| `/produtos/afiliar-se` | | Affiliate marketplace |
| `/produtos/area-membros` | | Member areas |
| `/produtos/area-membros/preview/[areaId]` | Dynamic | Member area preview |
| `/sales` | `sales/page.tsx` | Sales view |
| `/scrapers` | `scrapers/page.tsx` | Web scrapers management |
| `/settings` | `settings/page.tsx` | Account settings (ContaView) |
| `/sites` | `sites/page.tsx` | Site builder hub |
| `/sites/apps` | | Apps |
| `/sites/criar` | | Create site |
| `/sites/dominios` | | Domains |
| `/sites/editar` | | Edit site |
| `/sites/hospedagem` | | Hosting |
| `/sites/protecao` | | Protection |
| `/tools` | `tools/page.tsx` | Tools (alias) |
| `/vendas` | `vendas/page.tsx` | Sales hub |
| `/vendas/assinaturas` | | Subscription management |
| `/vendas/fisicos` | | Physical products |
| `/vendas/gestao-vendas` | | Sales management |
| `/vendas/pipeline` | | CRM pipeline |
| `/video` | `video/page.tsx` | Video/Media processing |
| `/webinarios` | `webinarios/page.tsx` | Webinars |
| `/whatsapp` | `whatsapp/page.tsx` | WhatsApp console |

**Layout:** `MainAppLayoutShell` → theme init script → `PulseFrontendHeartbeat` → `AppShell`

#### `(checkout)/` — Public checkout pages
| Path | Page | Description |
|------|------|-------------|
| `/[slug]` | Dynamic | Public checkout page (SSR metadata + client component) |
| `/r/[code]` | Dynamic | Redirect/coupon code |
| `/order/[orderId]/success` | Dynamic | Order confirmation |
| `/order/[orderId]/pix` | Dynamic | PIX payment |
| `/order/[orderId]/boleto` | Dynamic | Boleto payment |
| `/order/[orderId]/upsell` | Dynamic | Upsell page |
| `/preview/[planId]` | Dynamic | Checkout preview |

**Layout:** Minimal, sets `dmSans` + `playfair` font variables

#### API Routes (`api/`)
| Route | Method | Description |
|-------|--------|-------------|
| `api/auth/login` | POST | Proxy → backend `/auth/login` |
| `api/auth/register` | POST | Proxy → backend `/auth/register` |
| `api/auth/logout` | POST | Proxy → backend `/auth/logout` |
| `api/auth/refresh` | POST | Token refresh proxy |
| `api/auth/forgot-password` | POST | Password reset request |
| `api/auth/reset-password` | POST | Password reset |
| `api/auth/verify-email` | POST | Email verification |
| `api/auth/magic-link/request` | POST | Magic link request |
| `api/auth/magic-link/verify` | POST | Magic link verification |
| `api/auth/check-email` | POST | Email availability check |
| `api/auth/anonymous` | POST | Anonymous session creation |
| `api/auth/google` | GET/POST | Google OAuth proxy |
| `api/auth/apple/start` | GET | Apple OAuth start |
| `api/auth/apple/callback` | GET | Apple OAuth callback |
| `api/auth/facebook` | GET/POST | Facebook OAuth proxy |
| `api/auth/facebook/data-deletion` | POST | Facebook data deletion |
| `api/auth/facebook/deauthorize` | POST | Facebook deauthorization |
| `api/auth/tiktok/start` | GET | TikTok OAuth start |
| `api/auth/callback/tiktok` | GET | TikTok OAuth callback |
| `api/auth/callback/apple` | GET | Apple callback (alt) |
| `api/auth/whatsapp/send-code` | POST | WhatsApp auth: send code |
| `api/auth/whatsapp/verify` | POST | WhatsApp auth: verify code |
| `api/checkout/social/apple/start` | GET | Checkout Apple OAuth start |
| `api/checkout/social/apple/callback` | GET | Checkout Apple OAuth callback |
| `api/compliance/deletion-status/[code]` | GET | GDPR deletion status |
| `api/gdpr/status/[code]` | GET | GDPR status (alias) |
| `api/kloel/download-image` | GET | Image download proxy |
| `api/kyc/[...path]` | ALL | KYC proxy → backend `/kyc/*` |
| `api/marketing/[...path]` | ALL | Marketing proxy → backend `/marketing/*` |
| `api/pulse/live/heartbeat` | GET | PULSE frontend heartbeat |
| `api/v1/cookie-consent` | POST | Cookie consent storage |
| `api/webhooks/tiktok` | POST | TikTok webhook handler |
| `api/whatsapp-api/*` | ALL | WhatsApp API proxy (see below) |
| `api/workspace/me` | GET | Current workspace info |

#### WhatsApp API Routes (`api/whatsapp-api/`)
Extensive proxy layer for WhatsApp session management, messaging, catalog, agent streaming:
- `agent/stream` — Agent SSE stream
- `backlog` — Backlog processing
- `catalog/{contacts,ranking,refresh,score}` — WhatsApp catalog operations
- `chats` / `chats/[chatId]/messages` / `chats/[chatId]/presence` — Chat operations
- `check/[phone]` — Phone validation
- `cia/intelligence` — CIA intelligence endpoint
- `contacts` — Contact management
- `live` — Live connection
- `provider-status` — Provider status check
- `session/{action,action-turn,backlog/start,bootstrap,claim,diagnostics,disconnect,force-check,force-reconnect,link,logout,pause-agent,proofs,qr,reconcile,recreate-if-invalid,repair-config,resume-agent,start,status,stream-token,takeover,view}` — Full session lifecycle
- `sync` — Data sync

**Proxy Pattern:** All API routes use `findFirstSequential` against candidate backend URLs (from `backend-url.ts`) with shared cookie auth (`kloel_access_token`, `kloel_workspace_id`). Authentication passes via Bearer token from cookie or Authorization header.

---

## 2. Component Inventory

### `/components/kloel/` — Core Design System (~180 files)

#### Design System Primitives
| Component | File | Role |
|-----------|------|------|
| `Button`, `IconButton`, `Chip`, `Badge`, `Avatar`, `Skeleton` | `Primitives.tsx` | Base UI atoms |
| `Input`, `SearchInput`, `Textarea`, `Select`, `Checkbox`, `Toggle` | `Forms.tsx` | Form controls |
| `StatCard`, `ActionCard`, `InfoCard`, `EmptyState` | `Cards.tsx` | Card variants |
| `Shell`, `CenterStage`, `Surface`, `ModalSurface`, `Section`, `Divider`, `Flex`, `Grid` | `Layout.tsx` | Layout primitives |
| `Toast`, `ToastProvider` | `Toast.tsx` / `ToastProvider.tsx` | Notification system |
| `Pagination` | `Pagination.tsx` | Pagination |
| `Stepper` | `Stepper.tsx` | Multi-step progress |
| `PageTitle` | `PageTitle.tsx` | Page header |
| `SectionPage` | `SectionPage.tsx` | Section wrapper |

#### Design System — Advanced
| Component | File | Description |
|-----------|------|-------------|
| `UniversalComposer` | `UniversalComposer.tsx` | Unified input composer |
| `ContextCapsule` | `ContextCapsule.tsx` | Contextual metadata display |
| `AgentTimeline` | `AgentTimeline.tsx` | AI agent timeline visualization |
| `SensitiveOperationGate` | `SensitiveOperationGate.tsx` | Operation confirmation gate |
| `CommandPalette` | `CommandPalette.tsx` | Ctrl+K command palette |
| `AgentConsole` | `AgentConsole.tsx` | Real-time agent activity monitor |
| `WhatsAppConsole` | `WhatsAppConsole.tsx` | WhatsApp live console |
| `WhatsAppLiveView` | `WhatsAppLiveView.tsx` | WhatsApp live viewport |
| `MachineRail` | `MachineRail.tsx` | Agent pipeline visualization |
| `StageHeadline` | `StageHeadline.tsx` | Stage/page header |
| `MissionCards` / `ProofCards` | `MissionCards.tsx` | Mission and proof card grids |
| `QrConnectCard` | `QrConnectCard.tsx` | QR code connection card |
| `MediaPreviewBox` | `MediaPreviewBox.tsx` | Media preview |
| `PulseLoader` | `PulseLoader.tsx` | Loading indicator |
| `PulseFrontendHeartbeat` | `PulseFrontendHeartbeat.tsx` | PULSE heartbeat |
| `DatadogRumRouter` | `DatadogRumRouter.tsx` | Datadog RUM init |
| `SWRProvider` | `SWRProvider.tsx` | SWR configuration |
| `ErrorBoundary` | `ErrorBoundary.tsx` | React error boundary |
| `EmptyStates` | `EmptyStates.tsx` | Reusable empty state library |
| `KloelMarkdown` | `KloelMarkdown.tsx` | Markdown renderer |
| `FormExtras` | `FormExtras.tsx` | Form helper components |
| `ToolCard` | `ToolCard.tsx` | Tool card with helpers |
| `MessageActionBar` | `MessageActionBar.tsx` | Message action toolbar |

#### Brand Components
| Component | File | Description |
|-----------|------|-------------|
| `KloelMushroomMark` | `KloelBrand.tsx` | Animated mushroom SVG logo |
| `KloelWordmark` | `KloelBrand.tsx` | Text wordmark |
| `KloelLoadingState` | `KloelBrand.tsx` | Loading with branded spinner |

#### App Shell
| Component | File | Description |
|-----------|------|-------------|
| `AppShell` | `AppShell.tsx` | Main authenticated layout with Sidebar + TopBar + palette |
| `MainAppLayoutShell` | `layouts/MainAppLayoutShell.tsx` | Wraps AppShell with theme script + PULSE |
| `AppShell.banners` | `AppShell.banners.tsx` | MobileTopBar, KycBanner |
| `AppShell.routes` | `AppShell.routes.ts` | Route resolution + active view detection |

#### Sidebar
| Component | File | Description |
|-----------|------|-------------|
| `KloelSidebar` | `sidebar/KloelSidebar.tsx` | Main sidebar (expanded/collapsed) |
| `SidebarNav` | `sidebar/SidebarNav.tsx` | Navigation tree |
| `SidebarRecents` | `sidebar/SidebarRecents.tsx` | Recent items |
| `SidebarToggleIcon` | `sidebar/SidebarToggleIcon.tsx` | Collapse toggle |
| `SidebarUserMenu` | `sidebar/SidebarUserMenu.tsx` | User avatar + menu |
| `sidebar-config.ts` | | NAV definition, icons, dimensions |

#### Auth Components (`kloel/auth/`)
| Component | File | Description |
|-----------|------|-------------|
| `AuthProvider` | `auth-provider.tsx` | Full auth state machine (login/signup/logout/session) |
| `KloelAuthScreen` | `kloel-auth-screen.tsx` | Auth screen with mode-based rendering |
| `kloel-auth-screen.machine.tsx` | | Auth state machine logic |
| `kloel-auth-screen.form-fields.tsx` | | Login/signup form fields |
| `kloel-auth-screen.hooks.tsx` | | Auth screen hooks |
| `kloel-auth-screen.icons.tsx` | | Auth screen icons |
| `kloel-auth-screen.social-buttons.tsx` | | Google/Apple/TikTok/Facebook sign-in |
| `google-sign-in-button.tsx` | | Google One Tap + standard sign-in |
| `auth-modal.tsx` | | Modal wrapper for auth |
| `auth-screen-data.ts` | | Static auth screen data |

#### Landing Page (`kloel/landing/`)
| Component | File | Description |
|-----------|------|-------------|
| `KloelLanding` | `KloelLanding.tsx` | Full landing page assembly |
| `LandingHeader` | `LandingHeader.tsx` | Sticky header with CTA |
| `HeroSection` | `HeroSection.tsx` | Hero with taglines |
| `HeroLoop` / `HeroLoopDisplay` | | Animated hero background |
| `HeroLoopNoiseCanvas` | | Noise texture canvas |
| `MultiChannelSection` | `MultiChannelSection.tsx` | Channel showcase |
| `ManifestSection` | `ManifestSection.tsx` | Mission statement |
| `StepsSection` | `StepsSection.tsx` | How it works |
| `FeaturesGridSection` | `FeaturesGridSection.tsx` | Feature cards |
| `PricingSection` | `PricingSection.tsx` | Pricing tiers |
| `ThanosSection` | `ThanosSection.tsx` | Thanos snap interactive section |
| `TestimonialsSection` | `TestimonialsSection.tsx` | Social proof |
| `FinalCtaSection` | `FinalCtaSection.tsx` | Final CTA |
| `FinalManifestLoop` | `FinalManifestLoop.tsx` | Animated manifesto |
| `FaqSection` | `FaqSection.tsx` | FAQ accordion |
| `FooterSection` | `FooterSection.tsx` | Site footer |
| `FloatingChat` | `FloatingChat.tsx` | Floating chat widget |
| `LivePulse` | `LivePulse.tsx` | Live activity indicator |
| `Reveal` | `Reveal.tsx` | Scroll reveal animation |
| `BrandDivider` | `BrandDivider.tsx` | Section divider |
| `landing-data.ts` | | Landing page copy/configuration |
| `thanos-section.const.ts` | | Thanos section physics constants |
| `thanos-icons.ts` | | Thanos icon SVGs |

#### Feature Components

**Dashboard (`kloel/dashboard/`)**
- `KloelDashboard.tsx` — Main dashboard (message display + subcomponents)
- `KloelDashboardView.tsx` — Dashboard view (approval strip, composer section)
- `KloelChatComposer.tsx` — AI chat input with parts/top rail
- `KloelDashboard.assistant.tsx` — Assistant response display
- `KloelDashboard.message.tsx` — Message bubble rendering
- `KloelDashboard.hooks.ts` / `useBrainRouter.ts` — Routing logic
- `useKloelDragDrop.ts` / `useKloelFiles.ts` — DnD + file hooks

**Home (`kloel/home/`)**
- `HomeView.tsx` — Home page KPI dashboard
- `HomeLanding.tsx` — Landing version of home
- `HomeKpiTiles.tsx` — KPI tile cards
- `ChatInputArea.tsx` / `ChatMessageBubble.tsx` — Chat UI
- `useKloelChat.ts` / `useKloelSendMessage.ts` / `useTypingSimulation.ts`

**Chat (`kloel/chat-container.*`)**
- Multi-file chat container (layout, message list, message actions, agent stream, agent trace, event handler, empty state, modals, WhatsApp hook, data, types)

**WhatsApp Experience (`kloel/marketing/WhatsAppExperience.*`)**
- `WhatsAppExperience.tsx` — Main WhatsApp connection/management view
- `WhatsAppExperience.controller.ts` — Connection state machine
- `WhatsAppExperience.wizard-*.tsx` — Multi-step connection wizard
- `WhatsAppExperience.connection-panes.tsx` — Connection panels
- `WhatsAppExperience.dashboard-cards.tsx` — Status cards
- `WhatsAppExperience.qr-pane.tsx` — QR code display
- `WhatsAppExperience.panels.tsx` / `operational-panel.tsx` — Control panels
- `WhatsAppExperience.ui-atoms*.tsx` — Reusable display atoms
- `WhatsAppExperience.actions.ts` / `effects.ts` — Actions + side effects

**Marketing (`kloel/marketing/`)**
- `MarketingView.tsx` — Marketing hub
- `OfficialMarketingChannelPage.tsx` — Official channel page with setup
- `UniversalChannelWizard.tsx` — Multi-platform channel setup wizard
- Per-channel tabs: `WhatsAppMarketingTab`, `EmailMarketingTab`, `FacebookMarketingTab`, `InstagramMarketingTab`, `TikTokMarketingTab`, `SmsMarketingTab`
- `MarketingShared.tsx` / `MarketingShared.canvas.tsx` / `MarketingShared.channels.tsx` — Shared primitives
- `MarketingRevenueBarChart.tsx` / `MarketingConversationsHub.tsx` / `MarketingChannelNerveRow.tsx`
- Hooks: `useEmailMarketing`, `useFacebookMarketing`, `useInstagramMarketing`, `useSmsMarketing`, `useTikTokMarketing`

**CRM (`kloel/crm/`)**
- `CRMPipelineView.tsx` — Kanban pipeline
- `PipelineStageColumn.tsx` — Stage column
- `DealCard.tsx` / `DealDetailModal.tsx` / `DealCreateInlineForm.tsx`
- `ContactDetailDrawer.tsx` — Contact side panel with sections
- `ContactInfoSection` / `ContactScoreSentimentSection` / `ContactTagsSection` / `ContactDealsSection` / `ContactNeuroSection`
- Icons + utils

**Products (`kloel/products/`)**
- `ProductNerveCenter.tsx` — Product management center (Root.js = JS bridge)
- Tabs: `CheckoutsTab`, `PlanosTab`, `ComissaoTab`, `CuponsTab`, `IATab`, `AvalTab`, `CampanhasTab`, `AfterPayTab`
- Context: `product-nerve-center.context.tsx` + `view-models.ts`
- Constants, shared styles, inputs, plan linking, richtext editor

**Products (`components/products/`)**
- `CheckoutConfigPage`, `CheckoutLinksModal`
- Product tabs: `GeneralTab`, `PlansTab`, `IATab`, `CommissionsTab`, `CouponsTab`, `CampaignsTab`, `CheckoutsTab`, `AfterPayTab`, `ReviewsTab`, `UrlsTab`
- `checkout/` subdir: `CheckoutCheckbox`, `CheckoutRadio`, `CheckoutToggle`, `CheckoutToggleRow`, `CheckoutPixelRow`, `CheckoutPixelsSection`
- `useCheckoutFormState.ts`

**Plans (`components/plans/`)**
- `PlanAIConfig.tsx` → Tab with sub-sections: behavior, customer-profile, objections, positioning, sales-args, tech-info, upsell, summary, toggle, data, shared, helpers
- `PlanPaymentTab`, `PlanShippingTab`, `PlanStoreTab`, `PlanThankYouTab`, `PlanAffiliateTab`, `PlanOrderBumpTab`

**Account/Settings (`kloel/conta/`)**
- `ContaView.tsx` — Main settings view (sidebar + content panel)
- 24 section components: account type, bank, tax data, personal data, documents, languages, notifications, public profile, security, team, referral, apps, help, logout, Meta connect, PIX fields, connect account card, shareable components
- `ContaHelpers.ts`, `ContaTypes.ts`, `ContaConstants.ts`, `ContaIcons.tsx`

**Vendas (`kloel/vendas/`)**
- `VendasView.tsx` — Sales hub
- `GestaoVendas`, `GestaoAssinaturas`, `GestaoFisicos`, `PipelineTab`, `EstrategiasTab`
- `SaleRow`, `DetailModal`, `DetailActions`, `ShipModal`
- `SmartPaymentForm`, `SmartPaymentModal`, `SmartPaymentResult`
- `Stat`, `Badge`, `MiniChart`, `TH`, `OrderAlertsBanner`, `types.ts`

**Wallet (`kloel/carteira/`)**
- `CarteiraSaldoCard`, `CarteiraExtratoTable`, `CarteiraSaque`, `CarteiraWithdrawModal`, `CarteiraAntecipateModal`, `CarteiraTabAntecipacoes`
- `carteira-revenue-chart`, `carteira-recent-transactions`, `carteira-add-bank-form`
- Types, helpers, icons, config
- `carteira.tsx` — Legacy wrapper

**Autopilot (`kloel/autopilot/`)**
- `AutopilotSafetyBrakes.tsx`, `AutopilotSafetyBrakesConfigPanel.tsx`, `AutopilotSafetyBrakesHelpers.tsx`, `AutopilotSafetyBrakes.types.ts`
- `AutopilotDecisionLog.tsx`, `AutopilotPlanInspector.tsx`

**Sites (`kloel/sites/`)**
- `SitesView.tsx`, `CriarSite.tsx`, `EditarSite.tsx`, `EditarSiteEditor.tsx`, `EditarSiteList.tsx`
- `Apps.tsx`, `Dominios.tsx`, `Hospedagem.tsx`, `Protecao.tsx`, `VisaoGeral.tsx`
- `SitesViewAtoms`, `SitesViewControls`, `SitesViewIcons`, `NeuralPulse`

**Anúncios (`kloel/anuncios/`)**
- `AnunciosView.tsx`, `WarRoomDashboard.tsx`, `TrackingDashboard.tsx`
- `InvestReturnPanel.tsx`, `CampaignTimeline.tsx`, `AdAccountsBoard.tsx`
- `RuleEngineHub.tsx`, `RuleEditorForm.tsx`, `RuleNerveFiber.tsx`
- `PlatformDetailTab.tsx`, `AnunciosTabBar.tsx`, `AnunciosShared.tsx`
- Types: `anuncios-types.ts`

**Parcerias (`kloel/parcerias/`)**
- `ParceriasView.tsx`, `ParceriasShell.tsx`
- `AffiliateList`, `AffiliateDetailSheet`, `AffiliateDetailInfo`, `AffiliateDirectory`, `AffiliateFilterToolbar`
- `AffiliateLinkManager`, `AffiliateLinkList`, `AffiliateLinkStatsBar`
- `AffiliateMetricsGrid`, `AffiliatePerformanceChart`, `AffiliateStatsSummary`, `AffiliateProfileCard`
- `AffiliateRegistrationForm`, `AffiliateProductSuggestions`, `AffiliateSetupCards`, `AffiliateMarketplaceSearch`
- `ColaboratorList`, `ColaboratorRoster`, `ColaboratorInvitationForm`, `ColaboratorSearchToolbar`, `ColaboratorStatsSummary`
- `ChatContactList`, `ChatMessageArea`, `PartnerChatRoom`
- Types: `partnershipTypes.ts`

**Produtos (`kloel/produtos/`)**
- `ProdutosView.tsx` with tabs: `ProdutosMeusProdutosTab`, `ProdutosAfiliarSeTab`, `ProdutosAreaMembrosTab`
- `AffiliateApplyDialog`, `AffiliateMyApplications`, `AffiliateProductDetail`
- `AreaMembrosListPanel`, `AreaMembrosOverviewPanel`, `AreaMembrosStudentsPanel`, `AreaMembrosEditorPanel`, `AreaMembrosCertificatePanel`
- `ProductCardGrid`, `ProductFilters`, `MarketplaceFilters`, `MarketplaceProductGrid`, `ProductsListing`, `ProductActions`

**Inbox (`kloel/inbox/`)**
- `InboxWorkspace.tsx` — Main inbox container
- `parts/`: `InboxHeader`, `InboxConversationList`, `InboxConversationFilters`, `InboxConversationHeader`, `InboxMessageList`, `InboxMessageInput`, `InboxContextBanner`, `InboxErrorBanner`
- `InboxConversationListItem`, `InboxNoWorkspaceView`, `InboxNotAuthenticatedView`
- `useInboxData.ts`, `useInboxRealtime.ts`

**Search (`kloel/search/`)**
- `CommandPaletteItem.tsx`, `command-palette-utils.ts`, `conversation-search-utils.ts`
- `use-command-palette.ts`

**Settings (`kloel/settings/`)**
- 20+ section components: `account-settings-section`, `billing-settings-section`, `billing-legacy-providers-section`, `brain-settings-section`, `crm-settings-section`, `company-identity-section`, `product-catalog-section`, `knowledge-base-section`, `autopilot-section`, `ai-tools-panel`, `analytics-settings-section`, `attendance-rules-section`, `customer-personas-section`, `faq-section`, `voice-tone-section`
- Utility cards: `kloel-status-card`, `opening-message-card`, `missing-steps-card`, `realtime-usage-card`, `system-alerts-card`, `emergency-mode-card`
- `settings-drawer.tsx`, `settings-registry.ts`, `accordion-section.tsx`, `contract.tsx`, `product-checkout-plans.tsx`

**Cookies (`kloel/cookies/`)**
- `CookieProvider`, `CookieBanner`, `CookiePreferencesModal`, `CookiePolicyPage`, `CookieScriptManager`
- `cookie-data.ts`, `cookie-types.ts`

**Theme (`kloel/theme/`)**
- `ThemeProvider.tsx` — Dark/light mode provider
- `ThemeToggle.tsx` — Toggle button

**UI (`components/ui/`)** — Generic shadcn-style primitives
- `button.tsx`, `checkbox.tsx`, `input.tsx`, `label.tsx`, `select.tsx`, `switch.tsx`, `textarea.tsx`

#### Other Component Directories

**`/components/canvas/`** — Visual editor
- `CanvasEditor.tsx`, `EditorTopBar.tsx`, `EditorErrorBoundary.tsx`
- `canvas-editor-sidebar-panels.tsx`, `canvas-editor-tools-panel.tsx`, `canvas-editor-layers-panel.tsx`
- `canvas-editor-bottom-bar`, `canvas-editor-context-menu`, `canvas-editor-property-bar`
- `CanvasIcons.tsx` (3 catalog files + shared), `FormatGrid.tsx`, `FormatCard.tsx`, `FormatPills.tsx`
- `CreateModal.tsx`, `CustomSizePanel.tsx`, `UploadPanel.tsx`, `MockupSVGs.tsx`
- Types: `canvas-editor.types.ts`

**`/components/flow/`** — Flow builder
- `FlowBuilder.tsx` — Main ReactFlow-based builder
- `FlowSidebar.tsx`, `FlowContextBar.tsx`, `FlowExecutionsTab.tsx`, `FlowTemplatesTab.tsx`
- `NodeProperties.tsx` + sub-panels (action, flow, terminal parts)
- `nodes/`: 9 node types (`StartNode`, `EndNode`, `MessageNode`, `AINode`, `ActionNode`, `ConditionNode`, `DelayNode`, `InputNode`, `WaitForReplyNode`)

**`/components/webinarios/`**
- `webinar-card.tsx`, `webinar-form-modal.tsx`, `webinar-viewer.tsx`, `webinar-delete-dialog.tsx`
- `types.ts`, `utils.tsx`, `page-styles.ts`

**`/components/login/`** — `AppleSignInButton.tsx`

**`/components/icons/`** — `WhatsAppIcon.tsx`

---

## 3. Hook Inventory (`/hooks/` — ~50 hooks)

| Hook | File | Description |
|------|------|-------------|
| `useAnuncios` | `useAnuncios.ts` | Ads data fetching |
| `useAnunciosCampaigns` | `useAnunciosCampaigns.ts` | Campaign data |
| `useAppleDiagnostic` | `useAppleDiagnostic.ts` | Apple sign-in diagnostics |
| `useBrainDecide` | `useBrainDecide.ts` | AI brain decision routing |
| `useBrazilianBanks` | `useBrazilianBanks.ts` | Bank list from `data/brazilian-banks.ts` |
| `useCRM` | `useCRM.ts` | CRM pipeline + deal data |
| `useCanvasDesigns` | `useCanvasDesigns.ts` | Canvas design CRUD |
| `useCapabilities` | `useCapabilities.ts` | Feature capability gates |
| `useCheckoutEditor` | `useCheckoutEditor.ts` | Checkout editor state |
| `useCheckoutPlans` | `useCheckoutPlans.ts` | Checkout plan selection |
| `useCiaAdvanced` | `useCiaAdvanced.ts` | CIA advanced operations |
| `useCiaSurface` | `useCiaSurface.ts` | CIA surface data |
| `useCiaTasks` | `useCiaTasks.ts` | CIA task management |
| `useCommandPalette` | `useCommandPalette.ts` | Ctrl+K palette state |
| `useConnectAccounts` | `useConnectAccounts.ts` | Social account connections |
| `useConversationHistory` | `useConversationHistory.tsx` | Conversation list + pagination (SWR-based) |
| `useDashboardHome` | `useDashboardHome.ts` | Dashboard KPIs + post-payment |
| `useDetailedReports` | `useDetailedReports.ts` | Detailed report data |
| `useEmailPresets` | `useEmailPresets.ts` | Email preset templates |
| `useFlowExecutions` | `useFlowExecutions.ts` | Flow execution history |
| `useFlowOptimize` | `useFlowOptimize.ts` | AI flow optimization |
| `useFlowTemplates` | `useFlowTemplates.ts` | Flow template marketplace |
| `useFlows` | `useFlows.ts` | Flow CRUD |
| `useKyc` | `useKyc.ts` | KYC status + completion |
| `useMarketing` | `useMarketing.ts` | Marketing overview data |
| `useMemberAreas` | `useMemberAreas.ts` | Member area data |
| `usePartnerships` | `usePartnerships.ts` | Affiliate/partner data |
| `usePersistentImagePreview` | `usePersistentImagePreview.ts` | Image preview caching |
| `usePrefersReducedMotion` | `usePrefersReducedMotion.ts` | Accessibility preference |
| `usePricingPlans` | `usePricingPlans.ts` | Pricing plan data |
| `useProductTemplates` | `useProductTemplates.ts` | Product template list |
| `useProducts` | `useProducts.ts` | Product CRUD |
| `useReports` | `useReports.ts` | Report data fetching |
| `useResponsiveViewport` | `useResponsiveViewport.ts` | Breakpoint detection |
| `useSales` | `useSales.ts` | Sales data |
| `useSalesFlow` | `useSalesFlow.ts` | Sales flow automation |
| `useSalesPipeline` | `useSalesPipeline.ts` | Pipeline data |
| `useScrapers` | `useScrapers.ts` | Web scraper management |
| `useSocket` | `useSocket.ts` | WebSocket connection |
| `useWallet` | `useWallet.ts` | Wallet balance + transactions |
| `useWhatsAppSession` | `useWhatsAppSession.ts` | WhatsApp session management |
| `useWorkspaceId` | `useWorkspaceId.ts` | Workspace ID from token storage |

---

## 4. Lib Layer (`/lib/`)

### API Client Modules (`/lib/api/`)
| Module | File | Description |
|--------|------|-------------|
| `index.ts` | Barrel | Re-exports all API modules |
| `core.ts` | Core | `apiFetch`, `tokenStorage`, `buildQuery`, `authHeaders`, types |
| `core-tokens.ts` | Tokens | Token storage + workspace resolution |
| `core-tokens-scoring.ts` | Scoring | Token scoring |
| `core-tokens-storage.ts` | Storage | Token persistence |
| `core-tokens-sync.ts` | Sync | Cross-tab token sync |
| `auth.ts` | Auth | Login, register, logout, refresh, anonymous |
| `workspace.ts` | Workspace | Workspace info |
| `whatsapp.ts` | WhatsApp | Connection, QR, messaging, catalog, session |
| `whatsapp-api.ts` | WhatsApp API | WhatsApp API client |
| `whatsapp-helpers.ts` | Helpers | WhatsApp utilities |
| `kloel.ts` | Kloel | Generic Kloel API |
| `kloel-api.ts` | Kloel API | Kloel-specific API calls |
| `kloel-leads.ts` | Leads | Lead management |
| `kloel-memory.ts` | Memory | Memory operations |
| `analytics.ts` | Analytics | Dashboard, activity, advanced queries |
| `dashboard.ts` | Dashboard | Dashboard data |
| `home.ts` | Home | Home page data |
| `products.ts` | Products | Product CRUD |
| `product-import.ts` | Import | Product import |
| `checkout-public.ts` | Checkout | Public checkout API |
| `crm.ts` | CRM | CRM operations |
| `pipeline.ts` | Pipeline | Pipeline management |
| `leads.ts` | Leads | Lead operations |
| `flows.ts` | Flows | Flow management |
| `followups.ts` | Follow-ups | Follow-up operations |
| `campaigns.ts` | Campaigns | Campaign CRUD |
| `campaign-mass-send.ts` | Mass Send | Bulk campaign sending |
| `channel-setup.ts` | Channels | Channel setup |
| `onboarding.ts` | Onboarding | Onboarding profile |
| `notifications.ts` | Notifications | Notification management |
| `wallet.ts` | Wallet | Balance, transactions, withdrawals |
| `finance.ts` | Finance | Financial operations |
| `billing.ts` | Billing | Billing management |
| `brain.ts` | Brain | AI brain API |
| `ai-assistant.ts` | Assistant | AI assistant |
| `agent-tools.ts` | Agent Tools | Agent tool registry |
| `cia.ts` | CIA | CIA operations |
| `memory.ts` | Memory | Memory store |
| `kyc.ts` | KYC | KYC operations |
| `documents.ts` | Documents | Document management |
| `media.ts` | Media | Media upload/manage |
| `privacy.ts` | Privacy | GDPR operations |
| `cookie-consent.ts` | Consent | Cookie consent |
| `launch.ts` | Launch | Launch/campaign operations |
| `growth.ts` | Growth | Growth hacking tools |
| `marketplace.ts` | Marketplace | Affiliate marketplace |
| `partnerships.ts` | Partnerships | Partner operations |
| `affiliate.ts` | Affiliate | Affiliate management |
| `meta.ts` | Meta | Meta API integration |
| `apple.ts` | Apple | Apple Sign-In |
| `ad-rules.ts` | Ad Rules | Ad rule management |
| `objections.ts` | Objections | Sales objection handling |
| `reports.ts` | Reports | Report generation |
| `metrics.ts` | Metrics | Metric data |
| `scrapers.ts` | Scrapers | Web scraper API |
| `team.ts` | Team | Team management |
| `webinars.ts` | Webinars | Webinar management |
| `calendar.ts` | Calendar | Calendar integration |
| `shared-types.ts` | Types | Shared API types |
| `smart-payment.ts` | Smart Pay | Smart payment processing |
| `conversations.ts` | Convos | Conversation API |
| `member-area.ts` | Member Area | Member area management |
| `member-area-public.ts` | Public MA | Public member area |

### Core Infrastructure
| File | Description |
|------|-------------|
| `http.ts` | API base URL resolution (fail-fast in production) |
| `api.ts` | Shim → re-exports `api/index.ts` |
| `fetcher.ts` | SWR-compatible `swrFetcher` + `swrMutator` |
| `auth-identity.ts` | JWT decode, anonymous token detection |
| `anonymous-session.ts` | Guest/anonymous session management |
| `tokenStorage` (via api/core) | Shared cookie + localStorage token sync |
| `subdomains.ts` | Multi-tenant subdomain routing (app/auth/marketing/pay) |
| `design-tokens.ts` | "Monitor" design system colors (200+ lines) |
| `ui-tokens.ts` | UI-specific tokens |
| `kloel-theme.ts` | App theme CSS variable references |
| `machine-rails.ts` | Machine rail/pipeline constants |
| `kloel-dashboard-context.ts` | Dashboard context builder (URL params → chat routing) |
| `kloel-chat.ts` | Chat utilities |
| `kloel-conversations.ts` | Conversation helpers |
| `kloel-message-ui.ts` | Message UI helpers |
| `kloel-stream-events.ts` | SSE event streaming |
| `frontend-capabilities.ts` | Feature flags/capabilities |
| `canvas-formats.ts` | Canvas format definitions |
| `canvas-palette-tokens.ts` | Canvas color palette |
| `canvas-product-templates.ts` | Product templates for canvas |
| `checkout-links.ts` | Checkout link management |
| `checkout-pricing.ts` | Checkout pricing logic |
| `public-checkout.ts` | Public checkout utilities |
| `public-checkout-contract.ts` | Public checkout type contract |
| `media-upload.ts` | Media upload helpers |
| `member-area-preview.ts` | Member area preview utilities |
| `normalizer.ts` | Data normalization |
| `secure-random.ts` | Cryptographically secure random |
| `stripe-client.ts` | Stripe client initialization |
| `facebook-sdk.ts` | Facebook SDK wrapper |
| `legal-constants.ts` | Legal URLs, dates |
| `video-embed.ts` | Video embed helpers |
| `utils.ts` | General utilities |
| `async-sequence.ts` | Sequential async execution (`findFirstSequential`) |
| `external-brand-tokens.ts` | External brand identity tokens |
| `i18n/t.ts` | i18n gate shim (`kloelT`, `kloelError`, `kloelFormatNumber`) |

### Fabric.js Managers (`/lib/fabric/`)
For the canvas editor — each manager encapsulates a Fabric.js concern:
`BackgroundManager`, `ClipboardManager`, `ContextMenuManager`, `ExportManager`, `FilterManager`, `FontManager`, `GroupingManager`, `HistoryManager`, `ImageManager`, `KeyboardManager`, `LayerManager`, `SelectionManager`, `ShapeManager`, `SnapManager`, `TextManager`, `ZoomManager`

### Capability Data (`/lib/capability-data/`)
Structured data for "Ferramentas" (tools) section:
`fale.ts`, `gerencie.ts`, `impulsione.ts`, `recupere.ts`, `index.ts`, `types.ts`

---

## 5. Types, i18n, Data

### Types (`/types/`)
- `google-identity.d.ts` — Google Identity Services type declarations

### i18n (`/i18n/`)
- `request.ts` — next-intl request configuration
- `lib/i18n/t.ts` — i18n gate shim (all strings wrapped in `kloelT()`)

### Data (`/data/`)
- `brazilian-banks.ts` — Brazilian bank list (used by `useBrazilianBanks` hook)

---

## 6. Architecture Observations

### Strengths
1. **Well-structured route groups** — `(public)`, `(main)`, `(checkout)` cleanly separate concerns
2. **Multi-tenant subdomain middleware** — Sophisticated host-based routing (app/auth/marketing/pay.kloel.com) with shared cookie auth
3. **Comprehensive API proxy layer** — All backend communication routed through Next.js API routes with sequential candidate URL fallback
4. **Design system consistency** — "Monitor" theme with CSS custom properties, applied through both `globals.css` and `design-tokens.ts`
5. **Fail-fast in production** — `http.ts` and `next.config.ts` both enforce explicit `NEXT_PUBLIC_API_URL` at build time
6. **SWR everywhere** — Data fetching standardized on SWR via `swrFetcher`/`swrMutator`
7. **Observability** — Datadog RUM integrated at root, Sentry for error tracking, Codecov for bundle analysis
8. **Auth state machine** — AuthProvider handles full lifecycle (login, signup, anonymous sessions, refresh, logout, impersonation)
9. **React Compiler enabled** — `reactCompiler: true` in next.config
10. **i18n-ready** — All user-facing strings gated through `kloelT()` shim, ready for real next-intl translation

### Architecture Patterns

**API Proxy Pattern:**
```
Frontend Client → apiFetch() → Next.js Route Handler → findFirstSequential([candidateUrls]) → Railway Backend
```
- Auth: shared cookies (`kloel_access_token`, `kloel_workspace_id`)
- Fallback: tries multiple candidate URLs in sequence
- Redirect detection: detects auth redirects and returns 401

**Component Decomposition:**
- Large features split into multiple co-located files (e.g., `CheckoutBlanc.*.tsx`, `WhatsAppExperience.*.tsx`, `chat-container.*.tsx`)
- Shared types/helpers in same directory as component
- "Parts" pattern: `Component.parts.tsx`, `Component.helpers.ts`

**State Management:**
- SWR for server state
- React Context for: Auth, Theme, Cookies, Conversations, Toast, Product Nerve Center
- URL search params for transient UI state (tabs, filters, selected items)
- localStorage + cookies for token/workspace persistence

### Potential Concerns

1. **File count**: 1,286 files in `src/` is substantial. Some features have deeply nested component trees with many small files.

2. **Dual product system**: Both `/products` and `/produtos` routes exist with parallel implementations (`components/products/` vs `components/kloel/products/` and `components/kloel/produtos/`) — this appears to be an in-progress migration.

3. **Large single files**: Some page components and hooks are 200-500 lines (e.g., `leads/page.tsx`, `flow/page.tsx`, `auth-provider.tsx`).

4. **Mixed styling approaches**: CSS custom properties (via `globals.css`), inline styles via `design-tokens.ts`, Tailwind classes, and `KLOEL_THEME` object references coexist. This is partly by design (Monitor design system migration) but adds complexity.

5. **Checkout duplication**: Both `CheckoutBlanc.*` and `CheckoutNoir.*` component sets exist, plus `checkout-shared-parts.tsx` and `checkout-theme-shared.tsx`. This suggests checkout theme variants.

6. **Import pattern**: Some files use barrel exports (`@/components/kloel`), others use direct imports. Inconsistent.

7. **`Root.js` bridge**: `ProductNerveCenterRoot.js` exists in a TypeScript directory — likely a migration artifact.

8. **No dedicated `middleware.ts` in `/src/app/`** — Middleware lives at `/frontend/src/middleware.ts` (Next.js standard), but the subdomain logic is complex enough to warrant testing coverage.

---

## 7. Start Here

For another agent needing to work on this codebase, the recommended entry points are:

1. **`frontend/src/app/layout.tsx`** — Root layout, understand the provider stack
2. **`frontend/src/components/kloel/AppRootEnhancers.tsx`** — Provider hierarchy
3. **`frontend/src/components/kloel/AppShell.tsx`** — Main authenticated app shell
4. **`frontend/src/components/kloel/sidebar/sidebar-config.ts`** — Navigation structure
5. **`frontend/src/lib/api/index.ts`** — API client barrel (understand available APIs)
6. **`frontend/src/lib/http.ts`** — API URL configuration
7. **`frontend/src/middleware.ts`** — Subdomain routing
8. **`frontend/src/app/api/_lib/backend-url.ts`** — Backend URL resolution
9. **`frontend/src/lib/design-tokens.ts`** — Design system tokens
10. **`frontend/src/lib/kloel-dashboard-context.ts`** — Chat routing context builder

---

## 8. Key Files Summary

| File | Lines | Role |
|------|-------|------|
| `app/layout.tsx` | ~80 | Root HTML, metadata, provider injection |
| `app/globals.css` | ~600 | Design system CSS custom properties |
| `middleware.ts` | ~200 | Multi-tenant subdomain routing |
| `next.config.ts` | ~120 | Build config, Sentry, Codecov, React Compiler |
| `lib/design-tokens.ts` | ~390 | Color palette, spacing, typography tokens |
| `lib/api/core.ts` | ~540 | Core API client, types, token storage |
| `lib/api/index.ts` | ~380 | API module barrel |
| `lib/subdomains.ts` | ~350 | Host detection, URL building |
| `lib/kloel-dashboard-context.ts` | ~350 | Chat context parameter builder |
| `components/kloel/AppShell.tsx` | ~230 | Main app shell with sidebar, palette, routing |
| `components/kloel/AppShell.routes.ts` | ~200 | View/sub-view routing resolution |
| `components/kloel/auth/auth-provider.tsx` | ~590 | Auth state machine |
| `components/kloel/landing/KloelLanding.tsx` | ~50 | Landing page assembly |
| `components/kloel/sidebar/KloelSidebar.tsx` | ~350 | Sidebar with nav |
| `app/api/whatsapp-api/proxy.ts` | ~200 | WhatsApp API proxy |
| `app/api/marketing/[...path]/route.ts` | ~240 | Marketing API proxy |
| `app/api/kyc/[...path]/route.ts` | ~230 | KYC API proxy |
