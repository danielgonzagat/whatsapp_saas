# KloelGraph canonical screen map

Data: 2026-05-30.

Escopo deste documento: autopsia canonica do frontend real para o PR #462. O
grafo e a nova casca de navegacao; as telas abertas continuam sendo as rotas e
componentes reais existentes no repositorio.

## Chrome removido da experiencia principal

- Montagem atual: `frontend/src/app/(main)/layout.tsx` renderiza
  `MainAppLayoutShell`.
- Chrome antigo: `frontend/src/components/kloel/AppShell.tsx`, com
  `KloelSidebar`, `SidebarNav`, `SidebarRecents`, mobile chrome e
  `CommandPalette`.
- Entrada nova: `MainAppLayoutShell` escolhe `KloelGraphShell` quando
  `NEXT_PUBLIC_KLOEL_GRAPH_ENABLED`, ou `KLOEL_GRAPH_ENABLED`, for `true`, `1`
  ou `on`.
- Rollback: a sidebar antiga permanece intacta atras da flag.

## Mapa no -> tela canonica

| No do Graph | Tela canonica equivalente | Arquivo da tela | Rota original | Componente raiz | Subcomponentes / hooks importantes | Visual que deve ser preservado | Como abre no overlay 80% | Status | Pendencias |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Perfil | Perfil / Configuracoes | `frontend/src/app/(main)/settings/page.tsx` | `/settings` | `ContaView` | `ContaDadosPessoaisSection`, `ContaDadosFiscaisSection`, `ContaDadosBancariosSection`, `ContaTeamSection` | Tela de conta real, secoes e formularios reais | No `perfil` aponta para `/settings`; rota renderiza como `children` dentro do overlay | Implementado via rota real | Comparacao visual manual |
| Dashboard | Home/Dashboard | `frontend/src/app/(main)/dashboard/page.tsx` | `/dashboard` | `HomeView` | `HomeKpiTiles`, `HomeRecentActivity`, `useDashboardPostPayment` | Saudacao, periodo, KPIs, atividade recente, painel pos-pagamento | No `dashboard` aponta para `/dashboard` | Implementado via rota real | Comparacao visual manual |
| Kloel | Chat/HUB Kloel | `frontend/src/app/(main)/chat/page.tsx` | `/chat` | `KloelDashboard` | `KloelChatComposer`, `UniversalComposer`-style composer, `useConversationHistory`, `useKloelFiles` | Chat, composer, uploads, chips, historico | No `kloel` e `kloel-chat` apontam para `/chat` | Implementado via rota real | Comparacao visual manual |
| Novo Chat | Chat real | `frontend/src/app/(main)/chat/page.tsx` | `/chat` | `KloelDashboard` | Composer, anexos, streaming, historico | Chat canonico | No `kloel-chat` abre `/chat` | Implementado via rota real | Validar fluxo humano de envio |
| Buscar | Busca/Command Palette real | `frontend/src/components/kloel/CommandPalette.tsx` | Acionada dentro do graph | `CommandPalette` | `useCommandPalette`, `search/use-command-palette` | Modal de busca real e resultados/recentes reais | No `kloel-search` aciona a CommandPalette existente | Implementado com componente real | Nao e rota-pagina; validacao visual manual |
| Imagens | Kloel com capacidade real de imagem/upload | `frontend/src/app/(main)/chat/page.tsx` | `/chat?graphAction=images` | `KloelDashboard` | `useKloelFiles`, upload de arquivo, capability `create_image` | Composer e anexos reais | No `kloel-images` abre o chat real | Parcial | Falta tela/galeria canonica dedicada se o produto exigir uma |
| Recentes | Recentes da busca/conversas | `frontend/src/components/kloel/CommandPalette.tsx` | Acionada dentro do graph | `CommandPalette` | `useConversationHistory`, `mapRecentConversation` | Lista real de conversas recentes | No `kloel-recents` aciona CommandPalette em modo conversas | Implementado com componente real | Nao ha tela dedicada de recentes |
| Criar | Meus Produtos | `frontend/src/app/(main)/products/page.tsx` | `/products` | `ProdutosView defaultTab="produtos"` | `ProdutosMeusProdutosTab`, `ProductsListing`, `ProductCardGrid`, `ProductFilters`, `ProductActions` | Produtos, cards, filtros, CTA novo produto, estados reais | No `criar` e `criar-products` apontam para `/products` | Implementado via rota real | Comparacao visual manual |
| Novo produto | Wizard real de produto | `frontend/src/app/(main)/products/new/page.tsx` | `/products/new` | `NewProductPage` | `MonitorStepper`, `StepDetalhes`, `StepVendas`, `StepEmbalagem`, `StepEntrega`, `StepAfiliacao`, `StepPagamento`, `StepRevisao` | Flow de 7 etapas, upload, validacao e salvar real | No `criar-new-product` aponta para `/products/new` | Implementado via rota real | Validar criacao ponta a ponta com backend |
| Produto | Editor real de produto | `frontend/src/app/(main)/products/[id]/page.tsx` | `/products/:id` | `ProductNerveCenter` | 10 abas reais em `PRODUCT_NERVE_TABS`, `useProduct`, `useProductMutations`, `useCheckoutPlans` | Header, abas, formularios, modais e salvamento real | Nos dinamicos de produto apontam para `/products/:id` | Implementado via dados reais de `useProducts` | Comparacao visual manual |
| Dados / Planos / Checkouts / URLs / Comissao / Cupons / Campanhas / Avaliacoes / After Pay / IA | Abas reais do ProductNerveCenter | `frontend/src/components/kloel/products/ProductNerveCenterRoot.js` | `/products/:id?tab=<tab>` | `ProductNerveCenter` | `PRODUCT_NERVE_TABS`, tabs especificas | Visual e logica de cada aba | Subnos dinamicos apontam para `?tab=` | Implementado | Validar cada aba no browser |
| Plano | Detalhe real de plano | `frontend/src/app/(main)/products/[id]/plans/[planId]/page.tsx` | `/products/:id/plans/:planId` | `PlanDetailPage` | `PlanStoreTab`, `PlanPaymentTab`, `PlanShippingTab`, `PlanAffiliateTab`, `CheckoutEditorPage` | Tabs de plano com Checkout no lugar do Order Bump | Subnos de plano apontam para a rota real | Implementado | Validar layout do checkout embutido |
| Checkout dentro do plano | Editor real de checkout | `frontend/src/app/(main)/checkout/[planId]/page.tsx` | `/checkout/:planId?source=products...` | `CheckoutEditorPage` | `PlanSummarySection`, `BillingFormSection`, `OrderConfirmationSection`, `PaymentMethodSelector` | Editor split view + preview real | Subno checkout aponta para `/checkout/:id` com foco | Implementado | Validar browser |
| Order Bump dentro do Checkout | Secao real do checkout | `frontend/src/app/(main)/checkout/[planId]/page.tsx` | `/checkout/:planId?focus=order-bump` | `CheckoutEditorPage` | `OrderConfirmationSection`, `useOrderBumps` | Order bump dentro do editor de checkout | Subno Order Bump aponta para `focus=order-bump` | Implementado | Validar scroll/foco no browser |
| Afiliar | Marketplace de afiliacao | `frontend/src/app/(main)/produtos/afiliar-se/page.tsx` | `/produtos/afiliar-se` | `ProdutosView defaultTab="afiliar"` | `ProdutosAfiliarSeTab`, `MarketplaceFilters`, `MarketplaceProductGrid`, `AffiliateApplyDialog` | Marketplace, filtros, detalhes, solicitacao | No `afiliar` e `afiliar-marketplace` apontam para rota real | Implementado via rota real | Comparacao visual manual |
| Meus afiliados / Parcerias | Parcerias reais | `frontend/src/app/(main)/parcerias/page.tsx` | `/parcerias` | `ParceriasShell` | `AffiliateDirectory`, `AffiliateLinkManager`, `PartnerChatRoom`, `ColaboratorRoster` | Parcerias, links, chat, colaboradores | Nos `afiliar-parcerias`, `afiliar-afiliados`, `afiliar-chat`, `afiliar-colaboradores` | Implementado via rotas reais | Validar subrotas no browser |
| Educar | Area de membros | `frontend/src/app/(main)/produtos/area-membros/page.tsx` | `/produtos/area-membros` | `ProdutosView defaultTab="membros"` | `ProdutosAreaMembrosTab`, `AreaMembrosOverviewPanel`, `AreaMembrosStudentsPanel`, `AreaMembrosCertificatePanel` | Cursos, modulos, alunos, certificados | No `educar` e `educar-area-membros` apontam para rota real | Implementado via rota real | Comparacao visual manual |
| Conversar | Inbox real | `frontend/src/app/(main)/inbox/page.tsx` | `/inbox` | `InboxWorkspace` | `InboxConversationList`, `InboxMessageList`, `InboxMessageInput`, realtime hooks | Inbox, conversas, filtros, composer | No `conectar` e `conectar-inbox` apontam para `/inbox` | Implementado via rota real | Validar mensagens/realtime |
| CRM | Pipeline de vendas real | `frontend/src/app/(main)/vendas/pipeline/page.tsx` | `/vendas/pipeline` | `VendasView defaultTab="pipeline"` | `PipelineTab`, `SmartPaymentModal`, `SaleRow` | Pipeline e gestao real | No `conectar-crm` aponta para rota real | Implementado via rota real | Comparacao visual manual |
| Autopilot | Tela real de Autopilot | `frontend/src/app/(main)/autopilot/page.tsx` | `/autopilot` | `AutopilotPage` | `AutopilotOverview`, `AutopilotRulesPanel`, `AutopilotHistoryPanel`, `useAutopilotData` | Autopilot real | No `conectar-autopilot` fica sob `conectar-crm` | Implementado via rota real | Comparacao visual manual |
| WhatsApp | Canal real WhatsApp | `frontend/src/app/(main)/marketing/whatsapp/page.tsx` | `/marketing/whatsapp` | `MarketingView defaultTab="whatsapp"` | `WhatsAppMarketingTab`, `WhatsAppExperience`, `OfficialMarketingChannelPage` | Onboarding/status/canal real | No `conectar-channel-whatsapp` aponta para rota real | Implementado via rota real | Validar OAuth/QR externo |
| Instagram | Canal real Instagram | `frontend/src/app/(main)/marketing/instagram/page.tsx` | `/marketing/instagram` | `MarketingView defaultTab="instagram"` | `InstagramMarketingTab`, `OfficialMarketingChannelPage` | Canal real | No `conectar-channel-instagram` | Implementado via rota real | Validar provedor externo |
| Facebook | Canal real Facebook | `frontend/src/app/(main)/marketing/facebook/page.tsx` | `/marketing/facebook` | `MarketingView defaultTab="facebook"` | `FacebookMarketingTab`, `OfficialMarketingChannelPage` | Canal real | No `conectar-channel-facebook` | Implementado via rota real | Validar provedor externo |
| TikTok | Canal real TikTok | `frontend/src/app/(main)/marketing/tiktok/page.tsx` | `/marketing/tiktok` | `MarketingView defaultTab="tiktok"` | `TikTokMarketingTab`, callback real | Canal real | No `conectar-channel-tiktok` | Implementado via rota real | Validar provedor externo |
| Email | Canal real Email | `frontend/src/app/(main)/marketing/email/page.tsx` | `/marketing/email` | `MarketingView defaultTab="email"` | `EmailMarketingTab` | Canal real | No `conectar-channel-email` | Implementado via rota real | Validar credenciais/envio |
| Consultar | Hub financeiro via Carteira | `frontend/src/app/(main)/carteira/saldo/page.tsx` | `/carteira/saldo` | `KloelCarteira defaultTab="saldo"` | `CarteiraSaldoCard`, `CarteiraExtratoTable`, `CarteiraSaque`, `CarteiraTabAntecipacoes` | Carteira real | No `consultar` aponta para `/carteira/saldo` | Implementado via rota real | Comparacao visual manual |
| Saldo | Carteira saldo | `frontend/src/app/(main)/carteira/saldo/page.tsx` | `/carteira/saldo` | `KloelCarteira defaultTab="saldo"` | `CarteiraSaldoCard` | Saldo real | No `consultar-wallet-saldo` | Implementado via rota real | Validar dados reais |
| Extrato | Carteira extrato | `frontend/src/app/(main)/carteira/extrato/page.tsx` | `/carteira/extrato` | `KloelCarteira defaultTab="extrato"` | `CarteiraExtratoTable` | Extrato real | No `consultar-wallet-extrato` | Implementado via rota real | Validar dados reais |
| Saques | Carteira saques | `frontend/src/app/(main)/carteira/saques/page.tsx` | `/carteira/saques` | `KloelCarteira defaultTab="saques"` | `CarteiraSaque`, `CarteiraWithdrawModal` | Saques e modal real | No `consultar-wallet-saques` | Implementado via rota real | Validar saque em ambiente seguro |
| Antecipacoes | Carteira antecipacoes | `frontend/src/app/(main)/carteira/antecipacoes/page.tsx` | `/carteira/antecipacoes` | `KloelCarteira defaultTab="antecipacoes"` | `CarteiraTabAntecipacoes`, `CarteiraAntecipateModal` | Antecipacoes reais | No `consultar-wallet-antecipacoes` | Implementado via rota real | Validar em ambiente seguro |
| Vendas | Analytics vendas | `frontend/src/app/(main)/analytics/page.tsx` | `/analytics?tab=vendas` | `KloelRelatorio` | `AnalyticsHeader`, `AnalyticsFilterDrawer`, `VendasTab` | Relatorio real | No `consultar-report-vendas` | Implementado via rota real | Comparacao visual manual |
| Assinaturas | Analytics assinaturas | `frontend/src/app/(main)/analytics/page.tsx` | `/analytics?tab=assinaturas` | `KloelRelatorio` | `AssinaturasTab` | Relatorio real | No `consultar-report-assinaturas` | Implementado via rota real | Comparacao visual manual |
| Abandonos | Analytics abandonos | `frontend/src/app/(main)/analytics/page.tsx` | `/analytics?tab=abandonos` | `KloelRelatorio` | `AbandonosTab` | Relatorio real | No `consultar-report-abandonos` | Implementado via rota real | Comparacao visual manual |
| Estornos | Analytics estornos | `frontend/src/app/(main)/analytics/page.tsx` | `/analytics?tab=estornos` | `KloelRelatorio` | `EstornosTab` | Relatorio real | No `consultar-report-estornos` | Implementado via rota real | Comparacao visual manual |

## Dados reais usados pelo grafo

- Produtos principais: `useProducts()`.
- Planos/checkouts para a arvore do produto: `/checkout/products` e
  `/checkout/products/:id` via `swrFetcher`, normalizados por
  `useCheckoutPlans.helpers`.
- Telas internas: sempre as rotas reais renderizadas pelo App Router como
  `children` dentro de `KloelGraphShell`.
- Busca/recentes: `CommandPalette` e `useConversationHistory` reais.

## Fallbacks honestos

- `Imagens` ainda nao tem uma tela canonica isolada de galeria. O no abre o
  chat real, que ja possui upload real e capacidade de criacao de imagem.
- `Buscar` e `Recentes` usam a CommandPalette real existente, nao uma pagina
  propria.
