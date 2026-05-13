# Module 7-Question Conference — Organismo Delivery

> Gerado via conferencia agentica OpenCode V4 Pro em 2026-05-12.
> Cada modulo responde as 7 perguntas obrigatorias exigidas pela Parte 3.2 + Parte 4.
> Referencias: file paths + line numbers reais. Sem prosa vaga.

---

## M1 — `CommercialDecisionOrchestratorService`

**File:** `backend/src/kloel/commercial-decision-orchestrator.service.ts:174`

### 1. What does this part of Kloel do?
Recebe uma mensagem inbound de um canal (WhatsApp, Instagram, etc.), detecta conceitos
comerciais via `MindConceptService`, consulta o `MindService` para tomar decisoes
deterministicas (tom, formato, produto, cupom, transferencia humana), respeita o
repertorio e configuracao do canal, compoe uma mensagem customer-facing via
`composeCustomerMessage()`, aplica guard `assertCustomerSafe()`, e emite acoes
`PredecidedAction[]` com trace auditavel. Opera em 3 modos: `legacy` (delega vazio),
`shadow` (grava shadow sem despachar acao), `active` (despacha normalmente). Detecta
fallback >= 5%/h e faz auto-fallback active->shadow.

### 2. Which organism layer does it belong to?
**acao** — toma decisoes e emite acoes concretas (`send_message`, `apply_discount`,
`transfer_to_human`). E o motor de execucao comercial.

### 3. Who calls this part?
- `backend/src/kloel/unified-agent.service.ts:233` — `executePredecidedAgentActions()` quando `predecidedActions.length > 0`.
- `backend/src/admin/pipeline/pipeline.service.ts` — indiretamente via `PipelineState`, que o orquestrador le em `orchestrateInbound():190`.
- Chamada direta: qualquer servico que instancie `CommercialDecisionOrchestratorService.orchestrateInbound()` com um `InboundOrchestrationInput`.

### 4. What does this part call?
- `MindService` — `resolveTone()` (L318), `resolveAggressiveness()` (L320), `resolveMessageFormat()` (L327), `resolveChannelChoice()` (L333), `resolveCoupon()` (L422), `resolveObjectionResponse()` (L423), `resolveProductOffer()` (L477), `resolveHumanTransfer()` (L557), `retrieveSimilar()` (L249).
- `ChannelSetupService.getState()` (L256).
- `MindConceptService.detect()` (L237).
- `BrainEventSpineService.recordCommercial()` (L258, L649, L733, L790).
- `PrismaService` — `pipelineState.findUnique()` (L190), `decisionShadow.upsert()` (L711), `pipelineState.updateMany()` (L761), `pipelineState.update()` (L776).
- `composeCustomerMessage()` (L599), `assertCustomerSafe()` (L603) — funcoes locais.

### 5. What real-world event enters? What real action exits?
**Entra:** Mensagem de cliente em canal omnichannel (texto inbound via webhook WhatsApp,
Instagram DM, etc.) + metadata de workspace/contato/conversa.
**Sai:** `PredecidedAction[]` contendo `send_message` (com `customerMessage` composto),
`apply_discount` (com percentual e expiracao), ou `transfer_to_human`. No modo `shadow`,
sai `actions: []` mas grava `decisionShadow`. No modo `legacy`, sai `actions: []`.

### 6. What outcome closes the cycle? What baseline is the comparison?
**Outcome:** A acao do orquestrador e executada pelo `UnifiedAgentService` via
`executePredecidedAgentActions()`, que despacha `send_message` pelo transport real.
**Baseline:** `buildLegacyBaseline()` (L158) define o que o sistema pre-deterministico
teria feito para o mesmo `concept`. Em modo `shadow`, a decisao do orquestrador e
comparada contra essa baseline no `DecisionShadow`.

### 7. What risk if this part fails?
- Cliente recebe `replyDraft` (instrucao em 3a pessoa) se `composeCustomerMessage()`
  falhar e o guard nao estiver ativo (L2 ja documentada — ver `lacunas-identificadas.md`).
- `assertCustomerSafe()` lanca excecao que cancela o send e notifica operador
  (L603, `unified-agent-actions-messaging.service.ts:243`).
- Auto-fallback active->shadow (L776) move workspace para modo seguro se
  fallbackRate1h >= 0.05.
- Sem orquestrador, mensagens inbound nao recebem resposta ou caem em fallback
  generico.

---

## M2 — `MindService`

**File:** `backend/src/kloel/mind.service.ts:30`

### 1. What does this part of Kloel do?
O cerebro estatistico do Kloel. Executa ticks por workspace que processam eventos
do `MindEventProcessorService`, varrem surpresas expiradas via `MindSurpriseService`,
e varrem outcomes expirados via `MindPolicyService`. Exp oe resolvers tipados para
cada decisao comercial (`resolveTone`, `resolveAggressiveness`, `resolveCoupon`,
`resolveProductOffer`, `resolveAudioVsText`, `resolveMessageFormat`,
`resolveHumanTransfer`, `resolveChannelChoice`, `resolveBroadcastWindow`,
`resolveAdAlertAction`, `resolveBestVariant`). Mantem watermarks por workspace
e garante idempotencia de tick via lease.

### 2. Which organism layer does it belong to?
**memoria** — consulta crencas, politicas, casos similares e percepcoes para
produzir decisoes com confianca e fallback. Persiste estado via
`MindWorkspaceStateService`.

### 3. Who calls this part?
- `CommercialDecisionOrchestratorService` — todos os metodos `resolve*()` (L318-L340, L422-L423, L477-L484, L557-L562), `retrieveSimilar()` (L249).
- `backend/src/kloel/unified-agent.controller.ts` — `resolveBestVariant()`.
- Job periodico `mind-tick` no worker — `tick()` (L45).
- `backend/src/kloel/brain-runtime.service.ts` — indiretamente via `UnifiedAgentService`.

### 4. What does this part call?
- `MindPerceptionService.since()` (L73).
- `MindEventProcessorService.process()` (L81).
- `MindSurpriseService.sweepExpired()` (L88).
- `MindPolicyService.sweepExpiredOutcomes()` (L96), `harness()` (L159), `choose()` — via resolvers.
- `MindBeliefService.list()` (L145).
- `MindCaseMemoryService.similar()` (L155).
- `MindWorkspaceStateService` — `watermark()` (L72), `tryAcquireTickLease()` (L62), `recordSuccess()` (L125), `recordFailure()` (L136), `releaseTickLease()` (L140).
- `resolveAggressivenessDecision()` (L169), `resolveAudioVsTextDecision()` (L184), `resolveToneDecision()` (L194), `resolveMessageFormatDecision()` (L211), `resolveObjectionResponseDecision()` (L228), `resolveCouponDecision()` (L245) — `backend/src/kloel/mind-catalog-decision-resolvers.ts`.
- `resolveHumanTransferDecision()` (L262), `resolveChannelChoiceDecision()` (L279), `resolveProductOfferDecision()` (L297), `resolveBroadcastWindowDecision()` (L315), `resolveAdAlertActionDecision()` (L332), `resolveBestVariantDecision()` (L348) — `backend/src/kloel/mind-commercial-decision-resolvers.ts`.

