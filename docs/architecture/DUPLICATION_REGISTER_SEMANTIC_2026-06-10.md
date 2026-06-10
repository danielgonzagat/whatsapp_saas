# Registro de Duplicações Semânticas — Famílias de Maior Risco (P0–P3)

> **Data:** 2026-06-10 · **Escopo:** `backend/src`, `worker/`, `frontend/src` (citado quando relevante), `*/prisma/schema.prisma`
> **Método:** derivado 100% do código-fonte (não de docs). Cada item cita arquivo e, quando útil, linha aproximada.
> **Relação com `DUPLICATION_REGISTER.md`:** aquele arquivo é um scan léxico auto-gerado (`tools/canonicalize/scan.mjs`) de *nomes* exportados. Este registro é *semântico*: implementações múltiplas da MESMA capacidade, mesmo com nomes/códigos diferentes.

**Escala de gravidade**

| Nível | Critério |
|---|---|
| **P0** | Comportamentos divergem em produção hoje (bug ativo ou bypass de política) |
| **P1** | Inconsistência real entre caminhos — divergência latente sob condições normais |
| **P2** | Entropia: N implementações equivalentes, custo de manutenção e risco de drift |
| **P3** | Duplicação leve / wrapper documentado / risco baixo |

---

## Família 1 — Despacho de mensagem (sendMessage / sendText / dispatch)

### 1.1 Inventário de implementações

#### Backend — camadas de orquestração (3 registries paralelos)

| # | Implementação | Path | Assinatura | Quem chama |
|---|---|---|---|---|
| B1 | `ChannelDispatchRegistry.send` / `.sendMessage` | `backend/src/common/channel-dispatch/channel-dispatch.registry.ts:62,80` | `(input: ChannelSendInput) → ChannelSendResult` | `ChannelMessageDispatchService`; adapters por canal via token `CHANNEL_DISPATCH_ADAPTERS` |
| B2 | `ChannelMessageDispatchService.dispatch` / `.sendMessage` | `backend/src/marketing/channel-message-dispatch.service.ts:74,118` | `(workspaceId, channel, to, message, options?) → ChannelSendResult` | façade "porta única" (ADR-0012/Wave 21); `ChannelTransportRegistry` quando flag delegate ON |
| B3 | `ChannelTransportRegistry.send` | `backend/src/kloel/channel-transport.registry.ts` | `(workspaceId, ChannelSendRequest) → ChannelSendResult` (CONTRACT-A) | ~16 consumidores: `kloel-tool-executor-whatsapp.service.ts:128,285,332`, `unified-agent-actions-messaging.service.ts:89`, `cia-send-helpers.service.ts:140`, `inbox.service.ts`, `cart-recovery.service.ts`, `internal-whatsapp-runtime.controller.ts` (send-media) |

#### Backend — cadeia WhatsApp (5 camadas em fila)

| # | Implementação | Path | Assinatura | Quem chama |
|---|---|---|---|---|
| W1 | `WhatsappService.sendMessage` | `backend/src/marketing/channels/whatsapp/whatsapp.service.ts:436` (delegate Wave 22) | `(ws, to, message, opts?)` | `whatsapp-dispatch.adapter.ts:36`, `whatsapp.controller.ts:52`, `internal-whatsapp-runtime.controller.ts:164` (send-text), webhooks de pagamento (`payment-webhook-stripe.handlers2.helpers.ts:257`, `payment-webhook-generic-confirmation.ts:18`), `billing-checkout-helper.service.ts:71`, `inbound-processor.inline-autopilot.ts:61`, `unified-agent-actions-messaging.service.ts:345,391`, `unified-agent-actions.service.ts:186` |
| W2 | `WhatsappMessageDispatcherService.sendMessage` | `backend/src/marketing/channels/whatsapp/whatsapp-message-dispatcher.service.ts:49` | `(ws, to, message, opts?)` — **único ponto com `ensureSubscriptionActive` + `ensureOptInAllowed` + roteamento fila/direto + persistência inbox (`:278`)** | W1; `campaigns.service.ts:82` (só com flag ON); `channel-transport-whatsapp.provider.ts:92` (só com flag ON) |
| W3 | `WhatsAppProviderRegistry.sendMessage` / `.sendMedia` | `backend/src/marketing/channels/whatsapp/providers/provider-registry.ts:146,155` | `(workspaceId, to, message, options?) → SendResult` | W2; **`channel-transport-whatsapp.provider.ts:127` (caminho default, flag OFF — SEM compliance)** |
| W4 | `sendMessage` (funções livres, 2 arquivos) | `providers/provider-registry-messaging.ts:31,52` → `providers/provider-send-message.helpers.ts:25` | `(deps, workspaceId, to, message, options?)` | W3 (delegates documentados Wave 22) |
| W5 | `WhatsAppApiProvider.sendMessage` | `providers/whatsapp-api.provider.ts:131` | `(workspaceId, to, message, options)` → chama `MetaWhatsAppService.sendTextMessage` | W4 |
| W6 | `MetaWhatsAppService.sendTextMessage` | `backend/src/meta/meta-whatsapp.service.ts:236` | `(workspaceId, to, message, options?)` — folha HTTP Meta Cloud | W5; **`campaigns.service.ts:89` direto (flag OFF — bypass de opt-in/limites)**; `channel-transport.providers.ts` |

