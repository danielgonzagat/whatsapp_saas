# Decisão — Dono Único da Persistência Outbound (resíduo F1-B)

> **Data:** 2026-06-10 · **Origem:** `DUPLICATION_REGISTER_SEMANTIC_2026-06-10.md` §F1-B (P0) — janela NULL-externalId
> **Escopo:** caminho WhatsApp worker→backend. Análise 100% derivada do código-fonte (linhas citadas). Nenhum código de produção foi alterado por este documento.
> **Status:** decisão recomendada — Opção A (backend dono único), faseada. Aguarda aprovação.

---

## 1. Os dois caminhos de persistência, mapeados por completo

### 1.1 Caminho BACKEND — `inbox.saveMessageByPhone` via `WhatsappMessageDispatcherService` (W2)

**Cadeia de chamada (envio direto):**

```
chamador → WhatsappService.sendMessage (whatsapp.service.ts:436 — delegate puro)
        → WhatsappMessageDispatcherService.sendMessage (whatsapp-message-dispatcher.service.ts:49)
        → sendDirectlyViaProvider (:173, lock Redis whatsapp:action-lock:<ws>)
        → sendDirectCore (:214)
        → providerRegistry.sendMessage (W3→W4→W5→W6 Meta Graph API)
        → inbox.saveMessageByPhone (:278)            ← PERSISTÊNCIA
        → inbox.saveMessage (inbox.service.ts:198)
        → saveMessageInTx (inbox.conversation.helpers.ts:139 — $transaction I15)
```

**Quem chama** (chegando em W2 com persistência):
- `internal-whatsapp-runtime.controller.ts:164` — `POST /internal/whatsapp-runtime/send-text` com `forceDirect: true` (**é o loop HTTP do worker** — K5 termina aqui);
- Todos os ~10 chamadores de W1 (`whatsapp-dispatch.adapter.ts:36`, `whatsapp.controller.ts:52`, payment webhooks, `billing-checkout-helper.service.ts:71`, `inbound-processor.inline-autopilot.ts:61`, `unified-agent-actions-messaging.service.ts:345,391`) quando `forceDirect` OU worker indisponível (`whatsapp-message-dispatcher.service.ts:82-95`);
- Com `KLOEL_COMPLIANT_WHATSAPP_SEND=true`: os ~16 consumidores de `ChannelTransportRegistry` via `channel-transport-whatsapp.provider.ts:90-110` (inclui `inbox.service.ts:407 replyToConversation`).
- Outros writers OUTBOUND de `saveMessageByPhone` fora do par F1-B: `whatsapp-reconciler.service.ts:117` (reconciliação), `whatsapp-catchup-history.service.ts:310` (import histórico), `public-api.controller.ts:44`.

**Campos gravados** (`whatsapp-message-dispatcher.service.ts:278-287` → `saveMessageInTx`):
`workspaceId, contactId` (resolvido/criado por phone), `conversationId` (get-or-create com retry P2002), `content` (caption||message||mediaUrl), `direction:'OUTBOUND'`, `externalId` (só quando definido), `type` (mediaType.toUpperCase()||'TEXT'), `mediaUrl?`, `status:'SENT'`, `createdAt`. Atualiza `conversation.lastMessageAt/unreadCount` **na mesma transação**.
Nota: `saveMessageInTx` usa `tx.message.create` cru — **não captura P2002**; uma colisão de `(workspaceId, externalId)` (ex.: reconciler já gravou o wamid) estoura a transação.

**Eventos emitidos** (`inbox.service.ts:232-241`, pós-commit, direto no gateway):
- `message:new` (mensagem completa)
- `conversation:update` (com `lastMessageStatus`)
- webhook `message.received` via `webhookDispatcher.dispatch`
- adicionalmente o dispatcher emite `whatsappEmitter.emitMessageReplied` (`whatsapp-message-dispatcher.service.ts:289-298`)
- **não emite `message:status`** (evento exclusivo do worker hoje).

**Quando `externalId` fica NULL (backend)** — `whatsapp-message-dispatcher.service.ts:276-277`:

```ts
const extId = 'messageId' in r && r.messageId != null ? r.messageId : (opts?.externalId ?? undefined);
```