### 5. What real-world event enters? What real action exits?
**Entra:** Eventos do event spine (`MindEventProcessorService` processa eventos
comerciais como `case_memory.consulted`, `predecided_actions.built`, etc.).
**Sai:** Decisoes tipadas com `{ action/choice/tone/format/channel/variant/offer, confidence, fallback }`.

### 6. What outcome closes the cycle? What baseline is the comparison?
**Outcome:** `MindPolicyService.sweepExpiredOutcomes()` fecha outcomes com mais de 48h
sem confirmacao. `harness()` calcula lift por decisionType.
**Baseline:** `mind-decision-baselines.ts` define baselines deterministicas para cada
tipo de decisao. A comparacao baseline vs. decisao informa o lift.

### 7. What risk if this part fails?
- `tick()` falha: eventos acumulam, watermark congela, crencas nao atualizam.
- `resolve*()` falha: orquestrador opera com fallback puro (confidence=0,
  fallback=true), equivalente ao modo legacy.
- `resolveBestVariant()` falha: worker `cia-action-dispatch.ts:158` cai para
  `pickVariant()` local como fallback.

---

## M3 — `mind-commercial-decision-resolvers.ts`

**File:** `backend/src/kloel/mind-commercial-decision-resolvers.ts:1`

### 1. What does this part of Kloel do?
Define as funcoes puras que resolvem decisoes comerciais complexas usando
`MindPolicyService.choose()`: `resolveHumanTransferDecision`,
`resolveChannelChoiceDecision`, `resolveProductOfferDecision`,
`resolveBroadcastWindowDecision`, `resolveBestVariantDecision`,
`resolveAdAlertActionDecision`. Cada funcao monta contexto, candidatos,
baseline, outcomeKey, chama `policy.choose()`, e retorna resultado tipado
com confianca extraida dos `candidates[].beliefMean`.

### 2. Which organism layer does it belong to?
**memoria** — traduz parametros de dominio em chamadas ao mecanismo de
politica/bandit, que persiste e recupera crencas bayesianas.

### 3. Who calls this part?
- `MindService` — `resolveHumanTransfer()` (L262), `resolveChannelChoice()` (L279), `resolveProductOffer()` (L297), `resolveBroadcastWindow()` (L315), `resolveAdAlertAction()` (L332), `resolveBestVariant()` (L348).

### 4. What does this part call?
- `MindPolicyService.choose()` (L40, L79, L126, L162, L193, L232).
- `mind-decision-baselines.ts` — `resolveHumanTransferBaseline()` (L31), `resolveChannelChoiceBaseline()` (L71), `resolveProductOfferBaseline()` (L109), `resolveBroadcastWindowBaseline()` (L157), `resolveAdAlertActionBaseline()` (L222).

### 5. What real-world event enters? What real action exits?
**Entra:** Parametros concretos: `workspaceId`, `channel`, `concept`, `ticketRisk`,
`availableChannels`, `segment`, `priceBand`, `flow`, `variantIds`.
**Sai:** Decisao tipada: `{ action/channel/offer/window/variant, confidence, fallback }`.

### 6. What outcome closes the cycle? What baseline is the comparison?
**Outcome:** `policy.choose()` compara candidatos contra baseline e seleciona o de
maior crenca bayesiana. O resultado alimenta o `MindPolicyService` que atualiza
crencas via sweep de outcomes.
**Baseline:** Definida estaticamente em `mind-decision-baselines.ts` para cada
decisionType (e.g., `resolveProductOfferBaseline(segment, concept, priceBand)`).

### 7. What risk if this part fails?
- Falha em `policy.choose()`: retorno com `fallbackActive: true`, baseline vira a
  decisao. Nao ha personalizacao por crenca.
- `decisionConfidence()` retorna 0 se nenhum candidato tiver `beliefMean`: acao
  executada sem confianca, rastreavel no trace.

---

## M4 — `ChannelSetupService`

**File:** `backend/src/kloel/channel-setup.service.ts:86`

### 1. What does this part of Kloel do?
Gerencia o setup de canais de marketing por workspace: 3 passos (produtos,
arsenal, configuracao). Persiste `channelSetup`, `channelConfig`,
`channelProduct`, `channelArsenal` via Prisma com transacoes. Valida MIME types
de upload de arsenal (audio, imagem, video, documento, template). Fornece
`getState()` que retorna o snapshot completo do canal para consumo do
orquestrador. Normaliza canais (`messenger` -> `facebook`).

### 2. Which organism layer does it belong to?
**corpo** — e a infraestrutura de configuracao que define o que cada canal PODE
fazer. Sem setup completo, o canal nao opera.

### 3. Who calls this part?
- `CommercialDecisionOrchestratorService` — `getState()` (L256).
- `backend/src/kloel/channel-setup.controller.ts` — endpoints REST (`saveProducts`, `addArsenal`, `saveConfig`, `complete`, `reconfigure`).
- Frontend `OfficialMarketingChannelPage.tsx` — via API `/marketing/channel-setup`.

### 4. What does this part call?
- `PrismaService` — `channelSetup.findUnique()` (L95), `channelConfig.findUnique()` (L98), `product.findMany()` (L101), `channelProduct.findMany()` (L107), `channelArsenal.findMany()` (L111), `$transaction()` (L132, L152, L225), `upsertSetupQuery()` (L258).
- `StorageService.upload()` (L198) para upload de arquivos de arsenal.
- `detectUploadedMime()` (`backend/src/common/file-signature.util.ts`) para validacao (L287).

### 5. What real-world event enters? What real action exits?
**Entra:** Operador no frontend seleciona produtos, faz upload de assets de arsenal,
configura tom/agressividade/limite diario/horario comercial.
**Sai:** Estado persistido em 4 tabelas Prisma. `getState()` retorna snapshot com
`selectedProductIds`, `arsenal`, `config`, `completed`.

### 6. What outcome closes the cycle? What baseline is the comparison?
**Outcome:** `complete()` (L236) marca `completedAt` e `currentStep: 3`. So e chamado
apos `saveConfig()` (step 3).
**Baseline:** Canal sem setup (`getState()` retorna `completed: false`) — orquestrador
aplica restricoes (sem produtos = `cold_start_no_products`, sem arsenal = formatos
filtrados).

