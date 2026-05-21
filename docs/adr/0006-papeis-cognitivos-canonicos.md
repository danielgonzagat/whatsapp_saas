# ADR 0006: Papeis cognitivos canonicos

Data: 2026-05-09

## Status

Aceita.

## Contexto

O PR 266 passou a conter quatro camadas com capacidade cognitiva: Brain, MIND,
UnifiedAgent e partes legadas da CIA no worker. A auditoria do pipeline mostrou
que a existencia dessas camadas nao basta: cada uma precisa ter uma
responsabilidade exclusiva, e o caminho real de inbound nao pode depender de um
endpoint REST de inspecao para acionar a arquitetura nova.

## Decisao

O eixo canonico fica definido assim:

- Brain coordena a operacao comercial. Ele recebe requisicoes de webhook, cron,
  scheduler ou acao do operador e conduz o roteiro de percepcao, memoria,
  politica, regra, executor e verbalizador.
- CommercialDecisionOrchestrator e a peca operacional do Brain para mensagens
  inbound. Ele transforma mensagem real em conceitos, consulta casos, chama o
  MIND e produz `predecidedActions`.
- MIND escolhe. Ele e a camada de policy, memoria, experimentacao, baseline,
  lift e outcome. MIND nao executa efeito externo e nao verbaliza.
- MindGuards e a fachada publica do portao deterministico. KloelRuleEngine e o
  motor interno chamado apenas por essa fachada em fluxo de producao.
- UnifiedAgent executa. Quando recebe `predecidedActions`, ele executa a lista
  recebida e nao delega a escolha de ferramentas ao LLM.
- LLM verbaliza. No caminho de resposta a lead, o modelo recebe a decisao ja
  tomada e gera texto. Em chat interno, qualquer tool-calling remanescente fica
  restrito a ferramentas de leitura ou setup sem efeito comercial externo.
- CIA worker legado vira adapter de aprendizado. Agregados de aprendizado podem
  alimentar priors, baselines ou candidatos do MIND; codigo legado nao deve
  sobrescrever decisoes comerciais finais.

## Cadeia canonica de inbound

Webhook do canal -> `OmnichannelService.handleIncomingMessage` -> persistencia
da mensagem -> `CommercialDecisionOrchestrator.orchestrateInbound` ->
`MindConceptService.detect` -> `MindService.retrieveSimilar` -> decisoes MIND ->
`predecidedActions` -> `UnifiedAgentService.processMessage` -> executor ->
verbalizacao.

O endpoint `POST /brain/decide` permanece como superficie de inspecao e
operacao administrativa. Ele nao e prova de integracao do pipeline real.

## Consequencias

- `tool_choice: auto` nao pode existir no caminho principal de resposta a lead.
- Decisoes delegadas acessiveis apenas via REST ou apenas por tool chamada pelo
  LLM permanecem parciais.
- Novos callers de decisao devem partir de webhook, cron, scheduler ou acao real
  do operador.
- O relatorio final deve sempre listar a cadeia a partir do evento real do mundo.
