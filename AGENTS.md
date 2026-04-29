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

# [whatsapp_saas] recent context, 2026-04-28 11:10pm GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (27,314t read) | 1,232,686t work | 98% savings

### Apr 28, 2026

3871 9:46p ⚖️ PULSE Final Machine Readiness — 8-Domain Parallel Implementation Plan
3872 9:47p 🔵 PULSE gate-multi-cycle-convergence-pass — Current State at Task Dispatch
3873 9:48p 🔵 PULSE multiCycleConvergencePass Gate — Exact Failure Anatomy Confirmed
3877 9:49p 🔵 PULSE gate-multi-cycle-convergence-pass — Exact Failure State at Dispatch
3878 " 🔵 Multi-Cycle Convergence Gate — 2/3 Cycles Qualifying, 1 Failed Validation
3879 " 🔵 PULSE Autonomy Loop Architecture — Full Code-Path Map Confirmed
3880 9:54p 🔵 PULSE gate-multi-cycle-convergence-pass — Exact Blocking State at Session Start
3881 10:06p ⚖️ PULSE Final Machine Readiness — 8-Domain Parallel Implementation Plan
3883 " 🟣 autonomy-loop.execution.ts — Codex stdout/stderr Captured to .log File
3884 " 🔴 cert-gate-multi-cycle.ts — failedCodex Accounting and Codex-Success Requirement
3885 " 🔵 PULSE Autonomy State — 4 Iterations Completed, Stopped by RegressionGuard
3886 " 🔵 PULSE Machine Readiness — Exact Blocker State After Autonomy Loop
3887 " 🔵 pulseSelfTrustPass Gate — Failure Source Is parserInventory.unavailableChecks, Not selfTrustReport
3894 10:09p 🔵 PULSE Machine Readiness — Reduced to 2 Blockers After Fresh Run (Score 74)
3895 " 🔵 PULSE External Adapter Architecture — github and github_actions Are Required; All Others Profile-Dependent
3896 10:11p 🟣 PULSE External Adapters — PULSE_GITHUB_STATE.json and PULSE_GITHUB_ACTIONS_STATE.json Generated
3897 10:14p 🔵 PULSE Machine Readiness — external_reality Now PASS; Single Remaining Blocker is multi_cycle
3899 10:18p 🔵 PULSE Branch Working State — 69 Modified Files, Ahead 10 Behind 15
3900 10:19p 🟣 cert-gate-multi-cycle.ts — Convergence Criteria Hardened With 6 New Guards
3901 " 🟣 multi-cycle-convergence.spec.ts — Test Suite Updated for 3-Cycle and codexPassed Requirements
3902 " 🟣 certification.ts — pulse-core-final Profile Gets Scoped Gate Evaluation and Actor Bypass
3903 " 🔴 autonomy-loop.required-validations.ts — buildAffectedTestsCommand Fallback Fixed
3904 " 🔵 PULSE Autonomy State — 4 Cycle Records in .pulse/current/PULSE_AUTONOMY_STATE.json
3915 10:21p 🔵 PULSE Multi-Cycle Convergence Gate — Stuck at 2/3 Qualifying Cycles
3916 " ⚖️ PULSE Convergence Unit Dispatch Strategy — Scoped Gate Repair Without Loop Re-Entry
3917 10:23p 🔵 PULSE Certification Full State — Score 74, Only multi_cycle Gate Failing
3918 " 🟣 cert-gate-multi-cycle.ts — Regression Detail Added to Gate Failure Reason String
3919 " 🔴 multi-cycle-convergence.spec.ts — Test Assertion Fixed for Score-Regression Detail Format
3923 10:24p 🔵 PULSE Autonomy Iteration 5 — Codex Agent Diagnosing multi_cycle Blocker Before Any Code Change
3924 " 🔵 PULSE gate-multi-cycle-convergence-pass — Convergence Unit Dispatched at 2/3 Qualifying Cycles
3929 10:27p ⚖️ PULSE Final Machine Readiness — 8-Domain Parallel Implementation Plan
3931 10:28p 🔵 PULSE Machine Readiness Current State — Single Remaining Blocker: multi_cycle at 2/3
3932 10:30p 🟣 PULSE_MACHINE_READINESS Achieves READY Status — multi_cycle Gate Cleared at 3/3
3939 10:34p 🔵 PULSE pulse-core-final Run Hanging — No Output After 210+ Seconds
3940 10:37p 🔵 PULSE pulse-core-final Run — Browser Stress Phase Begins After 7+ Minutes of Silent Parsing
3943 10:44p 🔵 PULSE Health Report — Score 76, Critical TypeScript Build Failures and Financial Race Conditions Detected
3950 10:46p 🔵 PULSE Second Run Regression — self_trust Gate Fails, Machine Readiness Returns to NOT_READY
3951 10:47p 🔵 self_trust Failure Root Cause — test-coverage Parser Timed Out After 90,235ms, Killed by PULSE Parser Worker
3952 " 🔴 test-coverage Parser — Timeout Handling, Configurable Budget, and Reuse of Existing Coverage Summary
3959 10:53p ⚖️ PULSE Final Machine Readiness — Implementation Plan for Two Remaining Blockers
3960 " ⚖️ PULSE Execution Matrix — inferred_only Paths Must Receive Terminal Classification via Probes
3961 " ⚖️ PULSE Multi-Cycle Convergence — 3 Real Consecutive Non-Regressing Cycles Required With Before/After Snapshots
3962 " ⚖️ PULSE World Reality Priority — Prometheus Gap Made Explicit; Runtime Signals Ranked Above Static Analysis
3963 10:57p 🔵 PULSE Session 5742 Still Alive But Producing No Output After 240s Yield
3966 11:01p 🔵 PULSE Session 5742 Completed — Browser Auth Confirmed, 16 Disk Evidence Results Loaded
3967 " 🔵 PULSE Full-Scan Health Report — Score 76/100, Critical TypeScript Build Failures and Financial Race Conditions
3968 11:02p 🔵 PULSE Machine Readiness — READY Status Achieved, All 8 Criteria Passing
3969 " 🔵 PULSE Certificate — CERTIFIED at Score 76; Four Product Gates Still Failing
3970 " 🔵 PULSE Autonomy Proof — All Three Autonomy Verdicts SIM, canDeclareComplete=true, authorityMode=certified-autonomous
3971 " 🔵 PULSE Working Branch — 69 Modified Files + 11 New Files Uncommitted, Ahead 10 Behind 17

Access 1233k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