### 7. What risk if this part fails?
- Orquestrador opera sem `selectedProductIds` -> `product_offer = cold_start_no_products`.
- Sem `arsenal` -> formatos filtrados a vazio -> fallback para `text`.
- `reconfigure()` limpa `completedAt` e reseta `currentStep: 0` — canal volta a estado
  de setup pendente.

---

## M5 — `UnifiedAgentService`

**File:** `backend/src/kloel/unified-agent.service.ts:66`

### 1. What does this part of Kloel do?
Orquestrador LLM do Kloel. Carrega contexto (workspace, contato, historico, produtos,
AI config), constroi system prompt, chama OpenAI com fallback de modelo, processa
tool calls do LLM, despacha para 36 ferramentas via `executeToolAction()`, compoe
resposta final via writer LLM. Suporta dois modos: `predecidedActions` (acoes
pre-decididas pelo orquestrador deterministico — path principal atual) e LLM
tool-use tradicional (path legado). Garante idempotencia e limites de plano.

### 2. Which organism layer does it belong to?
**linguagem** — traduz intencao e contexto em linguagem natural via LLM.
**acao** — executa tool calls reais (send_message, create_payment_link, etc.).

### 3. Who calls this part?
- `backend/src/kloel/brain-runtime.service.ts:154` — `processMessage()`.
- `backend/src/kloel/whatsapp-brain.service.ts` — `processIncomingMessage()`.
- `backend/src/kloel/unified-agent.controller.ts` — endpoints REST.
- `worker/processors/autopilot/cia-action-dispatch.ts` — indiretamente via `sendDirectAutopilotText()`.

### 4. What does this part call?
- `UnifiedAgentContextService` — `getWorkspaceContext()` (L153), `getContactContext()` (L154), `getConversationHistory()` (L155), `getProducts()` (L156), `buildAndPersistCompressedContext()` (L189), `buildSystemPrompt()` (L202), `buildLeadTacticalHint()` (L195).
- `UnifiedAgentResponseService` — `buildReplyStyleInstruction()` (L203), `composeWriterReply()` (L245, L344), `buildQuotedReplyPlan()` (L390), `extractIntent()` (L244, L342), `calculateConfidence()` (L343), `buildFallbackResult()` (L148, L289).
- `UnifiedAgentActionsService` — `actionSendMessage()` (L413), `actionSendProductInfo()` (L414), `actionCreatePaymentLink()` (L417), e mais ~30 metodos (L447-L535).
- `PlanLimitsService` — `ensureTokenBudget()` (L269), `trackAiUsage()` (L298).
- `AuditService.logWithTx()` (L426).
- `PrismaService` — `productAIConfig.findMany()` (L169).
- `chatCompletionWithFallback()` (L276).
- `executePredecidedAgentActions()` (L234) — `backend/src/kloel/unified-agent-predecided-actions.part.ts`.

### 5. What real-world event enters? What real action exits?
**Entra:** Mensagem de cliente + contexto (workspaceId, contactId, phone, channel,
historico de conversa, predecidedActions opcionais).
**Sai:** `{ actions: ActionEntry[], response?: string, intent: string, confidence: number }`.
Cada action contem `tool`, `args`, `result`. A `response` e a mensagem composta pelo
writer LLM.

### 6. What outcome closes the cycle? What baseline is the comparison?
**Outcome:** Mensagem enviada ao cliente via transport real (`sendViaTransport()`),
payment link criado, lead atualizado, etc.
**Baseline:** `buildFallbackResult()` quando OpenAI nao configurado ou falha — retorna
resposta generica sem acoes. `composeWriterReply()` com fallback de modelo writer
quando primario falha.

### 7. What risk if this part fails?
- OpenAI indisponivel: `buildFallbackResult()` retorna resposta generica, sem acoes.
- `PlanLimitsService.ensureTokenBudget()` bloqueia: excecao lancada antes da chamada LLM.
- Writer LLM falha: resposta pode ser undefined; `processMessage()` retorna sem `response`.
- Tool call com args invalidos: `JSON.parse()` falha silenciosamente, args viram `{}`.
- Sem `OPENAI_API_KEY`: `this.openai = null`, todas as chamadas LLM caem em fallback.

---

## M6 — `UnifiedAgentActionsMessagingService`

**File:** `backend/src/kloel/unified-agent-actions-messaging.service.ts:22`

### 1. What does this part of Kloel do?
Centraliza todas as acoes de envio de mensagem do agente unificado:
`actionSendMessage`, `actionSendMedia`, `actionSendVoiceNote`, `actionSendAudio`,
`actionTranscribeAudio`. Roteia por canal (`resolveChannel()`) e transport
(`ChannelTransportRegistry.send()`). Aplica guard `assertCustomerSafe()` como
ultima linha de defesa antes do envio. Suporta envio por email via
`MailboxGmailOAuthService`. Aplica limite diario proativo por canal via
`DailyLimitService.ensureProactiveDailyLimit()`. Emite alertas operacionais
em falhas criticas.

### 2. Which organism layer does it belong to?
**acao** — executa o envio real da mensagem ao transport. E a ultima camada
antes do mundo externo.

### 3. Who calls this part?
- `UnifiedAgentService.executeToolAction()` — `actionSendMessage` (L413), `actionSendMedia` (L462), `actionSendVoiceNote` (L467), `actionSendAudio` (L469), `actionTranscribeAudio` (L471).
- `backend/src/kloel/unified-agent-actions.service.ts` — delegacao interna.

### 4. What does this part call?
- `ChannelTransportRegistry.send()` (L136) — roteamento multi-canal.
- `assertCustomerSafe()` (L243) — `backend/src/kloel/commercial-decision-orchestrator.service.ts:91`.
- `DailyLimitService.ensureProactiveDailyLimit()` (L265).
- `AudioService.textToSpeech()` (L391, L438), `transcribeFromUrl()` (L482), `transcribeFromBase64()` (L484).
- `MailboxGmailOAuthService.sendMessageFromMailbox()` (L199) — para email.
- `OpsAlertService.alertOnCriticalError()` (L249, L270, L322, L411).
- `BrainEventSpineService.record()` (L274) — eventos de bloqueio.
- `IWhatsappMessaging.sendMessage()` (L396, L442) — envio direto WhatsApp (fallback).

### 5. What real-world event enters? What real action exits?
**Entra:** `ToolArgs` com `message`, `mediaUrl`, `text`, `audioUrl` + contexto de
canal e compliance.
**Sai:** Mensagem enviada ao transport real (WhatsApp, Instagram, Email) com
resultado `{ success, messageId, delivery, error? }`.

### 6. What outcome closes the cycle? What baseline is the comparison?
**Outcome:** Transport confirma envio (`delivery: 'sent' | 'queued'`). Evento
registrado no event spine.
**Baseline:** Se `assertCustomerSafe()` falha, send cancelado com
`customerSafetyViolation: true`. Se `dailyLimit` excedido, send cancelado com
`channel-daily-limit-exceeded`.

