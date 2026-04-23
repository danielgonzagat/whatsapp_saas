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

| MCP         | Tipo  | Status         | Notas                                         |
| ----------- | ----- | -------------- | --------------------------------------------- |
| stripe      | stdio | ✅ ativo       | sk*test*\* em dev                             |
| codacy      | stdio | ✅ ativo       | @codacy/codacy-mcp, 24 tools, token direto    |
| mercadopago | http  | ✅ ativo       | mcp.mercadopago.com                           |
| railway     | stdio | ✅ configurado | 146+ tools, RAILWAY_TOKEN em .env.pulse.local |
| datadog     | stdio | ✅ configurado | 18 monitors + logs ativos, validated          |
| sentry      | stdio | ✅ configurado | @sentry/mcp-server, 2 projetos validados      |
| vercel      | http  | ✅ configurado | Bearer token, 7 projetos validados            |

### Pendências de credenciais

- [x] **Datadog DD_APP_KEY**: configurado e validado (18 monitors, 1 log index)
- [x] **Vercel**: Bearer token configurado, MCP handshake HTTP 200 validado
- [x] **Sentry**: @sentry/mcp-server com user token, 2 projetos (javascript-nextjs, node)

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

| Bloqueio                        | Responsável | ETA           |
| ------------------------------- | ----------- | ------------- |
| ~~DD_APP_KEY para Datadog MCP~~ | ~~Daniel~~  | ~~resolvido~~ |
| ~~Sentry OAuth authorize~~      | ~~Daniel~~  | ~~resolvido~~ |
| ~~Vercel OAuth authorize~~      | ~~Daniel~~  | ~~resolvido~~ |
| PIX capability Stripe live      | Daniel      | a solicitar   |

---

## HISTÓRICO DE SESSÕES RECENTES

| Data       | O que foi feito                                                  |
| ---------- | ---------------------------------------------------------------- |
| 2026-04-23 | Setup MCPs: Railway, Datadog, Sentry, Vercel. Launchers criados. |
| 2026-04-23 | Codacy: 2,779→1,074 issues (-61.4%), Grade A96                   |
| 2026-04-21 | TLS api.kloel.com resolvido, Meta webhook validado               |
