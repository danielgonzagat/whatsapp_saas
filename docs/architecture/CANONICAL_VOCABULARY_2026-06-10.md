# Dicionário Canônico de Termos — Kloel (2026-06-10)

> **Origem:** derivado 100% de código-fonte em 2026-06-10. Nenhum arquivo existente foi modificado.
> **Método:** contagem por palavra-inteira `rg -w -o <termo> <dir> | wc -l` (matches) + `rg -w -l | wc -l` (files) sobre o escopo
> `backend/src`, `frontend/src`, `worker` e `backend/prisma/schema.prisma`. Critério de canonicidade: qual termo
> domina **schema Prisma** (nome de model + call-sites `prisma.<delegate>`), **eventos** (taxonomia
> `commerce.*` — ver `EVENT_TAXONOMY_2026-06-10.md`) e **rotas** (`@Controller('...')`).
> **Relação com os vivos:** complementa (não substitui) `CANONICAL_VOCABULARY.md`, que é o **input do gate AST**
> `scripts/ops/check-canonical-vocabulary.mjs` (ratchet sobre `vocabulary-baseline.json`). O §8 traz as linhas
> prontas para copiar para aquela tabela; o §9 traz gates grep-áveis novos no padrão `scripts/ops/check-canonical-*.mjs`.
> **Par:** [`CANONICAL_DOMAINS_2026-06-10.md`](CANONICAL_DOMAINS_2026-06-10.md) · [`EVENT_TAXONOMY_2026-06-10.md`](EVENT_TAXONOMY_2026-06-10.md) · [`CONNECT_CHANNEL_CANONICAL.md`](CONNECT_CHANNEL_CANONICAL.md)

---

## 0. Sumário executivo

| Conceito | Canônico | Variantes vivas a depreciar | Variantes já mortas (gate tolerância-zero) |
|---|---|---|---|
| Pessoa destinatária | `Contact` | `KloelLead`/`kloelLead` (155), `Customer` como entidade (62) | `Prospect` (0) |
| Sessão de canal | `ChannelSession` (conceito) / `MetaConnection` (persistência) | `whatsappApiSession` fora do adapter (48 vazamentos), `WhatsappSessionService` (19) | `whatsappSession` (0), `waSession` (0) |
| Fio de mensagens c/ cliente | `Conversation` | `Chat`/`Thread` referindo conversa de cliente (hoje 0 — fixar) | — |
| Disparo em massa | `Campaign` | `Broadcast` como substantivo-entidade fora de campaigns/kloel-tools | `Blast` (0) |
| Unidade multi-tenant | `Workspace` | `Account` como alias de tenancy | `Tenant` como identificador (3 hits, todos legítimos) |
| Item vendável | `Product` + `ProductPlan` | `Plan` solto como entidade (2 interfaces no frontend), `Offer` fora de `kloel/offer/` | — |

---

## 1. Pessoa destinatária — `Lead` | `Contact` | `Customer` | `Client` | `Prospect`

### Contagem (matches palavra-inteira / files)

| Termo | backend/src | frontend/src | worker | schema.prisma |
|---|---|---|---|---|
| `Contact` | **130 / 46** | **56 / 20** | **40 / 9** | **25 linhas** — models `Contact` (:401), `ContactInsight` (:473), `ContactIdentityLink` (:487) |
| `Lead` | 87 / 56 | 37 / 20 | 12 / 5 | 4 linhas (só comentários "Lead → Contact bridge"); models `ScrapedLead` (:781), `KloelLead` (:1836) |
| `Customer` | 52 / 26 | 8 / 4 | 2 / 2 | 1 (comentário "Customer Ideal Profile") |
| `Client` | 25 / 12 | 12 / 11 | 0 | 0 |
| `Prospect` | **0** | **0** | **0** | **0** |

Call-sites Prisma (backend/src + worker): `prisma.contact` **490** vs `kloelLead` 118 + `KloelLead` 37 vs `scrapedLead` 9 + `ScrapedLead` 8.

### Decisão: canônico = **`Contact`**

- Schema: `Contact` é o model rico (25 linhas de referência) e o destino declarado dos bridges — comentários
  "Lead → Contact bridge" em `schema.prisma:772,1854,3335`.
- Migração já em voo: `backend/src/prisma/backfills/person-kloel-lead-to-contact.backfill.core.ts`,
  `backend/src/kloel/lead-contact-backfill.service.ts`, flag `backend/src/kloel/leads-read-contact.flag.ts`.