### 7. What risk if this part fails?
- `assertCustomerSafe()` ausente/desativado: instrucao em 3a pessoa vaza para
  o cliente (L2 de `lacunas-identificadas.md`).
- Transport indisponivel: erro logado, alerta operacional emitido, `success: false`.
- `DailyLimitService` falha: limite nao aplicado, risco de spam.
- `resolveGmailMailbox()` retorna null: email cai com `gmail_mailbox_not_available`.

---

## M7 — `WhatsAppBrainController`

**File:** `backend/src/kloel/whatsapp-brain.controller.ts:34`

### 1. What does this part of Kloel do?
Controller HTTP que recebe webhooks do WhatsApp (Meta Cloud API / WAHA). Verifica
assinatura HMAC-SHA256, aplica dupla camada de idempotencia (Redis SET NX +
WebhookEvent unique constraint), processa payload via `WhatsAppBrainService`,
marca webhook como processed/failed. Exp oe endpoint de verificacao
(`GET webhook?hub.mode=subscribe`) e endpoint de simulacao
(`POST simulate/:workspaceId`). Rota publica (`@Public()`).

### 2. Which organism layer does it belong to?
**sentidos** — porta de entrada para eventos externos do WhatsApp. O primeiro
ponto de contato entre o mundo real e o organismo Kloel.

### 3. Who calls this part?
- Meta Webhook infrastructure (POST para `/kloel/whatsapp/webhook`).
- Frontend de simulacao (`POST /kloel/whatsapp/simulate/:workspaceId`).
- Meta verification challenge (`GET /kloel/whatsapp/webhook?hub.mode=subscribe`).
- Health checks (`GET /kloel/whatsapp/status`).

### 4. What does this part call?
- `WhatsAppBrainService.processWebhook()` (L122).
- `WhatsAppBrainService.handleIncomingMessage()` (L152).
- `WebhooksService.logWebhookEvent()` (L103), `markWebhookProcessed()` (L124), `markWebhookFailed()` (L136).
- `Redis.set()` (L94) — idempotency lock.
- `createHmac('sha256', secret)` (L85) — signature validation.
- `safeCompareStrings()` (L57, L86) — timing-safe comparison.

### 5. What real-world event enters? What real action exits?
**Entra:** POST HTTP da Meta com payload JSON de webhook (`messages`, `statuses`).
**Sai:** HTTP 200 com `{ status: 'ok' }` ou `{ status: 'ok', duplicate: true }`.
Payload processado assincronamente pelo `WhatsAppBrainService`.

### 6. What outcome closes the cycle? What baseline is the comparison?
**Outcome:** Webhook marcado como `processed` no banco. Mensagem entregue ao
pipeline de processamento.
**Baseline:** Webhooks duplicados detectados por Redis (TTL 300s) ou unique
constraint Prisma (`P2002`) retornam 200 com `duplicate: true` sem reprocessar.

### 7. What risk if this part fails?
- Assinatura HMAC invalida: 403 Forbidden. Mensagens legitimas sao perdidas.
- `WHATSAPP_VERIFY_TOKEN` nao configurado: verificacao de webhook falha com 500,
  Meta nao consegue registrar o webhook.
- Idempotencia Redis falha (Redis down): risco de processamento duplicado
  mitigado pela segunda camada (WebhookEvent unique constraint).
- `WhatsAppBrainService.processWebhook()` lanca excecao: webhook marcado como
  `failed`, mensagem nao processada.

---

## M8 — `MetaAuthController`

**File:** `backend/src/meta/meta-auth.controller.ts:58`

### 1. What does this part of Kloel do?
Gerencia o fluxo OAuth com a Meta Platform. Gera URL de autorizacao
(`GET /meta/auth/url`), processa callback OAuth (`GET /meta/auth/callback` —
troca code por token, exchange para long-lived token, busca pages/Instagram/ad
accounts/WhatsApp assets), persiste `MetaConnection` com tokens criptografados,
suporta disconnect com revoke de permissoes, e expoe status de conexao.
Redireciona para o frontend com parametros `?meta=success|error`.

### 2. Which organism layer does it belong to?
**sentidos** — conecta o organismo Kloel a infraestrutura Meta (paginas,
Instagram, WhatsApp Business, ad accounts).

### 3. Who calls this part?
- Frontend: `MetaConnectPrompt` -> `GET /meta/auth/url?channel=whatsapp&returnTo=/marketing/whatsapp`.
- Meta OAuth redirect: `GET /meta/auth/callback?code=...&state=...`.
- Frontend disconnect button: `POST /meta/auth/disconnect`.
- Frontend status polling: `GET /meta/auth/status`.

### 4. What does this part call?
- `MetaWhatsAppService.buildEmbeddedSignupUrl()` (L174), `getOAuthRedirectUri()` (L215), `discoverWhatsAppAssets()` (L316).
- `MetaSdkService.exchangeToken()` (L259), `graphApiGet()` (L264, L302), `graphApiDelete()` (L408).
- `PrismaService.metaConnection.upsert()` (L350), `findUnique()` (L396, L432), `delete()` (L416).
- `encryptMetaToken()` (L324, L328, L337, L341).
- `decryptMetaToken()` (L405).
- `fetch()` para `graph.facebook.com` (L225).
- `OpsAlertService.alertOnCriticalError()` (L365).

### 5. What real-world event enters? What real action exits?
**Entra:** Usuario clica "Conectar Meta" no frontend -> OAuth redirect -> Meta
retorna `code` e `state`.
**Sai:** `MetaConnection` persistido com tokens, pageId, instagramAccountId,
whatsappPhoneNumberId, adAccountId. Frontend redirecionado para
`/marketing/{channel}?meta=success`.

### 6. What outcome closes the cycle? What baseline is the comparison?
**Outcome:** `metaConnection.status = 'connected'`. Frontend mostra estado
conectado com canais disponiveis (WhatsApp, Instagram, Messenger, Ads).
**Baseline:** Sem conexao -> `GET /meta/auth/status` retorna `{ connected: false }`.
Token expirado -> `tokenExpired: true`.

### 7. What risk if this part fails?
- `META_APP_ID` ou `META_APP_SECRET` nao configurados: OAuth URL usa strings
  vazias, token exchange falha com `invalid_client`.
- Redirect URI mismatch: Meta rejeita com erro `redirect_uri` —
  `humanizeMetaError()` traduz para mensagem amigavel.
- Token exchange falha: frontend redirecionado com `?meta=error&reason=token_exchange`.
- `encryptMetaToken()` falha: token salvo em plaintext (fallback na linha 324:
  `encryptMetaToken(accessToken) || accessToken`).

