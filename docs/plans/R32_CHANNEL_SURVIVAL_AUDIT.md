# R32 Channel Survival Audit — Camada XXVIII Autopsy

> **Data**: 2026-05-14
> **Escopo**: auditoria cognitiva-investigativa, zero toque em código.
> **Objetivo**: inventariar o que existe, medir o gap contra a Camada XXVIII completa do KLOEL_COGNITIVE_ORGANISM_PLAN, identificar evento canônico de degradação, propor plano de migração e recomendações priorizadas.

---

## (a) O Que Existe Hoje — Inventário Completo

### Módulo `kloel/channel/` (UTP-CHANNEL-001..008)

| UTP | Serviço | Arquivo | O que faz |
|-----|---------|---------|-----------|
| 001 | `ConcentrationDetector` | `concentration.detector.ts` | Mede concentração de receita por canal via `commerce.payment.approved`. Calcula Herfindahl-Hirschman Index. Classifica `low`/`moderate`/`high`/`critical`. |
| 002 | `HealthMonitor` | `health.monitor.ts` | Avalia saúde de canal: delivery rate, engagement rate, error rate, dias de inatividade. Score de degradação 0-1, status `healthy`/`degraded`/`unstable`/`down`. Janela de 14 dias. |
| 003 | `BanRiskDetector` | `ban-risk.detector.ts` | Detecta risco de banimento: policy violations (+0.25), complaints (+0.15), rate limits (+0.1), burst detection (>100/hora), sender spike (>50 senders). Emite `commerce.post_sale.churn_risk_detected` com `riskType: 'channel_ban'` para risco high/imminent. |
| 004 | `PolicyChangeWatcher` | `policy-change.watcher.ts` | Avalia severidade de mudança de política por keywords: ban/prohibit/shutdown → existential (100%), restrict/limit/deprecate → major (50%), change/update/modify → minor (15%). Recomenda pausa de autopilot se há eventos de automação. |
| 005 | `ContingencyPlanBuilder` | `contingency-plan.builder.ts` | Constrói plano de contingência: estima audiência, ranqueia canais alternativos, estima % migrável, constrói passos. Readiness `ready` se ≥2 canais alvo + >30% migrável. |
| 006 | `OwnedAudiencePusher` | `owned-audience.pusher.ts` | Rastreia migração de audiência de canal A → canal próprio. Conta contatos migrados, progresso %. Observacional (não executa push). |
| 007 | `MigrationOrchestrator` | `migration.orchestrator.ts` | Planeja migração: calcula audiência, steps (2/3/5 conforme tamanho), dias estimados via daily capacity por canal. Risco `low` se >10 eventos de migração prévios. |
| 008 | `DiversificationRecommender` | `diversification.recommender.ts` | Recomenda canais não ativos. Urgência `critical`/`high`/`medium`/`low`/`none`. Estima 7 dias por canal novo. |

### Módulo `kloel/channel-policy/` (política terminal por canal)

| Componente | Arquivo | O que faz |
|------------|---------|-----------|
| `ChannelPolicyRegistry` | `channel-policy.registry.ts` | Registro built-in de políticas terminais por canal (whatsapp, web, email, ads, post_sale). Aplica default valence + truthMode quando emitter omite. |
| `ChannelPolicyModule` | `channel-policy.module.ts` | NestJS wiring, exporta `ChannelPolicyRegistry`. |

### Módulo `kloel/whatsapp-emitter/` (eventos canônicos WhatsApp)

| Serviço | Arquivo | Eventos emitidos |
|---------|---------|-----------------|
| `WhatsAppEventEmitterService` | `whatsapp-event-emitter.service.ts` | `commerce.whatsapp.message_received`, `message_read`, `message_replied`, `handoff_to_human`, `conversation_resumed`, `session_lifecycle` (suporta `event: 'banned'`), `commerce.lead.went_silent` |

### Módulo `kloel/channel-repertoire.config.ts` (capacidades por canal)

Define 6 canais (`whatsapp`, `instagram`, `messenger`, `facebook`, `tiktok`, `email`) com ações, tons, formatos, regras de proactive outbound. Funções `repertoireFor()`, `canChannelDoAction()`, `allowedFormatsFor()`, `allowedTonesFor()`.

### Módulo `backend/src/whatsapp/whatsapp.module.ts` (WhatsApp operacional)

