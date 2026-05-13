# Lacunas Identificadas — Entrega KLOEL Organismo Comercial

> Esse arquivo é o registro de saída da conferência (Parte 3 do prompt).
> Não substitui Obsidian. Aponta para módulos no espelho de código e descreve
> o gap concreto, com referência ao commit que resolveu ou ao próximo passo.

Última atualização: 2026-05-12 — sessão de execução do prompt do organismo.

---

## L1 — Wizard de 4 passos é código órfão (CRÍTICO)

**Status:** documentada, fix em andamento via OpenCode agent.

**Onde vive:**

- `frontend/src/components/kloel/marketing/UniversalChannelWizard.tsx` —
  componente com 4 passos (`WIZARD_STEPS = ['Conexao','Produtos','Arsenal','Configuracao']`).
- `frontend/src/components/kloel/marketing/UniversalChannelWizard.connection.tsx`
- `frontend/src/components/kloel/marketing/UniversalChannelWizard.review.tsx`
- `frontend/src/components/kloel/marketing/OfficialMarketingChannelPage.tsx` —
  página alternativa com mesma lógica de 4 passos, persistência em backend
  (`/marketing/channel-setup`).
- `frontend/src/components/kloel/marketing/WhatsAppExperience.wizard-*` —
  variante WhatsApp.

**Evidência de orfandade:**

- `grep -rn "UniversalChannelWizard" frontend/src --include="*.tsx" | grep -v "UniversalChannelWizard\.."` retorna apenas o próprio arquivo (zero importações externas).
- `grep -rn "OfficialMarketingChannelPage" frontend/src` retorna apenas o próprio arquivo.
- Rotas `/marketing/{whatsapp,instagram,facebook,tiktok,email}/page.tsx`
  renderizam `MarketingView` que renderiza diretamente
  `WhatsAppMarketingTab`, `InstagramMarketingTab`, `FacebookMarketingTab`,
  `TikTokMarketingTab`, `EmailMarketingTab` — **sem etapas de wizard**.
- O fluxo real hoje: `MetaConnectPrompt` (botão único Conectar) → após OAuth
  redireciona → operacional dashboard (sem etapas Produtos/Arsenal/Configuração).

**Consequência:**

- Parte 1.1 (número "1" invisível) e Parte 1.2 (callback retorna ao step 2)
  não podem ser validadas pelo Daniel hoje porque o wizard simplesmente não
  renderiza.
- Parte 4 do prompt (4-step gate real) requer arquitetura ainda não escrita.

**Defeito visual já corrigido em código órfão:**

- `WhatsAppExperience.connection-panes.tsx` linhas 11/13 tinham
  `const E = 'UI.accent'` (string literal) ao invés de `const E = UI.accent`
  (token resolvido). Fix aplicado nesta sessão. **Mas o arquivo onde está
  esse componente é consumido apenas por `UniversalChannelWizard` que está
  órfão.** Quando o wizard for wired, o digit "1" do step ativo já renderiza
  com contraste correto.

**Próximo passo:**

1. Wire `OfficialMarketingChannelPage` (preferido — já tem persistência via
   API `/marketing/channel-setup`) em `/marketing/{channel}/page.tsx` quando
   o canal NÃO está com setup completo. Operacional dashboard só renderiza
   quando setup `currentStep` chegou a 3 e foi salvo como "concluído".
2. Auto-advance para step 2 quando `?meta=success&channel=X` chega no URL.
3. Definir estados por canal: `desconectado`, `conectado-setup-pendente`,
   `setup-completo-mas-inativo`, `ativo`.
4. Decidir se `UniversalChannelWizard` (genérico, sem persistência) deve ser
   absorvido pelo `OfficialMarketingChannelPage` (com persistência) ou
   removido como duplicação.

---

## L2 — `commercial-decision-orchestrator` envia `replyDraft` (instrução em 3ª pessoa) como `send_message`

**Status:** documentada, fix em andamento.

**Onde vive:**

