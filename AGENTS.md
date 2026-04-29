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

# [whatsapp_saas] recent context, 2026-04-29 5:09pm GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (23,883t read) | 3,461,087t work | 99% savings

### Apr 29, 2026

4299 4:19p 🔄 Pillar Scanners Refactored to Return Rich PillarScanResult Instead of Binary ObservabilityStatus
4300 " 🔄 buildCapabilityObservability Rebuilt Around Evidence-First Architecture
4301 " 🔴 Simulation Detection Regex Narrowed to Prevent False Positives on Test Files
4307 4:23p 🔴 property-tester.ts — All False Positive Execution Statuses Eliminated
4308 " 🔴 property-tester.ts buildPropertyTestEvidence() Summary — Planned/NotExecuted Counters Added
4309 " 🔄 property-tester.ts — generateFallbackCandidates Removal Attempted; ENUM_CANDIDATE_NAMES Removed
4310 4:24p ⚖️ PULSE Mission Scope — Full AI Autonomy from Zero to Production
4311 " ⚖️ Architectural Principle — "Hardcode of Grammar Allowed, Hardcode of Reality Forbidden"
4312 " ⚖️ PULSE 8 Organs — Complete Operational Vision
4313 " 🔵 PULSE Current State — Score 77, PARTIAL Certification, 3/3 Convergence Cycles Passing
4314 " ⚖️ PULSE 20 Technology Gaps — Ordered Implementation Roadmap to Perfect Machine
4315 " ⚖️ PULSE Layer Architecture — Scope → Capability → Flow → Vision → Directive
4316 4:25p 🔄 execution-harness.ts generateTestHarnessCode() — 4 Test Templates Collapsed to 1 Blueprint
4322 4:26p ⚖️ PULSE Mission Defined — Full AI Autonomy from Zero to Production
4323 " ⚖️ Architectural Principle — "Hardcode of Grammar Allowed, Hardcode of Reality Forbidden"
4324 " 🔵 PULSE Current State — 9 Missing Technologies to Reach "Perfect Machine"
4325 " ⚖️ PULSE 20 Technology Gaps — Ordered Implementation Roadmap
4326 " ⚖️ PULSE 8 Organs — Complete Operational Architecture
4327 " 🔵 PULSE Structural Gaps — 6 Specific Blockers Preventing Certified Status
4328 4:30p ⚖️ PULSE Architectural Principle — "Hardcode of Grammar Allowed, Hardcode of Reality Forbidden"
4329 " ⚖️ PULSE Completion Criterion — Binary 72-Hour Zero-Prompt Production Test
4330 " 🔵 PULSE Current State at Mission Start — Score 77, PARTIAL, 3/3 Convergence Cycles Passing
4331 " ⚖️ PULSE 20 Technology Gaps — Ordered Implementation Roadmap to Perfect Machine
4332 " ⚖️ PULSE Autonomous Engineer Mission — Full AI Handoff, Zero Human Involvement
4333 4:32p 🔵 PULSE Audit Session Git State — Branch chore/codacy-tsdoc-pulse-updates-apr23
4343 4:37p ⚖️ PULSE Autonomous Engineer Mission — Full AI Handoff, Zero Human Involvement
4344 " 🔵 PULSE Current State — Score 77, PARTIAL Certification, 20 Technology Gaps
4345 " ⚖️ Architectural Principle — "Hardcode of Grammar Allowed, Hardcode of Reality Forbidden"
4346 " ⚖️ PULSE 20 Technology Gaps — Ordered Implementation Roadmap to Perfect Machine
4347 4:38p ⚖️ PULSE Mission — Full AI Autonomy, Zero Human Technical Involvement
4348 " ⚖️ PULSE 20-Technology Gap Roadmap — Ordered Implementation to Perfect Machine
4349 " ⚖️ PULSE Architectural Principle — "Hardcode of Grammar Allowed, Hardcode of Reality Forbidden"
4360 4:42p ⚖️ PULSE Autonomous Engineer Mission — Full AI Handoff, Zero Human Involvement
4361 " ⚖️ Architectural Principle — "Hardcode of Grammar Allowed, Hardcode of Reality Forbidden"
4362 " 🔵 PULSE Current State — Score 77, PARTIAL Certification, 3/3 Convergence Cycles Passing
4363 " ⚖️ PULSE 20 Technology Gaps — Ordered Implementation Roadmap to Perfect Machine
4364 " ⚖️ PULSE Completion Criterion — Binary 72-Hour Zero-Prompt Production Test
4365 " 🔵 PULSE 8 Organs — Complete Operational Vision of the Finished Machine
4366 4:44p ⚖️ PULSE Mission Restated — Complete Autonomous Technical Substitute Specification
4367 " 🔴 OpsAlertModule Product Code Contamination Reverted
4368 " 🟣 OpsAlertService @Optional() Injection Added to Auth Services
4375 4:45p ⚖️ PULSE Mission Definition — Full AI Autonomy, Zero Human Involvement
4376 " ⚖️ Architectural Principle — "Hardcode of Grammar Allowed, Hardcode of Reality Forbidden"
4377 " ⚖️ PULSE 8 Organs — Complete Vision of the Finished Machine
4378 " 🔵 PULSE Current State at Mission Handoff — Score 77, PARTIAL, 20 Technology Gaps
4379 " ⚖️ PULSE 20 Technology Gaps — Ordered Implementation Roadmap to Perfect Machine
4386 4:47p 🟣 PULSE Observability Coverage — Error Budget Pillar Now Scans Real Code Instead of Always Returning Missing
4387 " 🔴 PULSE Path Coverage Engine — Three Logic Fixes for Scope, Risk Classification, and Safe Execution
4388 4:48p 🔵 PULSE human_required Emitter Map — Generator Functions Identified
4395 4:50p ⚖️ PULSE Investigation — Remove Human Blocking Semantics from Artifacts

Access 3461k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
