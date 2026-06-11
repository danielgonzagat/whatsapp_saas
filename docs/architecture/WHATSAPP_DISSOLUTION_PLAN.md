# Plano de Dissolução do WhatsApp em Marketing (Omnichannel)

> **Data:** 2026-06-10 · **Escopo:** `backend/` (NestJS) · **Derivado 100% do código-fonte** (não de docs)
> **Comandos de gate:** `cd backend && npm run typecheck` · testes: `cd backend && npx jest <path> --silent`

---

## 0. Descoberta crítica — a premissa da missão está obsoleta

**`backend/src/whatsapp/` NÃO EXISTE MAIS.** A dissolução física já foi executada via ADR-0012
("OmniCore") numa série de commits `refactor(omnicore)` concluída em **2026-06-02**:

| Commit | O que fez |
|---|---|
| `ef5c49a9c` / `b73333c45` | moveu suíte `account-agent` para `marketing/channels/whatsapp` |
| `0bda2e1e2` / `67868c2ac` | moveu `whatsapp-api.provider` + transports para `providers/` |
| `e54faa320` | moveu controllers para `marketing/channels/whatsapp/controllers/` |
| `96241bf9d` | completou migração de `whatsapp/providers/` (provider-registry) |
| `aef6b8439` / `fe00d1a4c` | dropou 36 + 16 stubs órfãos (re-exports temporários) |
| `6478b0cee` | moveu `WhatsappModule` para `marketing/channels/whatsapp` (W3 final) |
| `c023adfcd` | moveu helpers `cia-*` de `whatsapp/` para `kloel/mind/cia` (ADR-0013) |
| `eb066f7b2` / `169e6e979` | colapso final da pasta `whatsapp/` (último órfão deletado) |

Verificação: `ls backend/src/whatsapp` → diretório inexistente; `git log --oneline -- backend/src/whatsapp` confirma a sequência acima.

**Sobre o "~397 arquivos":** a contagem real hoje é **135 arquivos** em
`backend/src/marketing/channels/whatsapp/` (79 não-spec) e **261** em `backend/src/marketing/`
no total. A inflação de contagem provavelmente veio de `backend/src/kloel/recovery/jest_dx/`
(**1.572 arquivos** de cache do jest-transform, git-ignored, vários com `whatsapp*` no nome —
poluição local, não código).

**Consequência:** este plano cobre a **dissolução restante** — o que ainda está no lugar errado,
o que é morto, e as famílias duplicadas que a mudança física de pasta NÃO resolveu.

---

## 1. Inventário — `backend/src/marketing/channels/whatsapp/` (135 arquivos, 79 não-spec)

### 1.1 Módulo

| Arquivo | Responsabilidade |
|---|---|
| `whatsapp.module.ts` | `WhatsappModule` — DI de 17 providers + 5 controllers; exporta ports (`WHATSAPP_MESSAGING`, `INBOUND_PROCESSOR`, `CIA_RUNTIME`, `CATCHUP_HISTORY`); `forwardRef` para `KloelModule`/`CiaModule`/`BillingModule`/`CrmModule`/`OmnichannelModule` |
| `whatsapp.tokens.ts` | 4 symbols de injeção (ports) consumidos por kloel/meta/webhooks |
| `whatsapp.interfaces.ts` | Contratos `WhatsappMessagingPort` etc. |

### 1.2 Services (núcleo do canal)

| Arquivo | Responsabilidade (1 linha) |
|---|---|
| `whatsapp.service.ts` (523 linhas) | Facade pública do canal: send/sendTemplate/sendDirect, chats, status — delega para dispatcher + registry |
| `whatsapp-session.service.ts` | Ciclo de vida da sessão Meta Cloud (start/status/disconnect) via `WhatsAppProviderRegistry` + `WhatsAppApiProvider` |
| `whatsapp-message-dispatcher.service.ts` | Envio outbound "compliant": valida plano (`PlanLimitsService`), roteia para provider, contém `sendTemplate` |
| `whatsapp-send-rate-guard.service.ts` | Wrapper de module-init que monkey-patcha `WhatsappService.send*` com rate-limit por plano |
| `whatsapp-media.service.ts` | **Casca vazia** — só `normalizeNumber`/`normalizeChatId` (wrappers de util); nunca injetado por ninguém |
| `whatsapp-reconciler.service.ts` | Reconciliação de estado chat/contato local vs remoto (chamado por `whatsapp.service.ts`) |
| `whatsapp.service.chats.ts` / `.chats.messages.ts` / `.chats.backlog.ts` (+`.helpers`/`.types`) | Listagem de chats, mensagens paginadas e backlog operacional (pendências) sobre o provider |
| `whatsapp.service.catalog.ts` / `whatsapp-catalog-contact-collector.ts` | Catálogo de contatos/score a partir do grafo de conversas |
| `whatsapp.service.ranking.ts` | Ranking de chats/contatos para priorização |
| `whatsapp.service.helpers.ts` / `.normalizers.ts` / `whatsapp-service.helpers.ts` / `whatsapp-service.normalizers.ts` / `whatsapp-service.types.ts` | Normalização de payloads do provider (contacts/chats/messages), flags autonomia, tipos WAHA legados |
| `worker-runtime.service.ts` | Health-check de disponibilidade do worker externo (HTTP probe + cache) — nada de protocolo WhatsApp |

