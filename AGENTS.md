# KLOEL Repository Governance

## Governance Boundary

Arquivos de governance e infraestrutura sao `read-only` para qualquer IA CLI
deste repositorio.

Se um agente precisar mudar uma regra, um contrato, um baseline, um script de
validacao ou qualquer mecanismo que possa enfraquecer os guardrails, ele deve
parar e pedir para o humano fazer a mudanca ou aprovar explicitamente a mudanca
de governance.

## Protected Files

Os arquivos protegidos sao definidos em `ops/protected-governance-files.json`.

Eles incluem, entre outros:

- `scripts/ops/**`
- `ops/**`
- `.github/workflows/**`
- `docs/codacy/**`
- `docs/design/**`
- `.codacy.yml`
- `package.json`
- `.husky/pre-push`
- `backend/eslint.config.mjs`
- `frontend/eslint.config.mjs`
- `worker/eslint.config.mjs`
- `CLAUDE.md`
- `AGENTS.md`

## Absolute Rule

IA CLI nao tem permissao para editar arquivos protegidos por conta propria.

Se a mudanca tocar qualquer arquivo protegido:

1. pare;
2. informe que a superficie e de governance;
3. peca para o humano executar ou aprovar a mudanca.

O gate `scripts/ops/check-governance-boundary.mjs` existe para reforcar essa
fronteira.

## Agent Operating Protocol

Todo agente que entrar neste repositório deve seguir este protocolo antes de
editar código.

### 1. Boot Sequence

Antes de qualquer alteração:

1. Ler `CLAUDE.md`.
2. Ler `AGENTS.md`.
3. Ler `CODEX.md` se o agente não for Claude.
4. Verificar `git status`.
5. Identificar branch atual.
6. Identificar arquivos modificados pelo humano.
7. Não sobrescrever trabalho não commitado.
8. Rodar ou consultar PULSE quando a tarefa for funcional.
9. Ler docs/ADR/plans relacionados ao módulo.
10. Definir critérios de sucesso verificáveis.

Se houver mudanças não commitadas que não foram feitas pelo agente, tratá-las
como propriedade do humano e não tocar sem necessidade.

### 2. Scope Discipline

O agente deve trabalhar no menor escopo possível.

Permitido:

- editar arquivos diretamente relacionados à tarefa;
- criar testes para o comportamento alterado;
- ajustar tipos necessários para compilar;
- atualizar documentação operacional relacionada.

Proibido:

- refatorar módulo inteiro sem pedido explícito;
- mover arquivos por preferência estética;
- renomear APIs públicas sem migração;
- apagar código legado sem provar que não é usado;
- trocar arquitetura por gosto pessoal;
- corrigir "tudo que viu" em uma tarefa pequena.

Cada linha alterada deve ser explicável pelo objetivo.

### 3. Human Work Preservation

Nunca sobrescrever, reformatar ou descartar trabalho existente do humano.

Antes de aplicar patch:

1. Verificar diff atual.
2. Identificar arquivos já modificados.
3. Evitar tocar em arquivos com mudanças humanas não relacionadas.
4. Se conflito for inevitável, parar e explicar.
5. Nunca usar reset/checkout/clean destrutivo sem autorização explícita.

Comandos proibidos sem autorização explícita:

- `git reset --hard`
- `git checkout -- .`
- `git clean -fd`
- `rm -rf` fora de paths gerados claramente
- force push
- rebase destrutivo
- migration reset
- truncate/drop/delete massivo

### 4. Verification Ladder

Usar a menor verificação suficiente, mas nunca declarar pronto sem evidência.

Ordem recomendada:

1. Teste unitário específico.
2. Typecheck do pacote afetado.
3. Lint do pacote afetado.
4. Build do pacote afetado.
5. Boot smoke backend quando NestJS/DI mudar.
6. Playwright/E2E quando fluxo de usuário mudar.
7. PULSE quando shell/API/rota/conexão mudar.
8. Full test suite antes de commit crítico.

Se uma verificação falhar, o agente deve corrigir ou documentar a causa
objetiva.

### 5. Tool Permission Model

Ferramentas devem usar menor privilégio possível.

#### Filesystem

- Permitido apenas dentro do repo.
- Não ler arquivos pessoais fora do repo.
- Não procurar secrets fora dos arquivos explicitamente necessários.
- Não imprimir conteúdo de `.env`.

#### GitHub

- Pode ler issues, PRs, arquivos e histórico.
- Pode criar commits/PRs se a tarefa pedir.
- Não alterar branch protection, secrets, actions, environments ou settings
  sem autorização explícita.

#### Database

- Read-only por padrão.
- Write apenas em banco local/dev.
- Produção: somente leitura diagnóstica e sem expor dados sensíveis.
- Nunca rodar migration destrutiva em produção.

#### Browser/Playwright

