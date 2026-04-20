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

# [whatsapp_saas] recent context, 2026-04-20 1:51am GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE Fetch details: get_observations([IDs]) | Search:
mem-search skill

Stats: 50 obs (20,188t read) | 1,262,191t work | 98% savings

### Apr 19, 2026

635 11:44p ✅ Deploy Staging Manually Dispatched for SHA 197ea40e — Run
24645971099 636 11:46p 🔵 Deploy Staging Run 24645971099 — Clean Progress
Through First 7 Steps Without Cancellation 638 11:47p 🔵 Run 24645971099 —
Detailed Step Timings Confirm Typecheck Passed, Build Started at 02:46:04Z 646
11:52p 🔵 GitHub Actions Staging Environment RAILWAY_TOKEN Overrides Repo Secret
647 " 🔵 VERCEL_STAGING_PROJECT_ID Variable Missing — Step 14 Will Fail Next 648
" 🔵 Deploy Staging Pipeline Step-by-Step Timing for Run 24645971099 649 11:53p
🔵 Railway CLI Config — Full Token and Project Mapping Revealed 650 " 🟣 New CI
Run 24646152208 Triggered After RAILWAY_TOKEN Fix Attempt 653 11:54p 🔵 Railway
GraphQL API — projectTokenCreate Returns String! Not Object 659 11:55p 🔴
Railway Staging RAILWAY_TOKEN Refreshed via GraphQL projectTokenCreate 660
11:56p 🔵 Railway Staging Environment — Full Service Status and Domains
Confirmed 661 11:57p 🔵 Staging Deployment Pipeline — 370+ Consecutive Failures
Persisting After RAILWAY_TOKEN Rotation 664 11:58p 🔵 CI Run 24646152208 — Steps
1–9 All Passed, Test Step In-Progress at 02:56:09Z 665 " 🔵 Production
Infrastructure State — Railway Worker FAILED, All Other Services UP 671 " 🔵
Railway Worker Production — FAILED Status is Stale; Service Responds HTTP 200
with Healthy Queues 672 " 🔵 CI Run 24646152208 — Test Passed, Install CLIs
In-Progress; Railway Deploy Imminent

### Apr 20, 2026

673 12:00a 🔵 CI Run 24646152208 — Railway Staging Deploy Triggered; Backend
Status BUILDING at 02:58:26Z 676 12:01a 🔵 Railway Staging Environment — Worker
SUCCESS on Commit fa015553, Backend BUILDING with New Token 678 12:02a 🔵 CI Run
24646152208 — FAILED After 9m56s Despite Railway Token Working and Backend
Building 679 12:03a 🔵 Railway Staging Backend — Docker Build Succeeded
(169.87s) But Deploy Failed at Runtime Startup 681 " 🔵 Railway Staging Backend
Deployment Manifest — No healthcheckPath, No preDeployCommand, Empty
rootDirectory 683 12:04a 🔵 Root Cause Identified — Railway Staging Backend
Fails with "The executable `cd` could not be found" 686 12:05a 🔵 Railway
GraphQL API — serviceInstanceUpdate Mutation Can Fix startCommand via
ServiceInstanceUpdateInput 693 1:02a ⚖️ Kloel Production Readiness Mandate —
WAHA Deprecated, Meta Cloud API Adopted 694 " ⚖️ Kloel Full Compliance + Auth +
Checkout Scope — 12-Block Production Plan 695 " ⚖️ Compliance Module
Architecture — NestJS Backend + Next.js Frontend Pages 696 1:04a 🔵 Worker
Package Missing TypeScript in PATH — tsc Command Not Found 697 " 🟣 Compliance
Module Tests Passing — 10 Backend + 26 Frontend Tests All Green 708 1:07a 🔵
Branch State — feat/kloel-prod-readiness Diverged from main 709 1:08a ✅ Branch
Sync — feat/kloel-prod-readiness Merged origin/main 710 " ✅ Post-Merge
Verification — All Typechecks and Compliance Tests Green 712 1:09a ✅ PR #160
Opened — Marketing Skills Bundle + Compliance Suite to main 714 " 🔵 CI/CD
Infrastructure Map — Railway + Vercel Deploy Targets Identified 725 1:37a ⚖️
Autonomous Uninterrupted Work Mandate — Full Scope Completion Required 726 1:38a
🔵 Auth Architecture — Custom NestJS Backend, Not NextAuth; Full Social +
Magic-Link Stack 727 " 🔵 Compliance Legal Pages — Full PT/EN Stack Already
Deployed 728 " 🔵 Repo Structure Audit — Branch feat/checkout-autofill-hardening
Ahead 4, Behind 5 of Origin 732 " ✅ 37 Marketing Agent Skills Installed from
coreyhaines31/marketingskills 734 1:39a 🔵 VALIDATION_LOG.md Modified — Second
Unstaged File Alongside AGENTS.md 738 1:40a 🔴 Massive Documentation Update In
Progress — 63+ Modified Files Across docs/, READMEs, and Config 739 1:45a ⚖️
Kloel Production Readiness — Full Scope Mandate (Blocks A–L) Reconfirmed 740 "
⚖️ WAHA Deprecation — WhatsApp Migrates to Meta Cloud API Official (Reconfirmed)
741 " ⚖️ Social Auth Architecture — Custom Backend OAuth,
Google+Facebook+Apple+Magic Link 742 " ⚖️ Checkout Autofill Strategy —
Four-Layer Payment UX Architecture 743 " ⚖️ Compliance Architecture —
5-Regulation Stack for Kloel Legal Pages 744 1:46a 🟣 Kloel Product Marketing
Context File Created at .agents/product-marketing-context.md 746 1:49a 🔵 Kloel
Branch State — feat/checkout-autofill-hardening, Ahead 1, AGENTS.md Modified 747
" 🔵 Kloel Auth Architecture — Facebook OAuth Already Implemented, Custom
Backend Flow (Not NextAuth) 748 " 🔵 Kloel WAHA Footprint — Puppeteer in Worker,
QR Code Provider in Backend, Deprecated References Throughout 749 " 🔵
Compliance Module Already Exists in Backend — Data Deletion and Deauthorize
Callbacks Implemented

Access 1262k tokens of past work via get_observations([IDs]) or mem-search
skill. </claude-mem-context>
