# KLOEL Capability Map

> **Mission 5 deliverable** — evidence-based inventory of every capability declared in the Kloel Capability Registry V2, cross-checked against the live NestJS service graph.
>
> Source of truth: `backend/src/kloel/capability-registry-v2/partitions/*.ts` (the `CAPABILITY_DEFINITIONS` barrel).
> Resolver runtime: `backend/src/kloel/capability-registry-v2/capability-registry-v2.service.ts#listGaps` (DI reflection over `ModulesContainer`).
> Verification method: ripgrep `export class <Service>` to locate the file, then per-method definition lookup with a definition-shape regex (modifier? + async? + name + `(` / `<` / `[`). Each non-WIRED entry has been re-verified.

## How to read this file

Each capability has six relevant attributes (full schema in `capability-registry-v2.types.ts`):

- `id` — canonical capability ID (matches what the intent classifier emits).
- `title` — Portuguese-language label shown to the chat surface.
- `category` — one of `SELF_AWARENESS | QUERY | MUTATION_SAFE | MUTATION_SENSITIVE | COMMUNICATION | CONFIGURATION | META`.
- `tier` — priority bucket 0-12 used by the dispatcher.
- `domainService` — `ServiceName.methodName` resolver string. Empty / `Alias for ...` is not resolvable by design.
- `surface` — chat entrypoints that can dispatch the capability.

Resolution status used in this document:

| Status | Meaning |
|---|---|
| `WIRED` | Service class exported AND method definition exists in the resolved file. |
| `UNGATED (method missing)` | Service class exists but the declared method is not defined on it. The Kloel dispatcher will throw at runtime. |
| `UNGATED (service missing)` | Declared `ServiceName` has no `export class` definition anywhere in `backend/src` or `worker/src`. |
| `UNVERIFIED` | Compound resolver (`X.foo + Y.bar`). Marked UNVERIFIED unless one half resolves; the dispatcher cannot route compound resolvers anyway. |
| `ALIAS` | `domainService: "Alias for <id>"` — registry placeholder pointing at another capability. Not directly executable. |

## Capability Map Overview

> **w6 full re-scan (tool-measured 2026-05-29, all 202 capabilities):** every
> capability's `id` + `domainService` was extracted from
> `backend/src/kloel/capability-registry-v2/partitions/*.ts` (202 pairs,
> cross-checked three ways). Each distinct `domainService` token was matched
> against the live `SERVICE_TOKEN_MAP` in
> `backend/src/kloel/domain-service-resolver.service.ts` (51 mapped tokens),
> and each declared method was verified to exist on the real provider class via
> AST outline (`code_outline` / `code_read_symbol`). This supersedes the stale
> "first-142" breakdown that previously lived here. The per-row tables below
> were last refreshed at the Mission-5 / K87 scan and are NOT yet re-synced to
> these numbers — trust THIS overview for current WIRED/UNWIRED counts.

**Resolution status taxonomy (w6):**

| Status | Meaning | Resolver runtime behavior |
|---|---|---|
| `WIRED` | Token in `SERVICE_TOKEN_MAP` AND method exists on the real provider | Executes |
| `METHOD_MISSING` | Token mapped, but the declared method is absent on the provider | `method_not_found` |
| `UNKNOWN_SERVICE` | Token absent from `SERVICE_TOKEN_MAP` | `unknown_service` |
| `COMPOUND` | `X.foo + Y.bar` — multi-service; resolver skips by design (manual dispatch) | Not routed by resolver |
| `ALIAS` | `domainService: "Alias for <id>"` — registry pointer at another capability | Skipped by design |

### Headline numbers (all 202)

- **Total declared capabilities:** 202
- **WIRED (executable now):** 188 (93.1%)
- **METHOD_MISSING:** 7 (3.5%)
- **UNKNOWN_SERVICE:** 2 (1.0%) — 1 fixable via HUB, 1 needs implementation
- **COMPOUND (by-design deferred):** 3 (1.5%)
- **ALIAS (by-design pointer):** 2 (1.0%)

Resolver-executable coverage = WIRED / (202 − COMPOUND − ALIAS) = 188 / 197 =
**95.4%** of all non-deferred capabilities; **93.1%** of the full 202 surface.

### The complete UNWIRED list (14 capabilities)

#### METHOD_MISSING — service is mapped, but the method does not exist (7)

| Capability ID | `domainService` | Real provider methods | Resolution |
|---|---|---|---|
| `get_product_urls` *(deprecated)* | `ProductUrlService.list` | add, update, delete, togglePrivate, toggleKloelLearning, toggleKloelChatEmbed | No `list`. Canonical successor `products.update_urls` → `ProductService.updateUrls` is WIRED. Needs a `list` read method on `ProductUrlService` (a real URL-read companion exists at `unified-agent-actions-billing.service.ts:378`). |
| `change_plan` *(deprecated)* | `BillingService.changePlan` | getSubscription, status, activateTrial, getUsage, createCheckoutSession, handleWebhook, cancelSubscription | No `changePlan`. Claimed successor `billing.change_plan` does NOT exist as a capability id either. Needs `BillingService.changePlan` implementation. |
| `update_billing_info` *(deprecated)* | `BillingService.update` | (same as above) | No `update`. Claimed successor `billing.update` does NOT exist. Needs `BillingService.update` implementation. |
| `products.set_ai_config` | `ProductAIConfigService.update` | get | Product-scoped AI config service is read-only (`get`). Sibling `AIConfigService.update` is the *workspace*-scoped one — not interchangeable. Needs an `update` method on `ProductAIConfigService`. |
| `account.update_bank` | `AccountService.updateBankAccount` | updatePersonalData, getFiscalData, updateFiscalData, getSettings | No bank-account write method exists anywhere. Needs `AccountService.updateBankAccount` implementation. |
| `account.set_pix_key` | `AccountService.setPixKey` | (same as above) | No PIX-key write method exists anywhere. Needs `AccountService.setPixKey` implementation. |
| `set_pix_key` *(deprecated)* | `AccountService.setPixKey` | (same as above) | Same gap as `account.set_pix_key`; resolved when that method lands. |

#### UNKNOWN_SERVICE — token absent from `SERVICE_TOKEN_MAP` (2)