### 1.3 Catchup (backfill de histórico)

| Arquivo | Responsabilidade |
|---|---|
| `whatsapp-catchup.service.ts` | API pública `triggerCatchup(ws, reason)` — delega ao orchestrator |
| `whatsapp-catchup-orchestrator.service.ts` (+`-orchestrator.helpers.ts`) | Orquestra varredura de chats remotos → importa mensagens perdidas → dispara inbound processor |
| `whatsapp-catchup-history.service.ts` (+`-history-state.helpers.ts`, `-history.shared.ts`) | Importação de histórico profundo + reconciliação de estado de chat remoto |
| `whatsapp-catchup-chat-selector.ts` / `-message-loader.ts` / `-lock.helpers.ts` / `-config.ts` / `whatsapp-catchup.helpers.ts` / `.normalizers.ts` | Seleção de chats, paginação de mensagens, lock distribuído por workspace, knobs de config, normalização LID/PN |

### 1.4 Inbound

| Arquivo | Responsabilidade |
|---|---|
| `inbound-processor.service.ts` (+`.helpers.ts`, `.service.helpers.ts`) | Ingestão canônica de mensagem inbound: dedup, persistência, contato, autopilot, percept |
| `inbound-processor.inline-autopilot.ts` | Resposta automática inline (autopilot) no caminho inbound |
| `inbound-mind-percept.ts` | Dispara percept para o MIND (`ChannelInboundHookService` de `omnichannel/`) por mensagem |
| `inbound-catchup-percept-guard.ts` | Anti-tempestade: limita percepts por workspace/janela no caminho de catchup |

### 1.5 Suíte "Account Agent" + eventos de agente (14 + 4 arquivos)

| Arquivo(s) | Responsabilidade |
|---|---|
| `account-agent.service.ts` + `account-agent.{capability-gaps,gap-checkers,gap-detector,input-session,parsers,product-materializer,registry,types,util,util.helpers,work-item-upsert,work-items,service.helpers}.ts` | Agente conversacional de setup de conta: detecção de gaps de capacidade, materialização de produto, work-items, sessões de input — **lógica de agente IA, não protocolo WhatsApp** |
| `agent-events.service.ts` | Stream de eventos do agente (thought/status/sale/typing/...) para SSE — consumido por todo `kloel/mind/cia` |
| `agent-conversation-state.util.ts` | Estado operacional da conversa do agente (pausa/handoff) |
| `cia-remote-backlog.helpers.ts` | Helpers do backlog remoto da CIA — único consumidor: `kloel/mind/cia/cia-remote-backlog.service.ts` |

### 1.6 Providers (protocolo Meta Cloud)

| Arquivo | Responsabilidade |
|---|---|
| `providers/whatsapp-api.provider.ts` (+`.helpers.ts`, `.types.ts`) | Provider Meta Cloud: sessão env-backed, diagnostics, mapeia rows DB → shapes WAHA-compat |
| `providers/provider-registry.ts` (+`-session.ts`, `-messaging.ts`, `-contacts.ts`, `-op.ts`, `.types.ts`) | `WhatsAppProviderRegistry` — fachada única de operações de provider (sessão, envio, contatos) |
| `providers/provider-send-message.helpers.ts` | **Folha canônica do envio** — roteamento Meta Cloud, mídia, captura de erro, ops-alert |
| `providers/provider-env.ts` | Normaliza provider: **só `meta-cloud` é aceito** (WAHA/browser legados rejeitados) |
| `provider-settings.types.ts` | Tipos de `workspace.providerSettings` (lifecycle, sessão) |

### 1.7 Controllers