#### Backend — outros canais (cada um com par serviço+adapter)

| # | Implementação | Path | Observação |
|---|---|---|---|
| C1 | `InstagramService.sendMessage` | `marketing/channels/instagram/instagram.service.ts:12` | folha Graph API; adapter: `instagram-dispatch.adapter.ts` |
| C2 | `MessengerService.sendTextMessage` | `marketing/channels/messenger/messenger.service.ts:12` | adapter: `messenger-dispatch.adapter.ts:42`; também chamado direto por `channel-transport.providers.ts:174` e `messenger.controller.ts:63` |
| C3 | `FacebookMessengerService.sendMessage` | `marketing/facebook-messenger.service.ts:41` | canal `facebook` (PSID) — paralelo a C2 |
| C4 | Email: `EmailDispatchAdapter` vs `TransactionalEmailDispatchAdapter` vs `EmailChannelTransport` | `marketing/channels/email/*`, `kloel/channel-transport.providers.ts` | 3 semânticas de entrega distintas (mailbox conectada / transacional / campanha Resend-SendGrid) — distinção intencional, mas o nome `email` é sobrecarregado |
| C5 | `TikTokInboxService.sendMessage` | `marketing/tiktok-inbox.service.ts:98` | TikTok não tem API outbound; adapter retorna blocked honesto |
| C6 | `partnerships.chat.helpers.sendMessage` + `PartnershipsService.sendMessage` | `partnerships/partnerships.chat.helpers.ts:98`, `partnerships/partnerships.service.ts:431` | canal `internal-partnership` |
| C7 | `AdminChatService.sendMessage` | `admin/chat/admin-chat.service.ts:82` | superfície copilot (`INTERNAL_ADMIN`) |

#### Worker — pilha própria completa (paralela ao backend)

| # | Implementação | Path | Assinatura | Quem chama |
|---|---|---|---|---|
| K1 | `handleSendMessage` (job BullMQ `send-message`) | `worker/send-message-handler.ts:36` | `(job: Job)` — gate `PlanLimitsProvider`, retry BullMQ, **persiste via `persistSuccess` (`worker/send-message.persist-success.ts:43` — `prisma.message.create` sem dedupe)** | `worker/processor.ts` |
| K2 | `sendMessage` (flow engine) | `worker/flow-message-sender.helpers.ts:26` | `(deps, user, text, workspaceId?)` — RateLimiter + Watchdog + retry 3x + **persistência própria** (contact upsert + message) | `flow-engine-global.ts:488` (método privado homônimo), `flow-node-executor.ts:56,61,327` via `deps.sendMessage` |
| K3 | `dispatchOutboundThroughFlow` | `worker/providers/outbound-dispatcher.ts:4` | enfileira job `send-message` e espera resultado | `cognition-reply.ts:16 dispatchAutonomousTextMessage` (autopilot) |
| K4 | `WhatsAppEngine.sendText/.sendMedia` | `worker/providers/whatsapp-engine.ts:119,199` | lock Redis por workspace (anti-duplicata I6), anti-ban | K1 |
| K5 | `autoProvider` → `unifiedWhatsAppProvider` → `whatsappApiProvider` | `worker/providers/auto-provider.ts:18`, `unified-whatsapp-provider.ts:110`, `whatsapp-api-provider.ts:134` | 3 camadas que re-normalizam workspace e terminam em **HTTP POST `/internal/whatsapp-runtime/send-text`** no backend | K2 (via `ProviderRegistry.getProviderForUser`), K4 |
| K6 | `emailProvider.sendText/.sendMedia` | `worker/providers/email-provider.ts:22,60` | envio e-mail worker-side | `ProviderRegistry.getProviderForUser` quando `user` contém `@` |
| K7 | `dispatchAutopilotAction` / `dispatchCiaActionByType` | `worker/processors/autopilot/execution-dispatcher.ts:63`, `cia-action-dispatch.ts:19` | dispatchers de ação que terminam em K3 | autopilot |

### 1.2 Divergências de comportamento