Serviços relevantes para sobrevivência:
- `WhatsAppWatchdogService` — monitora saúde da sessão
- `WhatsAppWatchdogRecoveryService` — tenta recuperar sessão caída
- `WhatsAppWatchdogSessionService` — gerencia estado da sessão
- `WhatsAppCatchupService` — recupera mensagens perdidas
- `WhatsAppProviderRegistry` — registra providers WhatsApp (Waha, API)
- `WhatsAppEventEmitterModule` — emite eventos canônicos no spine

### Testes existentes

- `channel/channel.spec.ts` — 301 linhas, cobre ConcentrationDetector, HealthMonitor, BanRiskDetector, PolicyChangeWatcher, ContingencyPlanBuilder, DiversificationRecommender. 7 describes, ~17 test cases. MigrationOrchestrator e OwnedAudiencePusher sem cobertura de teste.
- `channel-policy/channel-policy.registry.spec.ts` — testa registro e aplicação de políticas
- `channel-repertoire.config.spec.ts` — testa o catálogo de canais

---

## (b) Gap entre o Que Existe e a Camada XXVIII Completa

### O que a Camada XXVIII exige (do KLOEL_COGNITIVE_ORGANISM_PLAN.md:355-358)

> **Propósito**: não morrer quando canal cai.
> **Capacidades**: detector de concentração, monitor de saúde do canal, detector de risco de banimento, observador de mudança de política, builder de plano de contingência, pusher de audiência própria antes da crise, orquestrador de migração sob crise, recomendador de diversificação.

### Status por capacidade

| Capacidade | Existe? | Nível | Gap principal |
|------------|---------|-------|---------------|
| detector de concentração | Sim | N1 (estrutural) | Só olha receita (`commerce.payment.approved`). Não detecta concentração por volume de mensagens, contatos ou dependência operacional. |
| monitor de saúde do canal | Sim | N1 (estrutural) | Detecção via string matching frágil (`e.eventName.includes('sent')`). Sem persistência de série temporal. Sem thresholds por tipo de negócio. |
| detector de risco de banimento | Sim | N2 (funcional) | Emite no spine, mas não tem integração com WhatsApp Watchdog. Burst threshold fixo (100/hora). Sem histórico de risco. |
| observador de mudança de política | Sim | N1 (estrutural) | Keyword-based apenas. Sem feed real de política da Meta/WhatsApp. Severidade depende de descrição textual humana. |
| builder de plano de contingência | Sim | N1 (estrutural) | Ranking de canais alternativos é estático (sempre mesma ordem). Não verifica disponibilidade real do canal no workspace. |
| pusher de audiência própria | Sim | N0.5 (observacional) | Só observa o que já migrou. Não executa push. Sem integração com exportação real de contatos. |
| orquestrador de migração sob crise | Sim | N1 (estrutural) | Planeja, não executa. Daily capacity hardcoded (email=5000, whatsapp=200). Sem integração com transportes reais. |
| recomendador de diversificação | Sim | N1 (estrutural) | Recomenda canais não ativos sem verificar se são configuráveis. Sem análise de custo/benefício. |

### Gaps transversais (bloqueiam N3+)

1. **Ausência de scheduler/background worker** — nenhum detector roda automaticamente. Tudo é stateless, chamado sob demanda. Para ser N3+, precisa de avaliação periódica (cron/BullMQ) em todos os workspaces ativos.

2. **Ausência de persistência de estado** — não há tabela no Prisma para `ChannelHealth`, `BanRisk`, `Concentration`. Cada chamada recalcula do zero. Impossível ver tendência ou histórico.

3. **Ausência de emissão de eventos canônicos de canal** — PCI.1 não define domínio `commerce.channel.*`. Os detectores emitem no spine emprestado (`commerce.post_sale.churn_risk_detected` para ban risk). Falta taxonomia própria:
   - `commerce.channel.concentration_critical`
   - `commerce.channel.health_degraded`
   - `commerce.channel.ban_risk_escalated`
   - `commerce.channel.migration_initiated`
   - `commerce.channel.policy_change_detected`

4. **Ausência de superfície de operador** — não há controller/API para expor health/risk/concentration ao dashboard. Operador não vê estado dos canais.

5. **Desconexão WhatsApp Watchdog ↔ Channel Survival** — `WhatsAppWatchdogService`, `WhatsAppWatchdogRecoveryService`, `WhatsAppWatchdogSessionService` estão no módulo `whatsapp/` e não consomem nem alimentam os detectores de `kloel/channel/`. O `session_lifecycle` com `event: 'banned'` é emitido pelo emitter mas não é consumido pelo `BanRiskDetector` de forma diferenciada.

