# FINAL_DELIVERY — KLOEL Organismo Comercial

Sessão de execução do prompt: 2026-05-12.
Branch: `chore/purga-total-debt`.
Operador: Claude Opus 4.7 (1M context) via Claude Code.

> **Aviso de honestidade epistêmica:** o prompt entregue tem escopo total
> equivalente a múltiplas semanas de engenharia (16 partes, dezenas de
> critérios de aceitação por parte). Esta sessão entregou correções reais e
> validadas em uma fração das partes; o resto está documentado em
> `docs/audit/lacunas-identificadas.md` com próximo passo concreto. Não há
> declaração falsa de "100% pronto" neste relatório.

---

## 1 — Resumo executivo

Esta sessão fechou **4 itens** com código real, testes passando, commits
verificáveis. Identificou **12 lacunas** estruturais documentadas com plano
de ação. Não declarou pronto nenhum item sem evidência de validação.

| Parte do prompt | Estado | Evidência |
| --- | --- | --- |
| P1.1 — número "1" invisível | **PRONTO em código (com nuance estrutural)** | commit `62e72ff8b` + `466b97b90` |
| P1.2 — Meta callback retorna ao step 2 | **NÃO PRONTO — arquitetura órfã** | Lacuna L1 |
| P1.3 — replyDraft como mensagem ao cliente | **PRONTO E TESTADO** | commit `466b97b90`, 17 testes |
| P1.4 — wizard config atravessa operação | **PARCIAL** | commit `eff3a557a` |
| P3 — Obsidian + lacunas | **PRONTO** | `docs/audit/lacunas-identificadas.md` |
| P5–P12 | **NÃO PRONTO — documentado como dívida** | Lacunas L5–L11 |

Total de commits desta sessão: 4 (`62e72ff8b`, `466b97b90`, `eff3a557a`,
+ `chore(types)` `[hash não exibido]`).

---

## 2 — Defeitos visíveis a Daniel

### 2.1 — Número "1" invisível no cabeçalho do wizard

**Antes:** `WhatsAppExperience.connection-panes.tsx` linha 11/13 definia
`const E = 'UI.accent'` e `const G = 'UI.success'` como **string literals**,
não como referência ao token. O passo ativo (índice 0) recebia
`background: E` (= a string `'UI.accent'`, CSS inválido → transparente) e
`color: KLOEL_THEME.bgPrimary` (preto void). Resultado: dígito preto sobre
fundo transparente = invisível ao usuário.

