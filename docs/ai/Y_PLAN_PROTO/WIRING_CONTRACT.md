# WIRING_CONTRACT — KloelGraph protótipo literal → produção (Opção C)

> Mapeamento **verificado no código** (file:line) pelos 11 subagents do re-aim
> (raciocínio bruto em `agent-maps/`). Alvo = `KloelGraphPrototype.jsx` literal
> (6576 linhas) no worktree `-kg`, já renderizando como `/dashboard`.
>
> **Ressalva de procedência (honesta)**: 9 dos 11 agents leram, em parte, o
> `KloelGraphPrototype.jsx` **parcial de 671 linhas** que existe no *outro*
> checkout (`/Users/danielpenin/whatsapp_saas`) — esse parcial é data-only e
> NÃO tem telas. Por isso vários disseram "telas inline não existem". Isso é
> **falso para o nosso alvo**: confirmado por grep, o `-kg` literal TEM todas as
> telas inline (CriarProdutosScreen, ProductOverview, CheckoutEditor,
> AfiliarScreen, EducarScreen, ConversarScreen, WalletOverview, CoreSettingsPanel,
> DesempenhoPanel, KloelChatScreen, NodePanel, KloelInner, buildGraph) + 1
> `api.anthropic`. **O que aproveitamos dos agents é o lado REAL-DO-REPO**
> (hooks/telas/rotas reais, todos file:line verificados) — esse lado é correto.

---

## Dois eixos de Y por domínio

- **Eixo-D (seed → dado real)**: dentro de `KloelInner`, o estado-raiz
  (`products/affiliate/wallet/educar/conversar/desempenho/kloel/accountData`) sai
  dos SEEDS e passa a vir de hooks reais. Os `build*NodesEdges` continuam iguais;
  só a FONTE muda. Honest-empty: loading/empty/error → **zero nós-entidade**
  (o nó-sol estático permanece), nunca seed.
- **Eixo-T (tela inline → componente real)**: o overlay (`NodePanel` por
  `node.type`) passa a montar o **componente real do repo** no lugar do painel
  reinventado, quando existir equivalente. Onde NÃO existir, mantém o painel do
  protótipo (decisão explícita por nó, abaixo). Import-direto (o protótipo é
  state-based, não roteado) — montar o componente real como filho do overlay.

---

## Mapa verificado por domínio (hook real + tela real + seed a aposentar)

### Criar / Produtos  *(agents 3899d9, ad4e8b3)*
- **Hook real**: `useProducts` (`frontend/src/hooks/useProducts.ts`, SWR `/products`); `productApi` (`lib/api/products.ts`); mutations `useProductMutations`.
- **Tela real**: lista `ProdutosView` (`components/kloel/produtos/ProdutosView.tsx`); detalhe `ProductNerveCenter` (`components/kloel/products/ProductNerveCenter.tsx`, props `{productId, initialTab, initialPlanSub, initialComSub, initialModal, initialFocus, onBack}`) + tabs reais `ProductNerveCenter{Planos,Checkouts,Cupons,Comissao,Aval,IA,AfterPay,Campanhas}Tab` + `ProductUrlsTab`; checkout `/checkout/:id?focus=...`; novo `/products/new` (wizard real).
- **Seed a aposentar**: `PRODUCTS` (L222), `defaultProductEditor/defaultPlan/defaultCheckoutConfig`. Honest-empty já existe no twin TS `buildKloelGraphProductNodes`.

### Consultar / Carteira + Analytics  *(agent ac9745)*
- **Hook real**: `useWalletBalance/Transactions/Withdrawals/Anticipations/Chart/Monthly` (`frontend/src/hooks/useWallet.ts` → `/kloel/wallet/{ws}/balance|transactions|withdraw|...`); `lib/api/analytics.ts` (`getAnalyticsDashboard/Stats/FullReport`); `use-report`/`useReports`/`useDetailedReports`.
- **Tela real**: `KloelCarteira` (`components/kloel/carteira.tsx`, prop `defaultTab`) + subcomponentes `CarteiraSaldoCard / ExtratoTable / Saque+WithdrawModal / TabAntecipacoes+AntecipateModal`; Analytics `KloelRelatorio` (`app/(main)/analytics/page.tsx`) + tabs `VendasTab/AssinaturasTab/AbandonosTab/EstornosTab` (+12). Rotas `/carteira/{saldo,extrato,saques,antecipacoes,movimentacoes}`.
- **Seed a aposentar**: `DEFAULT_WALLET` (L638), `ORDERS_SEED` (L465). **Preservar** `WALLET_BRANCHES`.
- **Provider**: precisa `Toaster/useToast` (modais de saque/antecipação) acima do ponto de montagem.
- **Overlap**: "Vendas" aparece em `wl-vendas` (Carteira) e `cv-vendas` (CRM) — **fonte real única** ao desfaker.