- `backend/src/kloel/commercial-decision-orchestrator.service.ts` linhas 238-272.
  `buildReplyDraft({aggressiveness, concept, couponAction, productOffer, setup, tone})`
  retorna texto em 3ª pessoa do tipo "Responder com tom consultivo...".
  Passado direto como `args.message` da action `send_message`.

**Caller real:**

- `backend/src/kloel/unified-agent.controller.ts` (cadeia documentada por findings).
- Quando flag `KLOEL_DETERMINISTIC_PIPELINE` está ativa, este path é o real.

**Consequência:**

- Se o composer/writer LLM falhar (timeout, rate limit, indisponibilidade),
  o fallback envia o `replyDraft` direto para o cliente, que recebe a instrução
  interna em 3ª pessoa como se a Kloel falasse dela mesma.

**Próximo passo:**

1. Renomear `replyDraft` → `internalReplyPlan` (sinal explícito de plano
   interno).
2. Action `send_message` passa a aceitar `internalReplyPlan` em campo separado,
   nunca em `message`.
3. Composer/writer consome `internalReplyPlan` + contexto, produz mensagem
   final humana, OU retorna `failed` quando LLM indisponível.
4. Quando composer falha: cancela `send_message` e emite evento durável
   `outbound.cancelled.writer_unavailable` + alerta para operador. Não envia
   fallback em 3ª pessoa.
5. Teste de regressão automatizado: dispara inbound em workspace de teste com
   writer mockado para falhar; afirma que nenhum outbound é enviado contendo
   verbos diretivos em 3ª pessoa ("Responder", "Usar", "Tratar", "Priorizar").

---

## L3 — `resolveProductOffer` ignora `selectedProductIds` do canal

**Status:** documentada, fix em andamento direto.

**Onde vive:**

- `backend/src/kloel/commercial-decision-orchestrator.service.ts` linha ~195-208.
  Chama `this.mind.resolveProductOffer(workspaceId, 'new_lead', concept, priceBand)`.
- `channelSetup.selectedProductIds` é carregado mais acima mas só usado para
  alimentar `setupContext` do `buildReplyDraft` (cosmético).

**Consequência:**

- Cérebro pode recomendar produto fora do conjunto que o usuário escolheu
  para o canal. Viola Parte 1.4 do prompt.

**Próximo passo:**

1. Estender assinatura de `resolveProductOffer` para aceitar `{channel,
   allowedProductIds}` como filtro estrutural.
2. Mind/brain filtra candidatos antes do scoring.
3. Se `allowedProductIds` estiver vazio (canal sem produtos), retornar
   `cold_start_no_products` em vez de fallback.
4. Mesmo tratamento para `resolveCoupon`: respeitar teto de
   `aggressiveness.aggressiveness` e janela de cupom configurada.

---

## L4 — CIA legado (`global-learning.ts` / `pickVariant`) ainda decide em produção

**Status:** documentada, ADR pendente.

**Onde vive:**

- `worker/processors/cia/global-learning.ts` exporta `buildGlobalStrategy`.
- `worker/processors/cia/self-improvement.ts` exporta funções relacionadas.
- `worker/processors/__companions__/autopilot-core.companion.ts` consome
  `globalStrategy` via `pickVariant(strategy, variants)` para selecionar
  variantes de mensagem em fluxos `payment_recovery` e `followup`.

**Consequência:**

- Há cérebro paralelo decidindo variantes de mensagem em produção, em
  desacordo com o cérebro determinístico (`commercial-decision-orchestrator`
  + `mind`). Viola Parte 7 do prompt.

**Próximo passo:**

1. ADR em `docs/adr/` documentando inspeção função por função.
2. `pickVariant` migrado para consultar orquestrador ou `mind.resolveBestVariant`.
3. `buildGlobalStrategy` reduzido a coletor estatístico (alimentar tabelas
   que o cérebro consulta) OU removido com migração documentada.

---

## L5 — Pipeline determinístico atrás de flag de ambiente, não estado per-workspace

**Status:** documentada, fix planejado (Parte 5).