| ID | Divergência | Gravidade |
|---|---|---|
| **F1-A** | **Bypass de compliance em produção (flag default OFF).** `WhatsAppChannelTransport.send` (`backend/src/kloel/channel-transport-whatsapp.provider.ts:88-127`): com `KLOEL_COMPLIANT_WHATSAPP_SEND !== 'true'` (default), vai DIRETO a `WhatsAppProviderRegistry.sendMessage`, pulando `ensureSubscriptionActive`, `ensureOptInAllowed`, roteamento de fila e metering de billing que W2 aplica. Mesmo bypass em `campaigns.service.ts:89` (blast em massa via `metaWhatsApp.sendTextMessage` cru). Os ~16 consumidores do `ChannelTransportRegistry` (inbox, agente, cart-recovery, webhooks) enviam WhatsApp sem política; quem passa por B1/W1 tem política. **Mesma capacidade, duas semânticas simultâneas em produção.** | **P0** |
| **F1-B** | **Dupla persistência de outbound em envios originados no worker.** Caminho: K1/K2 → K5 → HTTP `/internal/whatsapp-runtime/send-text` → `WhatsappService.sendMessage(forceDirect:true)` → W2 `sendDirectCore` → `inbox.saveMessageByPhone` (`whatsapp-message-dispatcher.service.ts:278`) grava `Message OUTBOUND` no backend; ao retornar, o worker grava DE NOVO (`persistSuccess` → `prisma.message.create`, `send-message.persist-success.ts:43`; K2 idem inline). Nem `inbox.saveMessage` (`backend/src/inbox/inbox.service.ts:117+`) nem `persistSuccess` deduplicam por `externalId`. Resultado: mensagens outbound duplicadas no inbox/analytics para todo envio de flow/autopilot/campanha via worker. | **P0** |
| **F1-C** | `internal-whatsapp-runtime.controller.ts`: `send-text` (`:152`) roteia por `whatsappService.sendMessage` (camada compliant W1→W2) enquanto `send-media` (`:174`) roteia por `this.transports.send` (B3 — sem compliance com flag OFF). Texto e mídia do MESMO worker passam por políticas diferentes. | **P1** |
| **F1-D** | `unified-agent-actions-messaging.service.ts` mistura os dois mundos no mesmo arquivo: `transports.send` na linha 89 e `whatsappService.sendMessage` nas linhas 345/391 — resultados com contratos diferentes (CONTRACT-A `{success,blocked}` vs `{ok|error,message}`). | **P1** |
| **F1-E** | Dois contratos de resultado coexistem: CONTRACT-A (`ChannelSendResult` do transport, `blocked` obrigatório) vs CONTRACT-B (`channel-dispatch.port.ts`, `blocked?` opcional + `queued/delivery/provider`). A colagem é flag-gated (`channel-transport-canonical-delegate.flag.ts`, default OFF). | **P1** |
| **F1-F** | Worker mantém pilha de envio inteira própria (K1–K7) que no fim faz loop HTTP para o backend — 4 camadas (`auto → unified → api-provider → HTTP`) cada uma re-normalizando workspace e re-resolvendo provider de env (`getWhatsAppProviderFromEnv` chamado em 3 camadas). | **P2** |
| **F1-G** | `ChannelDispatchPort` expõe `send` E alias `sendMessage` (port `:131` aprox.), registry idem — dois verbos para a mesma operação durante a transição Wave 21. | **P3** |
| **F1-H** | K1 (`handleSendMessage`) vs K2 (`flow-message-sender.sendMessage`): os docblocks afirmam serem capacidades distintas (contrato Job vs chamada direta), mas ambos: resolvem provider, aplicam retry, extraem `externalId` (duas cópias de `extractExternalId` — `send-message-handler.ts:24` e `flow-engine-external-id.ts`) e persistem outbound. A "distinção" real é só o transporte de entrada. | **P2** |

### 1.3 Canônico proposto e migração

**Canônico:** `ChannelDispatchRegistry` + `ChannelMessageDispatchService` (B1/B2) como ÚNICA porta backend; `WhatsappMessageDispatcherService` (W2) como única política WhatsApp; worker reduzido a *transporte de fila* sem persistência própria.

Plano curto (executável):

1. **(F1-A, P0)** Ligar `KLOEL_COMPLIANT_WHATSAPP_SEND=true` em produção após verificação: `grep` de consumidores de `transports.send` + smoke em staging; em seguida remover o branch legado de `channel-transport-whatsapp.provider.ts` e o caminho cru de `campaigns.service.ts:89`. Critério de aceite: nenhum call-site alcança `WhatsAppProviderRegistry.sendMessage` sem passar por W2.
2. **(F1-B, P0)** Escolher UM dono da persistência outbound: manter `inbox.saveMessageByPhone` (backend) e remover `persistSuccess`/persistência inline de K1/K2, OU adicionar dedupe por `externalId` (índice único parcial `(workspaceId, externalId)` em `Message` + `upsert`). Verificação prévia em produção: `SELECT externalId, COUNT(*) FROM "Message" WHERE direction='OUTBOUND' AND "externalId" IS NOT NULL GROUP BY 1 HAVING COUNT(*)>1`.
3. **(F1-C/D)** Migrar `send-media` do internal-runtime controller para `whatsappService.sendMessage` (mesma camada do `send-text`); nas `unified-agent-actions-messaging`, padronizar 100% em `transports.send` (pós item 1, ambos terão a mesma política).
4. **(F1-E)** Ligar `KLOEL_TRANSPORT_CANONICAL_DELEGATE=true`, depois apagar os providers duplicados de `channel-transport.providers.ts` mantendo só o shell de MindGuards.
5. **(F1-F/H)** Colapsar `auto-provider`/`unified-whatsapp-provider` num único `whatsapp-api-provider` worker-side; extrair `extractExternalId` para `worker/utils`.

---

## Família 2 — Normalização de telefone

### 2.1 Inventário