### Educar / Área de membros  *(agent 85afbc)*
- **Hook real**: `useMemberAreas` (GET `/member-areas`), `useMemberAreaStats` (GET `/member-areas/stats`, **agregado** — usar counts do list-item p/ subtitle por-nó), `useMemberAreaStudents`, `useMemberAreaMutations`.
- **Tela real**: `ProdutosAreaMembrosTab` (default `AreaMembros`) — **NÃO é auto-contido**: exige props `{totalStudents, displayAreas, avgCompletion, mutateAreas, productOptions}`; sub-painéis `AreaMembros{List,Overview,Students,Editor,Certificate}`. Rota `/produtos/area-membros`. → precisa de wrapper `EducarOverlayPanel` que deriva as props dos hooks.
- **Seed a aposentar**: `MEMBER_AREAS_SEED` (L390), `areaStats` (L414).

### Perfil + Dashboard  *(agent 76311b)*
- **Tela real**: Perfil sun → `/settings` → `ContaView` (`components/kloel/conta/ContaView.tsx`); Dashboard → `/dashboard` → `HomeView` + `DashboardPostPaymentPanel` (fed por `useDashboardPostPayment` → `/dashboard/post-payment`, estados honestos já prontos).
- **Seed a aposentar**: `DEFAULT_ACCOUNT_DATA` + `OPERATIONAL_DAYS`/`computeDesempenho` (existem no -kg literal — alimentar com `useDashboardHome`/reports reais; honest-empty).

### Afiliar  *(agent e35a56)*
- **Hook real**: `useAffiliates`/`usePartnerships` (marketplace + parceiros).
- **Tela real**: `AfiliarSe` + `ParceriasView` (marketplace, links, earnings reais).
- **Seed a aposentar**: `MARKETPLACE_SEED`, `MY_AFFILIATES_SEED`, `PARTNER_CHATS_SEED`.

### Conversar  *(agent 97faf3)*
- **Hook real**: `useCRM`/`conversations`/`useAnuncios` + onboarding real de canais.
- **Tela real**: Inbox/CRM/Contatos/Anuncios/Autopilot reais + wizard de canais.
- **Seed a aposentar**: `CRM_SEED`, `CONTACTS_SEED`, `CONVERSATIONS_SEED`, `AD_*_SEED`, `AUTOPILOT_*`.
- **GAP**: `/api/anuncios/*` pode dar 404 → criar proxy (espelhar marketing) ou repointar; 404 → zero nós-anúncio (inbox/crm intactos).

### Kloel (IA central)  *(agent d2aadd — leu o literal completo)*
- **FIX crítico de segurança**: `KloelChatScreen.send()` chama
  `https://api.anthropic.com/v1/messages` **direto do browser** (1 ocorrência
  confirmada no -kg literal). Trocar pelo motor real:
  `streamAuthenticatedKloelMessage` (`frontend/src/lib/kloel-conversations.ts:147`,
  POST `/kloel/think` SSE com bearer). Manter transcript/composer/estados
  byte-idênticos; trocar só o corpo de `send()`. (Espelhar
  `chat-container.message-sender.ts:247` e `KloelDashboardSendMessage.ts:229`.)
- **Recents/Imagens**: `searchKloelThreads`/`loadKloelThreadMessages`;
  `uploadChatFile` (`lib/api/kloel.ts:121`) — honest-empty onde faltar list-endpoint.
- **Busca**: manter `KloelSearchScreen`, alimentar `buildKloelSearchIndex` com dados reais (opcional: `useCommandPalette`).

---

## Regra de visual idêntico (gate, base de tudo)

`graphNodes` serializado por nó `{id,type,label,subtitle,parentId,area}` em ordem
congelada de `buildGraph` deve bater **byte-a-byte** antes/depois de cada
mudança; screenshot `/dashboard` no Chrome (resize 1440×900, <2000px) idêntico
(93 nós / 85 arestas / 7 galáxias). `Math.random` (em `defaultPlan` id e no
`physicsTick`) precisa de seed fixo p/ o diff não falsear. Qualquer divergência →
reverter via snapshot.

## Armadilhas honestas (revisor viabilidade, agent a8ea94)

1. **`@ts-nocheck` no arquivo literal** → "typecheck verde" que inclui ele é
   verde-por-supressão. Módulos extraídos devem dropar o bypass e passar gate real.
2. **Não dar flag-flip final** até as 7 galáxias estarem de-seedadas e provadas
   honest-empty — senão dado financeiro/CRM/pedido fake vaza (viola a REGRA SUPREMA).
3. **api.anthropic no client** = sem fallback falso, sempre via `/kloel/think`.
4. **Colisão**: ≥6 worktrees kloelgraph — aterrissar SÓ no `-kg`; lock por arquivo.

---

*Fim WIRING_CONTRACT.md*