6. **ChannelKind fragmentado** — três definições de tipo de canal coexistem sem unificação:
   - `ChannelKind` em `channel/types.ts` (whatsapp, email, instagram, messenger, tiktok, sms, push, owned_site)
   - `ChannelKey` em `channel-repertoire.config.ts` (whatsapp, instagram, messenger, facebook, tiktok, email)
   - `ChannelName` em `channel-transport.types.ts` (whatsapp, instagram, messenger, tiktok, email)
   - SMS, push, owned_site existem no tipo mas não têm repertoire nem transport.

7. **Sem medição de baseline R32** — R32 exige "tempo de retomada ≥50% mais rápido vs baseline". Não há mecanismo medindo tempo de detecção → mitigação → recuperação. Sem baseline, impossível provar o R.

8. **Sem mitigação automática** — detectores identificam problemas mas não agem. Para N3+, o sistema deveria:
   - Reduzir rate de envio quando risco de ban sobe
   - Pausar campanhas automáticas quando política muda
   - Trocar para provider backup quando health degrada
   - Iniciar migração preventiva quando concentração atinge critical

9. **Canais não-WhatsApp sem cobertura de eventos** — email, instagram, messenger, tiktok não têm emitters equivalentes ao `WhatsAppEventEmitterService`. HealthMonitor tenta detectar eventos desses canais mas os eventos não são emitidos.

---

## (c) Evento Canônico do PCI que Sinaliza Degradação de Canal

### Evento primário: `commerce.whatsapp.session_lifecycle`

Definido em PCI.1 como parte do domínio `commerce.whatsapp.*`. O `WhatsAppEventEmitterService.sessionLifecycle()` (linha 192 de `whatsapp-event-emitter.service.ts`) emite com os subtipos:
- `event: 'qr'` — sessão iniciando
- `event: 'connected'` — sessão ativa
- `event: 'disconnected'` — sessão caiu (degradação)
- `event: 'banned'` — **evento canônico de banimento**

Payload inclui `phoneNumber` e `reason`.

### Eventos secundários de degradação (existentes mas dispersos)

| Evento | Origem | Significado para sobrevivência |
|--------|--------|-------------------------------|
| `commerce.whatsapp.session_lifecycle` com `event: 'disconnected'` | `WhatsAppEventEmitterService` | Canal offline. Watchdog deve entrar em recovery. |
| `commerce.whatsapp.session_lifecycle` com `event: 'banned'` | `WhatsAppEventEmitterService` | **Banimento confirmado**. Triggers contingência máxima. |
| `commerce.post_sale.churn_risk_detected` com `riskType: 'channel_ban'` | `BanRiskDetector` | Risco elevado de ban (reuso indevido do evento post_sale). |
| `commerce.campaign.performance_drop_detected` | PCI.1 campanhas | Queda de performance pode sinalizar shadow-ban. |

### Eventos que DEVERIAM existir mas não existem (gap PCI)

| Evento proposto | Significado |
|-----------------|-------------|
| `commerce.channel.health_degraded` | HealthMonitor detecta status `degraded`/`unstable`/`down` |
| `commerce.channel.ban_risk_escalated` | BanRiskDetector sobe de `moderate` → `high` ou `high` → `imminent` |
| `commerce.channel.concentration_critical` | ConcentrationDetector atinge `critical` |
| `commerce.channel.migration_initiated` | MigrationOrchestrator inicia migração real |
| `commerce.channel.policy_change_detected` | PolicyChangeWatcher detecta mudança `major`/`existential` |
| `commerce.channel.diversification_recommended` | DiversificationRecommender emite recomendação |

**Recomendação**: expandir PCI.1 com domínio `commerce.channel.*` antes de promover Camada XXVIII a N3+.

---

## (d) Cenários Concretos

### Cenário 1: WhatsApp Ban

**Trigger**: Meta detecta violação de política (spam, conteúdo proibido, múltiplos reports).

**Fluxo atual (o que funciona)**:
1. `WhatsAppEventEmitterService.emitSessionLifecycle({ event: 'banned', reason: '...' })` emite no spine.
2. `WhatsAppWatchdogService` detecta sessão caída.
3. `WhatsAppWatchdogRecoveryService` tenta reconectar (provavelmente falha em ban real).

