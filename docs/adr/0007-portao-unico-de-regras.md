# ADR 0007: Portao unico de regras comerciais

Data: 2026-05-09

## Status

Aceita.

## Contexto

O backend possui `MindGuardsService` e `KloelRuleEngineService`. A auditoria do
PR 266 identificou risco de duplicidade conceitual: duas pecas poderiam ser
tratadas como portoes concorrentes para a mesma acao comercial.

## Decisao

Adotamos a opcao A:

- `MindGuardsService` e a fachada publica do portao deterministico.
- `KloelRuleEngineService` e o motor interno puro, responsavel por avaliar o
  catalogo de regras e produzir trace.
- Chamadas de producao com efeito externo devem passar por `MindGuardsService`.
- `KloelRuleEngineService` nao deve ser chamado diretamente por fluxos de
  produto; seu consumo direto fica restrito a testes, modulo de regras e a
  propria fachada `MindGuardsService`.

## Contrato operacional

Antes de avaliar regras, o caller deve enriquecer contexto via
`MindGuardContextBuilderService` quando houver dados de workspace, contato,
produto, campanha, transferencia ou pagamento. O contexto enriquecido deve
carregar, quando aplicavel:

- `contactOptOut`
- `withinComplianceWindow`
- `templateApproved`
- `contactMessagesToday`
- `discountPercent`
- `maxDiscountPercent`
- `minMarginPercent`
- `campaignActive`
- `campaignBudgetExhausted`
- `humanAvailable`
- `escalationInProgress`
- `paymentExternalId`
- `paymentAmount`
- `maxPaymentAmount`
- `paymentProcessed`

## Cadeias obrigatorias

- Envio de mensagem: caller -> `ChannelTransportRegistry.send` ->
  `MindGuardContextBuilderService.buildForSend` -> `MindGuardsService.evaluate`
  -> `KloelRuleEngineService.evaluate` -> provider do canal.
- Cupom/desconto: caller -> builder de desconto -> `MindGuardsService.evaluate`
  -> engine -> aplicacao ou veto.
- Transferencia humana: caller -> builder de transferencia ->
  `MindGuardsService.evaluate` -> engine -> transferencia ou veto.
- Pagamento/cobranca: caller -> builder de pagamento ->
  `MindGuardsService.evaluate` -> engine -> criacao ou veto.
- Broadcast/recovery: caller -> builder de campanha ou recovery ->
  `MindGuardsService.evaluate` -> engine -> envio/agendamento ou veto.

## Consequencias

- `MindGuardsService` permanece como ponto unico auditavel e persiste
  `mindGuardAudit`.
- `KloelRuleEngineService` permanece pequeno, deterministico e testavel.
- Endpoints de inspecao podem chamar a fachada para auditoria, mas nao substituem
  callers reais de producao.