| # | Implementação | Path | Assinatura / Semântica | Quem chama |
|---|---|---|---|---|
| P1 | **Canônico estruturado**: `normalizePhone` | `backend/src/common/phone/phone-normalization.util.ts:150` | `(input) → NormalizedPhone {digits,e164,country,valid} \| null`; piso 8 dígitos, teto 15, BR-promote 10/11→`55…`, strip sufixos `@c.us/@s.whatsapp.net/@lid/...` | kloel mind coordinators, `kloel-lead-processor`, checkout-social-lead |
| P2 | **Canônico facetas**: `digitsOnly` / `digitsOrNull` / `digitsOrUndefined` / `whatsappDigits` + `NON_DIGIT_RE` | `backend/src/common/phone.ts:40+` | strip de não-dígitos; SEM piso, SEM BR-promote | auth-whatsapp-password, kloel-*-tools, kyc, payment-webhook-generic |
| P3 | Espelho worker do P1 | `worker/utils/phone-normalization.util.ts:171` | **byte-idêntico ao P1 a partir de `NON_DIGIT_RE`** (verificado por diff — só o header difere); duplicado porque worker não importa do backend | autopilot profile, checkout-social-lead-enrichment |
| P4 | `normalizeWhatsAppPhone` | `backend/src/meta/meta-whatsapp.message.helpers.ts:59` | wrapper fino de `extractAsciiDigits` (P1) | MetaWhatsAppService |
| P5 | `normalizeNumber` | `backend/src/marketing/channels/whatsapp/whatsapp-service.helpers.ts:15` | wrapper fino de `extractAsciiDigits` | WhatsappService/Session/Media + dispatcher |
| P6 | `normalizeNumberLocal` | `backend/src/marketing/channels/whatsapp/whatsapp-service.normalizers.ts:10` | re-implementação local `replace(NON_DIGIT_RE,'')` — duplica P2 no mesmo módulo que já importa P5 | normalizadores de contato/chat |
| P7 | `normalizePhoneWithFloor` | `backend/src/prisma/checkout-paid-effects/whatsapp.ts:21` | P1 + piso 10 dígitos (faceta documentada) | efeitos pós-pagamento |
| P8 | `normalizePhoneDigits` (método privado) | `backend/src/checkout/checkout-order-support.ts:197` | strip local em checkout | checkout-order-support |
| P9 | `export { digitsOnly as normalizePhone }` | `backend/src/kloel/kloel.autonomy-proof.helpers.ts:83` | **alias que renomeia a faceta crua para o NOME do canônico estruturado** | provas de autonomia kloel |
| P10 | `normalizeCatalogPhone` + `expandComparablePhoneVariants` | `worker/processors/autopilot/identity-resolve.ts:17,24` | strip digits e depois `.replace('@c.us')` (morto — pós-strip não há `@`); variantes BR re-implementadas localmente (heurística `55` duplicando P1) | autopilot identity/profile |
| P11 | `normalizePhone` local | `worker/providers/checkout-social-lead-enrichment.ts:212` | adapter documentado → `canonicalNormalizePhone(value)?.digits ?? null` | enrichment |
| P12 | `const normalizedPhone = String(phone \|\| '').trim()` | `worker/processors/autopilot/cognition-context.ts:58` | **só trim, sem strip de dígitos** — diverge de `backlog-fetcher.ts:202` (strip) no mesmo domínio | contexto de cognição |
| P13 | `formatPhone` (display) | `frontend/src/app/(main)/followups/followups.helpers.ts:32` | formata 11/13 dígitos BR para exibição | UI followups |
| P14 | `normalizeWhatsappDigits` | `frontend/src/components/kloel/conta/ContaView.helpers.ts:189` | piso 10 / teto 15 + detecção de placeholder — **piso difere do canônico (8)** | UI conta |

Há ainda ~10 ocorrências inline de `replace(/\D/g,'')` em backend+worker fora das facetas (ex.: `whatsapp.service.chats.ts:7`).

### 2.2 Divergências

| ID | Divergência | Gravidade |
|---|---|---|
| **F2-A** | P9: `normalizePhone` re-exportado como alias de `digitsOnly` cria colisão semântica com o canônico P1 — quem importa "normalizePhone" pode receber string crua sem BR-promote/validação ou o struct, dependendo do módulo. Lookups `workspaceId_phone` podem divergir entre caminhos (ex.: `11987654321` vs `5511987654321`). | **P1** |
| **F2-B** | P12 (trim-only) vs P10/backlog-fetcher (strip) no MESMO domínio autopilot: telefone formatado (`+55 11 9...`) acha contato num caminho e não acha no outro. | **P1** |
| **F2-C** | P10 re-implementa a heurística BR-promote do P1 com regras diferentes (`length === 11` vs piso/teto do canônico) e contém replace morto. | **P2** |
| **F2-D** | Piso divergente FE (10, P14) vs canônico BE (8, P1) — número aceito no backend pode ser rejeitado/anulado na UI e vice-versa. | **P2** |
| **F2-E** | P3 é cópia byte-idêntica sem verificação automatizada ativa (o header cita `scripts/ops/check-cross-boundary-utils-drift.mjs` como "quando o script existir"). Hoje o drift só não acontece por disciplina. | **P2** |
| **F2-F** | P6 re-declara strip no módulo que já importa o wrapper; P8 idem em checkout; inlines `\D` residuais. | **P3** |

### 2.3 Canônico proposto e migração

**Canônico:** `backend/src/common/phone/phone-normalization.util.ts` (estruturado) + facetas de `backend/src/common/phone.ts`; worker usa o espelho `worker/utils/phone-normalization.util.ts` com check de drift em CI.