| Arquivo | Rota | Responsabilidade |
|---|---|---|
| `controllers/whatsapp-api.controller.ts` (+`.helpers.ts`) | `@Controller('whatsapp-api')` | API operacional do canal (sessão, agent stream, live) — consumida pelos proxies `frontend/src/app/api/whatsapp-api/*` |
| `controllers/whatsapp-catalog.controller.ts` | `@Controller('whatsapp-api')` | Contatos, chats, catálogo, backlog |
| `controllers/whatsapp-meta-compat.controller.ts` | `@Controller('whatsapp-api')` | **Tombstone**: endpoints não-Meta aposentados que respondem `410 Gone` |
| `controllers/whatsapp.controller.ts` | `@Controller('whatsapp/:workspaceId')` | **Legado**: send/incoming/opt-in-bulk/opt-out — nenhum chamador no frontend (grep: só `/auth/whatsapp/send-code`, que é do AuthModule) |
| `controllers/internal-whatsapp-runtime.controller.ts` | interna | Runtime interno (worker → backend) com auth por header |

### 1.8 Utils + adapter

| Arquivo | Responsabilidade |
|---|---|
| `whatsapp-dispatch.adapter.ts` | **O adapter canônico** — implementa `ChannelDispatchPort` delegando a `WhatsappService.sendMessage` (ADR-0012 W1) |
| `whatsapp-digits.util.ts` | Normalização de dígitos BR (9º dígito etc.) — consumido só por `whatsapp-normalization.util.ts` |
| `whatsapp-normalization.util.ts` | Normalização de número/chatId — consumido por kloel (4 arquivos) e pelo próprio canal |

---

## 2. Inventário — `backend/src/marketing/` raiz (261 arquivos; 156 não-spec)

### 2.1 Núcleo omnichannel (a "capacidade genérica")

| Arquivo | Responsabilidade |
|---|---|
| `marketing.module.ts` | `MarketingModule` — 11 controllers, serviços de email/tiktok/google-ads/messenger/connect |
| `channel-message-dispatch.service.ts` (+`.helpers.ts`) | **Entrypoint canônico de envio cross-channel** — fachada sobre `ChannelDispatchRegistry`; resolve credenciais por canal |
| `channels/marketing-channels.module.ts` | Registra os 8 adapters `ChannelDispatchPort` + `ChannelDispatchRegistry` |
| `channels/index.ts` | Barrel canônico dos adapters |
| `marketing.controller.ts` (+`.helpers.ts`) | `@Controller('marketing')` — endpoints agregados de marketing (métricas, envio email) |
| `marketing-connect.controller.ts` (+`.helpers.ts`) | `@Controller('marketing')` — conexão de canais (setup, status) |
| `marketing-connect/channel-setup.service.ts` | Estado de setup por canal genérico (lê `providerSettings`) |
| `marketing-connect/meta-connect.service.ts` | Conexão Meta (token, snapshot de sessão WhatsApp) — injeta `MetaWhatsAppService` + `WhatsAppProviderRegistry` |
| `marketing-connect/email-connect.service.ts` | Conexão de mailbox (Gmail/Microsoft/IMAP) |
| `marketing-connect/whatsapp-summary.service.ts` | Resumo do lifecycle WhatsApp para a tela connect (lê `providerSettings.whatsappLifecycle`) |
| `tokens.ts` | Tokens DI do marketing (`GMAIL_OAUTH_TOKEN` etc.) |

### 2.2 Canais não-WhatsApp (para referência de simetria)

| Família | Arquivos | Responsabilidade |
|---|---|---|
| Email marketing | `email-marketing.{service,controller,helpers}.ts`, `email-marketing-webhook.controller.ts`, `email-inbound.controller.ts`, `dto/create-email-campaign.dto.ts` | Campanhas, webhook de provedores, inbound parsing |
| Mailbox | `mailbox-gmail-oauth/*` (12), `mailbox-{gmail,microsoft}-oauth*.ts`, `mailbox-imap-smtp*.ts`, `mailbox-token-crypto.ts`, `mailbox-oauth-callback.helpers.ts` | OAuth, sync, MIME, envio por mailbox conectada |
| TikTok | `tiktok-marketing.{service,controller,helpers}.ts`, `tiktok-marketing-mode.service.ts`, `tiktok-inbox.{service,controller}.ts`, `tiktok-ads.service.ts`, `tiktok-inbox-canonical-dispatch.flag.ts` | Conteúdo, inbox DM, ads |
| Instagram | `instagram/instagram-marketing.{service,controller}.ts` + dtos + flags | Posts, insights, DMs (camada marketing) |
| Messenger/Facebook | `facebook-messenger.{service,controller}.ts` | Webhook parsing + envio (camada marketing) |
| Google Ads | `google-ads-marketing.{service,controller}.ts` | Campanhas Google Ads |
| Adapters | `channels/{email,facebook,instagram,messenger,tiktok,internal-partnership}/*` | Adapters `ChannelDispatchPort` + services finos sobre `MetaSdkService` |