**Onde vive:**

- `backend/src/kloel/commercial-decision-orchestrator.service.ts` —
  ativação atual depende de `process.env.KLOEL_DETERMINISTIC_PIPELINE` ou
  similar.
- Faltam tabelas `PipelineState` e `DecisionShadow` com `outcomeKey`.
- Falta endpoint admin para transições (`legacy` → `shadow` → `active`).
- Falta job de cálculo de lift agregado.
- Falta auto-fallback quando `fallbackRate > 5%/h`.

**Próximo passo:**

1. Criar model Prisma `PipelineState` (workspaceId, state: legacy|shadow|active,
   transitionedAt, transitionedBy, snapshot).
2. Criar model `DecisionShadow` (workspaceId, inboundCorrelationId,
   orchestratorDecision JSON, legacyBaseline JSON, outcomeKey, outcomeAt,
   outcomeValue).
3. Endpoint admin `POST /admin/pipeline/state` com guard `AdminGuard`.
4. Job periódico `mind-lift-report` em worker que escreve
   `artifacts/mind-reports/YYYY-MM-DD.md`.
5. Métricas no orquestrador: latência por dimensão, taxa de fallback.
6. Auto-fallback hook que move workspace para shadow.

---

## L6 — Repertório de ações não é declarado por canal

**RESOLVIDA em 3f2c8e503** — `channel-repertoire.config.ts` declarado com
`CHANNEL_REPERTOIRE: Record<ChannelKey, ChannelRepertoire>` exportando ações,
tons e formatos por canal. Orquestrador consome `allowedFormatsFor`,
`allowedTonesFor` e `repertoireFor` antes de consultar o mind. Audio em email
força texto sem consultar mind. TikTok bloqueia proactive outbound por padrão.
Tone fora do repertório é substituído com registro de override.

**Status:** documentada (Parte 6). **RESOLVIDA.**

**Onde vive:**

- `backend/src/kloel/commercial-decision-orchestrator.service.ts` decide as
  mesmas dimensões para os 5 canais. Variação só no contexto.
- ~~Falta arquivo `channel-repertoire.config.ts`.~~ **RESOLVIDO.**
- Crenças do mind/brain não são filtradas por canal de 1ª ordem.

**Próximo passo:**

1. ~~Criar `backend/src/kloel/channel-repertoire.config.ts` exportando
   `CHANNEL_REPERTOIRE: Record<Channel, {actions: ActionId[], tones: Tone[],
   formats: Format[], proactiveOutboundAllowed: boolean, ...}>`.~~ **FEITO.**
2. ~~Orquestrador consulta repertório antes de pedir decisão; filtra candidatos
   inválidos para o canal.~~ **FEITO.**
3. Mind/brain `resolveBelief({channel, ...})` filtra crenças por canal.
4. Tabela global de prior por canal para cold start.

---

## L7 — Outcome tracking incompleto / lift não mensurado

**Status:** documentada (Parte 11).

**Onde vive:**

- Não existe tabela `DecisionOutcome` com `outcomeKey` único e correlação
  ação→resultado→valor.
- Não existe job de cálculo de lift por decisão/canal.
- Falta relatório `artifacts/mind-reports/`.

**Próximo passo:**

1. Migração Prisma: `DecisionOutcome` com FK ao trace de decisão.
2. Webhooks/eventos relevantes emitem fechamento (`venda`, `refund`,
   `opt_out`, `silencio_24h`, `transferencia_humana`, etc).
3. Job de agregação calcula lift por (decisão, canal) com IC e p-valor.
4. Endpoint REST de inspeção `/admin/mind/lift`.

---

## L8 — PULSE em `NOT_CERTIFIED` / `humanReplacementStatus: NOT_READY`

**Status:** triada (Parte 9). 15 rotas classificadas, 0 removidas.

**Triagem concluida em 2026-05-13:**

- **15 rotas `route_caller_unobserved`** extraidas de PULSE_CERTIFICATE.json.
- Nenhuma rota e EXTERNA (todas tem auth guard; PULSE infere externas via
  `isPublic` = sem guard).