1. **(F2-A)** Remover o alias em `kloel.autonomy-proof.helpers.ts:83`; renomear call-sites para `digitsOnly` explícito (semântica que eles já recebem). Zero mudança de comportamento, elimina a armadilha.
2. **(F2-B)** Trocar `cognition-context.ts:58` por `normalizeCatalogPhone`/`extractAsciiDigits`; adicionar teste que cobre telefone formatado.
3. **(F2-C)** Reescrever `normalizeCatalogPhone`+`expandComparablePhoneVariants` sobre o espelho canônico (`normalizePhone(...).digits` + variante sem `55`).
4. **(F2-E)** Criar o script de drift prometido (diff a partir de `NON_DIGIT_RE`) e ligar no pre-push/CI.
5. **(F2-D/F)** Alinhar piso FE↔BE (decidir 8 ou 10 e documentar); varrer `replace(/\\D/g` inline e substituir por `digitsOnly`/`NON_DIGIT_RE` importado.

---

## Família 3 — Resolução de tenant/workspace

### 3.1 Inventário

| # | Implementação | Path | Semântica | Call-sites |
|---|---|---|---|---|
| T1 | **`resolveWorkspaceId(req, explicit?)`** | `backend/src/auth/workspace-access.ts:119` | explicit > params > body > query, depois `assertWorkspaceAccess` (token obrigatório; mismatch → 403; modo `AUTH_OPTIONAL` só dev) | **301** call-sites (controllers: crm, inbox, followup, pipeline, video, calendar, launch, tiktok-ads, …) |
| T2 | `WorkspaceGuard.canActivate` | `backend/src/common/guards/workspace.guard.ts` | workspace SEMPRE do token; request explícito divergente → 403; popula `req.workspaceId`; **se `req.user` ausente, retorna `true` (delega a outro guard)** | rotas decoradas |
| T3 | `getWorkspaceId(req)` | `backend/src/kloel/product-sub-resources/helpers/common.helpers.ts:20` | `req.user?.workspaceId \|\| req.workspaceId \|\| ''` — **fallback silencioso para string vazia, sem exceção** | 18 call-sites (sub-recursos de produto) |
| T4 | Leitura inline `req.user.workspaceId` | espalhado | sem validação de mismatch com body/params | **~230** ocorrências |
| T5 | Leitura `req.workspaceId` (pós-guard) | espalhado | depende de T2 ter rodado | ~31 ocorrências |
| T6 | `ApiKeyGuard` | `backend/src/public-api/api-key.guard.ts` | resolve tenant a partir de `x-api-key` e injeta `request.user = { workspaceId }` | public-api |
| T7 | `resolveWorkspaceIdHelper(prisma, subscription)` | `backend/src/billing/billing-subscription-status.helper.ts:24` | tenant a partir de metadata Stripe ou `stripeCustomerId` (domínio diferente; já consolidado de 3 cópias) | billing webhooks |
| T8 | **Worker:** `ProviderRegistry.getProviderForUser(user, workspaceId?)` | `worker/providers/registry.ts:16` | sem `workspaceId` → **fallback `workspace: { id: 'default' }`** (e-mail e WhatsApp); contato resolvido por telefone/email pode cruzar tenant quando `workspaceId` omitido | `flow-message-sender.helpers.ts:33` (que ainda re-extrai `provider.workspace \|\| { id: 'default' }`) |

### 3.2 Divergências

| ID | Divergência | Gravidade |
|---|---|---|
| **F3-A** | T8: tenant `'default'` sintético no worker. Envio/persistência podem ser atribuídos a um workspace inexistente ou — no caminho de e-mail por `contact.findFirst({ email })` sem `workspaceId` — ao tenant ERRADO. É despacho externo com isolamento de tenant não garantido. | **P0** (rota de produção quando jobs antigos/fluxos chamam sem `workspaceId`) |
| **F3-B** | T3 retorna `''` silenciosamente onde T1 lança 401/403. Uma query Prisma com `workspaceId: ''` retorna vazio "limpo" mascarando bug de auth; um `create` herdaria tenant vazio. | **P1** |
| **F3-C** | T4 (230 sites) não aplica a regra "explicit workspaceId divergente → 403" de T1/T2. Rotas que aceitam `workspaceId` no body e leem `req.user.workspaceId` inline ignoram o parâmetro sem erro; rotas T1 rejeitam — comportamento de API inconsistente. | **P1** |
| **F3-D** | T2 vs T1 duplicam a mesma política (token-first + mismatch 403) em guard e helper, com diferenças: T2 considera `headers['x-workspace-id']`, T1 não; T1 tem modo `AUTH_OPTIONAL` dev, T2 não. | **P2** |
| **F3-E** | T7 compartilha o NOME `resolveWorkspaceId*` com T1 mas é outro domínio (Stripe). Confusão de leitura, não de runtime. | **P3** |

### 3.3 Canônico proposto e migração

**Canônico:** T1 (`resolveWorkspaceId` + `assertWorkspaceAccess`) como única extração request→tenant; T2 reescrito como casca fina sobre T1; worker exige `workspaceId` obrigatório.