### 2.3 Satélites WhatsApp fora de `marketing/` (escopo da dissolução restante)

| Path | Responsabilidade | Situação |
|---|---|---|
| `backend/src/meta/meta-whatsapp.service.ts` (+`.helpers.ts`, `meta-whatsapp.message.helpers.ts`) | Transporte Meta Cloud API (folha HTTP real do envio) | OK — protocolo Meta compartilhado com IG/Messenger; fica em `meta/` |
| `backend/src/meta/webhooks/meta-webhook.controller.ts` (+ raiz `meta/meta-webhook.controller.ts`) | Ingresso webhook Meta (whatsapp/instagram/messenger) → injeta `INBOUND_PROCESSOR` | OK — ingresso vivo |
| `backend/src/webhooks/whatsapp-api-webhook.controller.ts` | **Webhook WAHA legado — DESABILITADO** ("All events are logged to webhookEvent audit trail then ignored") | DELETE |
| `backend/src/kloel/kloel-whatsapp-tools.service.ts` (+5 specs/helpers) | Tools de IA para WhatsApp — injeta o **port** `WHATSAPP_MESSAGING` ✔ | fica em kloel |
| `backend/src/kloel/kloel-tool-executor-whatsapp.service.ts` | Executor de tools — injeta `WhatsappService` **concreto** ✘ | migrar p/ port |
| `backend/src/kloel/channel-transport-whatsapp.provider.ts` | Transport WhatsApp do registry paralelo de kloel | convergir/deletar (fatia 3) |
| `backend/src/kloel/whatsapp-brain.controller.ts` | `@Controller('kloel/whatsapp')` — mind coordinator HTTP | fica em kloel |
| `backend/src/kloel/whatsapp-emitter/*` (3) | Emissor de eventos spine `commerce.whatsapp.*` | fica em kloel |
| `backend/src/kloel/mind/coordination/whatsapp-mind-coordinator.service.ts` | Coordenador cognitivo por canal | fica em kloel |
| `backend/src/campaigns/campaigns.service.ts` | Injeta `MetaWhatsAppService` **e** `WhatsappMessageDispatcherService` direto (linhas 21–22) | migrar p/ `ChannelMessageDispatchService` |
| `backend/src/billing/billing-webhook*.ts` (4) | Notificações pós-pagamento via `WhatsappService` concreto | migrar p/ port |
| `backend/src/mass-send/*` | Enfileira em BullMQ (`QUEUE_NAMES`) — worker consome | OK (desacoplado via fila) |
| `worker/send-message-handler.ts` | Consumidor da fila de envio (runtime separado) | OK |

---

## 3. Classificação arquivo-a-arquivo (services/controllers de `marketing/channels/whatsapp/`)

Legenda: **CHANNEL_ADAPTER** = específico do protocolo WhatsApp/Meta, casa correta é `marketing/channels/whatsapp/` (já está lá — manter). **DISSOLVE** = capacidade genérica que deve sair do diretório do canal. **DELETE** = morto/duplicado com prova. **AMBIGUOUS** = decisão de produto necessária.