- Eventos: a família `commerce.lead.*` (created 146, replied 156, qualified 57…) usa `lead` como **estágio de
  funil**, não como entidade — consistente com a nota do `CANONICAL_VOCABULARY.md` vivo.
- `Client` no backend **não é** alias de pessoa: são clientes de socket/HTTP (`inbox.gateway.ts` 6,
  `flows.gateway.ts` 5, `alerts.gateway.ts` 3) — conceito distinto e legítimo.

### Uso permitido

| Termo | Permitido quando |
|---|---|
| `Contact` | Sempre — entidade, DTOs, services, props |
| `lead` | Só como rótulo de estágio de funil em nomes de evento `commerce.lead.*` e no domínio de scraping (`ScrapedLead` = pré-promoção) |
| `customer` | Só como rótulo de estágio pós-venda (`backend/src/kloel/postsale-consumers/*`, `commerce.post_sale.*`) e em DTOs de checkout espelhando payload de gateway de pagamento (`create-order.dto.ts`) |
| `client` | Só significando cliente de socket/HTTP/SDK |
| `Prospect` | **Nunca** (0 usos hoje — manter em zero) |

### Depreciar

| Alias | Onde está | Contagem | Ação |
|---|---|---|---|
| `KloelLead`/`kloelLead` | concentrado em `backend/src/kloel/` (processor, mind-coordinator) + backfills | 155 total; **43 fora de backfill/spec** | Congelar via ratchet (G-VOC-2 §9); remoção segue o backfill `person-kloel-lead-to-contact` |
| `Customer` como nome de entidade nova | `postsale-consumers/*` (5+3+3+3+3), `payment.service.ts` (3) | 62 total | Não criar novos tipos `Customer*`; usos atuais toleráveis como rótulo de estágio |

---

## 2. Sessão de canal — `whatsappSession` | `waSession` | `connection` | `instance` | `channelSession`

### Contagem

| Termo | backend/src | frontend/src | worker | schema.prisma |
|---|---|---|---|---|
| `channelSession` (camel) | **111 / 11** | **49 / 11** | 0 | 0 (é nome de variável, não de model) |
| `connection` | 387 / 163 ⚠️ | 42 / 23 | 65 / 21 ⚠️ | 0; models `MetaConnection` (:3487), `MailboxConnection` (:2157) |
| `instance` | 245 / 192 ⚠️ | 9 / 7 | 14 / 4 | 0 |
| `whatsappSession` / `waSession` / `ChannelSession` (Pascal) | **0** | **0** | **0** | **0** |

⚠️ `connection` e `instance` são contagens brutas poluídas por inglês genérico: no worker **100% dos hits de
`connection` são BullMQ/Redis** (`worker/queue.ts`, `reprocess-dlq.ts`); `instance` é majoritariamente "instance of".
Sinal de domínio real: `metaConnection` 138 + `MetaConnection` 23 no backend, `prisma.metaConnection` **42** call-sites,
`whatsappApiSession` **132**, `WhatsappSessionService` 19, `connectionStatus` 65 / `getConnectionStatus` 34.

### Decisão: conceito canônico = **`ChannelSession`**, persistido hoje como **`MetaConnection`**

- O código já convergiu na **variável** `channelSession` (160 usos) para linhas de `MetaConnection` — ex.
  `backend/src/meta/meta-whatsapp.service.ts:75`, `backend/src/integrations/meta-conversions-api.service.ts:135`,
  `backend/src/kloel/channel-transport.providers.ts:64`.
- Confirma a linha existente do `CANONICAL_VOCABULARY.md` (canônico `ChannelSession`; aliases `whatsappSession`,
  `waSession`, `connection`, `instance`, `botSession`) e o veredito do `CONNECT_CHANNEL_CANONICAL.md`
  (canônico = `MetaConnectService`; `WhatsappSessionService` = MOVE-TO-MARKETING; `connectWhatsapp` do frontend = DELETE).
- Rota canônica de status: `GET /marketing/connect/status` (`MarketingConnectController`).

### Uso permitido