1. **(F3-A)** No worker: tornar `workspaceId` obrigatório em `getProviderForUser` (throw em vez de `'default'`); pré-verificação: `grep -rn "'default'" worker/providers/registry.ts worker/flow-message-sender.helpers.ts` + métrica/log temporário contando quantos jobs chegam sem `workspaceId` antes do corte.
2. **(F3-B)** `getWorkspaceId` → lançar `UnauthorizedException` quando vazio (ou delegar a T1). 18 call-sites, mudança mecânica.
3. **(F3-C)** Codemod progressivo: substituir leituras inline `req.user.workspaceId` em controllers por `resolveWorkspaceId(req)` (começar pelos que aceitam `workspaceId` em body/query — esses têm o bug de inconsistência observável).
4. **(F3-D)** Unificar a lista de fontes (incluir ou excluir `x-workspace-id` nas DUAS implementações — hoje só o guard a lê) e fazer T2 chamar `assertWorkspaceAccess`.

---

## Família 4 — Parsing de webhook por canal

### 4.1 Inventário (canais de mensagem)

| Canal | Handler | Rota | Verificação | Idempotência | Tenant resolvido por |
|---|---|---|---|---|---|
| WhatsApp (Meta Cloud) + Instagram + Messenger | `meta/webhooks/meta-webhook.controller.ts:160` | `POST /webhooks/meta` | HMAC-SHA256 `x-hub-signature-256` via `common/webhook/webhook-signature.util.ts`, **fail-closed** | Redis `SET NX` (5 min) **+** `WebhookEvent` unique (P2002) | `phone_number_id`/page/IG id → `MetaConnection` |
| Meta Marketing (lead ads etc.) | `meta/meta-webhook.controller.ts:81` | `POST /webhooks/meta-marketing` | mesma util, fail-closed; **scaffold GET-verify + POST duplicado do anterior** | — | metadados do evento |
| Instagram (legado) | `webhooks/webhooks.controller.ts:373` | `POST /hooks/instagram/:workspaceId` | `verifyMetaSignatureOrThrow` — **pula verificação em não-produção quando `META_APP_SECRET` ausente** | `computeExternalId` + `logWebhookEventSafe` | **`:workspaceId` na URL** |
| WhatsApp (WAHA legado) | `webhooks/whatsapp-api-webhook.controller.ts:67` | `POST /webhooks/whatsapp-api` | segredo compartilhado `x-api-key`/`x-webhook-secret`; **`if (expected)` — env ausente ⇒ aceita sem validar** | `WebhookEvent` unique | `session` do payload |
| TikTok | `webhooks/tiktok-webhook.controller.ts:138` | `POST /webhooks/tiktok` (aprox.) | parser próprio de `tiktok-signature` (hex64 ou raw) + `TIKTOK_CLIENT_SECRET` | — | payload |
| Email status (Resend/SendGrid) | `marketing/email-marketing-webhook.controller.ts:84,146` | `POST .../resend`, `.../sendgrid` | segredo compartilhado `x-webhook-secret` | — | payload |
| Email inbound | `marketing/email-inbound.controller.ts:164` | `POST /webhooks/email-inbound` | `x-email-inbound-secret` | — | mailbox |
| Pagamentos (família adjacente, mesmo padrão) | `payment-webhook-stripe.controller.ts:119`, `payment-webhook-generic.controller.ts:80,205,292,390` (generic/shopify/paghiper/woo), `payments/mercadopago/mercadopago-webhook.controller.ts:51`, `kloel/payment.controller.ts:47`, `kloel/smart-payment.controller.ts:238`, `billing/billing-webhook.service.ts` | várias | por provedor | varia | varia |

Pós-parse, o inbound WhatsApp converge para `InboundProcessorService.process` (`marketing/channels/whatsapp/inbound-processor.service.ts:134`) a partir de DUAS portas (WAHA e Meta Cloud) — convergência correta; a duplicação está na borda.

### 4.2 Divergências

| ID | Divergência | Gravidade |
|---|---|---|
| **F4-A** | Instagram inbound tem DOIS parsers vivos: `handleInstagram` em `/webhooks/meta` (fail-closed, tenant por IG-account-id) e `/hooks/instagram/:workspaceId` (skip de assinatura em dev, tenant confiado da URL). Payload igual, segurança e atribuição de tenant diferentes. | **P1** |
| **F4-B** | Política de segredo ausente difere por canal: Meta = fail-closed; WAHA = fail-open (`if (expected)`); Instagram legado = fail-open em dev. Um operador que esqueça a env em produção tem 3 comportamentos distintos. | **P1** |
| **F4-C** | Scaffold GET hub.challenge + POST HMAC + log + dedupe re-implementado em 2 controllers Meta (e parcialmente no hooks/instagram). A util de assinatura já é canônica; o restante do envelope não. | **P2** |
| **F4-D** | Idempotência heterogênea: Redis+DB (meta), só DB (WAHA), helper próprio (hooks), nenhuma (email/tiktok status). Eventos repetidos de provedores que reentregam (SendGrid faz isso) podem duplicar efeitos. | **P2** |
| **F4-E** | 7+ endpoints de pagamento com envelopes próprios — verificação legitimamente por provedor, mas log/dedupe/resposta divergem. | **P2** |

### 4.3 Canônico proposto e migração

**Canônico:** um `WebhookEnvelope` (pipeline: raw-body → verificação por estratégia do provedor → dedupe Redis+`WebhookEvent` → resolução de tenant → dispatch para o processor do canal), com `verifyHmacSha256Signature` mantido como estratégia Meta.