| Arquivo | Classe | Justificativa / Prova |
|---|---|---|
| `whatsapp.module.ts` | CHANNEL_ADAPTER | Módulo do canal; **mas** deve perder os providers de agente (ver fatia 2) e o re-export `CIA_RUNTIME` (acoplamento invertido com `kloel/mind/cia`) |
| `whatsapp.service.ts` + partições `.chats.*`, `.catalog`, `.ranking`, helpers/normalizers | CHANNEL_ADAPTER | Facade + shapes do provider; é o alvo do `WhatsAppDispatchAdapter` |
| `whatsapp-session.service.ts` | CHANNEL_ADAPTER | Sessão Meta Cloud — protocolo puro |
| `whatsapp-message-dispatcher.service.ts` | CHANNEL_ADAPTER | Folha de envio do canal; consumidores externos (`campaigns`) devem migrar para a fachada canônica, não o contrário |
| `whatsapp-send-rate-guard.service.ts` | DISSOLVE | Rate-limit por plano é política de marketing/billing cross-channel (`PlanLimitsService`); padrão monkey-patch deve virar guard no `ChannelMessageDispatchService` para valer p/ TODOS os canais |
| `whatsapp-media.service.ts` | **DELETE** | Prova de não-uso: únicas referências no repo são (a) registro em `whatsapp.module.ts:31,69`, (b) menção em comentário `whatsapp.service.ts:9` e `whatsapp-service.helpers.ts:9`, (c) o próprio spec. Nenhuma injeção em constructor algum (`grep -rn "mediaService" backend/src` → só `media/media.controller.ts`, outro domínio) |
| `whatsapp-reconciler.service.ts` | CHANNEL_ADAPTER | Reconcílio de estado específico do shape Meta/WAHA |
| `whatsapp-catchup*.{ts}` (12 arquivos) | CHANNEL_ADAPTER | Backfill depende de paginação/LID/PN do protocolo; conceito "catchup" pode ganhar port genérico depois (fora de escopo) |
| `inbound-processor.service.ts` + helpers + `inline-autopilot` | CHANNEL_ADAPTER | Parsing/persistência do shape inbound Meta; exporta port `INBOUND_PROCESSOR` consumido por `meta/webhooks/meta-webhook.controller.ts` ✔ |
| `inbound-mind-percept.ts` | DISSOLVE | Padrão "percept por inbound" é genérico (usa `omnichannel/channel-inbound-hook.service.ts`); deve virar utilitário em `omnichannel/` parametrizado por canal |
| `inbound-catchup-percept-guard.ts` | DISSOLVE | Anti-storm de percepts é política do MIND, não do WhatsApp → `omnichannel/` ou `kloel/mind` |
| `account-agent.*` (14 arquivos) | DISSOLVE → `kloel/mind/cia/` | Agente IA de setup de conta. Único consumidor externo: `kloel/mind/cia/cia.service.ts`. Zero protocolo WhatsApp nos parsers/registry. Precedente: commit `c023adfcd` já moveu `cia-*` para `kloel/mind/cia` |
| `agent-events.service.ts` | DISSOLVE → `kloel/mind/cia/` | 8 consumidores em `kloel/mind/cia/*` + 1 no webhook legado (que será deletado). Evento de agente ≠ canal |
| `agent-conversation-state.util.ts` | AMBIGUOUS | Usado por `whatsapp.service.ts` (estado operacional do chat) e conceitualmente pelo agente; decidir se o estado pausa/handoff é do canal ou do agente antes de mover |
| `cia-remote-backlog.helpers.ts` | DISSOLVE → `kloel/mind/cia/` | Único consumidor: `kloel/mind/cia/cia-remote-backlog.service.ts`. Sobra do ADR-0013 (`c023adfcd`) |
| `worker-runtime.service.ts` | DISSOLVE | Probe de disponibilidade de worker é infra genérica; único consumidor: `kloel/mind/cia/cia-backlog-run.service.ts` → mover p/ `kloel/mind/cia/` ou `common/` |
| `providers/*` (11 arquivos) | CHANNEL_ADAPTER | Protocolo Meta Cloud puro; corrigir 1 anotação morta (ver fatia 0) |
| `provider-settings.types.ts` | CHANNEL_ADAPTER | Tipos de `providerSettings` do canal |
| `whatsapp-digits.util.ts` / `whatsapp-normalization.util.ts` | AMBIGUOUS | Normalização de telefone BR é genérica (`common/phone/` já existe e menciona WAHA); consolidar com `common/phone/phone-normalization.util.ts` ou manter como util do canal — exigir decisão para não criar 3ª cópia |
| `whatsapp-dispatch.adapter.ts` | CHANNEL_ADAPTER | É exatamente o que o alvo arquitetural pede |
| `whatsapp.tokens.ts` / `whatsapp.interfaces.ts` | CHANNEL_ADAPTER | Ports do canal; **exceto** `CIA_RUNTIME` (token de kloel re-exportado — remover na fatia 2) |
| `controllers/whatsapp-api.controller.ts` + `.helpers` | CHANNEL_ADAPTER | Vivo — frontend proxy `frontend/src/app/api/whatsapp-api/*` |
| `controllers/whatsapp-catalog.controller.ts` | CHANNEL_ADAPTER | Vivo — rotas catalog/backlog usadas pelo frontend |
| `controllers/internal-whatsapp-runtime.controller.ts` | CHANNEL_ADAPTER | Canal interno worker→backend |
| `controllers/whatsapp-meta-compat.controller.ts` | DELETE (fase 2, com sunset) | Tombstone intencional `410 Gone` ("WhatsApp agora conecta somente pela API oficial da Meta"); deletar após janela de telemetria sem hits |
| `controllers/whatsapp.controller.ts` | AMBIGUOUS → provável DELETE | Rotas legadas `whatsapp/:workspaceId/{send,incoming,opt-in/bulk,...}`. Prova parcial de não-uso: zero chamadas no frontend (`grep -rn "opt-in/bulk" frontend/src` → vazio); único import é o registro em `whatsapp.module.ts`. Risco: consumidores de API pública externos — exigir telemetria de rota antes de deletar |
| `webhooks/whatsapp-api-webhook.controller.ts` (fora do dir, mas do canal) | **DELETE** | Comentário no próprio arquivo: "Legacy WAHA webhook — disabled after Meta-only migration. All events are logged ... then ignored". `providers/provider-env.ts` só aceita `meta-cloud`. Registrado em `webhooks/webhooks.module.ts:23` — desregistrar junto |

