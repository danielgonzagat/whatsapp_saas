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

# [whatsapp_saas] recent context, 2026-05-10 10:22pm GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (21,424t read) | 290,628t work | 93% savings

### May 10, 2026
846 7:59p 🔵 check:all Suite — Full 20/20 Green After Tenant Isolation Fix
848 8:00p 🔵 Pre-Push Hook Chain — Full Gate Sequence Confirmed on Tenant Isolation Fix Commit
849 " ✅ chore/ai-constitution-convergence-gates Branch Pushed — Pre-Push Fully Green Including Boot Smoke
852 8:08p ⚖️ Kloel AI Constitution — Wave-7+ Total Enrichment Mandate Issued
853 " 🔵 PR #277 CI Check Snapshot — Mixed Pass/Pending/Skip State at ~11:07 PM GMT-3
854 8:13p 🔵 PR #277 Quality Gate Failure — sales-templates Constants Drift Detected
855 " 🔵 sales-templates Drift Root Cause — Missing `export` Keyword in Backend Source of Truth
856 " 🔴 Fixed sales-templates Export Missing in Backend Source of Truth
857 8:14p 🔴 sales-templates Sync + Typecheck Fully Green After Export Fix
858 " 🔵 Quality Gate Pipeline — Full Step Inventory in ci-cd.yml
862 8:15p 🔵 Full Local Quality Gate Run — All Sync Checks Green, Baselines Confirmed
863 " 🔵 Tenant Isolation Scan Baseline — 1971 Prisma Queries, 637 Transitive-Scope Unresolved
865 8:17p 🔵 check:all Suite Running Green — lint, All Typechecks, Frontend Test Passing
866 8:19p 🔵 check:all Suite — All 20 Gates Fully Green on AI Constitution Convergence Branch
868 8:20p ✅ sales-templates Export Fix Committed — SHA 81f2bf7f0
870 " 🔵 Pre-Push Hook Pipeline — Scoped Hard Gates Run Before Every Push
871 " ✅ PR #277 Fix Pushed — chore/ai-constitution-convergence-gates Updated to 81f2bf7f0
875 8:30p ⚖️ Kloel AI Constitution — Total Enrichment Mandate (Wave-8+)
877 " 🔵 PR #277 CI Status Snapshot — Two Gates Still Pending, Both Vercel Deployments Complete
879 8:40p 🔵 PR #277 CI Status — Codacy Static Code Analysis FAILED, quality Gate Still Pending
880 8:41p 🔵 Codacy Failure Root Cause — 28 New Issues in check-ai-constitution.mjs and worker/resolve-redis-url.ts
881 8:43p 🔵 Local Gate Suite Fully Green on AI Constitution Branch — Codacy Complexity Is Sole Remaining Blocker
882 " 🔵 check:all Suite — 13/14+ Gates Green, Lint Running at 30s Yield Point
884 8:46p 🔵 check:all Suite Progress — 18/19+ Gates Green Including All Typechecks and Frontend Tests
885 8:47p 🔵 check:all Suite — Full 20/20 Green on AI Constitution Convergence Branch
886 8:48p 🔄 check-ai-constitution.mjs and resolve-redis-url.ts Refactored to Fix Codacy Complexity Violations
888 8:50p 🔵 Pre-Push Hook — Backend Boot Smoke Pass, 276 Frontend Tests Green, Frontend Build Starting
891 8:51p ✅ Codacy Complexity Fix Pushed to Remote — Pre-Push Hook Passed All Gates Including Frontend Build and Worker Tests
893 8:54p 🔵 PR #277 New CI Run After Codacy Fix Push — Fresh Gates Running on Commit c750bcabe
895 9:00p ⚖️ Kloel AI Constitution — Wave-9+ Total Enrichment Mandate Issued
897 9:03p 🔵 PR #277 CI Status — Quality and Codacy Still Pending, Vercel Deployments and Static Analysis Passed
898 9:10p 🔵 PR #277 Quality Gate Still Running — Log Fetch Confirms Job 75267096745 In Progress
900 9:20p 🔵 Kloel AI Constitution — Anti-Cheat Gate System Architecture
901 " ⚖️ AI Constitution Total Enrichment Mandate — Wave-10+ Issued
902 9:23p 🔄 check-ai-constitution.mjs — Regex Patterns Replaced with Named Function Rules
903 " 🔵 macOS zsh Missing GNU `timeout` Command — pulse:ci Runner Workaround Needed
904 9:28p 🔵 pulse:ci Execution Timed Out at 300s Default Threshold
905 " 🔵 PULSE CI Architecture — ts-node spawnSync Blocks Full 300s Until Timeout
908 9:32p 🔵 check:all Suite — 6 Gates Green After Constitution Refactor
910 9:33p 🔵 check:all Suite — Full Green (21/21 Gates) After AI Constitution Enrichment
911 9:35p 🔄 check-ai-constitution.mjs — Second Refactor Pass Consolidates to Named Constant Arrays
913 " 🔵 check-ai-constitution.mjs — Full Internal Check Sequence and Self-Integrity Rules Mapped
915 9:36p 🔵 guard:new-code Command Composition Confirmed — 5 Sub-Gates in Sequence
917 " 🔵 guard:new-code + format:check — Full Green After Constitution Refactor
920 9:40p 🔵 check:all Suite — Second Full Green (21/21) After Constitution Second Refactor Pass
922 " ✅ Constitution Refactor Committed — e86b87c05 on chore/ai-constitution-convergence-gates
924 9:41p 🔵 Pre-Push Hook Architecture — 6-Stage Sequence via run-scoped-pre-push.mjs
926 " 🔵 Pre-Push Hook — Backend Build and Boot Smoke Stages Confirmed
928 9:42p 🔵 Pre-Push Hook — Boot Smoke OK, 276 Frontend Tests Pass, Frontend Clean Build Stage Added
930 9:43p ⚖️ Kloel AI Constitution — Total Enrichment Mandate Wave-13+ Issued

Access 291k tokens of past work via get_observations([IDs]) or mem-search skill.
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
