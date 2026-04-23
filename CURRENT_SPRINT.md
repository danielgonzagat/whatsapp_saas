# CURRENT SPRINT — Estado Vivo de Execução

> Este arquivo é o estado operacional ativo do projeto.
> Atualizado por agentes ao início e fim de cada sessão.
> CLAUDE.md tem a filosofia e o DAG; este arquivo tem o que está sendo feito AGORA.

---

## SESSÃO ATIVA

**Data**: 2026-04-23
**Foco**: Observabilidade full-stack (Datadog APM + Sentry + Codecov + PULSE adapters)

---

## MCPs CONFIGURADOS

| MCP         | Tipo  | Status         | Notas                                             |
| ----------- | ----- | -------------- | ------------------------------------------------- |
| stripe      | stdio | ✅ ativo       | sk*test*\* em dev                                 |
| codacy      | stdio | ✅ ativo       | @codacy/codacy-mcp, 24 tools, token direto        |
| mercadopago | http  | ✅ ativo       | mcp.mercadopago.com                               |
| railway     | stdio | ✅ configurado | 146+ tools, RAILWAY_TOKEN em .env.pulse.local     |
| datadog     | stdio | ✅ configurado | 18 monitors + APM ativo (dd-trace backend+worker) |
| sentry      | stdio | ✅ configurado | @sentry/mcp-server, 2 projetos validados          |
| vercel      | http  | ✅ configurado | Bearer token, 7 projetos validados                |
| codecov     | stdio | ✅ configurado | codecov-mcp-server, token em .env.pulse.local     |

### Pendências de credenciais

- [x] **Datadog DD_APP_KEY**: configurado e validado
- [x] **Vercel**: Bearer token configurado
- [x] **Sentry**: @sentry/mcp-server com user token
- [x] **Codecov**: token cc9a8640 configurado
- [x] **PULSE aliases**: DATADOG_API_KEY, SENTRY_AUTH_TOKEN, CODECOV_TOKEN, GITHUB_OWNER/REPO

---

## PULSE EXTERNAL ADAPTERS (última scan: 2026-04-23)

| Adapter        | Status       | Signals | Notas                          |
| -------------- | ------------ | ------- | ------------------------------ |
| codacy         | ✅ ready     | 4       | hotspots normalizados          |
| github         | ✅ ready     | 1       | 20 commits recentes            |
| github_actions | ✅ ready     | 0       | CI configurado                 |
| sentry         | ✅ ready     | 1       | TypeError ativo no prod        |
| datadog        | ✅ ready     | 0       | todos os monitors OK           |
| codecov        | ✅ ready     | 0       | configurado                    |
| dependabot     | ✅ ready     | 0       | sem alertas ativos             |
| prometheus     | ❌ not_avail | 0       | sem URL configurada (esperado) |

**PULSE Score**: 70% — Certification: PARTIAL

---

## OBSERVABILIDADE BACKEND/WORKER

- [x] **dd-trace** inicializado em `backend/src/instrument.ts` (antes do Sentry)
- [x] **instrument.ts** importado como 1º import em `backend/src/main.ts`
- [x] **dd-trace** instalado e inicializado em `worker/bootstrap.ts` (antes do Sentry)
- [x] **Sentry** já inicializado em backend + worker + frontend
- [x] **Datadog RUM** código já em `frontend/instrumentation-client.ts` (aguarda NEXT_PUBLIC_DD_CLIENT_TOKEN)

### Pendência de frontend RUM

Para ativar RUM do Datadog no frontend, adicionar em Railway/Vercel:

- `NEXT_PUBLIC_DD_CLIENT_TOKEN` — obter no Datadog → RUM → kloel-frontend app settings
- `NEXT_PUBLIC_DD_APPLICATION_ID` = `dfa11593-c5ab-4c04-90a8-2c92eef93891` (já no código)

---

## BREAKS CRÍTICOS DO PULSE (15 CRIT/HIGH)

| Arquivo                                                | Break                                      |
| ------------------------------------------------------ | ------------------------------------------ |
| `.github/workflows/ci-cd.yml`                          | CI sem lint gate                           |
| `.github/workflows/ci-cd.yml`                          | E2E tests existem mas não rodam no CI      |
| `docker-compose.yml:220`                               | Possíveis secrets hardcoded                |
| `backend/src/billing/billing.service.ts`               | Operação financeira sem validação de plano |
| `backend/src/checkout/checkout-social-lead.service.ts` | Checkout sem validação de produto          |
| `backend/src/kloel/wallet.service.ts:266`              | Write financeiro sem existence check       |
| `backend/src/wallet/wallet.service.ts:55`              | Write financeiro sem existence check       |
| `frontend/src/app/.../PixelTracker.tsx`                | `document` em module scope — SSR crash     |
| `frontend/src/app/.../pricing/page.tsx`                | `document` em module scope — SSR crash     |

---

## PRÓXIMO PASSO DE PRODUTO

Conforme DAG em CLAUDE.md — FASE 1 MOTOR COMERCIAL:

- [ ] Checkout: conectar webhook de confirmação Stripe
- [ ] Wallet: saldo real, transações, saques
- [ ] Products: plans, URLs, coupons completos

Rodar PULSE antes de iniciar: `npx ts-node scripts/pulse/index.ts --report`

---

## BLOQUEIOS

| Bloqueio                        | Responsável | ETA                         |
| ------------------------------- | ----------- | --------------------------- |
| ~~DD_APP_KEY para Datadog MCP~~ | ~~Daniel~~  | ~~resolvido~~               |
| ~~Sentry OAuth authorize~~      | ~~Daniel~~  | ~~resolvido~~               |
| ~~Vercel OAuth authorize~~      | ~~Daniel~~  | ~~resolvido~~               |
| ~~Codecov MCP~~                 | ~~Claude~~  | ~~resolvido~~               |
| PIX capability Stripe live      | Daniel      | a solicitar                 |
| NEXT_PUBLIC_DD_CLIENT_TOKEN     | Daniel      | Datadog dashboard → RUM app |

---

## HISTÓRICO DE SESSÕES RECENTES

| Data       | O que foi feito                                                                |
| ---------- | ------------------------------------------------------------------------------ |
| 2026-04-23 | Observabilidade: dd-trace APM backend+worker, todos adapters PULSE ready (7/8) |
| 2026-04-23 | Setup MCPs: Railway, Datadog, Sentry, Vercel, Codecov. Launchers criados.      |
| 2026-04-23 | Codacy: 2,779→1,074 issues (-61.4%), Grade A96                                 |
| 2026-04-21 | TLS api.kloel.com resolvido, Meta webhook validado                             |