NULL ⇔ (a) o provider não devolveu `messageId` **e** (b) o chamador não passou `opts.externalId`. O `messageId` (wamid) só existe se a Meta devolveu `messages[0].id`: `provider-send-message.helpers.ts:50-54` (`typeof metaMsgId === 'string'` senão omite) ← `whatsapp-api.provider.ts:143-149` (`message.id = result.messageId`) ← `meta-whatsapp.service.ts:267-272` (`parseMessageIdFromResponse(response)` pode ser undefined). E no loop HTTP do worker, `opts.externalId` é **sempre** undefined porque o engine não o encaminha (ver §1.3).

### 1.2 Caminho WORKER — `createOutboundMessageDeduped` (`worker/outbound-message-dedup.ts:52`)

Dois sites de persistência compartilham a receita:

**K1 — job BullMQ `send-message`** (`processor.ts:271-272` → `send-message-handler.ts:35`):
- Jobs enfileirados por: backend W2 caminho fila (`whatsapp-message-dispatcher.service.ts:96-112`), `worker/campaign-processor.ts:111` (campanhas), `worker/processors/mass-send-processor.ts:37` (mass-send), `worker/providers/outbound-dispatcher.ts:24` (K3 — autopilot `cognition-reply.ts:24`, `scheduled-followup-handler.ts:70`, `autopilot-scanner.engine.ts:200`).
- Envia via `WhatsAppEngine.sendText/sendMedia` (`whatsapp-engine.ts`, lock I6) → `unifiedWhatsAppProvider` (`unified-whatsapp-provider.ts:110-118`) → `whatsappApiProvider.sendText` (`whatsapp-api-provider.ts:134-151`) → **HTTP POST `/internal/whatsapp-runtime/send-text`** → backend persiste (§1.1) e responde `{ok, direct:true, delivery:'sent', messageId: wamid|null}`.
- Persiste via `persistSuccess` (`send-message.persist-success.ts:28`) → `createOutboundMessageDeduped`.
- Falhas: `persistFailure` (`send-message.persist-failure.ts`) grava row `FAILED` + `errorCode` — **o backend nunca persiste falhas**, então o worker é hoje o único writer de rows FAILED.

**K2 — flow engine** (`flow-message-sender.helpers.ts:27`, chamado por `flow-engine-global.ts:482/505` e `flow-node-executor.ts:56,61,327`):
- Provider via `ProviderRegistry.getProviderForUser` (`@` ⇒ email worker-side direto; senão WhatsApp ⇒ mesmo loop HTTP).
- Persiste inline (`:119-135`) via `createOutboundMessageDeduped`; caminho de erro persiste `FAILED` com `externalId: null` (`:205-216`).

**Campos gravados** (`send-message.persist-success.ts:57-69` / `flow-message-sender.helpers.ts:125-134`):
`id` (uuid, só K1), `workspaceId, contactId, conversationId` (upsert contact + findFirst/create conversation próprios — **fora de transação**), `content`, `direction:'OUTBOUND'`, `type`, `mediaUrl?`, `status: SENT|FAILED`, `errorCode`, `externalId` (string|null). Depois `conversation.updateMany({lastMessageAt, unreadCount: 0})`.

**Eventos emitidos** (via `redisPub.publish('ws:inbox', ...)` → `backend/src/inbox/inbox-events.service.ts:33-72` → mesmo gateway):
- `message:new`, `conversation:update`, **`message:status`** (SENT/FAILED com errorCode — só existe neste caminho).
- Quando o dedupe acerta (`created === null`), **nenhum** evento é re-emitido (correto).

**Quando `externalId` fica NULL (worker):**
- K1 (`send-message-handler.ts:157`): `const externalId = jobExternalId || extractExternalId(res)`. NULL ⇔ o job não carrega `externalId` (campanha `campaign-processor.ts:104-127` e mass-send `mass-send-processor.ts:32-52` **não** setam) **e** a resposta HTTP veio com `messageId: null` (= backend não obteve wamid) ou shape de erro do fallback do engine.
- K2 (`flow-message-sender.helpers.ts:79`): `extractExternalId(result)` (`flow-engine-external-id.ts:29`) — NULL ⇔ resposta sem `messages[0].id|message.id|id|messageId|sid`; caminho de erro grava NULL sempre (`:215`).
- Em `createOutboundMessageDeduped` (`outbound-message-dedup.ts:57`): `externalId` ausente ⇒ **create-always legado** — nenhum dedupe possível.