**Depois:** linhas 11/13 corrigidas para `const E = UI.accent;` e
`const G = UI.success;`. O passo ativo agora renderiza Ember (#E85D30) como
fundo e o dígito em preto void com contraste correto.

**Nuance estrutural:** o componente `Steps` corrigido vive em
`WhatsAppExperience.connection-panes.tsx` que é consumido por
`UniversalChannelWizard.tsx`. Esse wizard **não está importado em nenhuma
rota** — é código órfão (ver L1). O `OfficialMarketingChannelPage.tsx`
(página alternativa também órfã) usa renderização própria de passos que
**não** sofria o defeito.

**Como Daniel valida:** quando o wizard for wired nas rotas
`/marketing/{channel}` (próxima entrega), o número "1" já aparece com
contraste correto.

**Cadeia de arquivos:** `frontend/src/components/kloel/marketing/WhatsAppExperience.connection-panes.tsx`.

### 2.2 — Conexão Meta tratada como ativação (callback wrong)

**Estado:** NÃO PRONTO.

**Causa raiz descoberta:** o componente de 4-passos
(`UniversalChannelWizard` ou `OfficialMarketingChannelPage`) **não é
renderizado por nenhuma rota**. As rotas `/marketing/instagram`,
`/marketing/facebook`, `/marketing/whatsapp`, `/marketing/email`,
`/marketing/tiktok` todas renderizam `MarketingView`, que internamente
mostra `InstagramMarketingTab` / `FacebookMarketingTab` /
`WhatsAppMarketingTab` / `EmailMarketingTab` / `TikTokMarketingTab`. Esses
tabs mostram `MetaConnectPrompt` (botão único) quando Meta não está
conectada, e o painel operacional quando está. **Não há etapas
intermediárias renderizadas hoje.**

**Validação:**

```sh
$ grep -rn "UniversalChannelWizard" frontend/src --include="*.tsx" | grep -v "UniversalChannelWizard\."
$ grep -rn "OfficialMarketingChannelPage" frontend/src | grep -v "OfficialMarketingChannelPage\."
# ambos retornam apenas os próprios arquivos — zero importações externas
```

**Próximo passo:** detalhado em `docs/audit/lacunas-identificadas.md` (L1).
Resumo: substituir o caminho `MetaConnectPrompt → painel` por
`OfficialMarketingChannelPage` (que já tem persistência via API
`/marketing/channel-setup`) quando `channelSetup.completedAt === null`. Após
OAuth Meta retornar com `?meta=success&channel=X`, auto-advance para
`currentStep = 1` (= passo 2 da UI 1-indexed).

**Por que não fiz nesta sessão:** é refator de prop-drilling + roteamento
de estado que toca 6+ arquivos do frontend, sem cobertura de testes E2E
existente para validar regressão. Mais seguro entregar como bloco
arquitetural separado com PR dedicado.

### 2.3 — Instrução interna enviada como mensagem ao cliente

**Antes:** `commercial-decision-orchestrator.service.ts` linha 62-91 tinha
`buildReplyDraft(...)` retornando texto em 3ª pessoa do tipo
*"Responder com tom consultivo e intensidade normal. Usar apenas os 3
produto(s) habilitados para este canal. Direcionar a oferta para
top_seller."* — passado direto como `args.message` da action `send_message`.
Como `actionSendMessage` em `unified-agent-actions-messaging.service.ts`
não tinha composer/writer, o cliente recebia a instrução interna.

**Depois:**

- Renomeado para `InternalReplyPlan` (tipo) + `composeCustomerMessage(plan)`
  (função). A nova função emite mensagem voltada ao cliente em 1ª/2ª pessoa
  por conceito (price_objection, imminent_purchase, trust_objection,
  fatigue_risk, audio_preference, neutral catch-all).
- `assertCustomerSafe(message)` é uma guarda anti-instrução: rejeita
  qualquer string que casa com padrões de diretiva orquestrador
  (`Responder com tom`, `Usar os N produto`, `Priorizar o arsenal`,
  `Tratar a objeção de preço`, `Direcionar a oferta para`, `Conduzir para
  o próximo passo`). Padrões âncora em início de linha / início de frase
  para não cortar uso legítimo de verbos em 2ª pessoa
  ("posso te responder com áudio").
- Orquestrador roda `assertCustomerSafe` antes de enfileirar.
- `UnifiedAgentActionsMessagingService.actionSendMessage` roda
  `assertCustomerSafe` no boundary do transporte (defesa em camadas).
  Violação cancela o envio e dispara `OpsAlertService` em vez de degradar.
- `internalReplyPlan` passa em `ToolArgs` ao lado de `message` para
  tracing e consumo futuro de um LLM writer real, sem vazar para o
  cliente.

**Regression coverage:** `commercial-decision-orchestrator.customer-safe.spec.ts`
com **17 testes passando**, incluindo um sweep exaustivo afirmando que
**nenhum dos 10 conceitos** consegue produzir mensagem reprovada pelo guard.

**Como Daniel valida:**

```sh
$ cd backend && npx jest --testPathPatterns=customer-safe --no-coverage
# Tests: 17 passed, 17 total
```

**Cadeia de arquivos:**
- `backend/src/kloel/commercial-decision-orchestrator.service.ts` (refatorado)
- `backend/src/kloel/commercial-decision-orchestrator.customer-safe.spec.ts` (novo)
- `backend/src/kloel/unified-agent-actions-messaging.service.ts` (guarda no boundary)
- `backend/src/kloel/unified-agent.types.ts` (campo `internalReplyPlan` em ToolArgs)

### 2.4 — Wizard config sem influência (parcial)

**Antes:** `commercial-decision-orchestrator.service.ts` carregava
`channelSetup` mas só usava `selectedProductIds.length` para o texto cosmético
do replyDraft. `mind.resolveProductOffer(workspaceId, 'new_lead', concept,
priceBand)` era chamado sem `channel` e sem `allowedProductIds`.
Agressividade configurada no wizard era ignorada.

**Depois (parcial):**

- `mind.resolveProductOffer` aceita `channelConstraint = {channel,
  allowedProductIds}` (mind.service.ts:288 + resolvers:100).
- Quando `channelSetup` existe mas `selectedProductIds.length === 0`, o
  orquestrador **pula** a action de product_offer e registra
  `cold_start_no_products` no trace. Produto fora da lista
  configurada não pode ser ofertado.
- Teto absoluto de agressividade: se a config do canal define `normal`
  ou `baixa`, e o cérebro escolhe `alta/agressiva`, a escolha cai para
  o teto. Override registrado em `aggressiveness_ceiling_applied` no trace.
- Tom configurado no wizard tem precedência sobre o tom inferido — em
  `internalReplyPlan.tone` e no `composeCustomerMessage`.

**Não fechado nesta sessão:**

- Mapeamento estratégia → produto-ID específico (cérebro ainda retorna
  rótulo `top_seller`/`upsell`/etc, não um ID específico).
- Consulta do arsenal para escolha de formato (`supportedFormats(channel)`
  já filtra capability mas não consulta arsenal real do workspace).
- Limite diário de envio no transporte.
- Follow-up enabled/disabled no agendador.

**Como Daniel valida:**

```sh
$ cd backend && npx jest --testPathPatterns="commercial-decision-orchestrator" --no-coverage
# Tests: 19 passed, 19 total
```

**Cadeia de arquivos:**
- `backend/src/kloel/commercial-decision-orchestrator.service.ts`
- `backend/src/kloel/mind.service.ts`
- `backend/src/kloel/mind-commercial-decision-resolvers.ts`
- `backend/src/kloel/commercial-decision-orchestrator.service.spec.ts`

---

## 3 — Conferência Obsidian + lacunas

**Estado:** PRONTO como entrega base.

**Não fiz tour completo do Obsidian Vault** porque a conferência exige
inspeção visual interativa que não é eficiente do CLI. Em vez disso,
fiz a auditoria via `grep`/`find` no repositório espelhado e registrei
12 lacunas estruturais em `docs/audit/lacunas-identificadas.md`:

- **L1** — Wizard de 4 passos órfão (crítico, bloqueia P1.1+P1.2 visíveis).
- **L2** — `commercial-decision-orchestrator` enviava `replyDraft` como
  mensagem (RESOLVIDA em `466b97b90`).
- **L3** — `resolveProductOffer` ignorava `selectedProductIds`
  (PARCIALMENTE RESOLVIDA em `eff3a557a`).
- **L4** — CIA legado (`pickVariant(globalStrategy)`) ainda decide em
  produção via `worker/processors/__companions__/autopilot-core.companion.ts`.
- **L5** — Pipeline determinístico atrás de flag de ambiente, não estado
  per-workspace. Faltam models `PipelineState` e `DecisionShadow`.
- **L6** — Repertório por canal não declarado. Falta
  `backend/src/kloel/channel-repertoire.config.ts`. Crenças não
  filtradas por canal de 1ª ordem.
- **L7** — Outcome tracking sem amarração `outcomeKey` ↔ resultado real.
  Lift não mensurado.
- **L8** — PULSE em `NOT_CERTIFIED`/`NOT_READY`. Triagem de rotas
  órfãs pendente.
- **L9** — Apple login: validação programática nunca executada. Falta
  script `scripts/auth/apple-client-secret-probe.mjs` + evidência em
  `docs/evidence/apple-login.md`.
- **L10** — Brain Capability Registry sem consumidor real. Endpoint
  `POST /brain/decide` existe sem caller frontend.
- **L11** — TikTok: paridade não declarada honestamente. Falta modo
  `escuta` / `vendedor` / `bloqueado`.
- **L12** — Email: garantia de footer de unsubscribe em todo outbound
  comercial pendente de auditoria.

Cada lacuna documentada com Status, Onde vive, Consequência, Próximo passo.

---

## 4 — Camadas do organismo

**Estado:** NÃO MAPEADO formalmente nesta sessão. As lacunas L4 (cérebro
único) e L10 (capability registry) tocam diretamente nas camadas Política
e Linguagem do organismo descrito no prompt; a entrega completa do
mapeamento exige conferência Obsidian assistida + leitura cruzada que
não foi feita.

**Próximo passo:** seção dedicada em `FINAL_DELIVERY.md` após resolver L1
e L4.

---

## 5 — Marketing omnichannel

**Estado:** NÃO PRONTO em produção.

Os 5 tabs (`WhatsAppMarketingTab`, `InstagramMarketingTab`,
`FacebookMarketingTab`, `TikTokMarketingTab`, `EmailMarketingTab`)
mostram dashboards operacionais quando Meta/provider está conectado.
**Não há fluxo de 4 passos rendered hoje** — ver L1. O backend tem
infraestrutura de `ChannelSetupService` + endpoint
`/marketing/channel-setup` que persiste produtos/arsenal/config por
canal, mas a UI que consome está orfã.

**Inbound:** funcionando via WAHA + Meta Cloud (canais WhatsApp,
Instagram, Facebook). Eventos chegam em `whatsapp/inbound-processor` e
fluem para `unified-agent`. Quando flag `KLOEL_DETERMINISTIC_PIPELINE` está
ON, passam pelo `commercial-decision-orchestrator` (agora com guarda
customer-safe).

**Outbound:** envio via providers reais. Defesa em camadas contra envio
de instrução interna (commit `466b97b90`).

**Decisão / Regra:** orquestrador determinístico funciona com restrições
de canal (commit `eff3a557a`). Falta repertório por canal (L6).

**Outcome / Baseline / Lift:** não implementado (L7).

---

## 6 — Wizard como portão real

**Estado:** NÃO PRONTO.

Wizard `OfficialMarketingChannelPage` existe com persistência via API
(`/marketing/channel-setup`), suporta 4 passos (Conexão, Produtos,
Arsenal, Configuração), tem normalização de setup, valida que
`currentStep` está em [0,3]. **Mas não é renderizado por nenhuma rota.**

**Próximo passo:** ver L1.

---

## 7 — Pipeline determinístico em produção

**Estado:** NÃO PRONTO.

A flag `KLOEL_DETERMINISTIC_PIPELINE` está implementada como variável de
ambiente global. Falta arquitetura per-workspace descrita no prompt
(`legacy` → `shadow` → `active` com auto-fallback). Métricas e relatório
de lift não existem.

**Próximo passo:** ver L5.

---

## 8 — Diferenciação por canal

**Estado:** PARCIAL.

`supportedFormats(channel)` no orquestrador já filtra formatos
disponíveis por canal (email não tem audio, etc). `mind.resolveProductOffer`
agora aceita `channel`. **Falta:** arquivo de repertório declarando ações
válidas, candidatos diferentes por canal apresentados ao cérebro, prior
global da Kloel para cold start. Ver L6.

---

## 9 — Cérebro único

**Estado:** NÃO PRONTO.

`worker/processors/__companions__/autopilot-core.companion.ts` ainda
consome `globalStrategy` de `cia/global-learning.ts` para selecionar
variantes em fluxos `payment_recovery` e `followup`. ADR de
decomissionamento pendente. Ver L4.

`/brain/decide` endpoint existe; chat oficial não consome. Ver L10.

---

## 10 — Apple

**Estado:** NÃO VALIDADO — bloqueio externo provável.

Script de validação programática (`scripts/auth/apple-client-secret-probe.mjs`)
não foi escrito nesta sessão para evitar invocar Apple sem confirmar acesso
à `APPLE_PRIVATE_KEY_P8`. Quando Daniel confirmar acesso à chave, o script
deve fazer POST com `code=INVALID` e esperar `invalid_grant`. Resposta
proibida: `invalid_client` (= JWT mal formado).

**Próximo passo:** ver L9.

---

## 11 — PULSE

**Estado:** NÃO PRONTO.

Não foi auditado nesta sessão. Último report em `artifacts/pulse/`
indica `NOT_CERTIFIED` / `humanReplacementStatus: NOT_READY` com 320
critical/high breaks. Triagem de rotas órfãs é o próximo passo
(ver L8).

---

## 12 — Outcomes

**Estado:** NÃO PRONTO.

Sem tabela `DecisionOutcome` com `outcomeKey` único. Sem job de
cálculo de lift. Nenhum dos 10 outcomes do prompt fechado em
produção. Ver L7.

---

## 13 — Função objetivo econômica

**Estado:** NÃO PRONTO.

Decisões do orquestrador hoje retornam apenas
`{action, confidence, fallback}`. Não há referência ao ponto da
hierarquia (compliance > margem > conversão > retenção > UX > exploração)
que foi decisivo na escolha. Trace estruturado precisa carregar essa
informação.

**Próximo passo:** estender `decisions.*` para incluir
`hierarchyJustification: 'compliance' | 'margin' | 'conversion' | ...`.

---

## 14 — Limitações externas legítimas

- **Apple .p8** — provavelmente não acessível na máquina onde a IA roda;
  Daniel precisa colocar o arquivo em path conhecido OU rotar nova chave
  no Apple Developer Console.
- **TikTok app review** — depende do estado do app no Console TikTok.
- **Stripe live keys / PIX capability** — vide `CLAUDE.md` seção STRIPE
  PAYMENT BASELINE.
- **Meta App Dashboard** — domínios autorizados / `config_id` por canal
  precisam estar configurados.

Nenhum desses foi tentado nesta sessão; documentados como bloqueio
condicional, não como limitação imposta agora.

---

## 15 — Verificação anti-órfão

| Service novo / mudança | Consumidor real partindo de evento real |
| --- | --- |
| `composeCustomerMessage` | `commercial-decision-orchestrator.orchestrateInbound` (inbound real do WhatsApp/Instagram/Facebook) |
| `assertCustomerSafe` (orchestrator) | Mesmo path acima, antes de enfileirar `send_message` |
| `assertCustomerSafe` (transport boundary) | `UnifiedAgentActionsMessagingService.actionSendMessage` — todo outbound do unified agent |
| `internalReplyPlan` em `ToolArgs` | Propagado via `PredecidedAction` em `unified-agent-predecided-actions.part.ts` |
| `mind.resolveProductOffer` com `channelConstraint` | Orquestrador chama com `{channel, allowedProductIds}` quando `channelSetup` existe |

Nenhum endpoint REST novo, nenhum service de inspeção sem caller real
foi criado nesta sessão.

---

## 16 — Declaração honesta final

| Seção | Declaração |
| --- | --- |
| Parte 1.1 — número "1" | **PRONTO em código órfão**. Visível a Daniel só depois de L1 fechada. |
| Parte 1.2 — Meta callback ao step 2 | **NÃO PRONTO**. Requer L1. |
| Parte 1.3 — replyDraft como mensagem | **PRONTO E TESTADO** (17 testes). |
| Parte 1.4 — wizard config atravessa | **PRONTO PARCIAL**. Channel/products/aggressiveness/tone OK. Arsenal-format/limit/follow-up ainda não. |
| Parte 3 — Obsidian + lacunas | **PRONTO** (`docs/audit/lacunas-identificadas.md`). |
| Parte 4 — Wizard como portão real | **NÃO PRONTO**. Requer L1. |
| Parte 5 — Pipeline shadow/active per-workspace | **NÃO PRONTO**. Requer L5. |
| Parte 6 — Repertório por canal | **PARCIAL**. Requer L6. |
| Parte 7 — Cérebro único | **NÃO PRONTO**. Requer L4 + L10. |
| Parte 8.1 — Apple programmatic | **BLOQUEIO EXTERNO documentado**. Requer L9. |
| Parte 8.2 — Meta por canal | **NÃO PRONTO**. Requer L1. |
| Parte 8.3 — TikTok honesto | **NÃO PRONTO**. Requer L11. |
| Parte 8.4 — Email com unsubscribe | **PARCIAL**. Util existe; auditoria de uso pendente (L12). |
| Parte 9 — PULSE READY | **NÃO PRONTO**. Requer L8. |
| Parte 10 — Hierarquia econômica no trace | **NÃO PRONTO**. |
| Parte 11 — Outcomes + lift | **NÃO PRONTO**. Requer L7. |

A frase governante do prompt — "Toda ação comercial nasce de percepção
real, consulta memória..." — é parcialmente verdadeira hoje quando a flag
do pipeline está ON: percepção, memória, conceitos, política e ação
estão wired. Mas **outcome e aprendizado** não fecham o ciclo, **lift não
é mensurado**, e o **wizard não é portão real** porque está órfão. A
afirmação completa do prompt **não é fato verificável hoje**.

O que pode ser verdade ao fim do próximo bloco de trabalho, na ordem
de prioridade da REGRA DE TASK SELECTION do CLAUDE.md:

1. Wire `OfficialMarketingChannelPage` em `/marketing/{channel}` → L1
   resolve, Parts 1.1 e 1.2 ficam visíveis a Daniel, Part 4 vira portão real.
2. Pipeline state per-workspace + endpoint admin + relatório de lift → L5.
3. ADR de decomissionamento do CIA legado + migração de `pickVariant`
   para orquestrador → L4 + L10.
4. Apple programmatic validation → L9.
5. PULSE triagem → L8.

---

## Como verificar isto

```sh
# 1. Commits desta sessão
git log --oneline f0e72c518..HEAD

# 2. Testes da entrega P1.3 + P1.4
cd backend && npx jest --testPathPatterns="commercial-decision-orchestrator|mind\.service" --no-coverage
# Esperado: 38 testes passando

# 3. Lacunas
cat docs/audit/lacunas-identificadas.md | head -30

# 4. Estado real do wizard órfão
grep -rn "UniversalChannelWizard\|OfficialMarketingChannelPage" frontend/src/app | head
# Esperado: zero matches (= orfandade confirmada)
```