**Fluxo atual (o que NÃO funciona)**:
4. `BanRiskDetector` NÃO consome o evento `session_lifecycle` com `banned` — só olha `policy_violation`, `complaint`, `rate_limit`.
5. `ContingencyPlanBuilder` NÃO é acionado automaticamente.
6. `MigrationOrchestrator` NÃO inicia migração real — só planeja.
7. Operador NÃO recebe alerta no dashboard.
8. Campanhas de autopilot NÃO são pausadas automaticamente.
9. Nenhuma notificação ao workspace owner.

**Resultado**: silêncio operacional. O Kloel sabe que o canal morreu (evento no spine) mas não reage.

### Cenário 2: Meta Policy Change

**Trigger**: Meta anuncia mudança nas políticas de WhatsApp Business API (ex: restrição de templates, novas regras de opt-in, depreciação de feature).

**Fluxo atual (o que funciona)**:
1. Humano lê a mudança e chama `PolicyChangeWatcher.assess(description='...')`.
2. `PolicyChangeWatcher` classifica severidade por keywords na descrição.
3. Se `requiresAction=true` e há eventos de autopilot/campanha, recomenda pausa.

**Fluxo atual (o que NÃO funciona)**:
4. Não há feed automático de mudanças da Meta — depende de input humano.
5. A recomendação de pausa de autopilot não é executada automaticamente.
6. Não há verificação de impacto real nas features do workspace.
7. `ChannelRepertoire` não é atualizado dinamicamente (ex: se Meta deprecia `send_template`, o repertoire continua listando).
8. Sem notificação ao workspace owner.

**Resultado**: detecção manual, sem ação automática.

### Cenário 3: Conta Bloqueada (Account-Level Block)

**Trigger**: WhatsApp bloqueia o número por suspeita de atividade incomum, sem banimento permanente.

**Fluxo atual (o que funciona)**:
1. `WhatsAppWatchdogService` detecta desconexão.
2. `WhatsAppWatchdogRecoveryService` tenta reconectar (pode funcionar para block temporário).
3. `WhatsAppCatchupService` pode recuperar mensagens perdidas após reconexão.

**Fluxo atual (o que NÃO funciona)**:
4. `HealthMonitor` não é acionado — não consome eventos de watchdog.
5. `BanRiskDetector` pode detectar burst/sender spike mas não conecta ao estado da sessão.
6. Sem throttling adaptativo durante o bloqueio (continua tentando enviar).
7. Sem switch para provider backup (WhatsAppApiProvider vs WahaProvider).

**Resultado**: recuperação reativa pelo watchdog, sem coordenação com camada cognitiva.

---

## (e) Plano de Migração Assistida Quando Canal Cai

### O que existe

- `ContingencyPlanBuilder.build()` produz `ContingencyPlan` com `targetChannels`, `steps`, `estimatedMigrationDays`, `migrationReadiness`.
- `MigrationOrchestrator.plan()` produz `MigrationPlan` com `phasedSteps`, `estimatedDays`, `riskLevel`.
- `OwnedAudiencePusher.assess()` mede progresso de migração.

### O que falta para migração assistida real

| Fase | Status | Gap |
|------|--------|-----|
| **Fase 0 — Detecção** | Parcial | `session_lifecycle` com `banned` existe, mas não dispara o pipeline. |
| **Fase 1 — Avaliação de impacto** | Inexistente | Nenhum componente calcula: quantos leads ativos, quantas conversas em andamento, receita em risco. |
| **Fase 2 — Seleção de canais alvo** | Parcial | `ContingencyPlanBuilder` ranqueia alternativas mas não verifica disponibilidade real (ex: workspace tem email configurado? tem saldo de SMS?). |
| **Fase 3 — Preparação de audiência** | Inexistente | `OwnedAudiencePusher` é só observador. Não há exportação de lista de contatos com dados de contato alternativos (email, telefone). |
| **Fase 4 — Execução faseada** | Inexistente | `MigrationOrchestrator` planeja fases mas não as executa. Não há dispatcher que envia mensagens pelos canais alternativos. |
| **Fase 5 — Monitoramento** | Inexistente | Não há tracking de: quantos migraram, quantos engajaram no novo canal, taxa de perda de audiência. |
| **Fase 6 — Notificação ao operador** | Inexistente | Nenhum canal de alerta: dashboard, email, notificação push. |
| **Fase 7 — Pós-morte** | Inexistente | Após migração, não há: lições aprendidas, atualização de diversification recommendation, ajuste de thresholds para early warning. |