| Capability ID | `domainService` | Status | Resolution |
|---|---|---|---|
| `configure_pixel` *(deprecated)* | `PixelService.configure` | **FIXABLE — provider exists** | `PixelService` is a real, complete provider at `backend/src/kloel/services-v2/pixel.service.ts:24` with a purpose-built `configure(workspaceId, { productId, pixelType, pixelId, accessToken })` that normalizes the single-pixel shape and delegates to `ProductService.setPixels`. It is simply not yet in `SERVICE_TOKEN_MAP` nor registered as a `kloel.module` provider. Two HUB patches (below) wire it. The capability's `domainService` ref is already correct. |
| `products.link_campaign` | `CampaignsService.linkToProduct` | **NEEDS IMPLEMENTATION** | Double defect: (1) token `CampaignsService` (plural) is not a map key — the alias key is `CampaignService` (singular, → `CampaignsService` class); (2) more importantly, `linkToProduct` does not exist on `CampaignsService` (methods: create, findAll, list, createBroadcast, findOne, launch, launchTool, …). No product↔campaign link method exists anywhere. Fixing the token alone would only convert `unknown_service` → `method_not_found`, so the honest state is "needs implementation". Left unchanged to avoid a misleading half-fix. |

#### COMPOUND — multi-service, resolver skips by design (3)

`products.upload_image`, `upload_product_image` → `MediaService.attach + ProductService.setImage`;
`upload_plan_image` → `MediaService.attach + PlanService.setImage`.
The resolver intentionally returns `null` for `+`-joined refs (the dispatcher handles these via manual logic). Note: `ProductService.setImage` and `PlanService.setImage` exist, but `MediaService.attach` does **not** (MediaService exposes createVideoJob/uploadDocument/listDocuments/getDocument/deleteDocument). These need either a real `attach` method or a dedicated compound handler. Not counted against resolver coverage because the resolver never routes them.

#### ALIAS — registry pointer, executable via the target (2)

`generate_pix` → "Alias for sales.create_pix"; `generate_boleto` → "Alias for sales.create_boleto".
Both targets exist and are WIRED (`sales.create_pix` → `SalesService.createPixOrder`, `sales.create_boleto` → `SalesService.createBoletoOrder`).

### HUB patches required (returned to leader — NOT applied in this slice)

Only `configure_pixel` is fixable without new business logic. It requires two
edits to HUB-owned files (`domain-service-resolver.service.ts` and
`kloel.module.ts`) — both supplied as `hub_patches_for_leader`. `PixelService`'s
constructor deps (`ProductService`, `PrismaService`) are already resolvable in
the kloel module graph, so the registration is boot-safe.

## Per-domain Capability Tables

### Tier 0 — Self-awareness, Query, Mutation (tier-0)

Tier 0 is split into sub-partitions:

- `partitions/tier-0a-introspection.ts` — 11 capabilities
- `partitions/tier-0b-query.commerce.ts` — 9 capabilities
- `partitions/tier-0b-query.comms.ts` — 8 capabilities
- `partitions/tier-0b-query.sales.ts` — 8 capabilities
- `partitions/tier-0b-query.workspace.ts` — 5 capabilities
- `partitions/tier-0c-mutations.ts` — 12 capabilities

