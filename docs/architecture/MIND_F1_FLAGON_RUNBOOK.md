# MIND F1 — Runbook de ativação em produção (loop de consequência do chat)

> Apêndice operacional do [`MIND_UNIFICATION_PLAN.md`](MIND_UNIFICATION_PLAN.md) §7-F1.
> Escopo: SOMENTE a ordem de flags, métricas de observação e critério de rollback da fatia F1.
> Nada aqui liga flag automaticamente — todo flip é manual, em homolog primeiro.

## Pré-condições (gate de entrada)

1. **F0 estável** em prod (dependência `F0 ──► F1` do plano): as 6 famílias `cognition.*`
   crescendo em `RAC_MindOutboxEvent`, latência p95 inalterada.
2. **Specs de paridade verdes** no commit a ser deployado:
   `backend/src/kloel/mind-f1-parity.harness.spec.ts` (harness flag-ON),
   `real-reward-signal.wiring.spec.ts`, `decision-sweep.scheduler.spec.ts`,
   `decision-ledger-dualwrite.spec.ts`, `decision-outcome.close-open-chat-replies.spec.ts`.
3. `KLOEL_COMMERCE_DECISION_LINK` já ligada (vitória por venda) — **manter**; F1 compõe com ela.

## Ordem das flags (nunca inverter)

### Passo 1 — `KLOEL_DECISION_SWEEP_ENABLED=true` (D+0)

O cron horário (`DecisionSweepScheduler`) passa a fechar decisões abertas há >24h como
`inbound.silent_24h` (LOSS, `wonVsBaseline=false`) e alimenta o bandit com `outcome=0`.

- **Esperado no 1º dia**: pico de losses — o backlog histórico de linhas abertas é drenado
  na primeira passada. Não é regressão; `sweepExpired` é idempotente (fecha no máximo 1×).
- **Observar por 24–48h antes do passo 2**:
  - logs `decision_timeout_loss_swept` / `decision_sweep_clean` (1×/h);
  - `SELECT count(*) FROM "RAC_DecisionOutcome" WHERE "outcomeAt" IS NULL AND "createdAt" < now() - interval '24 hours'` → tende a 0;
  - latência p95 do caminho de reply inalterada (o sweep roda fora do caminho de reply).

### Passo 2 — `KLOEL_REAL_REWARD_SIGNAL=true` (D+2, só com o passo 1 estável)

`chat_reply` deixa de auto-vencer (`chat.replied` imediato suprimido); a decisão fica
PENDENTE até a consequência real: continuação da conversa = WIN (`chat.continued`),
venda = WIN (via `KLOEL_COMMERCE_DECISION_LINK`), silêncio 24h = LOSS (via sweep).

- **NUNCA ligar sem o sweep ON**: sem o passo 1, decisões pendentes nunca viram LOSS e
  acumulam abertas para sempre (o lado-perda do reward depende do sweep — composição
  documentada em `real-reward-signal.flag.ts`).
- **Gate do plano (§7-F1)**, observar por 7 dias:
  - % de `chat_reply` com `wonVsBaseline=false` sai de ~0% para a faixa **10–40%**:
    `SELECT "wonVsBaseline", count(*) FROM "RAC_DecisionOutcome" WHERE "decisionType"='chat_reply' AND "outcomeAt" > now() - interval '7 days' GROUP BY 1;`
  - `MindBanditArm` de `reply_style`/`chat_strategy` com `beta` crescendo (`pulls > wins`);
  - warns `kloel_real_reward_continue_close_skipped` ≈ 0 nos logs;
  - erro/latência do caminho de reply inalterados (continuation-close é fire-and-forget e fail-open).

## Critério de rollback

**Gatilhos**: % de loss sustentado > 60% (sinal degenerado invertido), erros novos no caminho
de reply correlacionados ao flip, ou warns `kloel_real_reward_*` crescentes.

**Ação (ordem inversa do flip)**:

1. `KLOEL_REAL_REWARD_SIGNAL=false` primeiro — o reply volta ao auto-WIN imediato na hora.
2. **MANTER `KLOEL_DECISION_SWEEP_ENABLED=true`** até as decisões que ficaram pendentes
   drenarem (~24h): `SELECT count(*) FROM "RAC_DecisionOutcome" WHERE "outcomeAt" IS NULL AND "decisionType"='chat_reply';` → 0.
   O ledger se normaliza sozinho (rollback documentado no plano §7-F1).
3. Sweep OFF só depois do dreno, se necessário.

## Fora de escopo / armadilha conhecida

- **NÃO** ligar `KLOEL_DECISION_LEDGER_DUALWRITE` como parte da F1 — é F2.
  Gap conhecido, assertado no harness (`mind-f1-parity.harness.spec.ts`, teste
  "KNOWN F2 GAP"): `sweepExpired` e `closeOpenChatReplies` fecham só o ledger canônico
  (`RAC_DecisionOutcome`) e deixam o espelho `RAC_MindPolicy` aberto (`resolvedAt` nulo).
  Se a dual-write estiver ligada junto com F1, o leitor de paridade da F2 vai acusar
  divergência em toda linha fechada por sweep/continuação até esse gap ser fechado no código.
- Flags de percept (F0) e `KLOEL_MINDMESSAGE_*` / `KLOEL_MINDMEMORY_*` (F3/F4) não fazem
  parte deste runbook.
