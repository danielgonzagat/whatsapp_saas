# CURRENT SPRINT — Estado Vivo de Execução

> Este arquivo é o estado operacional ativo do projeto.
> Atualizado por agentes ao início e fim de cada sessão.
> CLAUDE.md tem a filosofia e o DAG; este arquivo tem o que está sendo feito AGORA.

---

## SESSÃO ATIVA

**Data**: 2026-04-23
**Foco**: Setup de tooling (MCPs, observabilidade, produtividade de agente)

---

## MCPs CONFIGURADOS

| MCP         | Tipo  | Status            | Notas                                         |
| ----------- | ----- | ----------------- | --------------------------------------------- |
| stripe      | stdio | ✅ ativo          | sk*test*\* em dev                             |
| codacy      | stdio | ✅ ativo          | snapshot read-only                            |
| mercadopago | http  | ✅ ativo          | mcp.mercadopago.com                           |
| railway     | stdio | ✅ configurado    | 146+ tools, RAILWAY_TOKEN em .env.pulse.local |
| datadog     | stdio | ⚠️ parcial        | DD_API_KEY ok, DD_APP_KEY = PLACEHOLDER       |
| sentry      | http  | 🔐 pendente OAuth | mcp.sentry.dev — precisa /mcp authorize       |
| vercel      | http  | 🔐 pendente OAuth | mcp.vercel.com — precisa /mcp authorize       |

### Pendências de credenciais

- [ ] **Datadog DD_APP_KEY**: obter em Datadog → Org Settings → Application Keys → New Key
      Depois, substituir `PLACEHOLDER_get_from_datadog_org_settings_application_keys`
      em `.env.pulse.local` com o valor real.
- [ ] **Sentry OAuth**: na próxima sessão, usar `mcp__plugin_sentry_sentry__authenticate`
- [ ] **Vercel OAuth**: na próxima sessão, usar `mcp__plugin_vercel_vercel__authenticate`

---

## MÓDULO ATUAL

**Módulo**: tooling / infra de agente
**DAG phase**: pré-execução (ver CLAUDE.md para DAG de produto)
**Backend**: —
**Frontend**: —
**Testes**: 18 specs E2E existentes em `/e2e/specs/`

---

## PRÓXIMO PASSO DE PRODUTO

Conforme DAG em CLAUDE.md — FASE 1 MOTOR COMERCIAL:

- [ ] Checkout: conectar webhook de confirmação Stripe
- [ ] Wallet: saldo real, transações, saques
- [ ] Products: plans, URLs, coupons completos

Rodar PULSE antes de iniciar: `npx ts-node scripts/pulse/index.ts --report`

---

## BLOQUEIOS

| Bloqueio                    | Responsável | ETA          |
| --------------------------- | ----------- | ------------ |
| DD_APP_KEY para Datadog MCP | Daniel      | próx. sessão |
| Sentry OAuth authorize      | Daniel      | próx. sessão |
| Vercel OAuth authorize      | Daniel      | próx. sessão |
| PIX capability Stripe live  | Daniel      | a solicitar  |

---

## HISTÓRICO DE SESSÕES RECENTES

| Data       | O que foi feito                                                  |
| ---------- | ---------------------------------------------------------------- |
| 2026-04-23 | Setup MCPs: Railway, Datadog, Sentry, Vercel. Launchers criados. |
| 2026-04-23 | Codacy: 2,779→1,074 issues (-61.4%), Grade A96                   |
| 2026-04-21 | TLS api.kloel.com resolvido, Meta webhook validado               |