| Capability ID | Title | Category | `domainService` | Resolved at | Status |
|---|---|---|---|---|---|
| `self.capabilities` | Listar capacidades | SELF_AWARENESS | `CapabilityRegistry.filterFor` | `backend/src/kloel/capability-registry-v2/capability-registry-v2.service.ts:89` | WIRED |
| `self.health` | Saúde do sistema | SELF_AWARENESS | `HealthService.snapshot` | `backend/src/health/health.service.ts` | UNGATED (method missing) |
| `self.gaps` | Listar lacunas | SELF_AWARENESS | `CapabilityRegistry.listGaps` | `backend/src/kloel/capability-registry-v2/capability-registry-v2.service.ts:149` | WIRED |
| `dependencies` | Listar dependências | SELF_AWARENESS | `DepsCoverageService.dependencies` | `backend/src/kloel/self-awareness/deps-coverage.service.ts:37` | WIRED |
| `code_coverage` | Cobertura de código | SELF_AWARENESS | `DepsCoverageService.codeCoverage` | `backend/src/kloel/self-awareness/deps-coverage.service.ts:86` | WIRED |
| `affected_tests` | Testes afetados | SELF_AWARENESS | `DepsCoverageService.affectedTests` | `backend/src/kloel/self-awareness/deps-coverage.service.ts:99` | WIRED |
| `self.audit_log` | Log de ações | SELF_AWARENESS | `AuditService.recent` | `backend/src/audit/audit.service.ts:142` | WIRED |
| `self.explain` | Explicar capacidade | SELF_AWARENESS | `CapabilityRegistry.describe` | `backend/src/kloel/capability-registry-v2/capability-registry-v2.service.ts:112` | WIRED |
| `read_source_file` | Ler código fonte | SELF_AWARENESS | `CodeAccessService.read` | `backend/src/kloel/self-awareness/code-access.service.ts:80` | WIRED |
| `search_codebase` | Buscar no código | SELF_AWARENESS | `CodeAccessService.search` | `backend/src/kloel/self-awareness/code-access.service.ts:125` | WIRED |
| `list_source_dir` | Listar diretório fonte | SELF_AWARENESS | `CodeAccessService.listDir` | `backend/src/kloel/self-awareness/code-access.service.ts` | UNGATED (method missing) |
| `list_products` | Listar produtos | QUERY | `ProductService.list` | `backend/src/products/product.service.ts:190` | WIRED |
| `list_checkouts` | Listar checkouts | QUERY | `CheckoutService.list` | `backend/src/checkout/checkout.service.ts:425` | WIRED |
| `get_product_details` | Detalhes do produto | QUERY | `ProductService.get` | `backend/src/products/product.service.ts:178` | WIRED |
| `list_refunds` | Estornos | QUERY | `RefundService.list` | _(unresolved)_ | UNGATED (service missing) |
| `get_product_ai_config` | Configuração IA do produto | QUERY | `ProductAIConfigService.get` | _(unresolved)_ | UNGATED (service missing) |
| `get_product_plans` | Planos do produto | QUERY | `PlanService.listForProduct` | `backend/src/plans/plan.service.ts:113` | WIRED |
| `get_product_reviews` | Avaliações | QUERY | `ReviewService.listForProduct` | _(unresolved)_ | UNGATED (service missing) |
| `get_product_urls` | URLs do produto | QUERY | `ProductUrlService.list` | _(unresolved)_ | UNGATED (service missing) |
| `validate_coupon` | Validar cupom | QUERY | `CouponService.validate` | `backend/src/kloel/coupon.service.ts:192` | WIRED |
| `search_agent_memory` | Buscar na memória | QUERY | `MemoryService.search` | `backend/src/kloel/memory.service.ts` | UNGATED (method missing) |
| `search_agent_sessions` | Buscar sessões | QUERY | `SessionService.search` | _(unresolved)_ | UNGATED (service missing) |
| `get_whatsapp_status` | Status WhatsApp | QUERY | `WhatsAppService.status` | `backend/src/marketing/channels/whatsapp/whatsapp.service.ts` (alias K87) | WIRED |
| `transcribe_audio` | Transcrever áudio | QUERY | `AudioService.transcribe` | `backend/src/kloel/audio.service.ts:67` | WIRED |
| `list_whatsapp_chats` | Conversas WhatsApp | QUERY | `WhatsAppService.listChats` | _(unresolved)_ | UNGATED (service missing) |
| `list_whatsapp_contacts` | Contatos WhatsApp | QUERY | `WhatsAppService.listContacts` | _(unresolved)_ | UNGATED (service missing) |
| `get_social_channels` | Canais sociais | QUERY | `ChannelService.list` | _(unresolved)_ | UNGATED (service missing) |
| `search_web` | Buscar na web | QUERY | `SearchService.web` | _(unresolved)_ | UNGATED (service missing) |
| `get_nps` | NPS | QUERY | `NpsService.get` | _(unresolved)_ | UNGATED (service missing) |
| `get_order_details` | Detalhes do pedido | QUERY | `OrderService.get` | _(unresolved)_ | UNGATED (service missing) |
| `get_churn` | Churn | QUERY | `ChurnService.get` | _(unresolved)_ | UNGATED (service missing) |
| `get_dashboard_summary` | Resumo do dashboard | QUERY | `DashboardService.summary` | `backend/src/dashboard/dashboard.service.ts` | UNGATED (method missing) |
| `list_orders` | Listar vendas/pedidos | QUERY | `OrderService.list` | _(unresolved)_ | UNGATED (service missing) |
| `get_sales_summary` | Resumo de vendas | QUERY | `SalesService.summary` | `backend/src/sales/sales.service.ts` | UNGATED (method missing) |
| `get_abandonments` | Carrinhos abandonados | QUERY | `AbandonmentService.list` | _(unresolved)_ | UNGATED (service missing) |
| `list_subscriptions` | Listar assinaturas | QUERY | `SubscriptionService.list` | _(unresolved)_ | UNGATED (service missing) |
| `get_analytics` | Analytics | QUERY | `AnalyticsService.get` | `backend/src/analytics/analytics.service.ts` | UNGATED (method missing) |
| `get_billing_status` | Status faturamento | QUERY | `BillingService.status` | `backend/src/billing/billing.service.ts` | UNGATED (method missing) |
| `get_settings` | Configurações | QUERY | `WorkspaceService.getSettings` | `backend/src/workspaces/workspace.service.ts` | UNGATED (method missing) |
| `get_wallet_balance` | Saldo da carteira | QUERY | `WalletService.getBalance` | `backend/src/kloel/wallet.service.ts:57` | WIRED |
| `get_wallet_statement` | Extrato da carteira | QUERY | `WalletService.getStatement` | `backend/src/kloel/wallet.service.ts` | UNGATED (method missing) |
| `toggle_autopilot` | Ativar/desativar autopilot | MUTATION_SAFE | `AutopilotService.toggle` | `backend/src/autopilot/autopilot.service.ts:224` | WIRED |
| `change_plan` | Mudar plano | MUTATION_SENSITIVE | `BillingService.changePlan` | `backend/src/billing/billing.service.ts` | UNGATED (method missing) |
| `remember_user_info` | Lembrar informação | MUTATION_SAFE | `MemoryService.set` | `backend/src/kloel/memory.service.ts` | UNGATED (method missing) |
| `save_business_info` | Salvar info do negócio | MUTATION_SAFE | `WorkspaceService.updateInfo` | `backend/src/workspaces/workspace.service.ts:310` | WIRED |
| `set_brand_voice` | Definir voz da marca | CONFIGURATION | `BrandService.setVoice` | _(unresolved)_ | UNGATED (service missing) |
| `update_workspace_settings` | Atualizar configurações | CONFIGURATION | `WorkspaceService.updateSettings` | `backend/src/workspaces/workspace.service.ts:348` | WIRED |
| `set_business_hours` | Horário comercial | CONFIGURATION | `WorkspaceService.setHours` | `backend/src/workspaces/workspace.service.ts:364` | WIRED |
| `set_sales_policy` | Política de vendas | CONFIGURATION | `WorkspaceService.setPolicy` | `backend/src/workspaces/workspace.service.ts:403` | WIRED |
| `update_billing_info` | Atualizar faturamento | MUTATION_SENSITIVE | `BillingService.update` | `backend/src/billing/billing.service.ts` | UNGATED (method missing) |
| `configure_ai_persona` | Configurar persona IA | CONFIGURATION | `AIConfigService.update` | _(unresolved)_ | UNGATED (service missing) |
| `delete_coupon` | Excluir cupom | MUTATION_SAFE | `CouponService.delete` | `backend/src/kloel/coupon.service.ts:153` | WIRED |
| `upload_document` | Enviar documento | MUTATION_SENSITIVE | `DocumentService.upload` | _(unresolved)_ | UNGATED (service missing) |

### Tier 1 — Products

Source: `backend/src/kloel/capability-registry-v2/partitions/tier-1-products.ts`

| Capability ID | Title | Category | `domainService` | Resolved at | Status |
|---|---|---|---|---|---|
| `configure_pixel` | Configurar pixel | MUTATION_SAFE | `PixelService.configure` | _(unresolved)_ | UNGATED (service missing) |
| `upload_product_image` | Upload foto do produto | MUTATION_SAFE | `MediaService.attach + ProductService.setImage` | `backend/src/media/media.service.ts` | UNVERIFIED |
| `create_product` | Criar produto | MUTATION_SAFE | `ProductService.create` | `backend/src/products/product.service.ts:51` | WIRED |
| `save_product` | Salvar produto | MUTATION_SAFE | `ProductService.create` | `backend/src/products/product.service.ts:51` | WIRED |
| `update_product` | Atualizar produto | MUTATION_SAFE | `ProductService.update` | `backend/src/products/product.service.ts:103` | WIRED |
| `delete_product` | Excluir produto | MUTATION_SENSITIVE | `ProductService.delete` | `backend/src/products/product.service.ts:337` | WIRED |
| `configure_shipping` | Configurar frete | MUTATION_SAFE | `ShippingService.configure` | _(unresolved)_ | UNGATED (service missing) |
| `configure_warranty` | Configurar garantia | MUTATION_SAFE | `ProductService.update` | `backend/src/products/product.service.ts:103` | WIRED |
| `configure_exit_intent` | Popup de saída | MUTATION_SAFE | `CheckoutService.update` | `backend/src/checkout/checkout.service.ts:399` | WIRED |
| `products.create` | Criar produto | MUTATION_SAFE | `ProductService.create` | `backend/src/products/product.service.ts:51` | WIRED |
| `products.upload_image` | Upload imagem do produto | MUTATION_SAFE | `MediaService.attach + ProductService.setImage` | `backend/src/media/media.service.ts` | UNVERIFIED |
| `products.update` | Editar produto | MUTATION_SAFE | `ProductService.update` | `backend/src/products/product.service.ts:103` | WIRED |

