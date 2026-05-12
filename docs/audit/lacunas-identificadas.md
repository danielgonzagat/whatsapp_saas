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

**Status:** documentada (Parte 9). Triagem necessária.

**Onde vive:**

- `artifacts/pulse/` contém o último report.
- Categoria predominante: `graph-route-caller-unobserved` — rotas backend
  sem caller frontend rastreado.

**Próximo passo:**

1. Listar rotas marcadas `graph-route-caller-unobserved`.
2. Triagem em 3 buckets:
   - **Externas**: usadas via curl/webhook/integração externa → registro
     em `docs/api/external-routes.md` + ignore declarado em PULSE.
   - **Históricas órfãs**: nenhuma evidência de uso → remover do código.
   - **Frontend incompleto**: contrato existe, frontend ainda não consome →
     entra em `lacunas-identificadas.md` como dívida.
3. Atingir READY ou READY_WITH_CAVEATS com cada caveat justificado.

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

**Status:** documentada (Parte 8.4).

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

## Como esse arquivo evolui

Cada vez que uma lacuna é resolvida, marcar com:

```
**RESOLVIDA em <commit-sha>** — <descrição curta do fix>
```

Cada nova lacuna identificada durante a entrega entra como Lxx com o mesmo
template (Status / Onde vive / Consequência / Próximo passo).