---

## M9 — `BrainCapabilityRegistryService`

**File:** `backend/src/kloel/brain-capability-registry.service.ts:31`

### 1. What does this part of Kloel do?
Registra todas as capabilities (ferramentas) que o Kloel Brain pode executar,
organizadas por dominio (`sales`, `messaging`, `product`, `control`). Lista
definicoes com nome, descricao, parametros, risco (`critical`/`high`/`normal`),
e dominio. Filtra capabilities permitidas por `BrainSource` (chat, dashboard,
vendas, relatorios, settings, crm, checkout, system) usando `brain-capability-policy.ts`.

### 2. Which organism layer does it belong to?
**politica** — define o que cada fonte cerebral pode ou nao fazer. E o contrato
de capacidades do organismo.

### 3. Who calls this part?
- `BrainRuntimeService` — `listCapabilities()` (L79), `allowedFor()` (L131).
- `backend/src/kloel/brain-runtime.service.ts:77` — `listCapabilities()`.
- `backend/src/cia/cia.controller.ts:36` — `getCapabilityRegistry()`.

### 4. What does this part call?
- `UNIFIED_AGENT_TOOLS_SALES` (`backend/src/kloel/unified-agent-tools-sales.ts`).
- `UNIFIED_AGENT_TOOLS_MESSAGING` (`backend/src/kloel/unified-agent-tools-messaging.ts`).
- `UNIFIED_AGENT_TOOLS_PRODUCT` (`backend/src/kloel/unified-agent-tools-product.ts`).
- `UNIFIED_AGENT_TOOLS_CONTROL` (`backend/src/kloel/unified-agent-tools-control.ts`).
- `getBrainCapabilityRisk()` (L41), `isBrainCapabilityAllowed()` (L48) — `backend/src/kloel/brain-capability-policy.ts`.

### 5. What real-world event enters? What real action exits?
**Entra:** Solicitacao de listagem/filtro de capabilities por source.
**Sai:** `BrainCapabilityDefinition[]` ou `string[]` (nomes permitidos) ou
agrupamento por dominio.

### 6. What outcome closes the cycle? What baseline is the comparison?
**Outcome:** `allowedFor(source)` retorna lista filtrada que o `BrainRuntimeService`
usa como `allowedTools` na chamada ao `UnifiedAgentService.processMessage()`.
**Baseline:** Source `system` bloqueia todas as critical + high risk capabilities.
Source `chat` permite todas. Cada source tem seu proprio conjunto de bloqueios.

### 7. What risk if this part fails?
- Registro vazio ou incompleto: Brain nao consegue executar nenhuma ferramenta.
- `isBrainCapabilityAllowed()` retorna `true` para capability bloqueada: chat
  poderia criar payment link ou mudar plano — risco financeiro.
- Novas tools adicionadas sem registro: nao aparecem na listagem, nao sao
  consideradas pelo brain.

---

## M10 — `BrainRuntimeService`

**File:** `backend/src/kloel/brain-runtime.service.ts:66`

### 1. What does this part of Kloel do?
Runtime do Kloel Brain. Processa requisicoes `decide` (com source, intent,
messages) e `observe` (snapshot do workspace). Roteia intents de operador
(`list_products`, `search_contact`, `list_conversations`,
`send_message_via_channel`, `query_revenue_summary`) para
`BrainCapabilityExecutorService`. Para intents normais, chama
`UnifiedAgentService.processMessage()` com tools filtradas por source.
Persiste threads de conversa via `KloelThreadService`. Emite eventos no
event spine para cada acao executada. Suporta streaming de eventos de decisao.

### 2. Which organism layer does it belong to?
**corpo** — coordena o fluxo cerebral: recebe estimulo, consulta capacidades,
roteia para execucao, persiste memoria.

### 3. Who calls this part?
- `backend/src/kloel/brain.controller.ts` (ou controller equivalente que expoe `POST /brain/decide`).
- `backend/src/kloel/whatsapp-brain.service.ts` — indiretamente.

### 4. What does this part call?
- `UnifiedAgentService.processMessage()` (L154).
- `BrainCapabilityRegistryService.list()` (L79), `allowedFor()` (L131).
- `BrainCapabilityExecutorService` — `listProducts()` (L282), `searchContact()` (L285), `listConversations()` (L288), `sendMessageViaChannel()` (L291), `queryRevenueSummary()` (L294).
- `KloelThreadService` — `resolveThread()` (L119), `persistUserThreadMessage()` (L122), `persistAssistantThreadMessage()` (L172), `maybeGenerateThreadTitle()` (L185).
- `BrainEventSpineService.record()` (L206, L216, L227, L321, L335, L435).
- `BrainCommercialGraphService.recommendNextActions()` (L422).
- `UnifiedAgentContextDataService` — `getWorkspaceContext()` (L420), `getProducts()` (L421).
- `buildPredecidedActions()` (L48) — funcao local.

### 5. What real-world event enters? What real action exits?
**Entra:** `BrainDecideDto` com `source`, `intent`, `messages[]`, `context` do
frontend ou API.
**Sai:** `{ source, conversationId, title?, intent, requestId, confidence, response?, actions[] }`.

### 6. What outcome closes the cycle? What baseline is the comparison?
**Outcome:** Para intents de operador, capability executada e resposta verbalizada.
Para intents normais, `UnifiedAgentService.processMessage()` retorna resposta e
acoes. Thread persistido com mensagens user + assistant.
**Baseline:** Se `message.trim()` vazio -> `BadRequestException`. Se intent nao
reconhecido como operador -> cai no path `UnifiedAgentService`.

### 7. What risk if this part fails?
- `OPERATOR_CAPABILITIES` inclui intent nao implementado no executor: retorna
  `{ ok: false, error: 'unknown_operator_intent' }`.
- `resolveThread()` falha: `thread = null`, mensagens nao persistem.
- `buildPredecidedActions()` retorna array vazio se intent nao esta em
  `allowedTools`: brain processa sem acoes pre-decididas.

---

## M11 — `channel-repertoire.config.ts`

**File:** `backend/src/kloel/channel-repertoire.config.ts:39`

### 1. What does this part of Kloel do?
Define o repertorio de acoes, tons e formatos permitidos por canal
(`CHANNEL_REPERTOIRE: Record<ChannelKey, ChannelRepertoire>`). Cada canal
(whatsapp, instagram, messenger, facebook, tiktok, email) declara:
`actions[]` (quais acoes pode executar), `tones[]` (quais tons sao permitidos),
`formats[]` (quais formatos de mensagem), `proactiveOutboundAllowed` (se pode
iniciar conversa), `proactiveWindowHours` (janela maxima para proactive),
`audioInboundOnly` (se audio so em resposta a inbound). TikTok tem
`proactiveOutboundAllowed` condicionado a env var `TIKTOK_OUTBOUND_APPROVED`.
Facebook nao tem `send_audio`. Email nao tem `send_audio`, `send_image`,
`send_video`. Exp oe funcoes `repertoireFor()`, `canChannelDoAction()`,
`allowedFormatsFor()`, `allowedTonesFor()`.