### Tier 2 — Plans

Source: `backend/src/kloel/capability-registry-v2/partitions/tier-2-plans.ts`

| Capability ID | Title | Category | `domainService` | Resolved at | Status |
|---|---|---|---|---|---|
| `configure_order_bump` | Order bump | MUTATION_SAFE | `PlanService.configure` | `backend/src/plans/plan.service.ts` | UNGATED (method missing) |
| `upload_plan_image` | Upload foto do plano | MUTATION_SAFE | `MediaService.attach + PlanService.setImage` | `backend/src/media/media.service.ts` | UNVERIFIED |
| `create_plan` | Criar plano | MUTATION_SAFE | `PlanService.create` | `backend/src/plans/plan.service.ts:40` | WIRED |
| `update_plan` | Atualizar plano | MUTATION_SAFE | `PlanService.update` | `backend/src/plans/plan.service.ts:123` | WIRED |
| `delete_plan` | Excluir plano | MUTATION_SENSITIVE | `PlanService.delete` | `backend/src/plans/plan.service.ts:176` | WIRED |
| `plans.create` | Criar plano | MUTATION_SAFE | `PlanService.create` | `backend/src/plans/plan.service.ts:40` | WIRED |
| `plans.update` | Editar plano | MUTATION_SAFE | `PlanService.update` | `backend/src/plans/plan.service.ts:123` | WIRED |

### Tier 3 — Checkouts

Source: `backend/src/kloel/capability-registry-v2/partitions/tier-3-checkouts.ts`

| Capability ID | Title | Category | `domainService` | Resolved at | Status |
|---|---|---|---|---|---|
| `configure_social_proof` | Prova social | MUTATION_SAFE | `CheckoutService.update` | `backend/src/checkout/checkout.service.ts:399` | WIRED |
| `configure_after_pay` | Configurar After Pay | MUTATION_SAFE | `CheckoutService.update` | `backend/src/checkout/checkout.service.ts:399` | WIRED |
| `create_checkout` | Criar checkout | MUTATION_SAFE | `CheckoutService.create` | `backend/src/checkout/checkout.service.ts:351` | WIRED |
| `update_checkout` | Atualizar checkout | MUTATION_SAFE | `CheckoutService.update` | `backend/src/checkout/checkout.service.ts:399` | WIRED |
| `delete_checkout` | Excluir checkout | MUTATION_SENSITIVE | `CheckoutService.delete` | `backend/src/checkout/checkout.service.ts:414` | WIRED |
| `checkouts.create` | Criar checkout | MUTATION_SAFE | `CheckoutService.create` | `backend/src/checkout/checkout.service.ts:351` | WIRED |
| `checkouts.update` | Editar checkout | MUTATION_SAFE | `CheckoutService.update` | `backend/src/checkout/checkout.service.ts:399` | WIRED |

### Tier 4 — Coupons

Source: `backend/src/kloel/capability-registry-v2/partitions/tier-4-coupons.ts`

| Capability ID | Title | Category | `domainService` | Resolved at | Status |
|---|---|---|---|---|---|
| `list_coupons` | Listar cupons | QUERY | `CouponService.list` | `backend/src/kloel/coupon.service.ts:174` | WIRED |
| `create_coupon` | Criar cupom | MUTATION_SAFE | `CouponService.create` | `backend/src/kloel/coupon.service.ts:19` | WIRED |
| `update_coupon` | Atualizar cupom | MUTATION_SAFE | `CouponService.update` | `backend/src/kloel/coupon.service.ts:82` | WIRED |
| `coupons.create` | Criar cupom | MUTATION_SAFE | `CouponService.create` | `backend/src/kloel/coupon.service.ts:19` | WIRED |
| `coupons.delete` | Excluir cupom | MUTATION_SAFE | `CouponService.delete` | `backend/src/kloel/coupon.service.ts:153` | WIRED |

### Tier 5 — Sales

Source: `backend/src/kloel/capability-registry-v2/partitions/tier-5-sales.ts`

| Capability ID | Title | Category | `domainService` | Resolved at | Status |
|---|---|---|---|---|---|
| `create_order` | Criar pedido | MUTATION_SENSITIVE | `CheckoutService.createOrder` | `backend/src/checkout/checkout.service.ts:149` | WIRED |
| `generate_pix` | Gerar PIX (alias legado) | MUTATION_SENSITIVE | `Alias for sales.create_pix` | `Alias for sales.create_pix` | ALIAS |
| `generate_boleto` | Gerar boleto (alias legado) | MUTATION_SENSITIVE | `Alias for sales.create_boleto` | `Alias for sales.create_boleto` | ALIAS |
| `create_payment_link` | Link de pagamento | MUTATION_SENSITIVE | `PaymentService.createPayment` | `backend/src/kloel/payment.service.ts:237` | WIRED |
| `sales.create_pix` | Gerar PIX | MUTATION_SENSITIVE | `SalesService.createPixOrder` | `backend/src/sales/sales.service.ts:85` | WIRED |
| `sales.create_boleto` | Gerar boleto | MUTATION_SENSITIVE | `SalesService.createBoletoOrder` | `backend/src/sales/sales.service.ts:115` | WIRED |
| `sales.create_card_link` | Gerar link de cartão | MUTATION_SENSITIVE | `SalesService.createStripeCardLink` | `backend/src/sales/sales.service.ts:125` | WIRED |
| `sales.refund` | Estornar venda | MUTATION_SENSITIVE | `SalesService.refund` | `backend/src/sales/sales.service.ts:351` | WIRED |

### Tier 6 — URLs

Source: `backend/src/kloel/capability-registry-v2/partitions/tier-6-urls.ts`

| Capability ID | Title | Category | `domainService` | Resolved at | Status |
|---|---|---|---|---|---|
| `add_url` | Adicionar URL | MUTATION_SAFE | `ProductUrlService.add` | _(unresolved)_ | UNGATED (service missing) |
| `update_url` | Editar URL | MUTATION_SAFE | `ProductUrlService.update` | _(unresolved)_ | UNGATED (service missing) |
| `delete_url` | Remover URL | MUTATION_SAFE | `ProductUrlService.delete` | _(unresolved)_ | UNGATED (service missing) |
| `urls.add` | Adicionar URL | MUTATION_SAFE | `ProductUrlService.add` | _(unresolved)_ | UNGATED (service missing) |

