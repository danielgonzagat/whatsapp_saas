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
6. Nunca usar `git restore`, sob nenhuma circunstância, por risco de destruir
   trabalho não commitado de humanos ou agentes.

Comandos proibidos para IA CLI:

- `git restore`
- `git restore --source`
- `git restore --staged`

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

# [whatsapp_saas] recent context, 2026-05-18 6:03pm GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (20,276t read) | 1,688,324t work | 99% savings

### May 11, 2026
1341 2:43p 🔵 Visual Diff (Chromium) CI Gate Failed — login-desktop 180px Diff + Chat Test Context Disposed
1342 2:44p 🔴 Backend TypeScript Typecheck and Build Now Pass Clean — Zero Errors
1343 2:45p 🔵 Working Railway CLI Deploy Command for Kloel Backend Service
1345 2:47p 🔵 New PR Push Triggered Fresh CI Run — Visual Snapshot Baseline Fix Attempt
1346 2:49p 🟣 Kloel Backend Successfully Deployed to Railway Production
1347 2:50p 🔵 Worker Service Health Check Confirmed Healthy — Redis Connected, Autopilot Queue Active
1348 " 🔴 WhatsAppProviderRegistry Added to WhatsappModule Exports
1349 2:51p 🔴 Visual Baseline Updated — signup-mobile.png Snapshot Regenerated from CI Artifact
1350 2:57p ⚖️ Kloel CIA v3 Execution Contract — Full Mission Definition Issued
1351 " 🔵 PR #266 Gap Analysis — Foundation Delivered, Production State Not Reached
1352 " 🔵 Baseline Lift Bug — outcome and baselineOutcome Always Equal, Lift Always Zero
1353 " ⚖️ Email Channel Architecture Mandate — Per-Workspace OAuth Mailbox, Not Shared Sender
1354 " 🔵 Meta OAuth Error Root Cause — 11-Step Diagnostic Tree Defined
1355 2:58p 🔵 Fourth CI Push — New Run Group 25687403xxx, Both Vercel Deploys Passing, Visual Diff Still Pending After 300s
1356 3:00p 🔵 CI Quality Job Failure — Prettier Lint Errors in 5 Backend Files on codex/pr266-exec Branch
1357 " 🔵 Visual Diff CI Failure — login-mobile Playwright Snapshot Has 123 Pixel Mismatch on Linux
1358 " 🔵 Worktree at /private/tmp/kloel-pr266-exec Has No node_modules — Fixed by Symlinking from Main Repo
1359 " ✅ Worktree Branch Fast-Forward Merged to origin/main (v0.4.1) — PR #287 and #288 Now Incorporated
1360 3:01p ⚖️ Railway Full Automation Mandate — Auto-Deploy on PR Merge + Production Perfection
1361 3:02p 🔵 Backend Docker Build — 5 npm Vulnerabilities Found During Railway Deploy
1362 " 🔵 Worktree Full npm ci Install — Node v25.9.0 Used Despite Package Engine Requiring Node 20.x
1363 3:03p ⚖️ 4-Problem Production Fix Mandate Issued — Kloel Platform (Eighth Issuance)
1364 " 🔴 Visual Baseline signup-tablet-visual-linux.png Updated on fix/quatro-problemas-producao
1365 3:05p 🔵 CI Run 25680826106 — All Three Jobs Passed (quality, architecture, e2e) on main After v0.4.1 Merge
1366 " 🔵 Auth Screen Decomposed into 5 New Files — Social Buttons, Icons, Hooks, Form Fields, and State Machine
1367 " ✅ 51 Visual Regression Snapshots Updated in PR #266 — Login, Signup, Landing, Settings, KYC, and More
1368 " ✅ Railway Backend Docker Image Built and Deployed — amd64/linux
1369 3:06p 🔵 Kloel Backend Production Health — All Services UP After Deployment
1370 " 🔵 Backend Production Logs — Two Residual Warnings After Clean Deploy
1371 " 🔵 Worker Health Check — Redis Connected, 3 Delayed Autopilot Jobs in Queue
1372 " 🔵 Backend Stack Architecture — Node 20, dd-trace, Prisma Auto-Migrate on Start
1373 " 🔵 Backend npm Audit — 5 Vulnerabilities Fully Catalogued, All Fixable Without Breaking Changes
1375 3:09p ✅ Backend Upgraded to Node 22, Firebase Warning Downgraded, npm Vulnerabilities Eliminated
1376 " 🔴 ledger.service.ts — Missing Prisma Namespace Import Fixed (TS2503)
1383 3:14p 🔴 Backend TypeScript Typecheck and Build Now Pass Clean — Zero Errors
1384 " ✅ Railway Backend Redeployment Triggered — New Deployment a9f749e3 with Node 22 + Clean Build
1385 3:15p 🔴 Visual Baseline signup-desktop-visual-linux.png Updated — Second Iteration
1386 " 🔵 PR #289 CI State — Visual Baselines Cascading, Non-Visual Gates All Green
1387 " 🔵 Worker `__companions__` Directory Excluded from TypeScript Compilation
1388 " 🔵 fallback-email.helpers.ts and templates/fallback-email.html Deleted in Wave-14
1389 " 🔵 Railway Worker Has Two Environment Deployments with Different Root Configs
1390 " 🔵 PR266 Visual Regression Root Cause — macOS Snapshots Committed as Linux Baseline
1391 " ✅ Deploy-Production Workflow Manually Re-Triggered — Run 25688283908
1392 3:16p 🔵 Kilo Code Review Failing with Sandbox Infrastructure Error — Transient, Not Code Issue
1406 3:25p 🔵 PR #289 CI Status — Most Checks Passing, Three Still In Progress
1407 3:26p ⚖️ Railway Full Automation and Production Perfection Mandate Issued
1412 3:30p 🔵 Kloel Backend and Worker Production Health Confirmed — Both Services UP
1413 " 🔵 Backend Railway Deployment Startup Sequence — Full NestJS Boot Captured
1414 " 🔵 Working Tree State — Branch chore/purga-total-debt Has ~160 Modified Files Pre-Commit
1415 3:31p ⚖️ Kloel CIA v3 Execution Contract Re-Issued in New Session — Full Mandate Active

Access 1688k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>

## PULSE Auditor Immutability

`scripts/pulse/no-hardcoded-reality-audit.ts` is a locked PULSE governance
surface.

No AI CLI may edit, weaken, bypass, rename, delete, chmod, unflag, move, or
replace this auditor. This prohibition applies even when an agent believes the
change is helpful.

The auditor must remain exhaustive over every source file inside
`scripts/pulse/**`. It must preserve hardcode debt when code is deleted without a
dynamic production replacement, including accumulated Git history debt.

Any required auditor change must stop the agent workflow and be performed by the
human owner outside autonomous AI execution.