| Termo | Permitido quando |
|---|---|
| `channelSession` | Nome de variável/param para linha de `MetaConnection` — convenção dominante, manter |
| `MetaConnection` / `prisma.metaConnection` | Camada de persistência (até eventual rename de model em migration dedicada) |
| `connection` | Só infra: BullMQ/Redis/DB/socket. Nunca como substantivo da sessão de canal em API pública nova |
| `instance` | Só inglês genérico ("instance of"); nunca como sinônimo de sessão de canal (vocabulário Evolution-API alheio ao schema) |
| `whatsappApiSession` | Só dentro do adapter WhatsApp (`backend/src/whatsapp/**`, `backend/src/meta/**`) como chave de snapshot `providerSettings` |

### Depreciar

| Alias | Onde está | Contagem | Ação |
|---|---|---|---|
| `whatsappApiSession` fora do adapter | vazamentos fora de `backend/src/whatsapp/**` e `backend/src/meta/**` | **48** (excl. specs) | Ratchet G-VOC-3 §9 |
| `WhatsappSessionService` | `backend/src/whatsapp/whatsapp-session.service.ts` | 19 refs | MOVE-TO-MARKETING já prescrito em `CONNECT_CHANNel_DISPATCH`/`CONNECT_CHANNEL_CANONICAL.md` §1.4 |
| `whatsappSession`, `waSession`, `ChannelSession`-Pascal fantasma | — | 0 | Gate tolerância-zero G-VOC-1 §9 (impedir renascimento até o model canônico existir de fato) |

---

## 3. Fio de mensagens com cliente — `Conversation` | `Chat` | `Thread` | `Inbox`

### Contagem

| Termo | backend/src | frontend/src | worker | schema.prisma |
|---|---|---|---|---|
| `Conversation` | **32 / 22** | **66 / 21** | **15 / 7** | model `Conversation` (:684), enum `ConversationStatus`, `ConversationProofSnapshot` (:1572) |
| `Chat` | 61 / 26 ⚠️ | 45 / 23 | 5 / 2 | models `AdminChatSession`/`AdminChatMessage` (:4438/:4455 — chat de IA do admin, conceito distinto) |
| `Inbox` | 5 files | 49 / 33 | 0 | 0 |
| `Thread` | 7 / 4 | 3 / 1 | 0 | 0 |

Call-sites: `prisma.conversation` **193**. ⚠️ Os hits de `Chat` no backend são (a) tipos do SDK
(`OpenAI.Chat.ChatCompletion` — `kloel-reply-engine.helpers.ts`, `unified-agent.service.ts`), (b) a superfície do
assistente Kloel (`backend/src/chat/chat.service.ts:20`, `guest-chat.controller.ts`, rota `@Controller('chat')` ×2) e
(c) boundary WAHA no worker (`isIndividualWahaChatId`, `status@broadcast`). **Nenhum** hit atual usa `Chat`/`Thread`
para a conversa com o cliente final.

### Decisão: canônico = **`Conversation`** (entidade); `Inbox` = superfície de UI/módulo

- Schema e delegates dominam sem ambiguidade (model + 193 call-sites).
- `Inbox` é o nome do módulo/área que **exibe** Conversations (`backend/src/inbox/` — gateway, omnichannel.service;
  páginas do frontend) — não é entidade, é surface. Manter.
- `Thread` pertence ao assistente (`KloelThreadService`, 115 refs) — conceito separado (fio do agente Kloel, model `KloelMessage`).

### Uso permitido

| Termo | Permitido quando |
|---|---|
| `Conversation` | Sempre — a conversa com o contato final |
| `Inbox` | Só como nome de surface/módulo (`backend/src/inbox/`, páginas/rotas de UI) |
| `Chat` | Só (a) superfície do assistente Kloel/Guest/Admin (`backend/src/chat/`, `AdminChat*`), (b) tipos de SDK de vendor, (c) boundary de provider (`chatId` WAHA no worker) |
| `Thread` | Só no domínio do assistente (`KloelThreadService` e mocks) |

### Depreciar

| Alias | Onde está | Contagem | Ação |
|---|---|---|---|
| `Chat`/`Thread` para conversa de cliente | nenhum hoje | 0 | Gate G-VOC-4 §9 congela: nenhuma classe `*(Chat|Thread)(Service|Controller|Module)` nova fora do allowlist do assistente (31 refs atuais, todas assistant-domain) |

---

## 4. Disparo em massa — `Campaign` | `Broadcast` | `Blast`

### Contagem

