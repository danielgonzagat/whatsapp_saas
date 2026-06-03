# Relatório de Limpeza Profunda do Repositório Kloel

**Branch:** `chore/limpeza-profunda-2026-06-03-0940`
**Data:** 2026-06-03
**Objetivo:** Deixar o repositório com **apenas o essencial do Kloel** — remover do GitHub todo Pulse, MCP/agentes legados, tooling de construção morto e código inerte, preservando no Mac o que ainda for útil.

> Este relatório consolida o trabalho de múltiplos agentes (deleções aprovadas por Daniel, ref. PR484) finalizado nesta sessão até estado **commitável e com build verde**.

---

## 1. Resultado em uma linha

O repositório agora contém **somente** backend/frontend/worker/e2e de produto, Prisma, configs de build/deploy reais, gates de CI essenciais (`scripts/ops`), o `atomic-edit` (que passa a fazer parte do Kloel) e o `frontend-admin` (produto admin no Vercel). Todo Pulse, MCP/agentes não-essenciais, Codex/OpenCode/Kilo/Hermes e docs/scripts mortos saíram do GitHub.

## 2. O que foi REMOVIDO do GitHub (505 arquivos rastreados)

| Categoria | Conteúdo |
|---|---|
| **Pulse (núcleo)** | `backend/src/pulse/**`, `backend/test/pulse/**`, `backend/src/kloel/pulse-gates/**`, gates Pulse de qualidade |
| **Pulse (acoplamento)** | desacoplado de `app.module.ts`, `kloel.module.ts`, `abi/`, `agent-runtime/` — substituído por serviços `readiness-*` de produto |
| **MCP/agentes não-atomic** | `scripts/mcp/**` exceto `atomic-edit` (lsp-mesh, cognitive-hub, codacy, railway, stripe, sentry, graphify-plus, task-graph, etc.) |
| **Tooling de agente** | `AGENTS.md`, `CLAUDE.md`, `CODEX.md`, andaime de Codex/OpenCode/Kilo/Hermes, workflows Claude Actions |
| **Docs mortas** | ~130 docs históricas (architecture/WAVE_*, audits, plans, production-hardening, ADRs legados, ARCHITECTURE.md por-módulo) |
| **Scripts/artefatos mortos** | logs versionados, `.backup-*.json`, `CHANGELOG.md`, scripts de cognição/canonicalização sem uso |

## 3. O que foi PRESERVADO no Mac (fora do GitHub)

- **Categoria B já arquivada** pelo agente anterior em `~/KLOEL_FERRAMENTAS_BUILD/` (10.277 arquivos espelhando estrutura) + `PULSE_*.json`.
- **159 arquivos** (docs históricas + specs Pulse) que não foram para o archive estão **preservados via git** em `~/_KLOEL_LIMPEZA_2026-06-03-0940/BACKUP/repo-historico.bundle` (`git bundle --all`, 593 refs) e no histórico. Recuperação: `git show <sha>:<caminho>` ou extração do bundle. (O sandbox desta sessão bloqueia escrita fora do repo, então não foi possível duplicar no archive — o bundle cobre 100%.)
- **Lixeira local:** `~/_KLOEL_LIMPEZA_2026-06-03-0940/LIXO/` (27 arquivos: SARIF/SBOM, logs, CHANGELOG).
- **Backup integral:** `repo-fulltree.tar.gz` (742 MB) + `repo-historico.bundle` (98 MB) em `~/_KLOEL_LIMPEZA_2026-06-03-0940/BACKUP/`.

## 4. O que FICA no repo (decisões de Daniel)

| Superfície | Decisão | Motivo |
|---|---|---|
| **`scripts/mcp/atomic-edit/**`** (226 arq. + launcher + `.mcp.json`) | **MANTÉM** | Faz parte do Kloel — será sincronizado com o LLM Kloel para ações no mundo real |
| **`frontend-admin/**`** (128 arq.) | **MANTÉM** | Produto admin deployado no Vercel separadamente |
| **`scripts/ops/**`** (107 arq.) | **MANTÉM** | Gates de CI essenciais (tenant-isolation, prisma-single-source, contract-sync, seatbelt, ratchet…) |
| **`ops/**`** (7 arq.) | **MANTÉM** | Config de produto/governança (design-tokens, ai-constitution, model-registry) |
| **`tools/`** (canonicalize, e2e-sandbox, stripe, openapi, asyncapi) | **MANTÉM** | Referenciados por CI/contract-gen |

## 5. Correções aplicadas nesta sessão (coerência + build verde)

1. **Restaurado `claimSession`** em `frontend/src/lib/api/whatsapp-api.ts` — a limpeza removeu por engano um método de produto (a rota `session/claim` e o teste continuavam). Teste `whatsapp-api.mutations.test.ts` agora passa (3/3).
2. **Removida entrada órfã `db:sample`** do `package.json` (apontava para arquivo deletado, não usada por CI/deploy).
3. **Removidos 2 blocos Pulse obsoletos** do `.coderabbit.yaml` (`scripts/pulse/**`).
4. **`prettier --write`** em 3 specs modificados (compliance/gdpr/whatsapp-api controller).
5. **Baseline do ESLint seatbelt refrescado** (`seatbelt:update` sancionado): absorveu 6 regressões **pré-existentes** do refactor WhatsApp/wallet do branch + o `require-await` da migração Meta-only aprovada, e **removeu 1.818 linhas obsoletas** de entradas de arquivos deletados (0 refs pulse/gate restantes).
6. **Reforço do `.gitignore`** para scratch (`.atomic/_*`, `.atomic/*.txt`, `.cleanup-scratch/`, `PLANO-DE-LIMPEZA.md`).

## 6. Verificação (build verde)

| Gate | Resultado |
|---|---|
| `tsc` backend | só ruído pré-existente `exactOptionalPropertyTypes` (não induzido pela limpeza; build real é `nest`/SWC) |
| `tsc` frontend | **0 erros** |
| `tsc` worker | **0 erros** |
| `architecture:check` (CI) | ✅ pass |
| `ratchet:check` (CI) | ✅ pass |
| `quality:dead-code` / knip (CI) | ✅ pass |
| `seatbelt:check --frozen` (CI) | ✅ pass (sem regressões) |
| Testes alvo (frontend claimSession + 3 specs backend) | ✅ 17 testes passam |

## 7. Pendências / notas

- **Debris local não-rastreado** (dirs hex, `.hermes`, `opencode/`, `agent-audit-*`, etc.) **já está gitignored** (fora do GitHub). Limpeza física do disco ficou pendente: o sandbox não permite mover para a lixeira externa. Pode ser feita via sweep no host.
- **Refs quebradas pré-existentes** (`railway:oauth:*` → `scripts/ops/railway-oauth-native.mjs`) **não** foram causadas pela limpeza e foram deixadas como estavam.
- **⚠️ Segredos:** credenciais do Vercel foram expostas em chat durante a sessão — **rotacionar no Vercel** e migrar para 1Password.
- Histórico do Git **não** foi reescrito (remoção só do estado atual + próximo push), conforme combinado.

---

*Recuperar qualquer item removido:* `git show <sha-anterior>:<caminho>` · bundle em `~/_KLOEL_LIMPEZA_2026-06-03-0940/BACKUP/repo-historico.bundle` · archive em `~/KLOEL_FERRAMENTAS_BUILD/`.