### 1.3 As janelas residuais (prova)

A constraint existe nos dois schemas: `@@unique([workspaceId, externalId])` (`backend/prisma/schema.prisma:752`, `worker/prisma/schema.prisma` model Message). Postgres permite N NULLs num unique — NULL nunca colide.

**Janela 1 — NULL-externalId (a registrada em F1-B):** quando a Meta não devolve wamid (ou o provider falha no fallback), o backend grava row com `externalId` NULL (§1.1) e o worker, recebendo `messageId: null`, cai no create-always (§1.2) ⇒ **2 rows NULL, dedupe estruturalmente impossível**.

**Janela 2 — mismatch de chave (descoberta nesta análise, ativa mesmo com wamid presente):**
- `outbound-dispatcher.ts:37` seta `externalId: input.externalId || input.jobId` em **todo** job de autopilot/followup/scanner (cognition usa `idempotencyKey` — `cognition-reply.ts:30`).
- K1 prefere a chave do job: `jobExternalId || extractExternalId(res)` (`send-message-handler.ts:157`).
- O backend prefere o wamid: `r.messageId != null ? r.messageId : opts?.externalId` (`whatsapp-message-dispatcher.service.ts:276`) — e `opts.externalId` chega sempre undefined porque K1 não encaminha o externalId ao engine (`send-message-handler.ts:142-145` passa só `{quotedMessageId, chatId}`) e o engine não o repassa ao HTTP (`whatsapp-engine.ts:151-155`).
- Resultado: backend grava row `externalId=wamid`, worker procura/grava por `externalId=idempotencyKey` ⇒ `findFirst` não acha ⇒ **2 rows por envio de autopilot, com o dedupe F1-B já em produção**. Precedências opostas garantem o mismatch.

---

## 2. Opções

### Opção A — Backend dono único (worker para de persistir o caminho WhatsApp-HTTP)

| Aspecto | Detalhe |
|---|---|
| **Arquivos a mudar** | `worker/send-message-handler.ts` (não chamar `persistSuccess` quando a resposta indica persistência backend), `worker/send-message.persist-success.ts`, `worker/flow-message-sender.helpers.ts` (bloco `:85-195`), `worker/outbound-message-dedup.ts` (evolui de dedupe-por-chave para skip-por-sinal, ou é removido), specs `worker/test/send-message.persist-success.spec.ts` + `worker/test/flow-message-sender.dedupe.spec.ts`; **aditivo backend**: `sendDirectCore` retornar `persisted: true` e `channel-transport-whatsapp.provider.ts:78-83` propagar o campo (hoje `mapDispatcherResult` descarta `direct`), para o worker ter sinal determinístico em texto E mídia |
| **Riscos** | (1) **Mídia com flag OFF**: `send-media` roteia por `transports.send` legado (`internal-whatsapp-runtime.controller.ts:188`) que NÃO persiste — remoção incondicional no worker apagaria mídia do inbox; por isso o skip tem que ser gated pelo sinal `persisted` da resposta, não incondicional. (2) **Email** (K2 com provider email worker-side) e **rows FAILED** (`persistFailure`, K2 error-path) continuam worker-owned — não são duplicação (backend não os grava) e ficam fora do corte. (3) Perda do evento `message:status` SENT (worker só o emite quando cria row) — mitigar emitindo `message:status` no backend pós-persist ou validando que o front se satisfaz com `conversation:update.lastMessageStatus` |
| **Impacto realtime** | Nenhum no caso feliz: quando o dedupe já acerta hoje, os eventos vêm exclusivamente do backend (`message:new` + `conversation:update` + webhook); a mudança apenas torna esse o comportamento universal. Único delta: `message:status` SENT (ver risco 3) |
| **Esforço** | **M** — 3-4 arquivos worker + 2 specs + 1 campo aditivo backend; elimina as DUAS janelas de uma vez (skip não depende de chave) |

### Opção B — Worker dono único (dispatcher para de salvar)

