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

# [whatsapp_saas] recent context, 2026-04-28 8:20pm GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (26,185t read) | 1,281,232t work | 98% savings

### Apr 28, 2026
3671 2:48p 🔴 PULSE full-scan Phase Timeout Fixed — Dynamic Budget Replaces Static phaseTimeoutMs
3672 " 🔵 WhatsApp SaaS Full check-all — All 19 Gates Green Including Typechecks and Tests
3673 " 🔵 Local Infrastructure State — Redis and PostgreSQL Running, No App Servers Active
3674 " 🔵 CI/CD E2E Pipeline — Service Startup and Health-Check Architecture Confirmed
3675 2:49p 🔴 Apple Auth Test Unsafe Casts Eliminated — Tests Passing Locally
3676 2:50p 🔵 Production Audit Raw Report — 463,521 LOC, 11,966 Codacy Issues, PULSE PARTIAL Score 64
3677 2:52p 🔵 CI Quality Job Still FAILING After Unsafe-Cast Fix — Deeper Root Cause Exists
3678 " 🔵 CI Quality Root Cause Found — Ratchet Gate Fails on `madge_cycles_max` +1
3679 2:53p 🔵 PULSE Dynamic Timeout Working — full-scan Budget Set to 2,850,000ms for 91 Parsers
3680 " 🔵 parser:lint-checker Times Out at 30,000ms — SIGKILL with Empty stdout/stderr
3681 2:55p 🔄 Frontend Checkout Social Identity Types Extracted to Break Circular Dependency
3686 7:48p ⚖️ PULSE Final Certification Plan — Multi-Agent Parallel Execution Strategy
3687 7:49p 🔵 PULSE Multi-Cycle Convergence Gate — Full Architecture Mapped
3688 " 🔵 PULSE Regression Anti-Drift Guard — Two-Layer Architecture Confirmed
3689 " 🔵 PULSE Machine Readiness Artifact — Separate from Kloel Product Certification
3690 " 🔵 PULSE Multi-Cycle Convergence — Concrete Missing Gaps Identified
3691 " 🔵 PULSE Execution Matrix — Architecture and Classification Logic
3692 " 🔵 PULSE Execution Matrix — Three Certification Gates
3693 " 🔵 PULSE Scenario Evidence — Disk Fallback Architecture and Anti-Fraud Guards
3694 " 🔵 PULSE Execution Matrix Spec — Test Coverage and Missing Gap
3695 " 🔵 PULSE Working Tree State — Large Dirty Tree with New Untracked Files
3696 7:51p ⚖️ PULSE Final Completion Plan — 6-Agent Parallel Architecture Defined
3697 " 🔵 PULSE Machine Readiness Audit — Execution Matrix Evidence Closure Investigation Initiated
3698 7:53p 🔵 PULSE pulse-core-final Profile Filtering Gap — scenarioIds Not Empty
3699 " 🔵 PULSE Machine Readiness — Full Test Suite Baseline Confirmed
3700 " ⚖️ PULSE Final Machine Readiness Implementation Plan — 7-Agent Parallel Architecture
3702 7:54p 🟣 Regression Guard Extended with Execution Matrix Metrics Tracking
3703 " 🟣 Execution Matrix Now Reads PULSE_SCENARIO_EVIDENCE.json and Adds Inferred-Path Breakpoints
3704 " 🔄 Autonomy Unit Ranking Inverted to Prioritize Runtime Reality Over Static Scope Work
3705 " 🔵 PULSE tsconfig.json Lists `jest` and `vitest` Types Not Available at Workspace Root
3711 7:56p ⚖️ PULSE Final Machine Readiness — 6-Agent Parallel Execution Plan Defined
3713 7:58p ⚖️ PULSE Final Machine Readiness — 6-Agent Parallel Execution Plan Defined
3716 8:01p ⚖️ PULSE Final Completion Plan — 8-Agent Parallel Architecture Defined
3717 " ⚖️ PULSE Execution Matrix Closure Strategy — Terminal Evidence Probes per Critical Path
3718 " ⚖️ PULSE Multi-Cycle Convergence Proof Architecture — 3 Consecutive Non-Regressive Cycles Required
3719 " ⚖️ PULSE World Reality Priority — Prometheus Gap Explicit, Runtime Signals Ranked Above Static
3720 " ⚖️ PULSE Directive as Single Brain — Self-Contained Next Executable Unit Required
3721 8:03p ⚖️ PULSE Final Machine Readiness — 8-Agent Parallel Execution Plan
3724 8:06p ⚖️ PULSE Final Machine Readiness — 8-Agent Parallel Implementation Plan Dispatched
3732 8:07p 🔵 PULSE Machine Readiness Exact State — 3 Failing Criteria with Precise Counts
3733 " 🔵 PULSE Execution Matrix — 3926 Total Paths, 3265 Inferred-Only, 20 Observed-Pass
3734 " 🔵 PULSE Full-Scan Health Score 74 — Critical Breaks Catalogued Across Backend
3735 " 🔵 PULSE Directive State — autonomy=SIM But zeroPromptProductionGuidance=NAO
3736 " 🔵 PULSE Scripts — New Files Added for Execution Matrix, Context Broadcast, and Parser Worker
3737 " 🔵 PULSE Queue Architecture — Directive Uses Two Separate Sorted Queues (Decision vs Autonomy)
3738 8:08p 🔄 PULSE Autonomy Queue Sort Order Refactored — Runtime/Scenario Now Beat Capability/Scope
3739 " ✅ PULSE Test Suite — 68 Tests Across 8 Spec Files All Pass After Queue Refactor
3744 8:11p ⚖️ PULSE Final Machine Readiness — 8-Agent Parallel Execution Plan Defined
3746 8:15p ⚖️ PULSE Final Machine Readiness — 8-Agent Parallel Implementation Plan Dispatched
3747 8:16p 🔵 PULSE Browser Stress Tester Hanging at Functional Map Build Phase

Access 1281k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