### 2. Which organism layer does it belong to?
**politica** — e a constituicao do que cada canal pode fazer. Nao e negociado
em runtime — e contrato estatico.

### 3. Who calls this part?
- `CommercialDecisionOrchestratorService` — `repertoireFor()` (L267), `allowedFormatsFor()` (L268), `allowedTonesFor()` (L269).

### 4. What does this part call?
- Nenhum servico externo. E configuracao pura. Le `process.env.TIKTOK_OUTBOUND_APPROVED`.

### 5. What real-world event enters? What real action exits?
**Entra:** String de canal (`'whatsapp'`, `'instagram'`, etc.) + action id opcional.
**Sai:** `ChannelRepertoire | null`, `boolean`, `FormatId[]`, `ToneId[]`.

### 6. What outcome closes the cycle? What baseline is the comparison?
**Outcome:** Orquestrador usa `repertoireFor()` para gatear `proactiveOutbound`,
`allowedFormatsFor()` para filtrar formatos, `allowedTonesFor()` para intersectar
tom do brain com tons permitidos.
**Baseline:** Canal desconhecido -> `repertoireFor()` retorna null ->
`allowedFormatsFor()` retorna `['text']`, `allowedTonesFor()` retorna todos.

### 7. What risk if this part fails?
- Canal adicionado sem entrada no `CHANNEL_REPERTOIRE`: opera como `['text']`
  apenas, sem proactive outbound, sem audio.
- `TIKTOK_OUTBOUND_APPROVED` ausente: TikTok bloqueia proactive outbound por
  padrao (seguro).
- Repertorio desatualizado vs. capacidades reais do provider: canal promete
  formato que o transport nao suporta -> falha no envio.

---

## M12 — `PipelineService` (Admin Pipeline)

**File:** `backend/src/admin/pipeline/pipeline.service.ts:29`

### 1. What does this part of Kloel do?
Gerencia o estado do pipeline deterministico por workspace. Permite transicao
entre estados `legacy` -> `shadow` -> `active` (e auto-fallback `active` ->
`shadow` quando `fallbackRate1h >= 0.05`). Registra `DecisionShadow` (snapshot
da decisao do orquestrador vs. baseline legada). Exp oe `getHealth()` com
metricas de shadow count e fallback rate. Toda transicao emite evento no
event spine.

### 2. Which organism layer does it belong to?
**politica** — controla qual cerebro decide em producao (legacy vs. deterministico)
e gerencia a transicao segura entre eles.

### 3. Who calls this part?
- `PipelineController` — `getState()` (L20), `setState()` (L28), `health()` (L46).
- `CommercialDecisionOrchestratorService` — indiretamente via leitura direta de
  `prisma.pipelineState` (L190), e `handleOrchestrationFallback()` (L753) que
  atualiza `fallbackRate1h` e faz auto-fallback.
- Job periodico de lift — `getHealth()`.

### 4. What does this part call?
- `PrismaService` — `pipelineState.findUnique()` (L38), `create()` (L44), `upsert()` (L63), `updateMany()` (L140).
- `PrismaService.decisionShadow.upsert()` (L103), `count()` (L187, L190).
- `PrismaService.workspace.findUnique()` (L178).
- `BrainEventSpineService.recordCommercial()` (L82, L125, L158).

### 5. What real-world event enters? What real action exits?
**Entra:** Admin dashboard chama `POST /admin/pipeline/state` com
`{ workspaceId, state: 'active', reason: 'lift comprovado' }`.
**Sai:** `PipelineStateRow` atualizado. Evento `pipeline.state.changed` emitido.
Shadow decision persistida para comparacao futura.

### 6. What outcome closes the cycle? What baseline is the comparison?
**Outcome:** Workspace em `active` usa orquestrador deterministico. Em `shadow`,
orquestrador grava decisoes mas nao despacha (acoes sao `[]`). Em `legacy`,
orquestrador retorna vazio e delega para path legado.
**Baseline:** `legacyBaseline` no `DecisionShadow` contem o que o sistema
pre-deterministico teria feito. Comparacao baseline vs. `orchestratorDecision`
informa o lift.

### 7. What risk if this part fails?
- `fallbackRate1h` nao incrementa: auto-fallback nunca dispara, workspace
  permanece em `active` com fallback acumulando.
- `DecisionShadow` nao persiste: sem dados para calcular lift, sem evidencia
  para decidir transicao.
- `setState()` chamado sem permissao: `AdminAuthGuard` + `AdminPermissionGuard`
  no controller (L16) previnem acesso nao autorizado.

---

## M13 — `global-learning.ts` (CIA Global Learning)

**File:** `worker/processors/cia/global-learning.ts:1`

### 1. What does this part of Kloel do?
Pipeline analitico cross-workspace que extrai padroes de variantes de mensagem.
Converte decision logs anonimizados em `GlobalLearningSignal[]`, computa
`GlobalLearningPattern[]` por dominio+intent (taxa de venda, taxa de resposta,
receita por sinal, melhor horario, comprimento preferido, familia de variante
preferida), e constroi `GlobalLearningStrategy` para alimentar o ciclo CIA.
Persiste padroes em Redis (`cia:global-patterns:v1`). Marcado como
`@deprecated` — autoridade de decisao migrada para `MindService.resolveBestVariant`.

### 2. Which organism layer does it belong to?
**aprendizado** — extrai conhecimento cross-workspace de dados historicos para
melhorar decisoes futuras.

### 3. Who calls this part?
- `worker/processors/autopilot/cia-cycle-workspace.ts:54` — `buildGlobalStrategy()`.
- `worker/processors/autopilot/cia-learn.ts:103` — `buildGlobalStrategy()`.
- `worker/processors/autopilot/cia-action-dispatch.ts:158` — `pickVariant()` via fallback.
- Job de overnight — `persistGlobalPatterns()`.

### 4. What does this part call?
- `Redis.set()` (L246) — `persistGlobalPatterns()`.
- Funcoes puras internas: `patternFor()`, `computeGlobalPatterns()`, `buildGlobalStrategy()`.

### 5. What real-world event enters? What real action exits?
**Entra:** `DecisionLog[]` do banco (`cia-decision-log.ts`) anonimizados via
`anonymizeDecisionLog()`.
**Sai:** `GlobalLearningStrategy` com `preferredLength`, `bestHour`,
`preferredVariantFamily`, `confidence`.