1. **(F4-A)** Confirmar tráfego do endpoint legado: `SELECT provider, COUNT(*) FROM "WebhookEvent" WHERE provider='hooks_instagram' AND "createdAt" > now()-interval '30 days'`. Se zero → remover rota; se ativo → redirecionar para o parser de `/webhooks/meta` e depreciar a rota com 308.
2. **(F4-B)** Padronizar fail-closed: em `whatsapp-api-webhook.controller.ts`, rejeitar quando `WHATSAPP_API_WEBHOOK_SECRET` não configurado (ou warn+reject em produção); mesma regra no handler legado de Instagram.
3. **(F4-C/D)** Extrair `common/webhook/webhook-envelope.ts` (dedupe Redis+DB já pronto no controller meta — mover, não reescrever) e migrar email/tiktok para ele.
4. **(F4-E)** Tratar pagamentos como família separada num passo posterior (registrar em `DEPRECATION_MAP.md`).

---

## Família 5 — Sessão de canal (session / connection / instance)

### 5.1 Inventário

#### Estado persistido (schema.prisma)

| Armazenamento | O que guarda | Quem lê/escreve |
|---|---|---|
| `model MetaConnection` (`backend/prisma/schema.prisma:3487`; worker `:3477`) | tokens Meta, `pageId`, `instagramAccountId`, `whatsappPhoneNumberId/BusinessId`, `tokenExpiresAt`, `channel` (default `whatsapp`) | 11 arquivos com acesso Prisma DIRETO: `integrations/meta-marketing.provider.ts` (8×), `marketing/instagram/instagram-marketing.service.ts` (5×), `meta/meta-whatsapp.service.ts`, `meta/webhooks/meta-webhook.controller.ts`, `meta/meta-auth.controller.ts`, `marketing-connect/meta-connect.service.ts`, `facebook-messenger.service.ts`, `integrations/meta-conversions-api.service.ts`, `ads-sync-persistence.helpers.ts`, `campaigns.service.ts`, `meta-whatsapp.service.helpers.ts` |
| `workspace.providerSettings Json` (`schema.prisma:133`) tipado por `ProviderSessionSnapshot` | snapshot da sessão WhatsApp legada (status, sessionName, phoneNumber, catchup/backfill state) | `marketing/channels/whatsapp/provider-settings.types.ts` + `asProviderSettings` usado em 10+ módulos backend; **worker lê `providerSettings` cru SEM o tipo** (`flow-engine.helpers.ts`, `autopilot-scanner.*`, `plan-limits.ts`, …) |
| `model MailboxConnection` (`:2157`) | sessão de e-mail (Gmail/Microsoft/IMAP) | mailbox-* services |
| `model ChannelIdentifier` (`:509`), `ChannelSetup`, `ChannelConfig` | identidade/configuração por canal | kloel channel setup |

#### Lógica de resolução de sessão/conexão

| # | Implementação | Path | Semântica |
|---|---|---|---|
| S1 | **`MetaWhatsAppService.resolveConnection(workspaceId, channel)`** | `backend/src/meta/meta-whatsapp.service.ts:71` | leitura canônica de `MetaConnection` + fallback env via `buildResolvedMetaConnection` (inclui `tokenExpired`) |
| S2 | `MetaConnectionStateService.forWorkspace` | `backend/src/meta/meta-connection-state.service.ts:44` | re-lê `MetaConnection` e re-implementa expiry (`EXPIRED = tokenExpiresAt < now`) para os 3 canais |
| S3 | `MetaConnectService.getStatus` | `backend/src/marketing/marketing-connect/meta-connect.service.ts:39` | terceira leitura com expiry próprio (`:125`) |
| S4 | `WhatsappSessionService` (`createSession/getConnectionStatus/recreateSessionIfInvalid/persistSessionDiagnostics`) | `backend/src/marketing/channels/whatsapp/whatsapp-session.service.ts:19+` | superfície legada WAHA agora mapeada para Meta (`throwMetaOnlyGone`), delega a `WhatsAppProviderRegistry.startSession/getSessionStatus` (`provider-registry.ts:134,142,245`) e persiste snapshot em `providerSettings` |
| S5 | Worker `normalizeWorkspace` ×3 | `worker/providers/whatsapp-api-provider.ts:92`, `unified-whatsapp-provider.ts:87`, `whatsapp-engine.ts:38` | 3 cópias da mesma função (injeta `whatsappProvider` de env) |
| S6 | Worker `ProviderRegistry.getProviderForUser` | `worker/providers/registry.ts:16` | resolve "sessão" (provider+workspace) por heurística de destinatário (`@`→email, senão WhatsApp) |
| S7 | `instagram-marketing.service` / `meta-marketing.provider` | paths acima | re-implementam seleção de conexão + checagem de token por conta própria |

### 5.2 Divergências