**Resumo:** 79 não-spec → **52 CHANNEL_ADAPTER · 21 DISSOLVE (account-agent 14 + agent-events + cia-remote-backlog.helpers + worker-runtime + inbound-mind-percept + inbound-catchup-percept-guard + whatsapp-send-rate-guard) · 2 DELETE imediato (+1 fora do dir) · 4 AMBIGUOUS.**

---

## 4. Famílias duplicadas (paths exatos)

### 4.1 Envio de mensagem — 3 camadas de roteamento concorrentes

| Camada | Path | Estado |
|---|---|---|
| **Canônica** (ADR-0012) | `backend/src/marketing/channel-message-dispatch.service.ts` → `backend/src/common/channel-dispatch/channel-dispatch.registry.ts` → `backend/src/marketing/channels/whatsapp/whatsapp-dispatch.adapter.ts` | alvo |
| Paralela kloel | `backend/src/kloel/channel-transport.registry.ts` + `backend/src/kloel/channel-transport-whatsapp.provider.ts` (+15 consumidores em kloel/inbox/webhooks) | em convergência via `backend/src/kloel/channel-transport-canonical-delegate.flag.ts` |
| Bypass direto | `backend/src/campaigns/campaigns.service.ts:21-22` (injeta `MetaWhatsAppService` + `WhatsappMessageDispatcherService`); `backend/src/billing/billing-webhook.service.ts` e irmãos (injetam `WhatsappService`) | eliminar |
| Folha física | `backend/src/marketing/channels/whatsapp/providers/provider-send-message.helpers.ts` → `backend/src/meta/meta-whatsapp.service.ts` | única, OK |

### 4.2 Sessão/conexão de canal — 3 fontes de verdade

| Path | Papel |
|---|---|
| `backend/src/marketing/channels/whatsapp/whatsapp-session.service.ts` + `providers/provider-registry-session.ts` | sessão runtime (start/status/snapshot) |
| `backend/src/meta/meta-connection-state.service.ts` | estado da conexão OAuth Meta |
| `backend/src/marketing/marketing-connect/{channel-setup,meta-connect,whatsapp-summary}.service.ts` | leitura agregada de `providerSettings.{whatsappLifecycle,whatsappApiSession}` para UI |

Todos leem/escrevem `workspace.providerSettings` com chaves sobrepostas — risco de divergência de snapshot. Alvo: `marketing-connect/` lê só via port exposto pelo canal.

### 4.3 Webhook parsing — sem ingresso comum

| Path | Canal | Estado |
|---|---|---|
| `backend/src/meta/meta-webhook.controller.ts` + `backend/src/meta/webhooks/meta-webhook.controller.ts` (+`.helpers.ts`) | WhatsApp/IG/Messenger | vivo (note: **dois** controllers meta-webhook, raiz + subpasta — verificar rota duplicada na fatia 0) |
| `backend/src/webhooks/whatsapp-api-webhook.controller.ts` | WAHA legado | **morto** (log-and-ignore) |
| `backend/src/marketing/email-marketing-webhook.controller.ts` | Email | vivo |
| `backend/src/webhooks/tiktok-webhook.controller.ts` | TikTok | vivo |

### 4.4 Templates

| Path | Papel |
|---|---|
| `backend/src/marketing/channels/whatsapp/whatsapp.service.ts` (`sendTemplate`, anotação morta na linha 431) + `whatsapp-message-dispatcher.service.ts` + `whatsapp-send-rate-guard.service.ts` | HSM/template WhatsApp |
| `backend/src/marketing/email-marketing.service.ts` + `dto/create-email-campaign.dto.ts` | template de campanha email |

Sem abstração comum de template — aceitável hoje; `ChannelSendInput` do port (`backend/src/common/channel-dispatch/channel-dispatch.port.ts`) é o lugar para um futuro `templateRef`.

### 4.5 Normalização de telefone — 3 implementações