### Fluxo desejado de migração assistida

```
session_lifecycle(banned)
  → BanRiskDetector confirma ban (consome evento)
  → Avaliador de impacto calcula audiência afetada + receita em risco
  → ContingencyPlanBuilder gera plano com canais disponíveis reais
  → Notificador alerta operador: "WhatsApp caiu. Plano de migração pronto. Audiência: 2.3k contatos. Canais: email, SMS. Iniciar?"
  → [aprovação humana ou autônoma se Camada XIII Delegation permite]
  → MigrationOrchestrator executa fases:
      Fase 1 (20%): email para contatos com email conhecido
      Fase 2 (30%): SMS para contatos com telefone
      Fase 3 (50%): owned_site + push
  → HealthMonitor acompanha engajamento nos novos canais
  → DiversificationRecommender atualiza recomendação pós-crise
  → Evento commerce.channel.migration_completed emitido no spine
```

---

## (f) 5 Recomendações Priorizadas para Subir R32 de N1 para N3+

### Recomendação 1 — Wire detectors into background scheduler + persist state

**O que**: Criar `ChannelSurvivalScheduler` (cron/BullMQ) que periodicamente (ex: a cada 15min) chama todos os detectores para cada workspace ativo e persiste resultados em tabelas Prisma (`ChannelHealthRecord`, `BanRiskRecord`, `ConcentrationRecord`).

**Por que primeiro**: Sem execução automática e persistência, nenhum detector tem efeito real. É o pré-requisito para todas as outras recomendações.

**Arquivos a criar/tocar**: novo scheduler em `kloel/channel/`, migration Prisma aditiva, testes de integração.

**Critério de aceitação**: `select * from "ChannelHealthRecord"` retorna registros com timestamp para cada workspace ativo a cada 15min.

---

### Recomendação 2 — Unificar ChannelKind + expandir PCI.1 com domínio `commerce.channel.*`

**O que**: Consolidar `ChannelKind`/`ChannelKey`/`ChannelName` em um único tipo canônico. Adicionar ao PCI.1 o domínio `commerce.channel.*` com eventos: `health_degraded`, `ban_risk_escalated`, `concentration_critical`, `migration_initiated`, `migration_completed`, `policy_change_detected`, `diversification_recommended`. Fazer detectores emitirem esses eventos no spine.

**Por que segundo**: Sem taxonomia canônica, a Camada III (Goal Field) não detecta tensões de canal como tensões comerciais. Sem unificação de tipos, código duplicado e divergência crescem.

**Arquivos a criar/tocar**: `channel/types.ts` (unificar), `docs/plans/KLOEL_COGNITIVE_ORGANISM_PLAN.md` (adicionar domínio ao PCI.1 — REQUER APROVAÇÃO HUMANA, é governance), atualizar detectores para emitir eventos novos.

**Critério de aceitação**: `grep -r "commerce.channel." backend/src/kloel/` retorna emissões reais de todos os detectores no spine.

---

### Recomendação 3 — Conectar WhatsApp Watchdog ao pipeline Channel Survival

**O que**: `WhatsAppWatchdogService` emitir `session_lifecycle` no spine em toda transição. `BanRiskDetector` consumir `session_lifecycle` com `banned`/`disconnected` como sinal de risco máximo. `HealthMonitor` consumir métricas do Watchdog (reconnect attempts, session uptime). Emitir `commerce.channel.health_degraded` quando watchdog detecta padrão de falha.

**Por que terceiro**: Watchdog já existe e já detecta saúde de sessão. É a fonte de verdade operacional mais próxima do WhatsApp real. Sem essa conexão, os detectores operam no vácuo.

**Arquivos a criar/tocar**: `WhatsAppWatchdogService` (adicionar emissão spine), `BanRiskDetector` (consumir `session_lifecycle`), `HealthMonitor` (consumir métricas de watchdog), testes.

**Critério de aceitação**: Simular `session_lifecycle { event: 'banned' }` → `BanRiskDetector.assess()` retorna `riskLevel: 'imminent'`.

---

### Recomendação 4 — Implementar mitigação automática de Nível 1

**O que**: Três ações automáticas de baixo risco com feature flag:

1. **Rate limiting adaptativo**: `WhatsappSendRateGuardService` consulta `BanRiskDetector.riskLevel` antes de autorizar envio. Se `imminent`, reduz throughput em 80%. Se `high`, reduz 50%.
2. **Campaign pause**: `PolicyChangeWatcher.requiresAction=true` → pausa campanhas ativas no workspace (via `CampaignEmitter` ou equivalente).
3. **Provider fallback**: `WhatsAppProviderRegistry` tenta provider alternativo quando `HealthMonitor.status` atinge `down`.

**Por que quarto**: Após detecção funcionando (Rec 1+3), a ação fecha o loop. Sem ação, detecção é log. Baixo risco porque tudo tem feature flag.

**Arquivos a criar/tocar**: `WhatsappSendRateGuardService` (adicionar consulta a BanRisk), `PolicyChangeWatcher` (adicionar ação de pausa), `WhatsAppProviderRegistry` (adicionar health-aware routing), testes.

**Critério de aceitação**: Teste E2E: injetar eventos de policy violation → `BanRiskDetector` sobe para `high` → `WhatsappSendRateGuardService` recusa 50% dos envios.

---

### Recomendação 5 — Dashboard de saúde de canal para operadores

**O que**: Criar `ChannelSurvivalController` com endpoints REST:
- `GET /kloel/channel/health/:workspaceId` — health status de todos os canais
- `GET /kloel/channel/concentration/:workspaceId` — concentração atual + tendência
- `GET /kloel/channel/ban-risk/:workspaceId` — risco de ban + fatores
- `GET /kloel/channel/contingency/:workspaceId` — plano de contingência atual
- `POST /kloel/channel/migration/:workspaceId/initiate` — dispara migração assistida

Frontend NÃO muda (restrição do plano). APIs são headless, consumíveis pelo dashboard existente ou via CLI/postman para operadores.

**Por que quinto**: Visibilidade fecha o ciclo B0.1 (inteligência percebida). Operador precisa ver que o Kloel está monitorando canais mesmo sem ação automática completa. Prepara terreno para Camada XIII (Delegation) autorizar ações autônomas depois.

**Arquivos a criar/tocar**: `channel-survival.controller.ts` + DTOs + testes de contrato.

**Critério de aceitação**: `curl localhost:3000/kloel/channel/health/wks_001` retorna JSON com health de whatsapp, email, instagram, etc.

---

## Resumo da Classificação

| Dimensão | Nível Atual | Alvo Imediato (pós-5-recs) | Alvo N3+ |
|----------|-------------|---------------------------|----------|
| Detecção | N1 (código existe, não roda) | N2 (roda automático, persiste) | N3 (predição + early warning) |
| Emissão de eventos | N1 (eventos reusados de outros domínios) | N2 (domínio `commerce.channel.*` canônico) | N3 (Goal Field detecta tensões de canal) |
| Integração Watchdog | N0 (desconectado) | N2 (watchdog alimenta detectores) | N3 (recovery coordenado) |
| Mitigação automática | N0 (zero ação) | N1 (rate limit adaptativo + campaign pause) | N3 (migração autônoma com delegação) |
| Visibilidade operador | N0 (zero endpoints) | N2 (API headless + health endpoints) | N3 (dashboard com narrativa semanal) |
| Medição R32 | N0 (sem baseline) | N1 (métrica de tempo de retomada instrumentada) | N3 (baseline estabelecida + delta ≥50%) |

---

## Riscos e Bloqueios

1. **PCI.1 modificação** — Adicionar domínio `commerce.channel.*` requer aprovação humana (Parte A do plano é imutável sem autorização). É superfície de governance.
2. **Prisma migration** — Persistir ChannelHealthRecord etc. requer migration aditiva. Baixo risco se for tabela nova (sem alterar schema existente).
3. **WhatsApp watchdog toque** — `whatsapp.module.ts` e `WhatsAppWatchdogService` são módulos de produção. Mudanças precisam de smoke test em staging antes de merge.
4. **Frontend restriction** — Zero toque em frontend. APIs headless são o contrato.
5. **B0.12 compliance** — Toda ação automática deve ter feature flag e rollback. "Diversificação proativa, detecção precoce, contingência ativa, migração assistida" — estamos em detecção precoce parcial, o resto é gap.

---

## Próximo Passo

1. Aprovar este audit como baseline.
2. Executar Recomendação 1 e 2 em paralelo (scheduler + unificação PCI).
3. Recomendação 3 (watchdog wiring) após 1 e 2 estáveis.
4. Recomendações 4 e 5 em paralelo após 3.
5. Medir baseline R32 (tempo de retomada) antes e depois de cada recomendação para provar delta.