- Permitido para validar UI local/staging.
- Não inserir credenciais reais em gravações/logs.
- Não salvar screenshots com dados sensíveis sem necessidade.

#### Package Managers

- Antes de instalar dependência, verificar se já existe alternativa no repo.
- Preferir dependências maduras.
- Não instalar pacote abandonado/obscuro para tarefa simples.
- Atualizar lockfile junto.

### 6. Production Risk Classes

Classificar mentalmente toda tarefa antes de agir.

#### Risk 0 — Safe

Docs não protegidas, testes, copy não sensível, pequenos ajustes visuais.

Validação mínima: lint/typecheck quando aplicável.

#### Risk 1 — Normal

Frontend, hooks, API client, services não financeiros.

Validação mínima: teste específico + typecheck/build pacote.

#### Risk 2 — High

Auth, workspace isolation, WhatsApp, filas, integrações externas, banco.

Validação mínima: testes + build + smoke + logs/edge cases.

#### Risk 3 — Critical

Pagamentos, wallet, ledger, split, payout, KYC, secrets, CI/CD, governance.

Validação mínima: ADR/plano lido + testes de edge cases + idempotência +
build + smoke + evidência completa. Se tocar governança/protegidos, parar.

### 7. Report Format

Todo relatório final de agente deve seguir:

```md
## Summary

- ...

## Files Changed

- `path`: why

## Validation

- `command`: result

## E2E/User Flow

- ...

## Risks / Not Done

- ...

## Next Step

- ...
```

Não omitir falhas. Falha conhecida escondida é regressão intencional.

### 8. Definition of Done for Agents

Uma tarefa está pronta somente quando:

1. O código compila.
2. Testes relevantes passam.
3. O comportamento pedido existe.
4. O fluxo do usuário foi considerado.
5. Não há mock/fallback falso.
6. Não há regressão óbvia.
7. Não há segredo exposto.
8. Não há arquivo protegido alterado sem autorização.
9. O relatório contém evidência.
10. O diff é menor e mais cirúrgico possível.

### 9. Anti-Gambiarra Rule

É proibido resolver erro criando bypass.

Proibido:

- comentar regra de lint;
- usar `as any`;
- usar `// @ts-ignore`;
- relaxar tipo para compilar;
- retornar mock para teste passar;
- pular teste;
- remover teste quebrado;
- ocultar botão quebrado;
- apagar UI para reduzir escopo;
- transformar erro real em `{ ok: true }`;
- capturar exception e ignorar;
- trocar falha de integração por dado fake.

A correção deve atacar a causa.

For detailed operational workflow, read `docs/ai/AGENT_RUNBOOK.md`.

## Codacy Lock

O estado de rigor maximo do Codacy faz parte da governance.

- `.codacy.yml` e `docs/codacy/**` sao superfices protegidas.
- IA CLI nao pode reduzir escopo do Codacy, desativar tool, pattern, gate,
  coverage, duplicacao ou complexidade.
- IA CLI nao pode usar comentarios de supressao para "resolver" Codacy
  (`biome-ignore`, `nosemgrep`, `eslint-disable`, `@ts-ignore`,
  `@ts-expect-error`, `@ts-nocheck`, `codacy:disable`, `codacy:ignore`,
  `NOSONAR`, `noqa`).
- IA CLI nao pode usar skip tags de commit para burlar analise (`[codacy skip]`,
  `[skip codacy]`, `[ci skip]`, `[skip ci]`).
- O unico fluxo permitido para estado live do Codacy e revalidar/sincronizar ou
  reaplicar o lock maximo via script oficial do repositorio.

<claude-mem-context>
# Memory Context

# [whatsapp_saas] recent context, 2026-04-23 11:16pm GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (21,415t read) | 524,936t work | 96% savings

### Apr 21, 2026

