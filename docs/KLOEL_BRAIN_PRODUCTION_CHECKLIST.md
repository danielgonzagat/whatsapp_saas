# KLOEL Brain Production Checklist

Este checklist acompanha a transformação do Kloel em uma inteligência comercial
que se manifesta como SaaS. O frontend legado é imutável por padrão: telas,
componentes, rotas visuais e fluxos existentes devem permanecer preservados e
funcionais enquanto o Brain é construído por cima.

## 0. Regras de Preservação

- [ ] Frontend legado preservado visualmente.
- [ ] Controllers e services legados preservados como rotas diretas de fallback.
- [ ] Auth, workspace isolation, pagamentos, webhooks, filas e storage sem LLM
      decidindo comportamento determinístico.
- [ ] Nenhuma capability executa ação crítica sem validação determinística.
- [ ] Nenhuma mudança em governance/protected files sem aprovação humana.
- [ ] Nenhum mock/fallback falso usado para declarar produção.

## 1. Brain Runtime

- [x] Endpoint canônico `POST /brain/decide` criado por cima de serviços
      existentes.
- [x] Endpoint `POST /brain/observe` criado sem executar ações.
- [x] Endpoint `GET /brain/capabilities` criado para inspecionar tools reais.
- [x] Streaming `POST /brain/stream` implementado para chat longo.
- [x] `BrainService.decide()` retorna contrato estável para chat e telas.
- [x] `BrainService.observe()` gera insights estruturados em modo passivo sem
      executar actions.
- [ ] Falha do LLM degrada sem derrubar rotas legadas.
- [ ] Idempotência definida para ações executáveis.
- [x] Auditoria por request com request id, user id, workspace id e capability.

## 2. Capability System

- [x] Capabilities iniciais expostas a partir do `UnifiedAgent` existente.
- [x] Capability registry tipado com catálogo por domínio.
- [ ] Schemas JSON de parâmetros versionados por capability.
- [ ] Cada capability tem testes isolados.
- [x] Capabilities de pagamento/billing passam por policy determinística.
- [ ] Capabilities de WhatsApp respeitam provider, consentimento, limites e
      templates.
- [ ] Capabilities de produto/vendas usam services existentes.
- [ ] Capabilities de CRM usam services existentes.
- [ ] Capabilities de analytics retornam dados observáveis.
- [ ] Capability de settings valida impactos antes de persistir.

## 3. Event Spine

- [x] Eventos do Brain gravados em `AutopilotEvent` sem nova migration.
- [x] Taxonomia canônica de eventos definida: `brain.decide`,
      `brain.observe`, `capability.executed`, `sale.completed`,
      `checkout.abandoned`, `message.converted`.
- [x] Eventos iniciais de Brain/action/produto/mensagem/lead/segmentação entram
      no spine.
- [ ] Todo evento relevante de produto, checkout, WhatsApp, CRM e pagamento
      entra no spine.
- [x] Eventos são imutáveis e consultáveis por workspace.
- [x] Eventos críticos têm correlation id.
- [ ] Eventos de dinheiro nunca dependem só de decisão LLM.

## 4. Living Commercial Graph

- [x] Grafo comercial por workspace definido.
- [ ] Nós mínimos: lead, contato, conversa, mensagem, produto, checkout,
      pedido, campanha, horário, canal, objeção, oferta.
- [ ] Arestas mínimas: viu, clicou, respondeu, comprou, abandonou, converteu,
      recebeu, abriu, reembolsou.
- [x] Peso de arestas atualizado por resultado real.
- [x] Consultas de melhor próxima ação por workspace.
- [ ] Aprendizado por workspace isolado.
- [ ] Métricas anonimizadas cross-workspace só com política explícita.

## 5. Chat Como Interface Universal

- [x] Chat CIA tem integração opt-in com `POST /brain/stream` sem remover o
      stream legado.
- [ ] Chat consegue listar produtos.
- [ ] Chat consegue criar produto.
- [ ] Chat consegue gerar link de checkout.
- [ ] Chat consegue consultar receita.
- [ ] Chat consegue buscar/segmentar contatos.
- [ ] Chat consegue enviar WhatsApp quando permitido.
- [ ] Chat explica ações executadas em linguagem natural.
- [ ] Chat mostra UI dinâmica opcional sem substituir telas legadas.

## 6. Telas Como Janelas do Brain

- [x] Hooks `useBrain*` criados por domínio sem alterar layout legado.
- [ ] Dashboard pode chamar Brain para insights sem mudar layout.
- [ ] Vendas pode chamar Brain para sugestões sem mudar layout.
- [ ] Relatórios pode chamar Brain para perguntas em linguagem natural.
- [ ] CRM pode chamar Brain para segmentação inteligente.
- [ ] Settings pode chamar Brain para validação inteligente.
- [ ] Checkout pode chamar Brain em background para recomendação não crítica.
- [ ] Todas as telas mantêm rota/service legado como fallback.

## 7. Autonomia Comercial

- [x] MIND Active Inference core criado com `MindBelief`, `MindPrediction` e
      `MindPolicy` via migration não destrutiva.
- [x] Policy layer escolhe ações por Expected Free Energy aproximada.
- [x] Belief layer atualiza probabilidades binárias com posterior Beta.
- [x] Evaluation harness calcula lift contra baseline por decision type.
- [ ] CIA ajusta estratégia por workspace com base em eventos reais.
- [ ] CIA mede resultado de mensagens, horários, canais, preço e objeções.
- [x] CIA sugere experimentos antes de automatizar mudanças sensíveis.
- [ ] CIA executa automações permitidas com limites de segurança.
- [ ] Estratégias aprendidas são auditáveis e reversíveis.
- [ ] Ações proativas respeitam consentimento, rate limits e política comercial.

## 8. Production Gates

- [x] Backend build passa.
- [x] Backend boot smoke passa após DI/module changes.
- [x] Testes unitários de Brain passam.
- [x] Testes de capability registry passam.
- [x] Testes de policy layer passam.
- [x] Testes unitários de MIND Active Inference passam.
- [ ] E2E de chat criando produto passa.
- [ ] E2E de chat consultando analytics passa.
- [ ] E2E de chat enviando WhatsApp em ambiente seguro passa.
- [ ] PULSE `production-final --final` passa.
- [ ] Codacy sem regressão nova.
- [ ] Deploy Railway/Vercel validado.
- [ ] Observability mostra erros, latência, tokens, actions e eventos.

## Definição de Pronto

O Kloel Brain está pronto para produção quando todos os itens acima estiverem
marcados, os fluxos legados seguirem funcionais e o usuário puder operar o SaaS
inteiro por conversa sem perder a opção de usar o frontend manualmente.