### 6. What outcome closes the cycle? What baseline is the comparison?
**Outcome:** `buildGlobalStrategy()` retorna estrategia que o `cia-cycle-workspace`
usa para planejar acoes e que `cia-action-dispatch` usa para selecionar variantes.
**Baseline:** Sem dados (`patterns: []`) -> `buildGlobalStrategy()` retorna
estrategia generica com `confidence = 0`, `preferredLength = 'medium'`,
`aggressiveness = 'MEDIUM'`.

### 7. What risk if this part fails?
- Redis indisponivel: `persistGlobalPatterns()` retorna null, padroes nao
  persistem entre reinicios.
- `anonymizeDecisionLog()` retorna null para logs malformados: sinal perdido.
- `computeGlobalPatterns()` com poucos samples: `confidence = samples / 25`
  (max 1.0) — baixa confianca para dominios novos.

---

## M14 — `self-improvement.ts` (CIA Variant RL)

**File:** `worker/processors/cia/self-improvement.ts:1`

### 1. What does this part of Kloel do?
Motor de reinforcement learning para variantes de mensagem. Define familias
(`followup`, `payment_recovery`) com templates default. Implementa selecao
epsilon-greedy `pickVariant()` usando bandit arms bayesianos
(`mindBanditArm` no Prisma). Atualiza outcomes (`SOLD`/`REPLIED` = reward 1)
via `updateVariantOutcome()`. Garante arms iniciais via `ensureBanditArms()`.
Marcado como `@deprecated` — decisao migrada para `MindService.resolveBestVariant`
via HTTP, mantido como fallback local.

### 2. Which organism layer does it belong to?
**aprendizado** — sistema de reforco que aprende qual variante de mensagem
funciona melhor para cada familia e workspace.

### 3. Who calls this part?
- `worker/processors/autopilot/cia-action-dispatch.ts:158` — `pickVariant()` como fallback quando `resolveBestVariantViaHttp()` falha.
- `worker/processors/autopilot/cia-action-dispatch.ts:156` — `resolveVariantByKey()` quando HTTP responde.
- `worker/processors/autopilot/cia-cycle-workspace.ts:198` — `computeLearningSnapshot()`.
- `worker/processors/autopilot/cia-learn.ts` — `updateVariantOutcome()`.
- `worker/processors/autopilot/cia-action.ts:31` — `pickVariant()`.

### 4. What does this part call?
- `PrismaClient.mindBanditArm` — `upsert()` (L114), `findMany()` (L174), `updateMany()` (L187), `update()` (L210).
- `randomUUID()` (L124).
- `score()` (L101) — funcao UCB local.
- `DEFAULT_VARIANTS` — map estatico de templates.

### 5. What real-world event enters? What real action exits?
**Entra:** `workspaceId`, `family` (`followup` | `payment_recovery`), opcional
`VariantSelectionStrategy`.
**Sai:** `MessageVariant` com `key`, `family`, `text`, `score`, `uses`.

### 6. What outcome closes the cycle? What baseline is the comparison?
**Outcome:** `updateVariantOutcome()` incrementa `alpha` (recompensa) ou `beta`
(nao-recompensa) do bandit arm. Proximo `pickVariant()` usa scores atualizados.
**Baseline:** Primeiro uso de uma familia: `ensureBanditArms()` cria arms com
`alpha=1, beta=1` (prior uniforme). `firstDefaultVariant()` como fallback se
nenhum arm encontrado.

### 7. What risk if this part fails?
- `prisma.mindBanditArm` indisponivel: `pickVariant()` retorna
  `firstDefaultVariant()` (template hardcoded).
- `ensureBanditArms()` falha silenciosamente (L112: `if (!prisma?.mindBanditArm?.upsert) return`):
  arms nunca criados, sempre usa default.
- `updateVariantOutcome()` nunca chamada: bandit nunca aprende, sempre explora
  aleatoriamente.

---

## M15 — `cia-action-dispatch.ts` (Worker Action Dispatch)

**File:** `worker/processors/autopilot/cia-action-dispatch.ts:19`

### 1. What does this part of Kloel do?
Despacha acoes CIA selecionadas pelo ciclo. Roteia por tipo de acao:
`WAIT` (pula), `ESCALATE_HUMAN` (gate de escalacao), `RESPOND` (scan de
contato), `PAYMENT_RECOVERY`/`FOLLOWUP_SOFT`/`FOLLOWUP_URGENT` (seleciona
variante de mensagem). Para familias de variante, tenta
`resolveBestVariantViaHttp()` (MindService backend) primeiro, com fallback
para `pickVariant()` local. Compoe mensagem, cria snapshot de prova,
envia via `sendDirectAutopilotText()`.

### 2. Which organism layer does it belong to?
**acao** — executa a acao escolhida pelo ciclo CIA, enviando mensagem real
ao cliente.

### 3. Who calls this part?
- `worker/processors/autopilot/cia-action.ts` — job BullMQ `cia-action`.
- `worker/processors/autopilot/cia-cycle-workspace.ts:359` — enfileira jobs `cia-action`.

### 4. What does this part call?
- `resolveBestVariantViaHttp()` (L143) — `worker/providers/mind-client.ts`.
- `pickVariant()` (L158), `listVariantKeys()` (L132), `resolveVariantByKey()` (L156) — `worker/processors/cia/self-improvement.ts`.
- `buildCognitiveMessage()` (L166) — `worker/processors/autopilot/cognition.ts`.
- `maybeEscalateToHumanControl()` (L84) — `worker/processors/autopilot/backlog-escalation.ts`.
- `runScanContact()` (L112) — `worker/processors/autopilot/scan.ts`.
- `sendDirectAutopilotText()` (L211) — `worker/processors/autopilot/execution.ts`.
- `createConversationProofSnapshotDraft()` (L176) — `worker/processors/autopilot/score-proof.ts`.
- `buildDecisionEnvelope()` (L89), `computeDemandState()` (L96) — `worker/providers/commercial-intelligence.ts`.
- `publishAgentEvent()` (L38, L69) — `worker/providers/agent-events.ts`.

### 5. What real-world event enters? What real action exits?
**Entra:** Job BullMQ `cia-action` com dados da acao planejada (tipo, contato,
conversa, estrategia global, contexto cognitivo).
**Sai:** Mensagem enviada ao cliente via `sendDirectAutopilotText()` com
resultado `'executed'` ou `'skipped'`.

### 6. What outcome closes the cycle? What baseline is the comparison?
**Outcome:** `dispatchCiaActionByType()` retorna `{ outcome: 'SENT'|'FAILED'|'SKIPPED',
renderedMessage, conversationProofId, variant, family }`.
**Baseline:** Se `resolveBestVariantViaHttp()` falha, `pickVariant()` local
seleciona variante. Se `sendDirectAutopilotText()` falha, outcome = `'SKIPPED'`.

