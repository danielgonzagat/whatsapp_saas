# Wave H — Coverage-Mixed (7 services diversos)

## Mission

Criar `.service.spec.ts` para 7 services restantes (multi-módulo).

**Targets**:
- `backend/src/billing/billing-webhook.service.ts`
- `backend/src/checkout/checkout-social-lead.service.ts`
- `backend/src/checkout/checkout-social-recovery.service.ts`
- `backend/src/kloel/mind-processor.service.ts`
- `backend/src/media/media.service.ts`
- `backend/src/pulse/pulse-artifact.service.ts`
- `backend/src/common/storage/storage-drivers.service.ts`

## Pre-read

1. `scripts/decomp/opencode-subagent-delegation-rules.md`
2. `CLAUDE.md` (REGRA DE PAGAMENTOS — para billing-webhook; REGRA DE INTEGRAÇÕES — para storage/media)
3. Specs já feitos como referência:
   - `backend/src/billing/billing.service.spec.ts` (delegator)
   - `backend/src/billing/billing-checkout-helper.service.spec.ts` (suspend/reactivate)
   - `backend/src/billing/billing-subscription.service.spec.ts` (trial/cancel)
   - `backend/src/webhooks/stripe-webhook-ledger.service.spec.ts` (treasury splits)
4. Cada arquivo target inteiro

## Padrões específicos

### billing-webhook
- Mock `stripe.webhooks.constructEvent` via `StripeRuntime` class mock
- Cobrir: missing rawBody → throw, missing signature → throw, idempotência (alreadyProcessed → return), happy path com event.type=`checkout.session.completed`
- Mock `prisma.webhookEvent.findFirst`, `prisma.$transaction`

### checkout-social-lead
- Mock providers Google/Facebook/Apple auth
- Cobrir: provider inválido → ServiceUnavailableException, verificação falha → UnauthorizedException, captura sucesso, conversão

### checkout-social-recovery
- Mock EmailService + FollowUpService + CheckoutSocialLeadService
- Cobrir: workspaceChannelState resolution, dispatch decisions, abandon eligibility

### mind-processor
- BullMQ workers — mockar Queue+Worker constructors
- Cobrir: onModuleInit em test mode (MIND_DISABLE_PROCESSOR=1 → return), enqueueActiveWorkspaces resultado

### media.service
- Mock `createRedisClient` + `Queue` + `StorageService`
- Cobrir: createVideoJob com SSRF guard, getJobStatus NotFound, uploadDocument BadRequest sem file.buffer

### pulse-artifact
- Mock `fs.readFileSync` via `jest.mock('node:fs')`
- Cobrir: readArtifactJson hit/miss, getMachineReadiness composition, freshness classification

### storage-drivers
- Mock `S3Client` + commands
- Cobrir: uploadToS3 sem bucket → fallback local, com bucket → S3 path, deleteObject

## Validation

```bash
cd /Users/danielpenin/whatsapp_saas/backend
npx jest src/<module>/<file>.spec.ts --silent
```

## Ownership / Constraints

- Apenas `.spec.ts` novos
- NO bypass tokens, NO source mods, NO commits

## Definition of Done

- 7 specs criados, cada um ≥3 testes, todos passam jest, ≥21 testes total