`backend/src/common/phone.ts` + `backend/src/common/phone/phone-normalization.util.ts` vs `backend/src/marketing/channels/whatsapp/whatsapp-digits.util.ts` + `whatsapp-normalization.util.ts` (este último importado por 4 arquivos de `kloel/`).

---

## 5. Plano de migração em fatias seguras (ordem de execução)

> Regra geral: **cada fatia = 1 PR**; shim de re-export entra ANTES da movimentação física; deleção só na última fatia da família, com prova de grep. Gate mínimo de toda fatia: `cd backend && npm run typecheck`.

### Fatia 0 — Higiene (zero risco de runtime)
1. Corrigir anotações mortas que apontam para o path extinto:
   - `backend/src/marketing/channels/whatsapp/whatsapp.service.ts:431` (`@canonical-path backend/src/whatsapp/...`)
   - `backend/src/marketing/channels/whatsapp/providers/provider-registry-messaging.ts:26`
2. Investigar duplicidade `meta/meta-webhook.controller.ts` vs `meta/webhooks/meta-webhook.controller.ts` (qual está registrado em `meta/meta.module.ts`; o outro recebe shim ou vai para a fatia 5).
3. (Local) `rm -rf backend/src/kloel/recovery/jest_dx` — 1.572 arquivos de cache, já git-ignored.
- **Gate:** `npm run typecheck` + `npx jest src/marketing/channels/whatsapp --silent`.

### Fatia 1 — Selar a fronteira do canal (re-export/barrel primeiro)
1. Criar `backend/src/marketing/channels/whatsapp/index.ts` exportando SOMENTE: `WhatsappModule`, `WhatsAppDispatchAdapter`, `whatsapp.tokens` (ports), `whatsapp.interfaces`.
2. Atualizar importadores externos profundos para o barrel (lista exata de módulos que importam o canal hoje: `app.module.ts`, `health/health.module.ts`, `meta/meta.module.ts`, `kloel/kloel.module.ts`, `kloel/mind/cia/cia.module.ts`, `marketing/marketing.module.ts`, `campaigns/campaigns.module.ts`, `webhooks/webhooks.module.ts`, `mass-send/mass-send.module.ts`).
3. Adicionar regra ESLint `no-restricted-imports` (ou boundary) proibindo `marketing/channels/whatsapp/**` exceto via barrel/ports.
- **Gate:** `npm run typecheck` + `npm run lint:check` + boot specs (`npx jest routes.boot --silent`).

### Fatia 2 — DISSOLVE: tirar o agente de dentro do canal (movimentação)
Ordem interna (dependência: helpers → service → module):
1. `cia-remote-backlog.helpers.ts` → `backend/src/kloel/mind/cia/` (1 consumidor; mesmo padrão do commit `c023adfcd`). Deixar re-export shim no path antigo.
2. `worker-runtime.service.ts` → `backend/src/kloel/mind/cia/` (1 consumidor: `cia-backlog-run.service.ts`); registrar em `cia.module.ts`; remover de `whatsapp.module.ts` providers/exports.
3. `agent-events.service.ts` → `backend/src/kloel/mind/cia/`; atualizar os 8 imports de `kloel/mind/cia/*`; remover export de `whatsapp.module.ts`.
4. Suíte `account-agent.*` (14 arquivos + 6 specs) → `backend/src/kloel/mind/cia/account-agent/`; atualizar `cia.service.ts`; remover provider/export de `whatsapp.module.ts`.
5. Remover de `whatsapp.module.ts` o provider `{ provide: CIA_RUNTIME, useExisting: CiaRuntimeService }` e o import `forwardRef(() => CiaModule)` — consumidores de `CIA_RUNTIME` passam a injetar do `CiaModule` direto. Isso quebra o ciclo `WhatsappModule ⇄ CiaModule`.
6. `inbound-mind-percept.ts` + `inbound-catchup-percept-guard.ts` → `backend/src/omnichannel/` (generalizar assinatura: `triggerChannelMindPercept(channel, ...)`).
7. Dropar os shims da etapa 1–4.
- **Gate por sub-passo:** `npm run typecheck` + `npx jest src/kloel/mind/cia src/marketing/channels/whatsapp --silent`; após 5: boot completo (`npx jest src/app.controller.spec.ts --silent` + subir `npm run start:dev` 1x para validar resolução DI dos `forwardRef` removidos).