### Tier 7 — Affiliates

Source: `backend/src/kloel/capability-registry-v2/partitions/tier-7-affiliates.ts`

| Capability ID | Title | Category | `domainService` | Resolved at | Status |
|---|---|---|---|---|---|
| `get_affiliate_config` | Configuração de afiliados | QUERY | `AffiliateService.getConfig` | `backend/src/affiliate/affiliate.service.ts:8` | WIRED |
| `update_affiliate_config` | Atualizar afiliados | MUTATION_SAFE | `AffiliateService.configure` | `backend/src/affiliate/affiliate.service.ts:35` | WIRED |
| `list_affiliates` | Listar afiliados | QUERY | `AffiliateService.list` | `backend/src/affiliate/affiliate.service.ts:72` | WIRED |
| `affiliates.configure` | Configurar afiliados | MUTATION_SAFE | `AffiliateService.configure` | `backend/src/affiliate/affiliate.service.ts:35` | WIRED |

### Tier 8 — CRM

Source: `backend/src/kloel/capability-registry-v2/partitions/tier-8-crm.ts`

| Capability ID | Title | Category | `domainService` | Resolved at | Status |
|---|---|---|---|---|---|
| `update_subscription` | Gerenciar assinatura | MUTATION_SENSITIVE | `SubscriptionService.update` | _(unresolved)_ | UNGATED (service missing) |
| `browse_marketplace` | Explorar marketplace | QUERY | `MarketplaceService.list` | `backend/src/marketplace/marketplace.service.ts:42` | WIRED |
| `get_lead_details` | Detalhes do lead | QUERY | `LeadService.get` | _(unresolved)_ | UNGATED (service missing) |
| `crm.pipeline` | Pipeline CRM | QUERY | `CrmService.getPipeline` | `backend/src/crm/crm.service.ts:233` | WIRED |
| `sales.list` | Listar vendas | QUERY | `OrderService.list` | _(unresolved)_ | UNGATED (service missing) |
| `sales.fill_buyer_data` | Preencher dados do comprador | MUTATION_SENSITIVE | `SalesService.fillBuyerData` | `backend/src/sales/sales.service.ts:313` | WIRED |

### Tier 9 — Wallet

Source: `backend/src/kloel/capability-registry-v2/partitions/tier-9-wallet.ts`

| Capability ID | Title | Category | `domainService` | Resolved at | Status |
|---|---|---|---|---|---|
| `request_withdrawal` | Solicitar saque | MUTATION_SENSITIVE | `WalletService.withdraw` | `backend/src/kloel/wallet.service.ts` | UNGATED (method missing) |
| `request_anticipation` | Solicitar antecipação | MUTATION_SENSITIVE | `WalletService.anticipate` | `backend/src/kloel/wallet.service.ts` | UNGATED (method missing) |
| `wallet.balance` | Saldo da carteira | QUERY | `WalletService.getBalanceCents` | `backend/src/kloel/wallet.service.ts:389` | WIRED |
| `wallet.withdraw` | Solicitar saque | MUTATION_SENSITIVE | `WalletService.requestWithdrawalCents` | `backend/src/kloel/wallet.service.ts:428` | WIRED |

### Tier 10 — Reports

Source: `backend/src/kloel/capability-registry-v2/partitions/tier-10-reports.ts`

| Capability ID | Title | Category | `domainService` | Resolved at | Status |
|---|---|---|---|---|---|
| `create_broadcast` | Criar campanha | MUTATION_SAFE | `CampaignService.createBroadcast` | _(unresolved)_ | UNGATED (service missing) |
| `connect_channel` | Conectar canal | MUTATION_SAFE | `ChannelService.connect` | _(unresolved)_ | UNGATED (service missing) |
| `connect_whatsapp` | Conectar WhatsApp | MUTATION_SAFE | `WhatsAppService.connect` | _(unresolved)_ | UNGATED (service missing) |
| `create_campaign` | Criar campanha | MUTATION_SAFE | `CampaignService.create` | _(unresolved)_ | UNGATED (service missing) |
| `create_flow` | Criar fluxo | MUTATION_SAFE | `FlowService.create` | _(unresolved)_ | UNGATED (service missing) |
| `list_flows` | Listar fluxos | QUERY | `FlowService.list` | _(unresolved)_ | UNGATED (service missing) |
| `send_whatsapp_message` | Enviar WhatsApp | COMMUNICATION | `MessagingService.sendWhatsApp` | _(unresolved)_ | UNGATED (service missing) |
| `send_channel_message` | Enviar por canal | COMMUNICATION | `ChannelService.send` | _(unresolved)_ | UNGATED (service missing) |
| `send_audio` | Enviar áudio | COMMUNICATION | `MessagingService.sendAudio` | _(unresolved)_ | UNGATED (service missing) |
| `send_document` | Enviar documento | COMMUNICATION | `MessagingService.sendDocument` | _(unresolved)_ | UNGATED (service missing) |
| `send_voice_note` | Enviar nota de voz | COMMUNICATION | `MessagingService.sendVoiceNote` | _(unresolved)_ | UNGATED (service missing) |
| `reports.operations` | Operações | QUERY | `ReportService.getOperations` | `backend/src/kloel/report.service.ts` | UNGATED (method missing) |
| `reports.abandonments` | Carrinhos abandonados | QUERY | `ReportService.getAbandonments` | `backend/src/kloel/report.service.ts` | UNGATED (method missing) |
| `get_whatsapp_messages` | Mensagens WhatsApp | QUERY | `WhatsAppService.getMessages` | _(unresolved)_ | UNGATED (service missing) |
| `get_whatsapp_backlog` | Backlog WhatsApp | QUERY | `WhatsAppService.getBacklog` | _(unresolved)_ | UNGATED (service missing) |
| `set_whatsapp_presence` | Presença WhatsApp | MUTATION_SAFE | `WhatsAppService.setPresence` | _(unresolved)_ | UNGATED (service missing) |
| `sync_whatsapp_history` | Sincronizar WhatsApp | MUTATION_SAFE | `WhatsAppService.syncHistory` | `backend/src/marketing/channels/whatsapp/whatsapp.service.ts` (alias K87) | WIRED |
| `create_agent_job` | Criar job agente | MUTATION_SAFE | `AgentJobService.create` | _(unresolved)_ | UNGATED (service missing) |
| `list_agent_jobs` | Listar jobs agente | QUERY | `AgentJobService.list` | _(unresolved)_ | UNGATED (service missing) |
| `set_agent_job_enabled` | Ativar/desativar job | MUTATION_SAFE | `AgentJobService.setEnabled` | _(unresolved)_ | UNGATED (service missing) |