- Nenhuma rota e HISTORICAL_DEAD (todos os 4 controladores tem outras rotas
  com callers frontend ativos — WebhookSettings GET/POST, AdminMind POST
  ask/report, Pipeline POST state, Anuncios POST disconnect/sync).
- **15 rotas sao FRONTEND_INCOMPLETE**: contrato backend existe, servico
  funcional, mas frontend ainda nao consome. Registradas abaixo.

**Onde vive:**

- `PULSE_REPORT.md` e `.pulse/current/PULSE_CERTIFICATE.json`.
- 4 controladores afetados:
  - `backend/src/webhooks/webhook-settings.controller.ts`
  - `backend/src/admin/mind/admin-mind.controller.ts`
  - `backend/src/admin/pipeline/pipeline.controller.ts`
  - `backend/src/anuncios/anuncios.controller.ts`

### Bucket: FRONTEND_INCOMPLETE (15 rotas)

#### Grupo A: Webhook Settings — DELETE ausente

| Metodo | Rota | Controller | Next Step |
|--------|------|-----------|------------|
| DELETE | `/settings/webhooks/:id` | webhook-settings.controller.ts:68 | Adicionar botao de remover no componente WebhookSettings do frontend (GET list e POST create ja tem callers). |

#### Grupo B: Admin Mind — Queries de diagnostico ausentes

| Metodo | Rota | Controller | Next Step |
|--------|------|-----------|------------|
| GET | `/admin/mind/:workspaceId/state` | admin-mind.controller.ts:19 | Pagina admin `/admin/mind` — criar aba State com grafico de PipelineState por workspace. |
| GET | `/admin/mind/:workspaceId/surprise` | admin-mind.controller.ts:28 | Pagina admin `/admin/mind` — criar aba Surprise com tabela de decisoes anomalas. |
| GET | `/admin/mind/:workspaceId/lift` | admin-mind.controller.ts:37 | Pagina admin `/admin/mind` — criar aba Lift com grafico de lift por decisionType. |
| GET | `/admin/mind/:workspaceId/concepts` | admin-mind.controller.ts:43 | Pagina admin `/admin/mind` — criar aba Concepts com lista de crencas aprendidas. |
| GET | `/admin/mind/:workspaceId/health` | admin-mind.controller.ts:52 | Pagina admin `/admin/mind` — criar aba Health com metricas de fallback/latencia. |
| GET | `/admin/mind/:workspaceId/briefing` | admin-mind.controller.ts:58 | Pagina admin `/admin/mind` — criar aba Briefing com resumo executivo. |
| GET | `/admin/mind/lift` | admin-mind.controller.ts:70 | Pagina admin `/admin/mind` — visao agregada de lift global. |

**Callers existentes no mesmo controller:** POST `/admin/mind/:workspaceId/ask`,
POST `/admin/mind/:workspaceId/report` (PULSE nao flagou — ja tem frontend).

#### Grupo C: Admin Pipeline — Leitura de estado ausente

| Metodo | Rota | Controller | Next Step |
|--------|------|-----------|------------|
| GET | `/admin/pipeline/state` | pipeline.controller.ts:20 | Pagina admin `/admin/pipeline` — exibir estado do pipeline (legacy/shadow/active). |
| GET | `/admin/pipeline/health` | pipeline.controller.ts:44 | Pagina admin `/admin/pipeline` — exibir metricas de health do pipeline. |

**Callers existentes no mesmo controller:** POST `/admin/pipeline/state`
(PULSE nao flagou — ja tem frontend para transicao de estado).

#### Grupo D: Anuncios/Ads — Leituras de status ausentes