| Termo | backend/src | frontend/src | worker | schema.prisma |
|---|---|---|---|---|
| `Campaign` | **72 / 37** | **55 / 16** | **9 / 5** | models `Campaign` (:653), `EmailCampaign`(+`Recipient`/`Delivery`), `ProductCampaign`, `AdCampaign`; enums `CampaignStatus`, `EmailCampaignStatus` |
| `Broadcast` | 3 / 3 | 4 / 4 | 1 / 1 | 0 |
| `Blast` | **0** | **0** | **0** | **0** |

Call-sites: `prisma.campaign` **46**. Sinal extra (case-insensitive): `createBroadcast` 9 + `CreateBroadcast*` 38 —
concentrados em `backend/src/campaigns/campaigns.service.ts:146` ("A broadcast is a…") e nas kloel agent-tools
(`unified-agent-actions-workspace.service.ts`, `kloel-chat-tools.service.ts` etc.).

### Decisão: canônico = **`Campaign`**

- `broadcast` sobrevive como **verbo/sub-ação** (um broadcast = envio one-shot de uma Campaign) dentro de
  `campaigns/` e dos nomes de tool do agente (renomear tool name quebra contrato do agente) — nunca como
  entidade/model próprio.
- Significados não-concorrentes legítimos: sufixo JID WhatsApp `status@broadcast`
  (`worker/utils/phone-normalization.util.ts:59`) e verbo de socket nos gateways.

### Uso permitido

| Termo | Permitido quando |
|---|---|
| `Campaign` | Sempre — entidade, DTOs, rotas, eventos |
| `broadcast` | (a) sub-ação de envio dentro de `backend/src/campaigns/` e tool-names kloel já publicados; (b) JID `@broadcast` em boundary de provider; (c) verbo de socket/gateway |
| `Blast` | **Nunca** (0 usos — gate tolerância-zero G-VOC-1) |

---

## 5. Unidade multi-tenant — `Workspace` | `Tenant` | `Company` | `Account`

### Contagem

| Termo | backend/src | frontend/src | worker | schema.prisma |
|---|---|---|---|---|
| `Workspace` | **423 / 224** | **72 / 40** | **122 / 17** | **99 linhas**, model `Workspace` (:119) |
| `Account` | 63 / 30 ⚠️ | 14 / 8 | 1 / 1 | 1 (comentário) |
| `Company` | 8 / 6 | 2 / 2 | 0 | 0 |
| `Tenant` | 2 / 2 | 0 | 1 / 1 | 0 |

Call-sites: `prisma.workspace` **484** — dominância absoluta (rota `@Controller('workspace')` inclusive).
⚠️ `Account` no backend são conceitos **distintos e legítimos**: ledger de pagamentos
(`ConnectAccountBalance` 27+76, `ConnectAccountType` 46), `SocialAccount` (model :1215, 67 usos camel),
`adAccount` Meta Ads (27). `accountId` tem 303 hits — todos nesses domínios, **não** como tenancy.
`Company` é campo de perfil de negócio no onboarding (`account-agent.types.ts:79` — nome da empresa do usuário),
não unidade de tenancy. `Tenant` aparece só como adjetivo em comentários de isolamento (`flow-engine-voice-producer.ts`)
e no OAuth Microsoft (`tenantId` da Azure — vocabulário do vendor, obrigatório).

### Decisão: canônico = **`Workspace`**

### Uso permitido

| Termo | Permitido quando |
|---|---|
| `Workspace` / `workspaceId` | Sempre — a unidade multi-tenant |
| `Account` | Só em compostos de domínio: `ConnectAccount*` (ledger), `SocialAccount`, `adAccount`, e a seção de UI "conta" (`ContaAppsSection`) |
| `company` | Só como campo de perfil de negócio (onboarding account-agent) |
| `tenant` | Só adjetivo em comentários ("multi-tenant", "cross-tenant") e `tenantId` do OAuth Microsoft/Azure |

### Depreciar

| Alias | Onde está | Contagem | Ação |
|---|---|---|---|
| `tenantId`/`companyId` como identificador interno | só 3 hits, todos legítimos (Microsoft OAuth ×2 + comentário throttler) | 3 | Gate G-VOC-5 §9 congela em ≤3 |

---

## 6. Item vendável — `Product` | `Offer` | `Plan`

### Contagem