### Tier 11 — Configuration

Source: `backend/src/kloel/capability-registry-v2/partitions/tier-11-configuration.ts`

| Capability ID | Title | Category | `domainService` | Resolved at | Status |
|---|---|---|---|---|---|
| `toggle_theme` | Alternar tema | CONFIGURATION | `ThemeService.set` | _(unresolved)_ | UNGATED (service missing) |
| `update_fiscal_data` | Atualizar dados fiscais | MUTATION_SENSITIVE | `AccountService.updateFiscalData` | `backend/src/kloel/account.service.ts:28` | WIRED |
| `account.update_fiscal` | Atualizar dados fiscais | MUTATION_SENSITIVE | `AccountService.updateFiscalData` | `backend/src/kloel/account.service.ts:28` | WIRED |
| `account.update_bank` | Atualizar dados bancários | MUTATION_SENSITIVE | `AccountService.updateBankAccount` | `backend/src/kloel/account.service.ts` | UNGATED (method missing) |
| `account.set_pix_key` | Cadastrar chave PIX | MUTATION_SENSITIVE | `AccountService.setPixKey` | `backend/src/kloel/account.service.ts` | UNGATED (method missing) |
| `account.upload_document` | Enviar documento | MUTATION_SENSITIVE | `DocumentService.upload` | _(unresolved)_ | UNGATED (service missing) |
| `ui.theme` | Alternar tema | CONFIGURATION | `ThemeService.set` | _(unresolved)_ | UNGATED (service missing) |
| `update_personal_data` | Atualizar dados pessoais | MUTATION_SENSITIVE | `AccountService.updatePersonalData` | `backend/src/kloel/account.service.ts:14` | WIRED |
| `set_pix_key` | Cadastrar chave PIX | MUTATION_SENSITIVE | `AccountService.setPixKey` | `backend/src/kloel/account.service.ts` | UNGATED (method missing) |

### Tier 12 — Marketing

Source: `backend/src/kloel/capability-registry-v2/partitions/tier-12-marketing.ts`

| Capability ID | Title | Category | `domainService` | Resolved at | Status |
|---|---|---|---|---|---|
| `whatsapp.send` | Enviar WhatsApp | COMMUNICATION | `MessagingService.sendWhatsApp` | _(unresolved)_ | UNGATED (service missing) |
| `instagram.send_dm` | Enviar DM Instagram | COMMUNICATION | `MessagingService.sendInstagramDM` | _(unresolved)_ | UNGATED (service missing) |
| `email.send` | Enviar email | COMMUNICATION | `MessagingService.sendEmail` | _(unresolved)_ | UNGATED (service missing) |

## Wiring Gaps

Capabilities whose `domainService` cannot be resolved at runtime via `ModulesContainer`. These must either be (a) implemented, (b) re-pointed to an existing service, or (c) removed from the registry.

### Gap class A — Service missing (no `export class <Service>` anywhere)

| Capability ID | Tier | Declared `domainService` | Partition file |
|---|---:|---|---|
| `configure_ai_persona` | 0 | `AIConfigService.update` | `tier-0c-mutations.ts` |
| `get_abandonments` | 0 | `AbandonmentService.list` | `tier-0b-query.sales.ts` |
| `get_churn` | 0 | `ChurnService.get` | `tier-0b-query.sales.ts` |
| `get_nps` | 0 | `NpsService.get` | `tier-0b-query.sales.ts` |
| `get_order_details` | 0 | `OrderService.get` | `tier-0b-query.sales.ts` |
| `get_product_ai_config` | 0 | `ProductAIConfigService.get` | `tier-0b-query.commerce.ts` |
| `get_product_reviews` | 0 | `ReviewService.listForProduct` | `tier-0b-query.commerce.ts` |
| `get_product_urls` | 0 | `ProductUrlService.list` | `tier-0b-query.commerce.ts` |
| `get_social_channels` | 0 | `ChannelService.list` | `tier-0b-query.comms.ts` |
| `get_whatsapp_status` | 0 | `WhatsAppService.status` | `tier-0b-query.comms.ts` |
| `list_orders` | 0 | `OrderService.list` | `tier-0b-query.sales.ts` |
| `list_refunds` | 0 | `RefundService.list` | `tier-0b-query.commerce.ts` |
| `list_subscriptions` | 0 | `SubscriptionService.list` | `tier-0b-query.sales.ts` |
| `list_whatsapp_chats` | 0 | `WhatsAppService.listChats` | `tier-0b-query.comms.ts` |
| `list_whatsapp_contacts` | 0 | `WhatsAppService.listContacts` | `tier-0b-query.comms.ts` |
| `search_agent_sessions` | 0 | `SessionService.search` | `tier-0b-query.comms.ts` |
| `search_web` | 0 | `SearchService.web` | `tier-0b-query.comms.ts` |
| `set_brand_voice` | 0 | `BrandService.setVoice` | `tier-0c-mutations.ts` |
| `upload_document` | 0 | `DocumentService.upload` | `tier-0c-mutations.ts` |
| `configure_pixel` | 1 | `PixelService.configure` | `tier-1-products.ts` |
| `configure_shipping` | 1 | `ShippingService.configure` | `tier-1-products.ts` |
| `add_url` | 6 | `ProductUrlService.add` | `tier-6-urls.ts` |
| `delete_url` | 6 | `ProductUrlService.delete` | `tier-6-urls.ts` |
| `update_url` | 6 | `ProductUrlService.update` | `tier-6-urls.ts` |
| `urls.add` | 6 | `ProductUrlService.add` | `tier-6-urls.ts` |
| `get_lead_details` | 8 | `LeadService.get` | `tier-8-crm.ts` |
| `sales.list` | 8 | `OrderService.list` | `tier-8-crm.ts` |
| `update_subscription` | 8 | `SubscriptionService.update` | `tier-8-crm.ts` |
| `connect_channel` | 10 | `ChannelService.connect` | `tier-10-reports.ts` |
| `connect_whatsapp` | 10 | `WhatsAppService.connect` | `tier-10-reports.ts` |
| `create_agent_job` | 10 | `AgentJobService.create` | `tier-10-reports.ts` |
| `create_broadcast` | 10 | `CampaignService.createBroadcast` | `tier-10-reports.ts` |
| `create_campaign` | 10 | `CampaignService.create` | `tier-10-reports.ts` |
| `create_flow` | 10 | `FlowService.create` | `tier-10-reports.ts` |
| `get_whatsapp_backlog` | 10 | `WhatsAppService.getBacklog` | `tier-10-reports.ts` |
| `get_whatsapp_messages` | 10 | `WhatsAppService.getMessages` | `tier-10-reports.ts` |
| `list_agent_jobs` | 10 | `AgentJobService.list` | `tier-10-reports.ts` |
| `list_flows` | 10 | `FlowService.list` | `tier-10-reports.ts` |
| `send_audio` | 10 | `MessagingService.sendAudio` | `tier-10-reports.ts` |
| `send_channel_message` | 10 | `ChannelService.send` | `tier-10-reports.ts` |
| `send_document` | 10 | `MessagingService.sendDocument` | `tier-10-reports.ts` |
| `send_voice_note` | 10 | `MessagingService.sendVoiceNote` | `tier-10-reports.ts` |
| `send_whatsapp_message` | 10 | `MessagingService.sendWhatsApp` | `tier-10-reports.ts` |
| `set_agent_job_enabled` | 10 | `AgentJobService.setEnabled` | `tier-10-reports.ts` |
| `set_whatsapp_presence` | 10 | `WhatsAppService.setPresence` | `tier-10-reports.ts` |
| `sync_whatsapp_history` | 10 | `WhatsAppService.syncHistory` | `tier-10-reports.ts` |
| `account.upload_document` | 11 | `DocumentService.upload` | `tier-11-configuration.ts` |
| `toggle_theme` | 11 | `ThemeService.set` | `tier-11-configuration.ts` |
| `ui.theme` | 11 | `ThemeService.set` | `tier-11-configuration.ts` |
| `email.send` | 12 | `MessagingService.sendEmail` | `tier-12-marketing.ts` |
| `instagram.send_dm` | 12 | `MessagingService.sendInstagramDM` | `tier-12-marketing.ts` |
| `whatsapp.send` | 12 | `MessagingService.sendWhatsApp` | `tier-12-marketing.ts` |

