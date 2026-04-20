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

# [whatsapp_saas] recent context, 2026-04-20 1:39am GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (20,028t read) | 913,055t work | 98% savings

### Apr 19, 2026
617 11:32p 🟣 Deploy Staging Run #24645619269 Passes Typecheck — Now Running Build Step
620 " ✅ PULSE_CODACY_STATE.json Restored to HEAD in repair-live-main Worktree — Worktree Now Clean
625 11:39p 🔵 CI Run 24645619269 — First Run in 370+ to Pass Build and Test Gates
626 " 🔵 Railway Deploy Auth Failure — RAILWAY_TOKEN Invalid for `railway up` with `--project` Flag
627 " 🔵 Deploy Staging Workflow Step Sequence — Full Architecture Confirmed
628 11:40p 🔴 RAILWAY_TOKEN Refreshed — New CI Run 24645822261 Triggered After Auth Fix
629 11:41p ✅ Commit, Push, and Merge — All Session Work on 370+ CI Fix Branch
630 11:42p 🟣 PR #159 Merged — Stripe Connect Sales Switched to Separate Charge Fan-Out
631 " 🔵 Deploy Staging Run 24645822261 Cancelled — New Push Commit Preempted Manual Dispatch
632 " 🟣 feat(payments): Connect Sales Fan-out — Separate Charge per Sale Committed to main
634 11:43p 🔵 Cascading Cancellation Loop — Rapid Pushes Prevent Any Deploy Staging Run from Completing
635 11:44p ✅ Deploy Staging Manually Dispatched for SHA 197ea40e — Run 24645971099
636 11:46p 🔵 Deploy Staging Run 24645971099 — Clean Progress Through First 7 Steps Without Cancellation
638 11:47p 🔵 Run 24645971099 — Detailed Step Timings Confirm Typecheck Passed, Build Started at 02:46:04Z
646 11:52p 🔵 GitHub Actions Staging Environment RAILWAY_TOKEN Overrides Repo Secret
647 " 🔵 VERCEL_STAGING_PROJECT_ID Variable Missing — Step 14 Will Fail Next
648 " 🔵 Deploy Staging Pipeline Step-by-Step Timing for Run 24645971099
649 11:53p 🔵 Railway CLI Config — Full Token and Project Mapping Revealed
650 " 🟣 New CI Run 24646152208 Triggered After RAILWAY_TOKEN Fix Attempt
653 11:54p 🔵 Railway GraphQL API — projectTokenCreate Returns String! Not Object
659 11:55p 🔴 Railway Staging RAILWAY_TOKEN Refreshed via GraphQL projectTokenCreate
660 11:56p 🔵 Railway Staging Environment — Full Service Status and Domains Confirmed
661 11:57p 🔵 Staging Deployment Pipeline — 370+ Consecutive Failures Persisting After RAILWAY_TOKEN Rotation
664 11:58p 🔵 CI Run 24646152208 — Steps 1–9 All Passed, Test Step In-Progress at 02:56:09Z
665 " 🔵 Production Infrastructure State — Railway Worker FAILED, All Other Services UP
671 " 🔵 Railway Worker Production — FAILED Status is Stale; Service Responds HTTP 200 with Healthy Queues
672 " 🔵 CI Run 24646152208 — Test Passed, Install CLIs In-Progress; Railway Deploy Imminent
### Apr 20, 2026
673 12:00a 🔵 CI Run 24646152208 — Railway Staging Deploy Triggered; Backend Status BUILDING at 02:58:26Z
676 12:01a 🔵 Railway Staging Environment — Worker SUCCESS on Commit fa015553, Backend BUILDING with New Token
678 12:02a 🔵 CI Run 24646152208 — FAILED After 9m56s Despite Railway Token Working and Backend Building
679 12:03a 🔵 Railway Staging Backend — Docker Build Succeeded (169.87s) But Deploy Failed at Runtime Startup
681 " 🔵 Railway Staging Backend Deployment Manifest — No healthcheckPath, No preDeployCommand, Empty rootDirectory
683 12:04a 🔵 Root Cause Identified — Railway Staging Backend Fails with "The executable `cd` could not be found"
686 12:05a 🔵 Railway GraphQL API — serviceInstanceUpdate Mutation Can Fix startCommand via ServiceInstanceUpdateInput
693 1:02a ⚖️ Kloel Production Readiness Mandate — WAHA Deprecated, Meta Cloud API Adopted
694 " ⚖️ Kloel Full Compliance + Auth + Checkout Scope — 12-Block Production Plan
695 " ⚖️ Compliance Module Architecture — NestJS Backend + Next.js Frontend Pages
696 1:04a 🔵 Worker Package Missing TypeScript in PATH — tsc Command Not Found
697 " 🟣 Compliance Module Tests Passing — 10 Backend + 26 Frontend Tests All Green
708 1:07a 🔵 Branch State — feat/kloel-prod-readiness Diverged from main
709 1:08a ✅ Branch Sync — feat/kloel-prod-readiness Merged origin/main
710 " ✅ Post-Merge Verification — All Typechecks and Compliance Tests Green
712 1:09a ✅ PR #160 Opened — Marketing Skills Bundle + Compliance Suite to main
714 " 🔵 CI/CD Infrastructure Map — Railway + Vercel Deploy Targets Identified
725 1:37a ⚖️ Autonomous Uninterrupted Work Mandate — Full Scope Completion Required
726 1:38a 🔵 Auth Architecture — Custom NestJS Backend, Not NextAuth; Full Social + Magic-Link Stack
727 " 🔵 Compliance Legal Pages — Full PT/EN Stack Already Deployed
728 " 🔵 Repo Structure Audit — Branch feat/checkout-autofill-hardening Ahead 4, Behind 5 of Origin
732 " ✅ 37 Marketing Agent Skills Installed from coreyhaines31/marketingskills
734 1:39a 🔵 VALIDATION_LOG.md Modified — Second Unstaged File Alongside AGENTS.md

Access 913k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