| Termo | backend/src | frontend/src | worker | schema.prisma |
|---|---|---|---|---|
| `Product` | **182 / 88** | **97 / 54** | **20 / 4** | model `Product` (:1736) + 12 models relacionados (`ProductPlan` :2223, `ProductCheckout`, `ProductCoupon`, `ProductCampaign`, `AffiliateProduct`, `ChannelProduct`…) |
| `Plan` | 84 / 51 | 47 / 22 | 9 / 5 | **nenhum `model Plan` solto** — só `ProductPlan`, `CheckoutProductPlan` (:2989), `CheckoutPlanLink` (:3025) |
| `Offer` | 18 / 15 | 1 / 1 | 1 / 1 | 1 (comentário "Send Offer") |

Call-sites: `prisma.product` **421**, `prisma.productPlan` **138**, `prisma.subscription` 81 (billing SaaS — conceito separado).
Rotas: `products`, `products/:productId/plans`, `pricing`. `Offer` vive em `backend/src/kloel/offer/`
(detectores UTP-OFFER-00x, `OfferInsight`, `offer-confidence.guard.ts`) — é conceito de **cognição/Mind**
(a proposição comercial raciocinada), não a entidade de catálogo.

### Decisão: canônicos = **`Product`** (catálogo) e **`ProductPlan`** (tier de preço)

- `Plan` nunca como entidade solta: as duas únicas violações são interfaces duplicadas no frontend —
  `frontend/src/hooks/usePricingPlans.ts:23` (`export interface Plan`) e
  `frontend/src/components/products/ProductPlansTab.helpers.ts:6` (`export interface Plan`).
- `plan` minúsculo tolerado em segmento de rota (`/products/:productId/plans`) e no módulo `backend/src/plans/`
  (que gerencia `ProductPlan`).

### Uso permitido

| Termo | Permitido quando |
|---|---|
| `Product` | Sempre — entidade de catálogo |
| `ProductPlan` | Tier de preço de um Product (tipo, delegate, DTO) |
| `plan` | Segmento de rota e nome de módulo existente (`backend/src/plans/`); `Subscription` cobre billing SaaS |
| `Offer` / `OfferInsight` | Só dentro de `backend/src/kloel/offer/` (domínio de cognição) e eventos `OFFER_EVENT_NAMES` |

### Depreciar

| Alias | Onde está | Contagem | Ação |
|---|---|---|---|
| `interface Plan` solta | `frontend/src/hooks/usePricingPlans.ts:23`, `frontend/src/components/products/ProductPlansTab.helpers.ts:6` | 2 | Renomear para `ProductPlan` (codemod trivial); gate G-VOC-6 congela em ≤2 até lá |
| `Offer` fora de `kloel/offer/` | hoje só referências cruzadas legítimas | — | Coberto pela tabela do vocab vivo (gate AST) |

---

## 7. Conflitos com o `CANONICAL_VOCABULARY.md` vivo

Nenhum conflito de decisão — este artefato **confirma** as 3 linhas existentes que tocam estes conceitos
(`ChannelSession`, `Contact`, `Workspace`) e **adiciona evidência quantitativa** + 3 conceitos novos
(`Conversation`, `Campaign`, `Product`/`ProductPlan`) que ainda não estão na tabela viva.

## 8. Linhas prontas para a tabela viva (input do gate AST)

> Copiar para `docs/architecture/CANONICAL_VOCABULARY.md` (o `check-canonical-vocabulary.mjs` parseia as tabelas
> markdown daquele arquivo). Depois rodar `node scripts/ops/check-canonical-vocabulary.mjs --bootstrap` para
> recapturar o baseline.

```markdown
| `Conversation` | `Chat` (customer context), `Thread` (customer context) | Entity for end-customer message threads; `Chat`/`Thread` reserved to the Kloel assistant domain (`backend/src/chat/`, `KloelThreadService`, `AdminChat*`); `Inbox` is the UI surface, never the entity |
| `Campaign` | `Broadcast` (entity context), `Blast` | `broadcast` allowed only as send-action verb inside `backend/src/campaigns/` + published kloel tool names, and as WAHA `@broadcast` JID boundary |
| `ProductPlan` | `Plan` (standalone entity) | Pricing tier of a `Product`; bare `plan` allowed only as route segment and the `backend/src/plans/` module name; SaaS billing is `Subscription` |
| `Contact` | `KloelLead` | Legacy entity being drained by `person-kloel-lead-to-contact` backfill; new code must not read/write `prisma.kloelLead` |
```

## 9. Gates grep-áveis propostos (padrão `scripts/ops/check-canonical-*.mjs`)

