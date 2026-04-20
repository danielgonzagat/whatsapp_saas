# KLOEL Repository Governance

## Governance Boundary

Arquivos de governance e infraestrutura sao `read-only` para qualquer IA CLI deste repositorio.

Se um agente precisar mudar uma regra, um contrato, um baseline, um script de validacao ou qualquer mecanismo que possa enfraquecer os guardrails, ele deve parar e pedir para o humano fazer a mudanca ou aprovar explicitamente a mudanca de governance.

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

O gate `scripts/ops/check-governance-boundary.mjs` existe para reforcar essa fronteira.

## Codacy Lock

O estado de rigor maximo do Codacy faz parte da governance.

- `.codacy.yml` e `docs/codacy/**` sao superfices protegidas.
- IA CLI nao pode reduzir escopo do Codacy, desativar tool, pattern, gate, coverage, duplicacao ou complexidade.
- IA CLI nao pode usar comentarios de supressao para "resolver" Codacy (`biome-ignore`, `nosemgrep`, `eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, `codacy:disable`, `codacy:ignore`, `NOSONAR`, `noqa`).
- IA CLI nao pode usar skip tags de commit para burlar analise (`[codacy skip]`, `[skip codacy]`, `[ci skip]`, `[skip ci]`).
- O unico fluxo permitido para estado live do Codacy e revalidar/sincronizar ou reaplicar o lock maximo via script oficial do repositorio.

<claude-mem-context>
# Memory Context

# [whatsapp_saas] recent context, 2026-04-19 9:37pm GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (23,403t read) | 3,171,554t work | 99% savings

### Apr 19, 2026
305 9:01p ⚖️ WAHA/Puppeteer fully deprecated — Kloel migrates exclusively to Meta Cloud API
306 " ⚖️ Full autonomous execution scope defined — 12-block Kloel production readiness plan
307 " 🟣 Meta developer tokens and App IDs provided for Kloel CIA integration
308 " ⚖️ Google Cloud Service Account "kloel-master" with Owner role planned for GCP automation
309 " ⚖️ Kloel Terminator design system rules locked — all UI components must comply
310 " 🟣 Checkout autofill audit and fix planned for Velvet Noir and Velvet Blanc
311 " ⚖️ Kloel Tecnologia LTDA entity details established for legal/compliance documentation
322 9:03p 🟣 ConnectPayoutApprovalService — two-phase approval workflow for connect payouts landed on main
323 " 🟣 ConnectLedgerReconciliationService — replay-based balance verification on 15-minute cron
324 " 🟣 ConnectController expanded with 6 new workspace-scoped endpoints and admin endpoints added to AdminCarteiraController
325 " 🔄 google-sign-in-button.tsx callback and render config extracted to helpers module
326 " 🟣 ConnectService gains createOnboardingLink and listBalances methods with Stripe AccountLink type
327 " ✅ connect-platform-wallet changes committed and pushed to main — 53 tests green, both typechecks clean
335 9:05p ⚖️ Kloel adopts Stripe Connect Platform model with Custom Accounts and manual payouts
336 " ⚖️ Kloel split payment priority order formally defined with mathematical contract
337 " ⚖️ Dual-balance ledger engine architecture defined for Kloel internal balance management
338 " ⚖️ 13-gate live-readiness checklist defined before Kloel can process real money
339 " 🔵 Kloel codebase quality metrics from Codacy: 7.95 issues/kLoC but 31% coverage and 19% duplication block production
340 " ⚖️ Scope boundary enforced: SplitEngine before custom domains, CIA, or marketing skills integration
341 " 🔵 Kloel competitive positioning clarified: not "first in world" but "first in Brazil" hybrid e-commerce + affiliate + AI
358 9:08p ⚖️ Kloel Live-Readiness Scope: 13 Formal Gates Defined for Financial Production
359 " ⚖️ SplitEngine Priority Order and Math Contract Locked
360 " ⚖️ Internal Ledger Architecture Required — Dual-Balance Pending/Available System
361 " ⚖️ Kloel Development Execution Order Locked — SplitEngine First, Custom Domains Last
362 " ⚖️ Stripe Connect Architecture Finalized — Platform Model with Custom Accounts and Manual Payouts
363 " ⚖️ Prepaid Wallet Architecture for API Usage — Not Stripe Billing/Meters
364 9:13p 🔵 Staging Deploy Pipeline — Total Failure Across 369 Consecutive Deploys
369 9:16p 🔵 Staging Deployment Pipeline — 369 Consecutive Failures Detected
370 " ⚖️ Autonomous Continuous Work Mode Activated — Fix All 369 Staging Failures
371 9:17p 🔵 Root Cause of All 369 Staging Failures — Architecture Guardrails Check Blocking CI
372 " 🔵 Architecture Guardrail: `expect.any(Date)` Falsely Flagged as Explicit `any`
373 " ✅ Worktree `fix/deploy-staging-connect-guardrails` Created to Resolve CI Blocker
374 9:18p 🔵 Staging Deploy Pipeline Broken — 369 Consecutive Failures Since Yesterday
375 " 🔵 Scope of Queued-but-Undeployed Work on main and feat/kloel-final-compliance
376 9:19p 🔴 Fixed False-Positive "any" Matcher in ConnectPayoutApprovalService Spec
377 9:21p 🔵 Mass Staging Deployment Failure — 369 Consecutive Deploys Failed
378 " ⚖️ Autonomous Recovery Scope: Fix All 369 Staging Failures and Deploy to Production
379 9:23p 🔵 369 Consecutive Staging Deploy Failures — Full Pipeline Blocked
381 9:25p 🔵 Staging Deployment Pipeline Completely Broken — 369 Consecutive Failures
384 9:27p 🔵 Staging Deployment Pipeline — Total Failure Across 369 Deployments
387 9:30p 🔵 369 Consecutive Staging Deployment Failures — Full Pipeline Broken
388 9:31p ⚖️ Kloel Full Production Readiness Scope — 12 Blocks (A–L) Defined
389 " ⚖️ Meta Developer Access Granted — App Tokens and OAuth Configuration Defined
390 " ⚖️ Google Cloud Service Account Architecture — Owner Role for Full GCP Control
391 " ⚖️ Compliance Backend Architecture — 5 Endpoints + 2 Prisma Models Required
392 " ⚖️ Legal Pages Architecture — 6 Next.js Routes with Full LGPD/GDPR/CCPA/Google/Meta Compliance
393 " ⚖️ Facebook Login Provider — NextAuth v5 Integration with Account Linking
394 " ⚖️ Checkout Autofill — Four-Layer Strategy with Native Form Requirements
395 " ⚖️ Meta Webhook Unified Endpoint Architecture — Single Handler for All Channels and Clients
396 " ⚖️ Environment Variables Consolidated — Full List Across Railway Backend and Vercel Frontend

Access 3172k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