1065 12:41a ⚖️ Kloel Financial System — Full 12-Block Production Readiness Mandate Re-Issued (Session S45+ Continuation)
1067 12:42a 🔵 Frontend Connect Finance Hooks — useConnectPayments Architecture Confirmed
1068 " 🔵 ConnectFinanceSettingsSection Component — Payout UI with Role-Based Balances
1069 " 🔵 Checkout Public URL Utility — pay.kloel.com Hostname Resolution
1074 12:43a 🟣 ConnectOnboardingService — Block 2 Custom Account Onboarding via Stripe API
1076 " 🟣 ConnectController — POST /:workspaceId/accounts/:accountType/activate Endpoint Added
1078 12:44a 🟣 ConnectOnboardingService Spec — 3 Tests Covering PF Sync, PJ Account Creation, and Terms Rejection
1080 " 🟣 ConnectController Spec — activateAccount Endpoint Test Added with x-forwarded-for IP Parsing
1081 " 🟣 useConnectOnboardingActions Hook — Frontend Activation API for Kloel-Native Onboarding
1085 12:45a 🟣 ConnectFinanceSettingsSection — Activation Form State and handleActivateAccount Added
1089 12:46a 🟣 ConnectFinanceSettingsSection — Activation Card UI Rendered for Unverified or Missing Accounts
1090 " 🟣 ConnectFinanceSettingsSection Test — Activation Flow E2E Test Added with Per-Test Account Fixtures
1093 " 🔴 ConnectOnboardingService — TS2702 Namespace Error Fixed for Stripe Type Aliases
1095 12:47a 🔵 ConnectOnboardingService Spec — 2 Test Failures: Document Upload Order + createCustomAccount Not Called
1099 12:50a 🔵 CERTIFICATION_RUNBOOK.md — Current Block Status: Blocks 3/4/5 Complete, Block 2 In Progress
1107 12:54a 🟣 Block 2 Commit Landed — Kloel-Native Connect Onboarding Activation
1108 " 🔴 ESLint `no-base-to-string` Blocking Pre-Commit Hook Fixed in normalizeDigits
1109 " ✅ CERTIFICATION_RUNBOOK.md — Block 2 Evidence and Risk Entries Added
1110 " 🔵 PartnershipsService — Affiliates and Collaborators Are Kloel-Native, Not Connect-Aware
1111 12:55a 🟣 connect-finance-section Test — Supplier Role Activation from Finance Panel
1113 " 🟣 connect-finance-section — 3 Tests Green After Supplier Role Test Addition
1114 " 🟣 Block 2 — Missing Finance Role Activation Committed (Fornecedor Certified)
1116 12:56a 🔵 No Invite-Acceptance Frontend Page Found for Affiliate/Collaborator Block 2 Gap
1120 12:57a 🔵 EmailService Has sendTeamInviteEmail — Invite Infrastructure Partially Built
1122 " 🔵 Auth signUp Flow Has No Invite Token Support — Block 2 Afiliado Onboarding Requires Extension
1126 12:58a 🟣 connect-finance-section — COPRODUCER and MANAGER Roles Covered via Parameterized Test
1130 1:02a 🔵 InviteModal in ParceriasView — Calls inviteCollaborator But No Token Consumption Route Exists
1131 " 🔵 AuthService Constructor + Auth Module — Full DI Graph for Invite Endpoint Planning
1132 " ⚖️ Afiliado Invite Flow — Implementation Plan: 3-File Additive Build
1133 1:03a 🟣 AuthService — Affiliate Invite Token Acceptance Wired into register()
1134 " 🟣 PartnershipsService Spec — Invite Token Tests Added for createAffiliate
1137 " 🟣 AuthService Spec — Affiliate Invite Token Tests Added to register() Suite
1138 " 🟣 Frontend Affiliate Invite Token Propagation — Full Stack Pass-Through Wired
1140 1:04a 🟣 KloelAuthScreen — Affiliate Invite Token Auto-Detection from URL Query Params
1142 1:05a 🔵 AuthService Spec — Direct new AuthService() Instantiations Need ConnectService Parameter
1143 " 🔵 EmailService and PartnershipsService — Affiliate Invite Infrastructure Already Implemented
1149 1:07a 🔵 PartnershipsService.createAffiliate — Full Invite Flow Already Implemented Including Email Dispatch
1155 1:11a ⚖️ Kloel Financial System — Full 12-Block Production Readiness Mandate Re-Issued (Session Continuation)
1158 " 🟣 ParceriasView AffiliateInviteModal — Full UI Integration Complete
1159 " 🟣 usePartnerships Test Suite Created — Normalization + createAffiliate Contract
1162 1:12a 🔴 Vitest vi.hoisted() Fix — swrMutateMock and createAffiliateMock TDZ Errors
1164 " 🟣 Frontend Test Suite Green — 5/5 Tests Passing After vi.hoisted Fix
1165 " 🔴 TypeCheck Failures in usePartnerships.test.ts — ApiResponse Type + SWR Mutate Callable
1167 1:13a 🔴 usePartnerships.test.ts TypeScript Fixes — ApiResponse Shape + SWR Mutate Predicate Narrowing
1170 " 🔵 ConnectService — Manual Payout Schedule + BR Fallback + Legacy accountLinks Endpoint Architecture
1171 " 🔵 CERTIFICATION_RUNBOOK.md — Current Block Status and Evidence Index Snapshot
1172 1:15a 🔴 RISK-0004 Fixed — Manual Payout Schedule BR Fallback Replaced With Hard Error
1173 " 🔴 RISK-0004/RISK-0005 — ConnectController + Spec Updated for Hard Error + accountLinks Removal
1174 1:16a 🟣 ConnectController + ConnectOnboardingService Specs — Manual Payout Hard-Error Coverage Added
1175 " 🔄 stripe-types.ts — StripeAccountLink Type Export Removed

Access 525k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