### Gap class B — Method missing (service exists but method is not defined)

| Capability ID | Tier | Declared `domainService` | Service file (found, method missing) | Partition file |
|---|---:|---|---|---|
| `change_plan` | 0 | `BillingService.changePlan` | `backend/src/billing/billing.service.ts` | `tier-0c-mutations.ts` |
| `get_analytics` | 0 | `AnalyticsService.get` | `backend/src/analytics/analytics.service.ts` | `tier-0b-query.workspace.ts` |
| `get_billing_status` | 0 | `BillingService.status` | `backend/src/billing/billing.service.ts` | `tier-0b-query.workspace.ts` |
| `get_dashboard_summary` | 0 | `DashboardService.summary` | `backend/src/dashboard/dashboard.service.ts` | `tier-0b-query.sales.ts` |
| `get_sales_summary` | 0 | `SalesService.summary` | `backend/src/sales/sales.service.ts` | `tier-0b-query.sales.ts` |
| `get_settings` | 0 | `WorkspaceService.getSettings` | `backend/src/workspaces/workspace.service.ts` | `tier-0b-query.workspace.ts` |
| `get_wallet_statement` | 0 | `WalletService.getStatement` | `backend/src/kloel/wallet.service.ts` | `tier-0b-query.workspace.ts` |
| `list_source_dir` | 0 | `CodeAccessService.listDir` | `backend/src/kloel/self-awareness/code-access.service.ts` | `tier-0a-introspection.ts` |
| `remember_user_info` | 0 | `MemoryService.set` | `backend/src/kloel/memory.service.ts` | `tier-0c-mutations.ts` |
| `search_agent_memory` | 0 | `MemoryService.search` | `backend/src/kloel/memory.service.ts` | `tier-0b-query.comms.ts` |
| `self.health` | 0 | `HealthService.snapshot` | `backend/src/health/health.service.ts` | `tier-0a-introspection.ts` |
| `update_billing_info` | 0 | `BillingService.update` | `backend/src/billing/billing.service.ts` | `tier-0c-mutations.ts` |
| `configure_order_bump` | 2 | `PlanService.configure` | `backend/src/plans/plan.service.ts` | `tier-2-plans.ts` |
| `request_anticipation` | 9 | `WalletService.anticipate` | `backend/src/kloel/wallet.service.ts` | `tier-9-wallet.ts` |
| `request_withdrawal` | 9 | `WalletService.withdraw` | `backend/src/kloel/wallet.service.ts` | `tier-9-wallet.ts` |
| `reports.abandonments` | 10 | `ReportService.getAbandonments` | `backend/src/kloel/report.service.ts` | `tier-10-reports.ts` |
| `reports.operations` | 10 | `ReportService.getOperations` | `backend/src/kloel/report.service.ts` | `tier-10-reports.ts` |
| `account.set_pix_key` | 11 | `AccountService.setPixKey` | `backend/src/kloel/account.service.ts` | `tier-11-configuration.ts` |
| `account.update_bank` | 11 | `AccountService.updateBankAccount` | `backend/src/kloel/account.service.ts` | `tier-11-configuration.ts` |
| `set_pix_key` | 11 | `AccountService.setPixKey` | `backend/src/kloel/account.service.ts` | `tier-11-configuration.ts` |

### Gap class C — Compound resolver (unverified)

Composite `X.foo + Y.bar` resolvers are not resolvable by the DI reflection path (see `listGaps()` in the service — it short-circuits on `+`). They require orchestration code at the dispatcher layer.

| Capability ID | Tier | Declared `domainService` | Partition file |
|---|---:|---|---|
| `products.upload_image` | 1 | `MediaService.attach + ProductService.setImage` | `tier-1-products.ts` |
| `upload_product_image` | 1 | `MediaService.attach + ProductService.setImage` | `tier-1-products.ts` |
| `upload_plan_image` | 2 | `MediaService.attach + PlanService.setImage` | `tier-2-plans.ts` |

### Gap class D — Alias-only pointers

Capabilities whose `domainService` is the string `Alias for <other-id>`. These are kept as registry pointers so different surfaces can refer to the same action under multiple IDs. They are not directly dispatchable — the dispatcher must follow the alias.

| Capability ID | Tier | Alias pointer | Partition file |
|---|---:|---|---|
| `generate_boleto` | 5 | `Alias for sales.create_boleto` | `tier-5-sales.ts` |
| `generate_pix` | 5 | `Alias for sales.create_pix` | `tier-5-sales.ts` |

## Coverage Summary