| Aspecto | Detalhe |
|---|---|
| **Arquivos a mudar** | `whatsapp-message-dispatcher.service.ts:278` (remover persist), e então TODO envio direto backend-origem (payment webhooks, billing-checkout, inline-autopilot, agent actions, inbox reply, e o próprio fallback "worker indisponível" `:89-95`) precisa virar job de fila — reescrita do roteamento direto/fila do W2, do `forceDirect`, e re-implementação no worker da atomicidade I15 (`saveMessageInTx`) que hoje não existe lá (contact/conversation/message fora de transação) |
| **Riscos** | **P0 estrutural: o worker nunca vê envios diretos originados no backend** — sem fila obrigatória essas mensagens desapareceriam do inbox; dependência dura do worker para consistência do inbox (worker down = inbox cego); migrar `message.received` webhook + `emitMessageReplied`; latência de fila em respostas síncronas (controllers de webhook de pagamento) |
| **Impacto realtime** | Todos os eventos passariam pelo hop Redis `ws:inbox` (latência extra); `message:new` atrasaria até o job rodar — UI de reply humano deixaria de refletir imediatamente |
| **Esforço** | **G** — re-arquitetura do despacho backend; contra a direção canônica já registrada (§1.3 do registro: "worker reduzido a transporte de fila sem persistência própria") |

### Opção C — Status quo + backfill de externalId

| Aspecto | Detalhe |
|---|---|
| **Arquivos a mudar** | `worker/send-message-handler.ts:157` (inverter precedência: `extractExternalId(res) || jobExternalId` — fecha a Janela 2); opcional: encaminhar externalId do job pelo engine→HTTP para o backend gravar a mesma chave; script SQL de backfill: re-chavear rows worker gravadas com idempotencyKey/jobId e deduplicar pares históricos (correlação por `conversationId+content+createdAt±Ns`, heurística); pré-verificação do registro: `SELECT externalId, COUNT(*) FROM "Message" WHERE direction='OUTBOUND' GROUP BY 1 HAVING COUNT(*)>1` |
| **Riscos** | **A Janela 1 (NULL) é estrutural e permanece** — sem wamid não existe chave e o create-always duplica; dois writers + duas fontes de evento para sempre (todo refactor futuro re-decide quem grava); backfill heurístico pode mesclar mensagens legítimas idênticas; analytics continua precisando filtrar |
| **Impacto realtime** | Igual ao atual: 2× `message:new` com ids diferentes sempre que o dedupe falha |
| **Esforço** | **P** (precedence swap) + **M** (backfill) — mas não elimina a classe do bug, só estreita |

---

## 3. Recomendação

**Opção A — backend dono único**, executada em fase única no worker com skip gated pelo sinal `persisted` da resposta (cobre texto já; mídia ganha cobertura quando F1-A ligar `KLOEL_COMPLIANT_WHATSAPP_SEND`); email e rows FAILED permanecem worker-owned por não serem duplicação.

**Justificativa (uma frase):** o backend é o único lado que (a) vê 100% dos envios — o worker nunca enxerga os envios diretos backend-origem, o que torna a Opção B estruturalmente impossível sem re-arquitetar — e (b) já persiste com transação atômica I15 + eventos nativos, enquanto a Opção C mantém viva a janela NULL que é justamente a classe do bug.

### Sequência sugerida (quando aprovado)

1. Backend aditivo: `sendDirectCore` retorna `persisted: true`; `mapDispatcherResult` propaga (2 linhas, zero breaking — campo novo).
2. Worker: K1/K2 pulam persistência+eventos quando a resposta do provider tem `persisted === true`; `createOutboundMessageDeduped` fica como guarda residual para respostas sem o sinal (providers legados).
3. Corrigir precedência `send-message-handler.ts:157` (wamid > jobExternalId) como cinto-e-suspensório enquanto o sinal não cobre 100%.
4. Backfill histórico (SQL do registro F1-B item 2) e remoção do dedupe quando a telemetria `send_persist_skipped_duplicate` zerar.

---

## Anexo — evidência de validação (2026-06-10, sem mudanças de produção)

```
worker  vitest  test/send-message.persist-success.spec.ts + test/flow-message-sender.dedupe.spec.ts
        Test Files  2 passed (2) · Tests  10 passed (10)
worker  npm run typecheck → tsc -p tsconfig.json --noEmit (limpo)

backend jest    whatsapp-message-dispatcher.service.spec.ts + internal-whatsapp-runtime.controller.spec.ts
        Test Suites: 2 passed · Tests: 26 passed
backend npm run typecheck → tsc -p tsconfig.build.json --noEmit (limpo)
```
