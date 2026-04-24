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

# [whatsapp_saas] recent context, 2026-04-23 10:03pm GMT-3

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