**65 of 142 declared capabilities are WIRED to a concrete service method = 45.8% coverage** *(measured against the original 142-capability set at the Mission-5 / K87 scan; the registry now declares 202 — the +60 post-Wave-4 capabilities are not yet included in this coverage figure and the percentage must be recomputed against 202 before it is quoted as current).*

Breakdown of the remaining gap:

- 20 capabilities (14.1%) point to an existing service class but a missing method — the service file is real, the method is not. Highest-leverage fix surface: implement the method in-place.
- 52 capabilities (36.6%) point to a service class that has **no** `export class` definition anywhere in `backend/src` or `worker/src`. These are domain placeholders awaiting a service skeleton.
- 3 capabilities use compound resolvers (`X.foo + Y.bar`) which the DI reflection guard short-circuits.
- 2 capabilities are alias pointers and are intentionally non-dispatchable.

### Coverage by tier

| Tier | Domain | WIRED / Total | Coverage |
|---|---|---:|---:|
| 0 | Self-awareness, Query, Mutation (tier-0) | 22 / 53 | 42% |
| 1 | Products | 8 / 12 | 67% |
| 2 | Plans | 5 / 7 | 71% |
| 3 | Checkouts | 7 / 7 | 100% |
| 4 | Coupons | 5 / 5 | 100% |
| 5 | Sales | 6 / 8 | 75% |
| 6 | URLs | 0 / 4 | 0% |
| 7 | Affiliates | 4 / 4 | 100% |
| 8 | CRM | 3 / 6 | 50% |
| 9 | Wallet | 2 / 4 | 50% |
| 10 | Reports | 0 / 20 | 0% |
| 11 | Configuration | 3 / 9 | 33% |
| 12 | Marketing | 0 / 3 | 0% |

### Distinct resolver services referenced

- **49** distinct service names referenced by capabilities.
- **25** resolve to an `export class` declaration; **24** do not.

#### Resolved services (and their files)

| Service | File |
|---|---|
| `AccountService` | `backend/src/kloel/account.service.ts` |
| `AffiliateService` | `backend/src/affiliate/affiliate.service.ts` |
| `AnalyticsService` | `backend/src/analytics/analytics.service.ts` |
| `AudioService` | `backend/src/kloel/audio.service.ts` |
| `AuditService` | `backend/src/audit/audit.service.ts` |
| `AutopilotService` | `backend/src/autopilot/autopilot.service.ts` |
| `BillingService` | `backend/src/billing/billing.service.ts` |
| `CapabilityRegistry` | `backend/src/kloel/capability-registry-v2/capability-registry-v2.service.ts` |
| `CheckoutService` | `backend/src/checkout/checkout.service.ts` |
| `CodeAccessService` | `backend/src/kloel/self-awareness/code-access.service.ts` |
| `CouponService` | `backend/src/kloel/coupon.service.ts` |
| `CrmService` | `backend/src/crm/crm.service.ts` |
| `DashboardService` | `backend/src/dashboard/dashboard.service.ts` |
| `DepsCoverageService` | `backend/src/kloel/self-awareness/deps-coverage.service.ts` |
| `HealthService` | `backend/src/health/health.service.ts` |
| `MarketplaceService` | `backend/src/marketplace/marketplace.service.ts` |
| `MediaService` | `backend/src/media/media.service.ts` |
| `MemoryService` | `backend/src/kloel/memory.service.ts` |
| `PaymentService` | `backend/src/kloel/payment.service.ts` |
| `PlanService` | `backend/src/plans/plan.service.ts` |
| `ProductService` | `backend/src/products/product.service.ts` |
| `ReportService` | `backend/src/kloel/report.service.ts` |
| `SalesService` | `backend/src/sales/sales.service.ts` |
| `WalletService` | `backend/src/kloel/wallet.service.ts` |
| `WorkspaceService` | `backend/src/workspaces/workspace.service.ts` |

#### Unresolved services (registry refers to them but no class exists)

| Service | Capabilities referencing it |
|---|---|
| `AIConfigService` | `configure_ai_persona` |
| `AbandonmentService` | `get_abandonments` |
| `AgentJobService` | `create_agent_job`, `list_agent_jobs`, `set_agent_job_enabled` |
| `BrandService` | `set_brand_voice` |
| `CampaignService` | `create_broadcast`, `create_campaign` |
| `ChannelService` | `get_social_channels`, `connect_channel`, `send_channel_message` |
| `ChurnService` | `get_churn` |
| `DocumentService` | `upload_document`, `account.upload_document` |
| `FlowService` | `create_flow`, `list_flows` |
| `LeadService` | `get_lead_details` |
| `MessagingService` | `send_whatsapp_message`, `send_audio`, `send_document`, `send_voice_note`, `whatsapp.send`, `instagram.send_dm`, `email.send` |
| `NpsService` | `get_nps` |
| `OrderService` | `get_order_details`, `list_orders`, `sales.list` |
| `PixelService` | `configure_pixel` |
| `ProductAIConfigService` | `get_product_ai_config` |
| `ProductUrlService` | `get_product_urls`, `add_url`, `update_url`, `delete_url`, `urls.add` |
| `RefundService` | `list_refunds` |
| `ReviewService` | `get_product_reviews` |
| `SearchService` | `search_web` |
| `SessionService` | `search_agent_sessions` |
| `ShippingService` | `configure_shipping` |
| `SubscriptionService` | `list_subscriptions`, `update_subscription` |
| `ThemeService` | `toggle_theme`, `ui.theme` |
| `WhatsAppService` | `get_whatsapp_status`, `list_whatsapp_chats`, `list_whatsapp_contacts`, `connect_whatsapp`, `get_whatsapp_messages`, `get_whatsapp_backlog`, `set_whatsapp_presence`, `sync_whatsapp_history` |

## Reproducibility

This document is regenerable from source. The procedure is:

1. Enumerate capability objects in `backend/src/kloel/capability-registry-v2/partitions/*.ts` (extract `id`, `title`, `category`, `tier`, `domainService`).
2. For each unique `ServiceName` referenced by a capability, locate the file with `rg "export class <ServiceName>\b" backend/src worker/src`. Capability with no match → `UNGATED (service missing)`.
3. For each capability whose service is found, look up the method in that file using a definition-shape regex. Match → `WIRED`. No match → `UNGATED (method missing)`.
4. Compound `X.foo + Y.bar` resolvers → `UNVERIFIED` (matches the runtime short-circuit in `listGaps()`).
5. `Alias for ...` resolvers → `ALIAS`.

The same logic runs at boot through `CapabilityRegistryV2Service.listGaps()`, which uses `ModulesContainer` to dynamically inspect the live NestJS DI graph. The runtime check is stricter: it also requires the provider to be actually registered in a module, not just declared as a class.
