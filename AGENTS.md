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

# [whatsapp_saas] recent context, 2026-05-10 7:09pm GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (24,223t read) | 569,173t work | 96% savings

### May 10, 2026
722 5:49p 🟣 New Worktree Created — chore/ai-constitution-convergence-gates Branched from main
723 " 🔵 check-ai-constitution.mjs — Full Implementation Architecture Mapped
724 " 🔵 ops/kloel-ai-constitution.json — Declarative Constitution Full Content Mapped
725 " 🔵 Kloel Governance Layer Full Stack — AGENTS.md, CLAUDE.md, CODEX.md, AGENT_RUNBOOK.md All Read
726 " 🔵 Kloel Quality Gate Ecosystem — 30+ npm Scripts Form Multi-Layer Enforcement Pipeline
728 5:51p 🔵 Wave-15 OpenCode Fleet Running — 2 Active Subagents and Monitor Process Confirmed Live
729 " 🔵 OpenCode Subagent Delegation Rules — Comprehensive Anti-Deception Protocol for PULSE Debt Work
730 5:53p 🔵 Deepseek Auditor Subagent Launched — Reads All CI/CD and Governance Files in Parallel
733 5:54p 🟣 AI Constitution Enrichment Written — 268 Insertions Across Both Core Files
734 " 🔴 collectChangedFiles() Path Bug — ops/ Prefix Loses Leading 'o' in Fallback Branch
735 " 🔵 ops/governance-change-approvals.json — Full Audit Trail of All Protected File Change Approvals
737 5:56p 🟣 AI Constitution v2 — Four New Enforcement Functions and 10+ New Forbidden Patterns Added
738 " 🟣 AI Constitution JSON v2 — convergenceContract and evidenceContract Sections Added
739 5:57p 🔴 addedTextForFile Fixed — All Diff Strategies Now Merged Instead of First-Match-Wins
740 " 🟣 checkSelfIntegrity() Added — Constitution Checker Now Verifies Its Own Critical Code Paths Survive
741 " 🟣 Three Regex Pattern Fixes — Broader Success Return, Parameterless Catch, and Empty Arrow Catch
742 " 🔵 Deepseek Auditor Identified False Positive Risks in New Constitution Patterns
752 6:04p ⚖️ Kloel AI Constitution Enrichment Mandate — Wave-4 Convergence Gate Expansion
754 6:07p 🔵 Backend Test Suite — SplitEngine Invariant Validation Confirmed via Property-Based Tests
755 6:09p 🔵 Backend Test Suite Passing — TranscriptionService Retry Logic and SSRF Guard Confirmed
756 6:10p 🔵 Backend Full Test Suite — 247/247 Suites Pass on ai-constitution-convergence Worktree
759 6:14p 🔵 Backend Tests Exit Code 1 Despite Zero Failures — 1 Skipped Test Drives Non-Zero Exit
762 6:18p 🔵 check-all Suite on ai-constitution-convergence — 6/7 Gates Green, backend-test In Progress
764 6:20p 🔵 UnifiedAgentService Audit Bug — auditService.logWithTx Not a Function
765 " 🔵 TikTok Webhook Controller — New Channel Integration With Signature Validation
766 " 🔵 LedgerReconciliationService — Active Drift Detection Between Wallet Balance and Ledger Sum
767 6:22p 🔵 Kloel AI Constitution System — Current Gate Architecture Documented
768 " ⚖️ AI Constitution Total Enrichment Mandate Issued — Mathematical Convergence Goal
770 6:24p 🔵 Kloel check:all Gate Suite — Full 12-Gate Architecture Confirmed Running
771 6:27p 🔵 check:all Suite — Full Typecheck, Lint, and Test Gates All Passing in ai-constitution-convergence Worktree
773 6:28p 🔵 check:all Suite — All 21 Gates Pass with Exit Code 0 in ai-constitution-convergence Worktree
775 " 🟣 AI Constitution Enriched — convergenceContract, evidenceContract, and 4 New Checker Functions Added
776 " 🔴 MassSendService — BullMQ Queue Leak Fixed via OnModuleDestroy Lifecycle Hook
777 " 🔵 Pre-Commit Hook Blocks Constitution Commit — Protected Files and Self-Referential False Positive
783 6:30p 🔵 gate-rules.mjs Anti-Self-Trip Pattern — Forbidden Strings Built via Per-Character Joins
784 " 🔴 Self-Integrity Snippet Name Changed — False Positive in Architecture Gate Resolved
785 6:39p ⚖️ Human Approval Granted — validate-staged.mjs Pre-Commit Gate Enhancement
787 " 🟣 validate-staged.mjs — Governance Approval Bypass Added to Protected-File Gate
789 6:40p ✅ validate-staged.mjs Patch Passes Full Guard Suite on Node 20
791 6:43p ✅ check:all Suite — Ratchet, Lint, All Typechecks, and Frontend Tests Green
793 " ✅ check:all Suite — All 20 Gates Green, Exit Code 0 on Node 20
795 " 🔵 Pre-Commit Blocked — `eslint-disable` Forbidden Token in check-ai-constitution.mjs:286
796 6:44p 🔴 validate-staged.mjs — Protected-Path `continue` Logic Fixed to Always Skip Remaining Checks
799 6:48p ✅ Second check:all Run — All 20 Gates Green After Control-Flow Bugfix in validate-staged.mjs
800 6:49p 🔵 validate-staged.mjs Had `MM` Git Status — Both Staged and Unstaged Changes After Two-Patch Series
802 " 🟣 Commit `681a63249` Landed on chore/ai-constitution-convergence-gates — Pre-Commit Hook Passed
804 6:50p 🔵 pre-push Hook Architecture — `run-scoped-pre-push.mjs` Runs 7 Ordered Gate Stages
808 6:51p 🔵 Pre-Push Frontend Tests — 276/276 Passed; Next.js `middleware` Deprecation Warning Active
809 6:52p 🟣 Branch chore/ai-constitution-convergence-gates Pushed to Origin — Full Pre-Push Pipeline Passed
810 " 🔵 Worker Tests Use Dummy OpenAI Key — 401 Errors Are Expected and Tests Still Pass

Access 569k tokens of past work via get_observations([IDs]) or mem-search skill.
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