### 7. What risk if this part fails?
- `resolveBestVariantViaHttp()` timeout/erro: fallback para `pickVariant()`
  local (L158) — OK, mas sem coordenacao central.
- `sendDirectAutopilotText()` falha: mensagem nao enviada, `outcome = 'SKIPPED'`.
- Job BullMQ retry: `removeOnComplete: true` (L380) evita acumulo, mas falha
  transitoria pode perder acao se nao houver retry configurado.

---

## M16 — `cia-cycle-workspace.ts` (CIA Cycle Orchestrator)

**File:** `worker/processors/autopilot/cia-cycle-workspace.ts:143`

### 1. What does this part of Kloel do?
Orquestrador do ciclo CIA por workspace. Carrega configuracao do workspace,
verifica janela de operacao (horario local), constroi estado CIA
(`buildCiaWorkspaceState`), carrega estrategia global (`loadWorkspaceGlobalStrategy`
via Redis + `buildGlobalStrategy`), planeja acoes (`planCiaActions`), valida
contratos (`assertCiaGuarantees`, `assertCiaExhaustion`,
`assertConversationTacticPlan`), persiste provas (`persistCiaCycleProof`,
`persistAccountProofSnapshot`), e enfileira jobs `cia-action` no BullMQ.
Publica eventos de heartbeat, thought, error.

### 2. Which organism layer does it belong to?
**acao** — ciclo de planejamento e execucao que decide o que fazer e despacha.

### 3. Who calls this part?
- `worker/processors/autopilot/cia-orchestrator.ts` — job `cia-cycle` (loop principal).
- `worker/processors/autopilot/cia-cycle.ts` — entrada do ciclo.

### 4. What does this part call?
- `buildCiaWorkspaceState()` (L172) — `worker/processors/cia/build-state.ts`.
- `planCiaActions()` (L212) — `worker/processors/cia/brain.ts`.
- `assertCiaGuarantees()` (L75), `assertCiaExhaustion()` (L76) — `worker/processors/cia/contracts.ts`.
- `buildCiaGuaranteeReport()` (L216), `buildCiaExhaustionReport()` (L217) — `worker/processors/cia/contracts.ts`.
- `assertConversationTacticPlan()` (L78) — `worker/processors/cia/conversation-tactics.ts`.
- `buildGlobalStrategy()` (L54), `inferWorkspaceDomain()` (L51) — `worker/processors/cia/global-learning.ts`.
- `computeLearningSnapshot()` (L198) — `worker/processors/cia/self-improvement.ts`.
- `persistBusinessSnapshot()` (L178), `persistMarketSignals()` (L179), `persistSystemInsight()` (L125, L200, L251) — `worker/providers/commercial-intelligence.ts`.
- `persistCiaCycleProof()` (L271), `listCanonicalWorkItems()` (L278), `persistAccountProofSnapshot()` (L286), `refreshOpportunityUniverse()` (L180) — `worker/processors/autopilot/score.ts`.
- `publishAgentEvent()` (L107, L236, L333), `publishCiaProofEvent()` (L298).
- `autopilotQueue.add()` (L359) — BullMQ.
- `Redis.get()` (L52) — `cia:global-patterns:v1`.
- `PrismaClient.workspace.findUnique()` (L147).

### 5. What real-world event enters? What real action exits?
**Entra:** Job BullMQ `cia-cycle` com `workspaceId`. Trigger periodico
(configurado no worker).
**Sai:** `{ queued, ignoredCount, learning, guaranteeReport, exhaustionReport,
cycleProofId, accountProofId, opportunityRefresh }`. Jobs `cia-action`
enfileirados para cada acao planejada.

### 6. What outcome closes the cycle? What baseline is the comparison?
**Outcome:** Jobs `cia-action` processados assincronamente. Se `batch.actions.length === 0`,
publica evento `cia_idle` e retorna `reason: 'no_safe_actions'`.
**Baseline:** `validateCiaContracts()` — se garantias ou exaustao falham, ciclo
bloqueado com evento `cia_contract_violation` (severity CRITICAL) e
`reason: 'contract_violation'`.

### 7. What risk if this part fails?
- `validateCiaContracts()` falha: ciclo inteiro bloqueado, nenhuma acao
  despachada, insight CRITICAL persistido.
- `loadWorkspaceGlobalStrategy()` Redis falha: `buildGlobalStrategy()` com
  `patterns: []` — estrategia generica, sem aprendizado cross-workspace.
- `planCiaActions()` retorna actions invalidas: `assertConversationTacticPlan()`
  bloqueia por acao.
- Workspace fora da janela: retorna `reason: 'outside_window'` sem processar.

---

## Coverage Summary

| # | Module | File | Lines | Layer |
|---|--------|------|-------|-------|
| M1 | CommercialDecisionOrchestratorService | `backend/src/kloel/commercial-decision-orchestrator.service.ts` | 816 | acao |
| M2 | MindService | `backend/src/kloel/mind.service.ts` | 356 | memoria |
| M3 | mind-commercial-decision-resolvers | `backend/src/kloel/mind-commercial-decision-resolvers.ts` | 251 | memoria |
| M4 | ChannelSetupService | `backend/src/kloel/channel-setup.service.ts` | 344 | corpo |
| M5 | UnifiedAgentService | `backend/src/kloel/unified-agent.service.ts` | 541 | linguagem/acao |
| M6 | UnifiedAgentActionsMessagingService | `backend/src/kloel/unified-agent-actions-messaging.service.ts` | 507 | acao |
| M7 | WhatsAppBrainController | `backend/src/kloel/whatsapp-brain.controller.ts` | 174 | sentidos |
| M8 | MetaAuthController | `backend/src/meta/meta-auth.controller.ts` | 494 | sentidos |
| M9 | BrainCapabilityRegistryService | `backend/src/kloel/brain-capability-registry.service.ts` | 66 | politica |
| M10 | BrainRuntimeService | `backend/src/kloel/brain-runtime.service.ts` | 462 | corpo |
| M11 | channel-repertoire.config.ts | `backend/src/kloel/channel-repertoire.config.ts` | 183 | politica |
| M12 | PipelineService | `backend/src/admin/pipeline/pipeline.service.ts` | 208 | politica |
| M13 | global-learning.ts | `worker/processors/cia/global-learning.ts` | 248 | aprendizado |
| M14 | self-improvement.ts | `worker/processors/cia/self-improvement.ts` | 230 | aprendizado |
| M15 | cia-action-dispatch.ts | `worker/processors/autopilot/cia-action-dispatch.ts` | 246 | acao |
| M16 | cia-cycle-workspace.ts | `worker/processors/autopilot/cia-cycle-workspace.ts` | 395 | acao |

**Total: 16 modules covered, 7 unique layers populated.**
