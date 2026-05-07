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

# [whatsapp_saas] recent context, 2026-05-07 2:23pm GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (22,031t read) | 2,420,326t work | 99% savings

### May 7, 2026

325 12:47p 🟣 MIND Backend Test Suite — 94 Tests Passing Across 15 Suites Including All MIND Service Specs
326 " 🟣 CIA Aggressiveness Decision Delegated to MIND — First Production Decision Type Migrated
327 " 🟣 MIND Frontend Observability — mind-client.ts, useMind Hooks, MindDashboard, and /mente Route All Built and Passing
328 " 🔴 React Compiler Memoization Errors Fixed in MindDashboard and MindBriefingCard
329 " 🔴 mind-verbalizer.service.ts and mind.service.ts — @typescript-eslint/no-base-to-string Fixed with safeString() Helper
330 " 🔵 ESLint Version Conflict — npx Fetches ESLint 10.x Which Crashes on Project's ESLint 9.x Config
331 " 🔵 Full Scope of Changes on Branch codex/official-marketing-prod — 46 Files, Two Prisma Migrations, ~20 New Backend Files
335 12:51p 🔴 mind-verbalizer.service.spec.ts Prettier Formatting Fixed via ESLint --fix
336 " 🟣 MIND Backend Test Suite — 16 Suites, 99 Tests All Passing
337 " 🟣 ESLint Clean Pass on All MIND Backend and Frontend Files
338 " 🔵 Full Git Status of MIND Omnichannel Branch — 95 Files Changed or New
339 " 🔵 Frontend Dev Server Running on Port 3001 — Port 3000 Already Occupied
340 12:52p 🔵 Playwright E2E Audit Confirmed: Marketing Pages Clean, Login Missing Google Button Detection
341 " 🔵 ThanosSection Canvas Particle System Already Implemented with 150 Particles per Icon
342 " ✅ Auth Social Button Labels Localized to Portuguese — "Continuar com Google/Apple"
343 12:53p 🔴 Login Page E2E Audit Confirmed: Google Detected, Apple Labeled in Portuguese, Facebook/TikTok Absent
354 12:54p 🟣 Thanos Disintegration Animation Confirmed Live — Canvas Pixel Count Grows 0→15,550 Non-Blank Pixels
355 " 🟣 Frontend Test Suite — 27 Tests Passing Including Auth, MIND Hooks, and Apple Start Route
356 " 🔵 KloelMushroomVisual Uses /kloel-mushroom-animated.svg as Single Canonical Source
365 12:59p 🔴 Frontend Test Suite — 27/27 Passing After KloelBrand and Auth Fixes
366 " 🔵 Railway CLI Session Expired — Cannot Set Apple Auth Env Vars Without Re-Login
367 " 🔵 Apple Auth Configuration — Service ID and Env Var Mapping Confirmed
368 " 🔵 Git Working Tree Status — Full Scope of MIND Transformation Uncommitted
369 " 🔵 KLOEL Brain Production Checklist — Current Completion State
370 1:00p ✅ Delivery Report Created — KLOEL_MIND_OMNICHANNEL_DELIVERY_REPORT.md
371 " ✅ Security Scan Confirms No Secrets in Codebase Diff
372 1:02p ⚖️ Railway API Authentication Strategy — Use Env File Keys, Research Correct Call Pattern
373 " ⚖️ KLOEL MIND Omnichannel Full Platform Transformation Mandate v9 — Autonomous Execution Contract
378 1:04p 🔵 WORKSPACE GATE — CLAUDE.md and AGENTS.md Protected from Shell Read via sed
379 " 🔵 Working Tree Inventory — Branch codex/official-marketing-prod Has Massive MIND + Marketing Changes
380 1:05p 🔵 Railway MCP Token Configuration Gap — RAILWAY_TOKEN Present But MCP Requires configure_api_token Call
381 " 🔵 Env File Topology — All Production Secrets Confirmed Across Multiple .env Files
386 1:07p 🔵 Railway GraphQL API — Correct Variable Mutation Input Schemas Confirmed
387 " 🟣 OpenCode Subagent Server Started on Port 4096 for Parallel Subagent Orchestration
388 " 🟣 10 Parallel OpenCode Subagents Launched for Full-Scope Audit Wave
390 1:08p 🔵 Apple Auth Env Var Resolution Chain — backend/src/auth/apple-auth.service.ts
391 " 🔵 Meta Per-Channel Config ID Env Var Mapping and TikTok Technical Leakage in MarketingView
393 " 🔴 TikTok Marketing UI — Technical Identifiers and Env Var Names Removed from Operator Screen
394 " 🟣 Railway Backend Production Variables Bulk Upsert — MIND + Meta + TikTok Config Vars
414 1:15p 🔴 WhatsAppExperience ConnectedCelebration — Raw Unicode Checkmark Replaced with Lucide Icon
415 " ✅ KLOEL_MIND_OMNICHANNEL_DELIVERY_REPORT.md — Blocker List Reduced and Railway API Status Updated
416 " 🔵 Frontend Validation — TypeCheck Clean, 27 Tests Passing Across 4 Critical Suites
417 1:16p 🔵 Backend Build + Mind/Brain Test Suite — 20 Suites, 123 Tests All Passing
418 " 🔵 MIND Decision Types — Both `cia_aggressiveness` and `followup_timing` Are Real, Distinct Decision Types
419 " 🔵 Pre-Commit Hook Blocks Commit — 6 Architecture Violations in 109-File Staged Changeset
430 1:19p 🔵 MIND Module Complete File Inventory — 17 Backend Services + 4 Admin + Frontend Hooks Verified
431 " 🔵 Apple Service ID `com.kloel.web` — Only in Test Fixtures, Never in Production Code
432 " 🔴 admin-mind.service.ts Trailing Whitespace Fixed — git diff --check Now Passes
433 " 🔵 Frontend-Admin Also Uses Canonical Mushroom SVG — 3 References Found
434 " 🔵 Pre-Commit Architecture Gate Flags `expect.any()` as Explicit Any — False Positive Pattern

Access 2420k tokens of past work via get_observations([IDs]) or mem-search skill.
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
