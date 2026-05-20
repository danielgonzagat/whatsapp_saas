---
title: SP-8 — Operações destrutivas seguras
status: draft
author: claude-opus-4-6 (autonomous)
date: 2026-04-15
module: adm.kloel.com · transversal
tier: CRITICAL · irreversible · safety
depends_on: SP-0/1/2 (foundation+IAM+2FA), SP-4 (contas), SP-5 (produtos)
---

# SP-8 — Destructive Operations Safety Layer

Ações destrutivas do painel (suspender conta, deletar produto, revogar MFA,
forçar logout global, zerar cache, reembolso manual) compartilham os mesmos
riscos: irreversibilidade, impacto em usuários finais e exposição a falha
humana. SP-8 consolida o padrão único de execução segura dessas ações, em vez de
ter cada módulo reinventando o wheel.

## O modelo: Two-Person Confirm + Idempotência + Rollback Window

Toda ação destrutiva passa por um `DestructiveIntent`:

1. **Intent criado** — admin clica "Suspender conta". Front envia
   `POST /admin/destructive-intents` com `kind`, `targetId`, `reason`,
   `ttlSeconds`. Backend cria registro `PENDING` com `expiresAt = now + ttl` e
   retorna `intentId + challenge` (codename 6-letras do targetId para o admin
   digitar).
2. **Confirm** — admin digita o challenge e (se aplicável) a OTP do seu TOTP.
   `POST /admin/destructive-intents/{id}/confirm`.
3. **Execução** — backend valida challenge+OTP, troca status para `EXECUTING`,
   roda o handler de domínio, registra resultado, marca `EXECUTED` ou `FAILED`.
4. **Rollback window** — para ações reversíveis (suspend account, archive
   product), guarda `undoTokenHash` com TTL curto. Um segundo endpoint
   `POST /admin/destructive-intents/{id}/undo?token=...` desfaz em janela curta.
   Ações irreversíveis (hard delete, refund externo) não têm undo.

## Invariantes (I-ADMIN-D1 .. D6)

- **I-ADMIN-D1**: `DestructiveIntent` é append-only. Atualizações são limitadas
  a `status` e `executedAt` via service dedicado; proteção espelha
  `AdminAuditLog` — trigger PG `destructive_intents_block_mutation` nega
  qualquer UPDATE em colunas fora da allowlist.
- **I-ADMIN-D2**: Challenge expira em no máx 5 min. Servidor nunca aceita
  challenge para um intent `EXPIRED`.
- **I-ADMIN-D3**: Toda transição gera linha em `AdminAuditLog` com `action`
  derivada (`destructive.create|confirm|execute|undo|fail`).
- **I-ADMIN-D4**: Idempotência — confirmar duas vezes o mesmo intent é no-op; a
  segunda chamada retorna o resultado cached do primeiro execute.
- **I-ADMIN-D5**: Permissão granular por `kind` — ex.: `CONTAS:DELETE` é
  distinto de `CARTEIRA:APPROVE`. Role `OWNER` bypassa a matriz de permissões
  mas **não** bypassa o challenge+OTP.
- **I-ADMIN-D6**: Nenhum endpoint destrutivo aceita execução direta. Controllers
  de domínio chamam `DestructiveIntentService.executeIntent(id, ctx)` e o
  service é o único ponto autorizado a invocar o handler de domínio.

## Ações cobertas (catálogo inicial)

| kind                  | módulo   | reversível | OTP | undo |
| --------------------- | -------- | ---------- | --- | ---- |
| `ACCOUNT_SUSPEND`     | contas   | sim        | não | 24h  |
| `ACCOUNT_DEACTIVATE`  | contas   | sim        | sim | 7d   |
| `ACCOUNT_HARD_DELETE` | contas   | NÃO        | sim | —    |
| `PRODUCT_ARCHIVE`     | produtos | sim        | não | 24h  |
| `PRODUCT_DELETE`      | produtos | NÃO        | sim | —    |
| `REFUND_MANUAL`       | carteira | NÃO        | sim | —    |
| `PAYOUT_CANCEL`       | carteira | sim        | sim | 1h   |
| `MFA_RESET`           | iam      | sim        | sim | 24h  |
| `FORCE_LOGOUT_GLOBAL` | iam      | sim        | sim | —    |
| `CACHE_PURGE`         | ops      | sim        | não | —    |

Novas ações são adicionadas via registry tipado; o scanner
`check-destructive-handler-registered.mjs` (novo) falha o build se um controller
chamar um handler de domínio que não está registrado.

## Fora de escopo

- SSO step-up (WebAuthn) — SP-8 usa TOTP; WebAuthn fica para épico posterior.
- Workflows de aprovação multi-admin (ex.: dois OWNERs aprovando hard delete) —
  fica como extension point via `approverCount` no intent, mas não ativado na
  v1.

## Rollout

- Flag `adm.destructive.v1`. Sem flag, controllers destrutivos continuam
  bloqueados retornando 501.
- Teste de aceitação manual em staging por todas as 10 ações antes do flip.