> Cada gate abaixo é um `rg` puro (sem AST) — apto a virar `scripts/ops/check-canonical-terms.mjs` com a mesma
> semântica de ratchet do `check-canonical-vocabulary.mjs`: **tolerância-zero** falha com qualquer hit;
> **ratchet** falha só se a contagem subir acima do baseline gravado (regenerável com `--bootstrap`).
> Contagens "hoje" medidas em 2026-06-10 — são o baseline inicial.

| ID | Modo | Comando (exit 1 se viola) | Hoje |
|---|---|---|---|
| G-VOC-1 | tolerância-zero | `rg -n -w 'Prospect\|Blast\|waSession\|whatsappSession\|ChannelSession' backend/src frontend/src worker` → qualquer hit falha | **0** |
| G-VOC-2 | ratchet ≤43 | `rg -w -o 'KloelLead\|kloelLead' backend/src frontend/src worker -g '!*backfill*' -g '!*.spec.*' \| wc -l` | 43 |
| G-VOC-3 | ratchet ≤48 | `rg -n 'whatsappApiSession' backend/src frontend/src worker -g '!backend/src/whatsapp/**' -g '!backend/src/meta/**' -g '!*.spec.*' \| wc -l` | 48 |
| G-VOC-4 | ratchet ≤31 | `rg -o '\b\w*(Chat\|Thread)(Service\|Controller\|Module\|Repository\|Entity)\b' backend/src worker --no-filename \| wc -l` — allowlist conceitual: tudo hoje é assistant-domain (`KloelThreadService` 115 refs, `ChatService`/`GuestChat*`/`AdminChat*`) | 31 símbolos |
| G-VOC-5 | ratchet ≤3 | `rg -n -w 'tenantId\|companyId' backend/src frontend/src worker \| wc -l` (os 3 atuais: Microsoft OAuth ×2 + comentário throttler). **Não** incluir `accountId` (303 hits legítimos em Connect/Social/Ads) | 3 |
| G-VOC-6 | ratchet ≤2 | `rg -n '\b(class\|interface\|model) (Plan\|Offer)\b' backend/src backend/prisma/schema.prisma frontend/src worker \| wc -l` | 2 (as duas `interface Plan` do §6) |
| G-VOC-7 | informativo | `rg -o -i 'createBroadcast\|sendBlast\|broadcastCampaign' backend/src frontend/src worker --no-filename \| wc -l` — não bloquear (tool-names publicados do agente); alertar se crescer | 47 |

Esqueleto de integração (mesma forma dos irmãos — ver header de `check-canonical-events.mjs` e o bloco
RATCHET de `check-canonical-vocabulary.mjs`):

```js
// scripts/ops/check-canonical-terms.mjs (proposto — não criado)
// Exit 0 = limpo; 1 = violação nova (zero-tolerance hit OU contagem > baseline); 2 = erro.
// Baseline: scripts/ops/canonical-terms-baseline.json {"G-VOC-2": 43, "G-VOC-3": 48, ...}
// Flags: --strict (CI), --report, --bootstrap (regrava baseline).
// Registrar em check-all-gates.mjs ao lado dos demais check-canonical-*.
```

### Validação executada (2026-06-10)

```
G1-zero-tolerance   0
G2-kloelLead        43
G3-whatsappApiSession-leak  48
G4-tenant-company-account-id  3   (accountId isolado: 303 — excluído do gate)
G5-chat-thread-classes  31
G6-bare-Plan-model-or-class  2
G7-broadcast-campaign-synonym  45 (case-insensitive: 47 símbolos createBroadcast/CreateBroadcast*)
```

## 10. Riscos e notas de migração

1. **`MetaConnection` → `ChannelSession` (rename de model)** é a única decisão que exige migration de banco —
   fora do escopo deste artefato; até lá o par "conceito `ChannelSession` / persistência `MetaConnection`" é o estado canônico.
2. **`commerce.lead.*` não deve ser renomeado** para `commerce.contact.*` sem passar pelo DE→PARA do
   `EVENT_TAXONOMY_2026-06-10.md` — eventos são contrato persistido (Spine/Mind-Outbox).
3. **Tool-names kloel com `broadcast`** (47 refs) são contrato do agente; renomear quebra dispatch — manter como verbo aceito.
4. Os gates G-VOC-2/3 dependem da **conclusão do backfill** `person-kloel-lead-to-contact` e do MOVE-TO-MARKETING
   do `WhatsappSessionService` para chegarem a zero; o ratchet só impede crescimento.
