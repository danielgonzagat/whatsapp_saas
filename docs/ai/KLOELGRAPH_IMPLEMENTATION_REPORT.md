# KloelGraph implementation report

Data: 2026-05-30.

## O que foi implementado

- `KloelGraphShell` passou a ser a casca principal quando
  `NEXT_PUBLIC_KLOEL_GRAPH_ENABLED`, ou `KLOEL_GRAPH_ENABLED`, estiver ativo.
- A sidebar antiga permanece como rollback por flag, mas deixa de ser a
  experiencia principal no rollout do grafo.
- O grafo ocupa a viewport inteira, com massas canonicas:
  Perfil, Kloel, Criar, Afiliar, Educar, Conversar e Consultar.
- O floating nav usa exatamente essas massas.
- O overlay central renderiza a rota real atual como `children`, em casca
  neutra de aproximadamente 80vw x 80vh, com o grafo visivel atras.
- O fechamento por botao ou `Esc` retorna para `/dashboard?graph=1`, preservando
  a superficie do grafo.
- O clique em no respeita limiar de drag de 6px; arrastar nao abre tela.
- Os nos dinamicos de produtos sao derivados de dados reais, nao seeds.
- Planos, checkout e order bump foram reposicionados:
  - Checkout aparece dentro da edicao de plano.
  - No editor inline legado, o identificador interno `bump` foi preservado para
    nao reescrever `ProductNerveCenterRoot.js`; a label visivel agora e
    `Checkout`.
  - Order Bump fica dentro do editor real de checkout, via `focus=order-bump`.

## Sidebar removida / ocultada

Arquivo de entrada:

- `frontend/src/components/kloel/layouts/MainAppLayoutShell.tsx`

Comportamento:

- Flag ligada: `KloelGraphShell`.
- Flag desligada: `AppShell` antigo com sidebar, para rollback.

## Como overlays funcionam

Arquivo:

- `frontend/src/components/kloel/graph/KloelGraphShell.tsx`

Detalhes:

- `role="dialog"` e `aria-modal="true"`.
- `width: clamp(320px, 80vw, 1320px)`.
- `height: clamp(520px, 80vh, 900px)`.
- `overflow: auto`.
- Sem header pesado: apenas botao discreto de fechar.
- A tela interna e a pagina real do App Router, nao uma copia.

## Como cada no abre tela real

Arquivo:

- `frontend/src/components/kloel/graph/KloelGraph.routes.ts`

Principais rotas:

- Perfil -> `/settings`
- Dashboard -> `/dashboard`
- Kloel / Novo Chat -> `/chat`
- Criar -> `/products`
- Novo produto -> `/products/new`
- Produto -> `/products/:id`
- Afiliar -> `/produtos/afiliar-se`
- Parcerias -> `/parcerias`
- Educar -> `/produtos/area-membros`
- Conversar -> `/inbox`
- CRM -> `/vendas/pipeline`
- Autopilot -> `/autopilot`, como filho de CRM
- Canais -> `/marketing/<canal>`
- Consultar / Saldo -> `/carteira/saldo`
- Extrato -> `/carteira/extrato`
- Saques -> `/carteira/saques`
- Antecipacoes -> `/carteira/antecipacoes`
- Vendas / Assinaturas / Abandonos / Estornos -> `/analytics?tab=<tab>`

## Telas preservadas

As telas sao as rotas reais existentes:

- `HomeView`
- `KloelDashboard`
- `ProdutosView`
- `ProductNerveCenter`
- `NewProductPage`
- `ParceriasShell`
- `InboxWorkspace`
- `VendasView`
- `MarketingView`
- `KloelCarteira`
- `KloelRelatorio`
- `AutopilotPage`

## Dados reais

- `useProducts()` alimenta produtos do grafo.
- `/checkout/products` e detalhes de cada produto alimentam planos/checkouts.
- Busca e recentes usam `CommandPalette` e `useConversationHistory`.
- As telas internas mantem seus hooks/API originais.

## Fallbacks e pendencias honestas

- O no `Imagens` abre o chat real, que possui upload/capacidade de imagem, mas
  ainda nao existe uma tela canonica isolada de galeria de imagens.
- `Buscar` e `Recentes` acionam a CommandPalette real existente, em vez de uma
  pagina dedicada.
- A comparacao visual lado a lado exigida pelo prompt ainda precisa de execucao
  com browser/dev server e conta autenticada.
- Validacoes externas de canais, saque, antecipacao, envio de mensagem e OAuth
  dependem de ambiente/provedores.

## Compatibilidade de testes legados

O pre-push do PR #462 ainda enxerga paths legados de specs removidos em ondas
anteriores de canonicalizacao. Para publicar este slice sem bypass e sem
relaxar governance, foram adicionados entrypoints pequenos que importam os
specs canonicos atuais:

- `backend/src/cia/*.spec.ts` -> `backend/src/kloel/mind/cia/*.spec.ts`
- `backend/src/kloel/healthymoney/revenue-quality.scorer.service.spec.ts` ->
  `backend/src/kloel/healthy-money/healthy-money.spec.ts`
- `backend/src/whatsapp/providers/waha.provider.spec.ts` -> provider canonico
  Meta Cloud API em `backend/src/marketing/channels/whatsapp/providers`.

## Testes rodados durante a implementacao

- `npm run guard:test-files`
  - Resultado: passou.
- `npm run guard:changed-eslint`
  - Resultado: passou para backend, frontend e worker no conjunto alterado.
- `cd backend && npx jest src/cia/cia-backlog-run.service.spec.ts src/cia/cia-bootstrap.service.spec.ts src/cia/cia-chat-filter.service.spec.ts src/cia/cia-inline-fallback.service.spec.ts src/cia/cia-remote-backlog.service.spec.ts src/kloel/healthymoney/revenue-quality.scorer.service.spec.ts src/whatsapp/providers/waha.provider.spec.ts --runInBand --no-coverage`
  - Resultado: 7 arquivos passaram, 108 testes passaram.
- `cd frontend && npm test -- --run src/components/kloel/graph/KloelGraph.routes.spec.ts src/components/kloel/graph/KloelGraphShell.spec.tsx src/components/kloel/layouts/MainAppLayoutShell.spec.tsx src/components/kloel/products/product-nerve-tabs.graph-contract.spec.ts`
  - Resultado: 4 arquivos passaram, 18 testes passaram.
- `cd frontend && npm run typecheck`
  - Resultado: passou.
- `cd frontend && npm run build`
  - Resultado: passou; 94 rotas geradas.
- `git diff --check HEAD~1..HEAD`
  - Resultado: passou.
- `cd frontend && NEXT_PUBLIC_KLOEL_GRAPH_ENABLED=true KLOEL_GRAPH_ENABLED=true npm run dev -- --port 3207`
  - Resultado: servidor local subiu em `http://localhost:3207` em ciclo anterior desta entrega.
- `curl -I -sS 'http://localhost:3207/dashboard?graph=1'`
  - Resultado: `307 Temporary Redirect` para login, confirmando que a rota principal continua protegida por auth sem sessao.

## Resultado

O PR agora tem a casca do KloelGraph flagada, rotas reais em overlay, nos
dinamicos de produtos/planos/checkouts, Order Bump dentro do checkout,
documentacao canonica e validacao local de testes, lint, typecheck e build.
