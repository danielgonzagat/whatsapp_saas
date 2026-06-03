# Wave H — Coverage-Whatsapp (5 services)

## Mission

Criar `.service.spec.ts` para 5 services WhatsApp restantes.

**Targets**:
- `backend/src/whatsapp/whatsapp-reconciler.service.ts`
- `backend/src/whatsapp/whatsapp-message-dispatcher.service.ts`
- `backend/src/whatsapp/whatsapp-session.service.ts`
- `backend/src/whatsapp/whatsapp-send-rate-guard.service.ts`
- `backend/src/whatsapp/whatsapp-catchup-orchestrator.service.ts`

## Pre-read

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` (REGRA DE WHATSAPP)
3. `backend/src/whatsapp/whatsapp-catchup-history.service.spec.ts` (já existe — padrão Provider+Inbox+OpsAlert)
4. `backend/src/whatsapp/whatsapp-watchdog-session.service.spec.ts` (já existe)
5. Cada arquivo target inteiro

## Padrões

- `WhatsAppProviderRegistry` mock: `{ getSessionStatus: jest.fn(), getChats: jest.fn(), extractPhoneFromChatId: jest.fn() }`.
- `INBOX_SERVICE` mock: `{ saveMessageByPhone: jest.fn() }`.
- `flowQueue` mock: `jest.mock('../queue/queue', () => ({ flowQueue: { add: jest.fn().mockResolvedValue(undefined) }, autopilotQueue: { add: jest.fn().mockResolvedValue(undefined) } }))`.
- Para `whatsapp-send-rate-guard`: usa `WhatsappService.prototype` patch — testar apenas que `PlanLimitsService.ensureMessageRate` é chamado.

## Validation

```bash
cd /Users/danielpenin/whatsapp_saas/backend
npx jest src/whatsapp/<file>.spec.ts --silent
```

## Ownership / Constraints

- Apenas `.spec.ts` novos
- NO bypass tokens, NO source mods, NO commits
- Mock todas as deps externas

## Definition of Done

- 5 specs criados, todos passam jest, ≥15 testes total
