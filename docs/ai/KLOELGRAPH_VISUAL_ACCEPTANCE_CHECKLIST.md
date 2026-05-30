# KloelGraph visual acceptance checklist

Data: 2026-05-30.

Legenda:

- OK por rota: o no aponta para a rota/componente canonico real.
- OK por teste: coberto por teste automatizado nesta entrega.
- Pendente visual: ainda precisa de screenshot lado a lado com browser.
- Pendente externo: depende de conta/provedor/ambiente real.

| Fluxo | Status | Evidencia atual | Pendencia |
| --- | --- | --- | --- |
| Sidebar deixa de ser navegacao principal com flag ligada | OK por teste | `MainAppLayoutShell.spec.tsx` cobre escolha `KloelGraphShell` vs `AppShell` | Smoke visual com flag ligada |
| Graph como superficie principal | OK por teste | `KloelGraphShell.spec.tsx` verifica shell e graph-only | Screenshot desktop/mobile |
| Floating nav Perfil/Kloel/Criar/Afiliar/Educar/Conversar/Consultar | OK por teste | `KloelGraph.routes.spec.ts` verifica massas canonicas | Screenshot |
| Overlay 80% com tela real | OK por teste | `KloelGraphShell.spec.tsx` verifica dialog com children reais | Comparacao visual lado a lado |
| Drag nao abre tela | OK por teste | `KloelGraphShell.spec.tsx` cobre drag acima de 6px | Teste manual no browser |
| Clique abre tela | OK por teste | `KloelGraphShell.spec.tsx` cobre clique limpo | Teste manual no browser |
| Dashboard/Home | OK por rota | No `dashboard` -> `/dashboard` -> `HomeView` | Pendente visual |
| Perfil/Configuracoes | OK por rota | No `perfil` -> `/settings` -> `ContaView` | Pendente visual |
| Kloel/Novo Chat | OK por rota | No `kloel-chat` -> `/chat` -> `KloelDashboard` | Validar envio/streaming |
| Buscar | OK por teste | No `kloel-search` aciona `CommandPalette` real | Pendente visual |
| Imagens | Parcial | No `kloel-images` abre chat real com upload/capacidade de imagem | Falta galeria canonica dedicada |
| Recentes | OK por teste | No `kloel-recents` aciona CommandPalette em modo conversas | Pendente visual |
| Criar/Meus Produtos | OK por rota | No `criar` -> `/products` -> `ProdutosView defaultTab=\"produtos\"` | Pendente visual |
| Novo produto | OK por rota | No `criar-new-product` -> `/products/new` | Validar criacao real |
| Produto/ProductNerveCenter | OK por teste | Nos dinamicos -> `/products/:id` | Pendente visual |
| Abas ProductNerveCenter | OK por teste | Subnos -> `/products/:id?tab=<tab>` | Teste manual de cada aba |
| Planos com Checkout dentro | OK por teste | `product-nerve-tabs.graph-contract.spec.ts` | Pendente visual |
| Order Bump dentro do Checkout | OK por teste | Deep links `focus=order-bump` | Pendente visual/scroll |
| Afiliar marketplace | OK por rota | No `afiliar` -> `/produtos/afiliar-se` | Pendente visual |
| Parcerias / Meus afiliados | OK por rota | Nos de parcerias -> `/parcerias...` | Pendente visual |
| Educar / Area de membros | OK por rota | No `educar` -> `/produtos/area-membros` | Pendente visual |
| Conversar / Inbox | OK por rota | No `conectar` -> `/inbox` | Validar realtime |
| CRM | OK por rota | No `conectar-crm` -> `/vendas/pipeline` | Pendente visual |
| Autopilot dentro do CRM | OK por teste | `parentId` de `conectar-autopilot` e `conectar-crm` | Pendente visual |
| WhatsApp | OK por rota | No `conectar-channel-whatsapp` -> `/marketing/whatsapp` | Pendente externo OAuth/QR |
| Instagram | OK por rota | No `conectar-channel-instagram` -> `/marketing/instagram` | Pendente externo |
| Facebook | OK por rota | No `conectar-channel-facebook` -> `/marketing/facebook` | Pendente externo |
| TikTok | OK por rota | No `conectar-channel-tiktok` -> `/marketing/tiktok` | Pendente externo |
| Email | OK por rota | No `conectar-channel-email` -> `/marketing/email` | Pendente externo |
| Consultar/Saldo | OK por rota | No `consultar` -> `/carteira/saldo` | Pendente visual/dados |
| Extrato | OK por rota | No `consultar-wallet-extrato` -> `/carteira/extrato` | Pendente visual/dados |
| Saques | OK por rota | No `consultar-wallet-saques` -> `/carteira/saques` | Pendente externo financeiro |
| Antecipacoes | OK por rota | No `consultar-wallet-antecipacoes` -> `/carteira/antecipacoes` | Pendente externo financeiro |
| Vendas Analytics | OK por rota | No `consultar-report-vendas` -> `/analytics?tab=vendas` | Pendente visual |
| Assinaturas Analytics | OK por rota | No `consultar-report-assinaturas` -> `/analytics?tab=assinaturas` | Pendente visual |
| Abandonos Analytics | OK por rota | No `consultar-report-abandonos` -> `/analytics?tab=abandonos` | Pendente visual |
| Estornos Analytics | OK por rota | No `consultar-report-estornos` -> `/analytics?tab=estornos` | Pendente visual |

## Checklist manual obrigatorio

- Entrar com a flag do grafo ligada.
- Confirmar que a sidebar nao aparece como navegacao principal.
- Abrir cada no principal e subno listado acima.
- Tirar screenshot da rota original e do overlay.
- Aceitar apenas diferenca de graph no fundo e botao discreto de fechar.
- Validar responsividade mobile.
- Validar operacoes sensiveis apenas em ambiente seguro.
