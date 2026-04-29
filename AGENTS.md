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

# [whatsapp_saas] recent context, 2026-04-29 4:08pm GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (26,888t read) | 3,039,107t work | 99% savings

### Apr 29, 2026

4215 3:46p ⚖️ PULSE Mission Scope — Full AI Handoff, Zero Human Involvement
4216 " ⚖️ PULSE "100% Dynamic, 0% Hardcode" Principle — Formal Clarification
4217 " ⚖️ PULSE 20 Technology Gaps — Ordered Implementation Roadmap to Perfect Machine
4218 " 🔵 PULSE Current State at Session Start — Score 77, PARTIAL, 3/3 Convergence Cycles Passing
4219 3:48p ⚖️ PULSE Autonomous Mission Scope — Full AI Handoff, Zero Human Technical Involvement
4220 " ⚖️ PULSE 20-Technology Gap Roadmap — Ordered Implementation to Perfect Machine
4221 " 🔵 PULSE Current State — Score 77, PARTIAL Certification, 3/3 Convergence Cycles Passing
4222 " ⚖️ PULSE Architecture Principles — 100% Dynamic, 0% Hardcoded as Absolute Law
4223 3:49p ⚖️ PULSE Autonomous Engineer Mission — Full AI Handoff with Formal Vision
4224 " 🔵 PULSE Current State — Score 77, PARTIAL Certification, 3/3 Convergence Cycles Passing
4225 " ⚖️ PULSE 20 Technology Gaps — Ordered Implementation Roadmap to Perfect Machine
4226 " 🔵 PULSE Canonical Artifact Audit — Current System State
4227 " 🔵 PULSE Certification Gaps — 20 Technology Gaps and Blocking Fields
4228 3:51p 🔵 PULSE Autonomy Architecture Audit — Read-Only Scope and Goals Defined
4229 3:52p 🔵 PULSE Machine Readiness Audit — Score 75, PARTIAL Certification, Autonomous Cycles READY
4230 " 🔵 PULSE External Signal State — 8 Signals, 4 Codacy Hotspots Block 228 Execution Paths
4231 " 🔵 PULSE Runtime Evidence — Both Probes Pass on Staging Backend
4232 " 🔵 PULSE Execution Matrix — 228 observed_fail All Blocked by email.service.ts, 39 Parity Gaps (37 Observability)
4233 3:54p 🔵 PULSE Static/Behavior Discovery Layer — Read-Only Audit Initiated
4234 3:55p 🔵 PULSE Autonomy Architecture Audit — Scope and Known State
4235 3:56p ⚖️ PULSE Autonomous Mission Scope — Full AI Handoff to Replace Human Technical Role
4236 " ⚖️ PULSE 20-Technology Gap Ordered Implementation Roadmap Established
4237 3:57p ⚖️ PULSE Autonomous Engineer Mission — Full AI Handoff with Zero Human Involvement
4238 " ⚖️ PULSE "100% Dynamic, 0% Hardcode" Principle — Formal Clarification of What This Means
4239 " ⚖️ PULSE 20 Technology Gaps — Ordered Implementation Roadmap to Perfect Machine
4240 " 🔵 PULSE Current State at Mission Start — Score 77, PARTIAL Certification, 3/3 Convergence Cycles Passing
4241 3:58p 🔵 PULSE Autonomy Architecture Audit — 72h No-Human Readiness Assessment
4242 3:59p 🔵 PULSE Perfectness Module Audit — Wiring and Gap Assessment Initiated
4243 " 🔵 PULSE Static/Behavior Discovery Layer — Full File Inventory
4244 4:00p 🔵 PULSE Autonomy State Snapshot — Certificate PARTIAL, Score 75, humanReplacementStatus NOT_READY
4245 " 🔵 PULSE Perfectness Test — 3 Failed Gates Block 72h Autonomous Test Readiness
4246 " 🔵 PULSE Worker File-Lease Architecture — 10 Parallel Workers with 30-Min TTL, Conflict-Free File Ownership
4247 " ⚖️ PULSE Autonomous Engineer Mission — Full AI Handoff with Zero Human Involvement
4248 " ⚖️ PULSE "100% Dynamic, 0% Hardcode" Principle — Formal Clarification of What This Means
4249 " ⚖️ PULSE 20 Technology Gaps — Ordered Implementation Roadmap to Perfect Machine
4250 " 🔵 PULSE Current State Assessment — Score 77, PARTIAL, 3/3 Convergence Cycles Passing
4251 4:01p ⚖️ PULSE Autonomous Engineering Machine — Full Mission Scope Defined
4252 4:02p ⚖️ PULSE Mission Scope — Autonomous AI Engineer Replacing All Human Technical Roles
4253 " ⚖️ PULSE 20-Technology Gap Roadmap — Ordered Implementation Plan to Perfect Machine
4254 " ⚖️ PULSE Parallel Subagent Strategy — Maximum Concurrency for Fastest Machine Completion
4255 4:03p ⚖️ PULSE Autonomous Engineer Mission — Full AI Handoff, Zero Human Involvement
4256 " ⚖️ PULSE "100% Dynamic, 0% Hardcode" Principle — Formal Clarification of Scope
4257 " 🔵 PULSE Current State — Score 77, PARTIAL Certification, autonomous-execution Authority
4258 " ⚖️ PULSE 20 Technology Gaps — Ordered Implementation Roadmap to Perfect Machine
4259 " ⚖️ PULSE Completion Criterion — Zero-Prompt Production Test (Binary Pass/Fail)
4260 " ⚖️ PULSE 8-Organ Architecture — Complete Operational Vision
4264 4:05p ⚖️ PULSE Mission — Full AI Handoff, Zero Human Involvement
4265 " ⚖️ PULSE "100% Dynamic, 0% Hardcode" Principle — Formal Clarification
4266 " ⚖️ PULSE 20 Technology Gaps — Ordered Implementation Roadmap
4267 " 🔵 PULSE Current State at Mission Handoff — Score 77, PARTIAL Certification

Access 3039k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