### Fatia 3 — DISSOLVE: canonicalizar o envio (matar bypasses)
1. `campaigns/campaigns.service.ts`: substituir `MetaWhatsAppService`/`WhatsappMessageDispatcherService` por `ChannelMessageDispatchService.dispatch(ws, 'whatsapp', ...)` (manter flag `compliant-whatsapp-send.flag.ts` durante transição).
2. `billing/billing-webhook*.ts`: trocar `WhatsappService` concreto pelo port `WHATSAPP_MESSAGING` (mínimo) ou pela fachada canônica (ideal).
3. `kloel/kloel-tool-executor-whatsapp.service.ts`: trocar `WhatsappService` concreto pelo port `WHATSAPP_MESSAGING` (paridade com `kloel-whatsapp-tools.service.ts`, que já usa o port).
4. Concluir rollout de `kloel/channel-transport-canonical-delegate.flag.ts` (delegação do `ChannelTransportRegistry` → `ChannelMessageDispatchService`); quando default-on estável, deletar `kloel/channel-transport-whatsapp.provider.ts`.
5. Generalizar `whatsapp-send-rate-guard.service.ts`: mover o check `PlanLimitsService.ensureMessageRate` para dentro de `ChannelMessageDispatchService`/adapters; aposentar o monkey-patch.
- **Gate:** `npm run typecheck` + `npx jest src/campaigns src/billing src/kloel src/marketing --silent`; smoke de envio em homolog com flag ligada antes do flip definitivo.

### Fatia 4 — Sessão única
1. Expor port `WhatsAppSessionPort` (status/snapshot) no barrel do canal.
2. `marketing-connect/{meta-connect,whatsapp-summary,channel-setup}.service.ts` passam a consumir o port em vez de ler `providerSettings` cru (escrita continua exclusiva do canal).
- **Gate:** `npm run typecheck` + `npx jest src/marketing/marketing-connect --silent` + verificação manual da tela Connect em homolog.

### Fatia 5 — DELETE (por último, com provas re-checadas)
| Alvo | Pré-condição de prova |
|---|---|
| `backend/src/marketing/channels/whatsapp/whatsapp-media.service.ts` (+spec) + remoção de `whatsapp.module.ts:31,69` | re-rodar `grep -rn "WhatsappMediaService" backend/src` → só módulo/spec/comentários |
| `backend/src/webhooks/whatsapp-api-webhook.controller.ts` (+spec) + desregistro em `webhooks/webhooks.module.ts:9,13,23` | já é log-and-ignore; conferir 7 dias de telemetria de rota `POST /webhooks/whatsapp-api` |
| `backend/src/marketing/channels/whatsapp/controllers/whatsapp.controller.ts` | telemetria de rota `whatsapp/:workspaceId/*` zerada (não há chamador no frontend; risco residual: API pública) |
| `backend/src/marketing/channels/whatsapp/controllers/whatsapp-meta-compat.controller.ts` | telemetria de `410` zerada por 30 dias (tombstone cumpriu o papel) |
| Tipos WAHA órfãos em `whatsapp-service.types.ts` / shapes `Waha*` em `providers/whatsapp-api.provider.types.ts` | só após confirmar que os mapeadores row→WAHA-shape não os usam mais (hoje usam — NÃO deletar ainda) |
- **Gate:** `npm run typecheck` + suíte completa `npm test` (jest chunks) + boot specs + diff de rotas registradas (logar `RoutesResolver` antes/depois e comparar — só as rotas deletadas podem sumir).

### Critério de pronto (Definition of Done)
- `grep -rn "backend/src/whatsapp" backend/src --include="*.ts"` → 0 hits.
- `whatsapp.module.ts` sem `forwardRef` para `CiaModule` e sem providers de agente.
- Nenhum import de `MetaWhatsAppService`/`WhatsappMessageDispatcherService`/`WhatsappService` fora de `marketing/channels/whatsapp/**`, `meta/**` e do barrel de ports.
- `marketing/channels/whatsapp/` contém apenas: module, service+partições, session, dispatcher, reconciler, catchup, inbound-processor, providers, controllers vivos, adapter, tokens, interfaces, utils.

---

## 6. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Ciclos `forwardRef` quebrando DI ao mexer em `whatsapp.module.ts` | Cada remoção de `forwardRef` em PR isolado + boot real (`start:dev`) no gate, não só typecheck |
| Consumidor externo desconhecido das rotas legadas | Telemetria de rota (RouteClass já existe) antes de qualquer deleção de controller |
| Outra sessão de agente commitando em paralelo | Fatias pequenas, rebase antes de cada PR, nunca tocar arquivos da fila de outra sessão |
| `whatsapp-send-rate-guard` monkey-patch: mover sem perder cobertura | Manter o wrapper até o guard genérico ter teste de paridade (mesmos 3 métodos protegidos) |