| ID | Divergência | Gravidade |
|---|---|---|
| **F5-A** | **Drift real entre `backend/prisma/schema.prisma` e `worker/prisma/schema.prisma`** (verificado por diff): worker NÃO tem (i) colunas `originalAmountInCents/feeAmountInCents/netAmountInCents` (dual-write de antecipação), (ii) `sourceId` + `@@unique([workspaceId, source, sourceId])` no modelo de mensagens Mind, (iii) enums de `type/relation` ampliados em MindMemory. O cliente Prisma do worker está dessincronizado do banco: upserts/validações que dependem do índice único novo não são expressáveis no worker, e o dual-write de centavos é invisível para ele. | **P0** (se o worker escreve nessas tabelas) / **P1** no mínimo |
| **F5-B** | Checagem de expiração de token Meta re-implementada em ≥4 lugares (S1 via helper, S2 `EXPIRED`, S3 inline `:125`, instagram-marketing) — uma mudança de política (ex.: margem de renovação) precisaria de 4 edições; hoje já há nuances (S1 retorna `tokenExpired` no struct; S2/S3 calculam na hora). | **P1** |
| **F5-C** | 11 arquivos fazem `prisma.metaConnection.*` direto em vez de S1 — cada um re-decide `findFirst` vs canal default, fallback de env e tratamento de token nulo. | **P2** |
| **F5-D** | Worker lê `workspace.providerSettings` cru sem `ProviderSessionSnapshot` (tipo existe só no backend) — campo renomeado no backend quebra o worker silenciosamente. | **P2** |
| **F5-E** | `normalizeWorkspace` triplicado no worker (S5). | **P2** |
| **F5-F** | Vocabulário: "session" significa 4 coisas (sessão WhatsApp WAHA, MetaConnection OAuth, `SessionService` v2 = busca de threads de chat em `kloel/services-v2/session.service.ts`, `AdminSession` auth). Sem colisão de runtime, mas custo cognitivo alto. | **P3** |

### 5.3 Canônico proposto e migração

**Canônico:** `MetaConnection` como ÚNICA fonte de sessão Meta com leitura exclusiva via `MetaWhatsAppService.resolveConnection` (S1); `ProviderSessionSnapshot` compartilhado (espelho no worker, com drift-check); schema.prisma do worker regenerado a partir do backend em CI.

1. **(F5-A)** Sincronizar JÁ: copiar `backend/prisma/schema.prisma` → `worker/prisma/schema.prisma`, `npx prisma generate` no worker, e adicionar check de CI `diff backend/prisma/schema.prisma worker/prisma/schema.prisma` (mesmo mecanismo prometido para phone-normalization). Pré-verificação: `grep -rn "anticipation\|mindMemory\|message.*source" worker/` para medir exposição real.
2. **(F5-B)** Extrair `isMetaTokenExpired(connection, marginMs?)` para `backend/src/meta/` e usar em S1/S2/S3/instagram-marketing.
3. **(F5-C)** Migrar os 11 acessos diretos para S1 (começar por `integrations/meta-marketing.provider.ts`, maior contagem); marcar `prisma.metaConnection` como acesso restrito em `PRISMA_USAGE.md`.
4. **(F5-D)** Espelhar `provider-settings.types.ts` em `worker/` (mesmo padrão do espelho de phone) e tipar as leituras do worker.
5. **(F5-E)** Uma única `normalizeWorkspace` em `worker/providers/workspace.ts`.

---

## Resumo executivo de gravidade

| ID | Família | Achado | Gravidade |
|---|---|---|---|
| F1-A | Dispatch | Bypass de plan-limit/opt-in/billing nos envios via `ChannelTransportRegistry` e campanhas (flags `KLOEL_COMPLIANT_WHATSAPP_SEND`/delegate default OFF) | **P0** |
| F1-B | Dispatch | Dupla persistência de `Message OUTBOUND` em envios worker→backend (sem dedupe por `externalId`) | **P0** |
| F3-A | Tenant | Workspace sintético `'default'` no worker `ProviderRegistry` — despacho externo sem isolamento garantido | **P0** |
| F5-A | Sessão/Schema | `worker/prisma/schema.prisma` dessincronizado do backend (colunas/índice único ausentes) | **P0/P1** |
| F1-C/D/E | Dispatch | Texto vs mídia em camadas distintas; serviço de agente misto; 2 contratos de resultado | P1 |
| F2-A/B | Telefone | Alias `normalizePhone`≠canônico; trim-only vs strip no autopilot | P1 |
| F3-B/C | Tenant | `getWorkspaceId() → ''` silencioso; 230 leituras inline sem validação de mismatch | P1 |
| F4-A/B | Webhook | 2 parsers Instagram com segurança divergente; política fail-open/fail-closed inconsistente | P1 |
| F5-B | Sessão | Expiry de token Meta re-implementado 4× | P1 |
| F1-F/H, F2-C/D/E, F3-D, F4-C/D/E, F5-C/D/E | — | Entropia estrutural (cadeias redundantes, cópias sem drift-check, scaffolds repetidos) | P2 |
| F1-G, F2-F, F3-E, F5-F | — | Aliases/wrappers documentados, colisão só de vocabulário | P3 |

### Ordem de execução recomendada (menor risco → maior impacto)

1. F5-A (sync de schema — mecânico, destrava o resto do worker)
2. F1-B (decidir dono da persistência outbound + dedupe `externalId`)
3. F1-A (ligar flags compliant/delegate, depois deletar caminhos legados)
4. F3-A/B (worker exige workspaceId; `getWorkspaceId` lança)
5. F4-A/B (matar parser Instagram legado; fail-closed universal)
6. F2-A/B e F5-B (correções pontuais de 1 arquivo cada)
7. P2s por codemod incremental, registrando cada colapso em `DEPRECATION_MAP.md`.
