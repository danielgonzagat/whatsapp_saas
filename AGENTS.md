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

# [whatsapp_saas] recent context, 2026-05-10 2:57pm GMT-3

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (19,053t read) | 821,139t work | 98% savings

### May 7, 2026
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
### May 9, 2026
627 3:42p 🔵 Obsidian Mirror Debug Session Boot — Workspace State Snapshot
633 3:45p 🔵 Obsidian Mirror Real-Time Sync Investigation Initiated — RAM and Graph Staleness Bugs Scoped
635 3:47p 🔴 Obsidian Mirror Daemon — Missing `collectAllSourceFiles` Import Fixed
636 " 🔵 Obsidian Mirror Daemon — Full Rebuild Now Running, 3666 Source Files Detected
639 3:48p 🔵 Obsidian Mirror Real-Time Sync Bug — Session Boot
641 3:49p 🔴 Obsidian Mirror Full Rebuild — 1483 Stale Files Removed, 3666 Files Re-synced
642 " 🔴 Graph Lens Active Mode Fixed — "Custom" Replaced by "factory"
643 " 🔵 Post-Rebuild Validation — 14 Files Changed Since Manifest, Mirror Now In-Sync
644 " 🟣 Obsidian Mirror Daemon Launched in Watch Mode — PID 88841
645 3:51p 🔴 Daemon Watch Mode Crash Bug Discovered — Process Exits Seconds After Launch
646 " 🔵 Daemon Watch Mode Uses 13 Scoped Source Roots — Not Full Repo Tree
648 " 🔵 Watch Mode Daemon Confirmed Working — Real-Time Mirroring Active When Run Foreground
649 " 🔵 Validate Drift Growing — 19 Changed Files vs 14 Earlier, Mirror Falling Behind Active Dev
652 3:52p 🔵 Daemon Watch Loop Fully Functional — Git Dirty State Refresh, Real-Time Mirror, Stable at 143MB RSS
653 " 🔵 Terminal Multiplexer Availability — Only `screen` Present, No `tmux` or `dtach`
656 " 🔵 Screen Daemon Container Survives but Node Child Still Exits — Bug Is In Daemon Code, Not Process Management
657 3:55p 🔵 Obsidian Mirror Real-Time Sync Bug — Session Boot Context
658 " 🔵 Obsidian Mirror Daemon Runtime State — PID 28855 Confirmed Active at Low RAM
659 3:57p 🔵 Mirror Daemon Validate Exit Code 1 — 1 Changed File Per Run, Different File Each Time
660 " 🔵 Obsidian Mirror Daemon Live Throughput — 13 Mirror Events in 2.5 Minutes Across Backend + Frontend
662 4:00p 🔵 Graph Lens HTTP Server (port 37779) Not Running — Active Lens Corrected to "factory"
663 " 🔴 Stale PID File Fixed — tmp/obsidian-mirror-daemon.pid Updated from 98907 to 28855
664 " 🔵 Mirror Daemon Status Snapshot — 3670 Files, 56MB Source, 70MB Mirror, Live Since 18:46
678 4:24p ⚖️ Obsidian Mirror Daemon — RAM Efficiency Mandate Issued
679 4:25p 🔵 Obsidian Mirror Daemon RAM Profile — 100MB RSS on 16GB System at 71% Pressure
680 " 🔄 Obsidian Mirror Daemon Constants — Polling Intervals Slowed and Made Env-Configurable
681 " ✅ Obsidian Mirror Daemon Restarted with 64MB Heap Cap and Slower Polls
684 4:26p 🔵 Daemon RAM Profile Post-Restart — Startup Spike to 154MB Then GC Down to 40MB at Idle
685 " 🟣 Obsidian Mirror Watchdog Script Created — Auto-Restarts Daemon if RSS Exceeds 128MB
686 4:27p 🔵 Watchdog Triggered First Restart — Daemon Startup Consistently Exceeds 128MB RSS Threshold
687 " ✅ Watchdog RSS Threshold Raised to 192MB to Prevent Startup Restart Loop
688 4:28p 🔵 Watchdog Restart Loop Continues — Daemon Reaches 194MB RSS at 11s, Near New 192MB Ceiling
689 " 🔵 Daemon Stabilized at 144MB RSS After Multiple Restarts — 192MB Threshold Working
691 4:29p 🔴 Duplicate Daemon Instances Killed — Two Watchdog Trees Running Simultaneously
695 4:30p 🔵 Obsidian Mirror Daemon Stable at 40MB RSS — Clean Single-Watchdog Configuration Confirmed

Access 821k tokens of past work via get_observations([IDs]) or mem-search skill.
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