| Metodo | Rota | Controller | Next Step |
|--------|------|-----------|------------|
| GET | `/api/anuncios/status` | anuncios.controller.ts:23 | Painel Ads — exibir status das plataformas conectadas. |
| GET | `/api/anuncios/sync-status/google` | anuncios.controller.ts:37 | Painel Ads — exibir status de sync do Google Ads. |
| GET | `/api/anuncios/accounts` | anuncios.controller.ts:44 | Painel Ads — listar contas conectadas por plataforma. |
| GET | `/api/anuncios/campaigns` | anuncios.controller.ts:51 | Painel Ads — listar campanhas ativas por plataforma. |
| GET | `/api/anuncios/connect/:platform` | anuncios.controller.ts:58 | Painel Ads — gerar URL de OAuth para conectar plataforma. |

**Callers existentes no mesmo controller:** POST `/api/anuncios/disconnect/:platform`,
POST `/api/anuncios/sync/accounts`, POST `/api/anuncios/sync/campaigns`,
GET `/api/anuncios/sync-status/meta` (PULSE nao flagou — ja tem frontend para
mutacoes de ads).

### Resumo P9/L8

- Orphan count antes: 15 `route_caller_unobserved`
- Orphan count depois: 0 (todas classificadas como FRONTEND_INCOMPLETE)
- HISTORICAL_DEAD: 0 (nenhuma rota removida)
- EXTERNAL: 0 (nenhuma rota com auth guard e externa)
- FRONTEND_INCOMPLETE: 15
- PULSE status delta: `route_caller_unobserved` findings agora tem `needs_context`
  resolvido com documentacao de next steps. Score permanece 58/100 — PULSE
  sobe quando frontend for wired.

---

## L9 — Apple login: validação programática ausente

**Status:** documentada (Parte 8.1). Bloqueio externo provável (`.p8` access).

**Onde vive:**

- `backend/src/auth/apple-*` (verificação RS256, JWKS cache, troca de código).
- Não há registro de validação contra endpoint Apple real.

**Próximo passo:**

1. Script `scripts/auth/apple-client-secret-probe.mjs` que gera o
   `client_secret` JWT programaticamente a partir de `APPLE_TEAM_ID`,
   `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY_P8` env.
2. Faz POST a `https://appleid.apple.com/auth/token` com `code=INVALID`.
3. Espera resposta `invalid_grant`.
4. Resposta proibida: `invalid_client` (= client_secret mal montado).
5. Evidência em `docs/evidence/apple-login.md` com timestamp.
6. Se `.p8` não acessível: documentar como bloqueio externo legítimo.

---

## L10 — Brain Capability Registry sem consumidor real partindo de evento real

**Status:** documentada (Parte 7.2).

**Onde vive:**

- `backend/src/brain/brain.controller.ts` expõe `POST /brain/decide`.
- Capabilities listadas em `brain-capabilities.registry.ts` (sales, messaging,
  product, control).
- Nenhum componente frontend chama `/brain/decide`.

**Próximo passo:**

1. Identificar componente do chat oficial no dashboard.
2. Adicionar chamada `apiFetch('/brain/decide', {body: {intent, context}})`
   quando operador pede ação comercial.
3. Capabilities mínimas operáveis: listar produtos, criar produto, buscar
   contato, listar conversas, enviar mensagem, consultar receita, gerar
   link de checkout, consultar config, ajustar config dentro de limites.
4. Cada chamada gera evento durável no event spine.
5. Resposta verbalizada honestamente pelo LLM no chat.

---

## L11 — TikTok: paridade não declarada honestamente

**Status:** documentada (Parte 8.3).

**Onde vive:**

- `backend/src/tiktok-ads/` (envio de eventos publicitários).
- `frontend/src/components/kloel/marketing/TikTokMarketingTab.tsx`.
- Nenhuma evidência de envio outbound de DMs programaticamente.

**Próximo passo:**

1. Verificar status do app TikTok no painel TikTok (revisão).
2. Declarar modo honesto em `OfficialMarketingChannelPage` para TikTok:
   - "Recebendo" — se app só aceita inbound, IA escuta e alimenta memória
     mas não envia.
   - "Vendendo" — se app aprovado para outbound completo.
   - "Pendente" — se chaves/permissões faltam, com lista exata do que falta.

---

