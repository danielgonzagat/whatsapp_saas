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

# [whatsapp_saas] recent context, 2026-04-19 10:10pm GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (22,646t read) | 1,657,894t work | 99% savings

### Apr 19, 2026
388 9:31p ⚖️ Kloel Full Production Readiness Scope — 12 Blocks (A–L) Defined
389 " ⚖️ Meta Developer Access Granted — App Tokens and OAuth Configuration Defined
390 " ⚖️ Google Cloud Service Account Architecture — Owner Role for Full GCP Control
391 " ⚖️ Compliance Backend Architecture — 5 Endpoints + 2 Prisma Models Required
392 " ⚖️ Legal Pages Architecture — 6 Next.js Routes with Full LGPD/GDPR/CCPA/Google/Meta Compliance
393 " ⚖️ Facebook Login Provider — NextAuth v5 Integration with Account Linking
394 " ⚖️ Checkout Autofill — Four-Layer Strategy with Native Form Requirements
395 " ⚖️ Meta Webhook Unified Endpoint Architecture — Single Handler for All Channels and Clients
396 " ⚖️ Environment Variables Consolidated — Full List Across Railway Backend and Vercel Frontend
412 9:40p 🔵 Systemic Staging Deployment Failure — 369 Consecutive Deploys Failed
422 9:42p 🔵 CI Pipeline Structure — main.yml Disabled, ci-cd.yml Has No Visible Deploy-Staging Job
423 " 🔵 Railway CLI Auth Architecture — OAuth via backboard.railway.com, RAILWAY_API_TOKEN for Non-Interactive
421 " 🟣 Facebook Login + Magic Link Auth — Frontend Implementation
424 9:44p 🔵 Railway Staging Environment Has Zero Service Instances — Root Cause of 369 Deploy Failures
425 " 🔵 deploy-staging.yml Workflow File Exists in Worktrees and References RAILWAY_PROJECT_TOKEN
426 9:46p 🔵 GitHub staging and production Environments Have Zero Secrets and Variables — Confirmed Root Cause
427 " 🔵 Session Pivoting to Browser Cookie Extraction to Retrieve Railway API Token
429 9:47p ⚖️ Kloel Full Production Readiness Scope — Final Consolidated Prompt Defined
430 " ⚖️ Meta Developer Access Granted — Kloel CIA App Token and Auth Test Token Provided
431 " ⚖️ Meta OAuth Redirect URIs and SDK Domain Whitelist Finalized
432 " ⚖️ Kloel Tecnologia LTDA Legal Entity Data Confirmed for Compliance Pages
433 " 🟣 Facebook Login UI Integration in kloel-auth-screen.tsx — Handlers Applied
434 9:49p 🔵 Railway GraphQL API Accessible via Production Token — But Cannot Mint Staging Tokens
435 " 🔵 Railway CLI Browserless Login Initiated — Device Code DXJV-WFMQ Awaiting Activation
438 9:50p 🔴 compliance.service.ts — Email Fetched Before Soft-Delete to Avoid Data Loss
439 " 🔵 feat/kloel-prod-readiness Branch — Massive Working Tree with 170+ Modified Files
440 " 🟣 Frontend Unit Tests Pass — 23 Tests Green Including authApi Facebook/MagicLink Methods
443 9:54p 🔵 Deploy Staging Pipeline — Root Cause: Empty GitHub Environments + Empty Railway Staging
444 " 🔵 Railway CLI v4.35.0 Auth Constraints — Project Token Cannot Create Staging Tokens
445 " ⚖️ Staging Fix Execution Order — Auth → Token → Services → GitHub Secrets → Trigger
446 9:57p 🔴 TypeScript TS2739 — Facebook Identity Props Missing from CheckoutLeadSections Prop Chain
447 " 🔵 Deploy Staging Pipeline Now Reaches Typecheck — GitHub Environment Secrets Already Configured
448 " 🟣 Facebook Auth + Magic-Link Compliance Suite — Commit 26f84dbf Landed on Main
449 9:58p 🔵 Frontend Pre-Push Suite — 153 Tests Passing, Typecheck Clean, Build In Progress
450 10:00p 🔵 Frontend Clean Build Passes — Next.js 16.2.4 Compiles in 101s with 73 Static Pages
451 " ⚖️ Kloel Full Production Readiness Scope — 12 Blocks A–L Defined
452 " ⚖️ Meta Embedded Signup Replaces WAHA QR Code for Client Channel Onboarding
453 " ⚖️ Google OAuth Compliance — State Parameter + RISC Endpoint Required Before Verification
454 " ⚖️ Compliance Suite Architecture — Legal Pages + Privacy Callbacks in feat/compliance-suite Branch
455 " ⚖️ Checkout Autofill Architecture — Four-Layer Strategy with Native Form Requirements
456 " ⚖️ Environment Variables Consolidation — Railway Backend + Vercel Frontend Separation Defined
457 10:01p 🔴 Fix Pushed to main — Deploy Staging #24643598197 In Progress on Commit 14bde176
459 10:03p 🔵 Kloel Auth Architecture — Existing Social Auth, Magic Link, and Apple Callback Already Implemented
460 " 🔵 Compliance Suite Already Committed in 40e44eb7 — Docs, Smoke Test, Legal Pages All Present
458 " 🔵 Deploy Staging Concurrency Policy — Push-Triggered Run Cancels workflow_dispatch Run
461 10:05p 🟣 Test Coverage Added for Facebook Auth Proxy Route and Magic-Link Proxy Routes
462 " 🔴 Magic-Link Proxy Test Mock Not Applied — Backend URL Resolves to localhost:3001 Instead of Mock
463 " 🔵 Deploy Staging Run 24643670954 — Install Dependencies + Prisma Migrate Passed, Typecheck Running
473 10:09p 🔵 Staging Deployment Pipeline — 369 Consecutive Failures Confirmed
474 " ⚖️ Autonomous Mandate: Fix All 369 Staging Failures and Ship to Production

Access 1658k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
