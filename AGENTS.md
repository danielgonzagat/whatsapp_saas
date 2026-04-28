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

# [whatsapp_saas] recent context, 2026-04-28 10:51am GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (19,731t read) | 756,050t work | 97% savings

### Apr 27, 2026

3165 11:53a 🔵 capability:autopilot-ask State Analysis — Missing Persistence + Codacy HIGH
3167 11:55a 🔵 Codacy HIGH Issues Catalogued for Autopilot + Auth + Migration Files
3168 " 🔵 autopilot.service.ts Codacy Line 878 Issue Is a Stale Reference
3169 6:49p 🔵 capability-autopilot-ask Convergence Unit — Current State Before Fix Cycle
3176 6:52p 🔵 capability:autopilot-ask — Missing Roles Cleared, Two Maturity Gaps Remain
3177 " 🔵 PULSE System Health — 71% Score, 87 CRIT/HIGH Breaks, autopilot Rate-Limit Gap
3178 " 🔵 PULSE Runtime Evidence Collection Mechanism — Scan Mode Skips, Deep/Total Mode Executes

### Apr 28, 2026

3180 9:56a 🔵 Codex Global Skills Manifest Already Exists at ~/.codex/skills-import-manifest.json
3181 9:57a 🔵 oh-my-codex Git Clone Stalled — No Output After 15+ Seconds
3184 " 🔵 ~/.codex/config.toml Full State Captured — Plugins, MCP Servers, Features
3186 9:58a 🔵 gitnexus@1.6.3 Already Installed Globally via Homebrew
3187 " ✅ oh-my-codex Installed Globally via npm
3188 9:59a 🟣 oh-my-codex v0.15.0 and gitnexus v1.6.3 Confirmed Installed and Operational
3189 " ✅ oh-my-codex Setup Completed in Plugin Mode (User Scope)
3190 10:00a ✅ Gitnexus and Beads MCP Servers Wired into ~/.codex/config.toml
3191 " 🔵 oh-my-codex Doctor State — 8 Passed, 6 Warnings, OMX Config Not Yet Applied
3192 " 🔵 Codex CLI MCP List — beads and gitnexus Confirmed Enabled
3193 " ✅ omx setup --scope user --force Completed — HUD Config Created, Hooks Refreshed
3194 " 🔵 oh-my-codex v0.15.0 Repo Structure — Prompts, Docs, Skills Architecture
3198 10:01a ✅ Gitnexus MCP Server Updated to npx -y gitnexus@latest for Dynamic Version Resolution
3199 10:03a 🔵 PR #198 State — UNSTABLE Merge Status, 1 Commit Ahead of Origin
3200 " 🔵 ADR 0001 — Worker Hardcodes "meta-cloud" in 6 Places, Cannot Route to WAHA
3201 " 🔵 kloel.com Landing Page — Live on Vercel, Served by KloelLanding Component
3202 10:04a 🔵 kloel.com Landing Animations Confirmed Working in Production Browser Snapshot
3203 " 🔵 usePrefersReducedMotion Hook Duplicated in 3 Files — Refactor Opportunity
3204 " 🔵 ThanosSection — Canvas Particle Disintegration System with PHI-Based Layout
3205 " 🔵 KloelLanding.helpers.ts — Typewriter Delay Calculator Extracted to Reduce Cyclomatic Complexity
3209 10:06a 🔵 Frontend Build Succeeds — 82 Static Pages, Full Route Map Confirmed
3211 10:08a 🔵 Landing Page Animation Integration Test — All 3 Motion Modes Verified Against Local Build
3216 10:10a 🔴 usePrefersReducedMotion — Fixed SSR Default Causing Animations to Stay Disabled in Production
3217 10:11a ✅ Commit 804cb9df Pushed to PR #198 — Animation Fix + .omx Config Files
3218 " 🔵 Pre-Push Hook Gate Results — ESLint, Visual Contract, TypeCheck, and Vitest All Passing
3219 10:12a 🔵 Frontend Vitest Suite — 46 Files, 205 Tests All Passing in 18.35s
3220 10:14a ✅ PR #198 Push Succeeded — Commit 804cb9df Pushed After Full Pre-Push Gate
3222 10:20a 🔵 PR #198 Local Branch 1 Commit Ahead of Remote — Push Incomplete
3223 " 🔵 PR #198 CI Status Snapshot — 3 Failures, 4 Successes, 2 In-Progress
3224 " ✅ AGENTS.md Committed and PR #198 Push Initiated with Pre-Push Hook Running
3225 10:22a 🔵 PR #198 Pre-Push Guards All Passing — Backend Typecheck Running
3226 " 🔵 PR #198 Push Blocked — nest build Fails with ENOTEMPTY on backend/dist/src/checkout
3230 10:28a 🔵 PR #198 Second Push Attempt Blocked — frontend:build:clean Exceeds 180s Timeout
3231 10:29a 🔴 Third PR #198 Push Attempt — Both frontend/.next and backend/dist Cleared Before Retry
3234 10:33a 🔵 PR #198 Third Push Blocked — Backend Build Silently Failed, bootstrap.js Not Produced
3235 " 🔵 Backend Manually Rebuilt Before Fourth Push Attempt — bootstrap.js Confirmed Present
3236 10:34a 🔵 Root Cause Confirmed — `nest build` Cleans dist Then Silently Fails, Destroying Pre-Built bootstrap.js
3237 10:35a 🔵 `nest-cli.json` Has `deleteOutDir: true` — Confirms Root Cause of Missing bootstrap.js
3239 10:36a 🔵 Backend CI-Env Build Reproducibly Fails — Only tsbuildinfo Produced, No JS Output
3241 10:38a 🔵 Stale tsbuildinfo Outside dist/ Was Causing Silent CI-Env Build Failure
3243 10:42a 🔵 PR #198 Pre-Push Hook — All Stages Passing Through Frontend Vitest
3244 10:46a 🔵 PR #198 Push Failed — frontend:build:clean Exceeded 180s Timeout
3245 10:49a 🔵 Next.js Build Trace — Actual Stage Timings Reveal Why 180s Timeout Fires

Access 756k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