## L12 — Email: footer de unsubscribe obrigatório

**RESOLVIDA** — `backend/src/unsubscribe/unsubscribe.controller.ts` GET endpoint funcional com token HMAC-signed. `buildUnsubscribeFooterHtml` e `buildUnsubscribeFooterText` exportados de `unsubscribe-footer.util.ts`. Todos os senders comerciais auditados:
- `email-campaign.service.ts` (footer + List-Unsubscribe header)
- `email-marketing.service.ts` (footer + List-Unsubscribe header)
- `auth/email.service.ts` (welcome/onboarding footer)
- `marketing/marketing.controller.ts` (direct send footer)
- `checkout/checkout-social-recovery.service.ts` (recovery footer)
- `campaigns/campaigns.service.ts` (campaign broadcast footer)
- `marketing/marketing-connect.controller.ts` (test email footer)
- `mailbox-gmail-oauth.service.ts` (Gmail proactive footer)
- `unified-agent-actions-messaging.service.ts` (defense-in-depth guard)

Todo outbound de email comercial passa por `buildUnsubscribeFooterHtml` ou `buildUnsubscribeFooterText` e specs correspondentes afirmam presença do footer. GET `/unsubscribe?token=...` verifica token HMAC, flips `Contact.optIn=false` via `UnsubscribeService.processUnsubscribeToken`, redireciona para `/unsubscribed` (ou `/unsubscribed?error=invalid_token`).

**Status:** documentada (Parte 8.4). **RESOLVIDA.**

**Onde vive:**

- `backend/src/common/utils/unsubscribe-footer.util.ts` existe.
- Não está garantido que TODO outbound de email comercial passa pela
  função.

**Próximo passo:**

1. Auditar todos os pontos de envio de email comercial
   (`marketing-connect.controller.ts`, `email-campaign.service.ts`,
   `marketing/mailbox-imap-smtp.service.ts`).
2. Garantir que `buildUnsubscribeFooterHtml` é aplicado e o teste de unidade
   afirma footer presente.
3. Endpoint público `/unsubscribe?token=...` funcional.

---

## L13 — PULSE nao tem accept-list explicito para rotas externas com guard

**Status:** documentada (Parte 9). Sem fix imediato — depende de mudanca em
`scripts/pulse/*` (governance surface).

**Onde vive:**

- `scripts/pulse/graph/graph-part1-core.ts:160` — `inferRouteHasExternalCaller`
  decide que rota e externa apenas por `route.isPublic` (ausencia de guard).
- Nao ha arquivo de config nem campo `externalRoutes` no manifest que permita
  declarar que uma rota COM auth guard (ex: JwtAuthGuard) e chamada
  exclusivamente por integracao externa (ex: webhook com HMAC, callback OAuth,
  endpoint de health check autenticado).

**Consequencia:**

- Se uma rota com guard for chamada apenas por webhook/parceiro externo,
  PULSE reportara como `route_caller_unobserved` falso positivo.
- Hoje nenhuma das 15 rotas triadas cai nesse caso, mas o gap existe e pode
  afetar futuras adicoes.

**Proximo passo:**

1. Humano cria `scripts/pulse/external-routes.json` (ou equivalente) com
   schema: `{ "accept": [{ "method": "GET", "path": "/admin/health", "reason": "called by Railway health check" }] }`.
2. `inferRouteHasExternalCaller` ou funcao auxiliar consulta essa lista
   antes de emitir `route_caller_unobserved`.
3. Referencia cruzada com `docs/api/external-routes.md` para single source
   of truth.

> **Nota de governance:** `scripts/pulse/*` e superficie protegida. IA CLI
> nao pode editar estes arquivos. Este gap requer acao humana.

---

## Como esse arquivo evolui

Cada vez que uma lacuna é resolvida, marcar com:

```
**RESOLVIDA em <commit-sha>** — <descrição curta do fix>
```

Cada nova lacuna identificada durante a entrega entra como Lxx com o mesmo
template (Status / Onde vive / Consequência / Próximo passo).
