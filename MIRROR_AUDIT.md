# MIRROR_AUDIT — Workspace → Obsidian Mirror System

> **Fase 0 da missão "Mirror Expansion"** (CLAUDE.md governance).
> Branch: `chore/ai-constitution-obsidian-graph-lock`.
> Auditoria read-only. Nenhum código alterado.
> **PARE aqui. Aguardando validação explícita do dono do repositório antes da Fase 1.**

---

## 0. TL;DR

O sistema atual já é mais sofisticado do que a missão sugere:

1. **Watcher existe.** `scripts/obsidian-mirror-daemon.mjs:413` usa `node:fs.watch(REPO_ROOT, { recursive: true })` com debounce de 250ms. **Não é "estático".** O que falta é **operacionalização** (nenhum npm script, nenhum hook dispara o daemon em watch por padrão).
2. **Detecção de erros existe**, mas é **regex-level / pattern-level**, não AST. Conta `throw`/`catch`/`try` para classificar `effect-intensity:errors:*`. Não há tipos, não há lint integrado, não há SAST.
3. **Coloração no graph é nativa Obsidian** (sem plugin custom). Tags YAML no frontmatter casam com `colorGroups` em `.obsidian/graph.json`. **Não é multi-dot por nó — é um nó, uma cor.** A missão pede "pontos coloridos", o que significa que vai precisar **ou** de um plugin custom **ou** de uma reinterpretação visual (cor do nó = severidade dominante; tags = categorias filtráveis).
4. **Pontos de extensão existem e estão bem isolados.** O daemon e seus 4 módulos são **constitution-locked**. Adicionamos via sidecar JSON (`FINDINGS_AGGREGATE.json`) ingerido por novo módulo não-protegido — sem tocar a casca lockada.

---

## 1. Arquitetura atual

### 1.1 Diagrama textual

```
┌────────────────────────────────────────────────────────────────────────┐
│                            REPO_ROOT                                    │
│                  (whatsapp_saas, ~184k LOC, 812 arquivos)               │
└──────────────────────────────┬─────────────────────────────────────────┘
                               │
                               │  fs.watch(recursive) | --rebuild | --validate
                               │  debounce 250ms      | --status
                               ▼
┌────────────────────────────────────────────────────────────────────────┐
│  scripts/obsidian-mirror-daemon.mjs               (568 LOC, LOCKED)     │
│  ─ entry point, modos, lock acquisition, watcher loop                   │
│  ─ orquestra os 4 módulos abaixo                                        │
└──┬──────────────────┬──────────────────┬──────────────────┬─────────────┘
   │                  │                  │                  │
   ▼                  ▼                  ▼                  ▼
┌────────┐   ┌──────────────┐   ┌─────────────────┐   ┌───────────────┐
│constants│   │   utils      │   │    content      │   │   indexes     │
│344 LOC  │   │   433 LOC    │   │   1493 LOC      │   │   1366 LOC    │
│LOCKED   │   │   LOCKED     │   │   LOCKED        │   │   LOCKED      │
├────────┤   ├──────────────┤   ├─────────────────┤   ├───────────────┤
│paths    │   │ lock acquire │   │ analyze content │   │ domain index  │
│debounce │   │ git state    │   │ extract facts   │   │ machine index │
│regexes  │   │ link helpers │   │ build markdown  │   │ cluster index │
│tag defs │   │ lang detect  │   │ emit tags       │   │ camera notes  │
│colors   │   │ skip filters │   │ frontmatter     │   │ manifest I/O  │
│limits   │   │ manifest I/O │   │ visual facts    │   │ stale cleanup │
└────────┘   │ dir scan     │   │                 │   │               │
             └──────────────┘   └─────────────────┘   └───────────────┘
                                          │
                                          │  emite tags via YAML frontmatter
                                          ▼
┌────────────────────────────────────────────────────────────────────────┐
│            VAULT: ~/Documents/Obsidian Vault/Kloel/                     │
│                                                                          │
│  99 - Espelho do Codigo/                                                 │
│   └─ _source/                ← 600+ .md gerados (mirror dos arquivos)   │
│       ├─ scripts/...                                                     │
│       ├─ backend/...                                                     │
│       ├─ frontend/...                                                    │
│       └─ manifest.json       ← hashes + format version 21                │
│                                                                          │
│  .obsidian/                                                              │
│   ├─ graph.json              ← 27 colorGroups (lidos pelo Obsidian)     │
│   ├─ graph.lens.runtime.json ← lens "vivo"                              │
│   └─ graph.lens.static.json  ← lens "snapshot"                          │
└────────────────────────────────────────────────────────────────────────┘
                                          ▲
                                          │
                                          │  reforça via setInterval (2s)
                                          │
┌────────────────────────────────────────────────────────────────────────┐
│  scripts/obsidian-graph-lens.mjs                  (148 LOC, LOCKED)     │
│  ─ instala/reaplica os 27 colorGroups em .obsidian/graph.json          │
│  ─ alterna entre runtime e static lens                                  │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Inventário de arquivos do sistema

| Path                                                                  | Função                                                                                    | Tech         | Locked | LOC    |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------ | ------ | ------ |
| `scripts/obsidian-mirror-daemon.mjs`                                  | Entry point: modos watch/rebuild/validate/status, lock, orchestration                     | Node ESM     | ✓      | 568    |
| `scripts/obsidian-mirror-daemon-constants.mjs`                        | Configuração: paths, debounce, file size, language map, tag defs, color groups            | Node ESM     | ✓      | 344    |
| `scripts/obsidian-mirror-daemon-utils.mjs`                            | Lock, git state, link helpers, language detection, file filtering, manifest I/O, dir scan | Node ESM     | ✓      | 433    |
| `scripts/obsidian-mirror-daemon-content.mjs`                          | Content analysis, visual facts, frontmatter, tag emission, mirror node building           | Node ESM     | ✓      | 1493   |
| `scripts/obsidian-mirror-daemon-indexes.mjs`                          | Index writers (domain/machine/cluster/camera), manifest persistence, stale cleanup        | Node ESM     | ✓      | 1366   |
| `scripts/obsidian-graph-lens.mjs`                                     | Aplica/reforça 27 colorGroups em `.obsidian/graph.json`; runtime vs static                | Node ESM     | ✓      | 148    |
| `scripts/mirror-tests.mjs`                                            | Espelhador secundário de testes (`*.spec.ts`/`*.test.ts` → vault Tests/)                  | Node ESM     | ✗      | 101    |
| `~/Documents/Obsidian Vault/.obsidian/plugins/claudian/`              | Plugin Obsidian: integração Claude (read/write/search/bash)                               | JS compilado | ✗      | ~3.6MB |
| `~/Documents/Obsidian Vault/.obsidian/plugins/opencode-obsidian/`     | Plugin Obsidian: integração OpenCode                                                      | JS compilado | ✗      | ~57KB  |
| `~/Documents/Obsidian Vault/.obsidian/plugins/codex-obsidian-bridge/` | Bridge localhost para Codex inspecionar vault                                             | JS compilado | ✗      | ~136KB |

**Total LOC do core mirror (locked): 4.352 linhas.**
**Constitution-protected per CLAUDE.md "ARQUIVOS PROTEGIDOS"**: estes 6 arquivos `.mjs` não podem ser editados por IA — apenas o dono.

### 1.3 Pipeline ponta-a-ponta

#### Ingestão

- **Estratégia**: `fs.watch(REPO_ROOT, { recursive: true })` em watch mode (`obsidian-mirror-daemon.mjs:413`); `collectAllSourceFiles()` em `--rebuild`.
- **Filtros**: `isCandidateSourcePath()` + `isMirrorableSourceFile()` em `utils.mjs` (regex de skip patterns + extensões em `constants.mjs`).
- **Debounce**: 250ms (`DEBOUNCE_MS`).
- **Tamanho máximo**: 5MB (`MAX_FILE_SIZE`); arquivos maiores entram como `mirror/metadata-only`.
- **Lock**: `.obsidian-mirror-daemon.lock` na raiz do repo, stale após 120s, poll 75ms, timeout de aquisição 30s.

#### Geração de nó

Para `/repo/foo/bar.ts`:

- **Output path**: `/Vault/Kloel/99 - Espelho do Codigo/_source/foo/bar.ts.md` (via `sourceToMirrorPath`).
- **Conteúdo**: frontmatter YAML com 13+ campos + corpo com source code embedded (até `SOURCE_BODY_MIRROR_MAX_BYTES`, default unlimited).
- **Wiki-links**: helpers em `utils.mjs` (formato `[[...]]` para conexões entre mirror nodes).

**Frontmatter real (sample colhido pelo subagente C, arquivo `_source/.backup-manifest.json.md`):**

```yaml
---
source: .backup-manifest.json
repo_root: /Users/danielpenin/whatsapp_saas
mirror_format: 21
sha256: 6e4c122a2495af247c48fbb04e034a01ff224d0b4e98a3216cd7a86425389168
bytes: 3414
lang: json
git_dirty: false
git_local_commit: false
workspace_state: NO_LOCAL_DIFF
mirror_payload: full_text
machine_surface: source
machine_risk: normal # ← severity (categorical: normal | high | critical)
machine_cluster: .backup-manifest.json__root
tags: # ← drives Obsidian colorGroups
  - graph/surface-source
  - signal/static-high
  - graph/effect-config
  - signal/external
mirrored: 2026-05-02T01:30:40.791Z
internal_links: 1
visual_facts: # ← rich detection output (non-rendered, queryable)
  - debt:secret-like-token
  - vocabulary:railway
  - computational-effect:configuration
  - surface:source
  - risk:normal
  - language:json
---
```

#### Configuração do vault path

- **Env vars** (com fallback hardcoded para máquina do Daniel):
  - `KLOEL_REPO_ROOT` → default `/Users/danielpenin/whatsapp_saas`
  - `KLOEL_MIRROR_ROOT` → default `/Users/danielpenin/Documents/Obsidian Vault/Kloel/99 - Espelho do Codigo`
  - `KLOEL_VAULT_ROOT` → derivado de `MIRROR_ROOT` (dois níveis acima)
- Outros tunables: `KLOEL_MIRROR_LOCK_TIMEOUT_MS`, `KLOEL_MIRROR_LOCK_STALE_MS`, `KLOEL_MIRROR_LOCK_POLL_MS`, `KLOEL_SOURCE_BODY_MIRROR_MAX_BYTES`, `KLOEL_GRAPH_PAGE_SIZE`.

#### Modos de execução

| Flag                  | Comportamento                                            |
| --------------------- | -------------------------------------------------------- |
| `--watch`             | `fs.watch` recursivo + debounce; daemon de longa duração |
| `--rebuild --force`   | Apaga `_source/`, regenera tudo                          |
| `--rebuild --dry-run` | Mostra o que seria escrito sem mexer no disco            |
| `--validate`          | Compara hashes do manifest; reporta drift                |
| `--status`            | Sumário do estado do mirror                              |
| (nenhum)              | Provavelmente exibe help (linha 469)                     |

**Operacionalização**: ZERO npm script (`grep "obsidian\|mirror" package.json` retornou só uma referência ao path). ZERO hook husky/CI dispara o daemon. **É invocado manualmente, ou esquecido.**

#### Idempotência

- Manifest em `_source/manifest.json` com SHA-256 por arquivo + `mirror_format: 21` (versionado, regenera tudo se mudar).
- `--validate` confronta hashes para detectar drift.
- Append-only para enriched docs no mirror root (fora de `_source/`); `_source/` é regenerável.

---

## 2. Cobertura de detecção atual

### 2.1 Tabela exaustiva: tag → emitida hoje?

| Tag emitida pelo daemon                     | Trigger (em `content.mjs`)                                                                                                                            | Severidade efetiva |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| `#graph/effect-error`                       | regex match em `throw`, `.catch(`, `try {`, `catch (` → bucketed por contagem (`errors:1`, `errors:2-5`, `errors:6-20`, `errors:21-80`, `errors:80+`) | médio              |
| `#graph/effect-security`                    | `computational-effect:auth-or-isolation` (regex em `@UseGuards`, `JWT`, etc)                                                                          | alto (categórico)  |
| `#graph/effect-entrypoint`                  | `computational-effect:http-server` ou `service-logic`                                                                                                 | médio              |
| `#graph/effect-data`                        | `computational-effect:database-*` (Prisma, queries)                                                                                                   | médio              |
| `#graph/effect-network`                     | `computational-effect:network-io` ou `external-provider`                                                                                              | médio              |
| `#graph/effect-async`                       | `computational-effect:queue-work` ou `effect-intensity:async:*`                                                                                       | médio              |
| `#graph/effect-state`                       | UI/browser state                                                                                                                                      | baixo              |
| `#graph/effect-contract`                    | docs/types                                                                                                                                            | baixo              |
| `#graph/effect-config`                      | `configuration`                                                                                                                                       | baixo              |
| `#graph/risk-critical`                      | path matches critical pattern OU `risk:critical` machine                                                                                              | crítico            |
| `#graph/risk-high`                          | path matches high-risk pattern OU git-dirty + critical file                                                                                           | alto               |
| `#graph/action-required`                    | visual fact `kind:problem`                                                                                                                            | alto               |
| `#graph/evidence-gap`                       | visual fact `kind:missing`                                                                                                                            | médio              |
| `#signal/static-high`                       | visual fact `kind:debt`                                                                                                                               | médio              |
| `#signal/hotspot`                           | visual fact `kind:architecture` ou unmapped effect                                                                                                    | baixo              |
| `#signal/external`                          | visual fact `kind:integration`                                                                                                                        | informativo        |
| `#workspace/dirty`                          | `git status` mostra arquivo modificado                                                                                                                | informativo        |
| `#source/pulse-machine`                     | `surface:pulse-machine`                                                                                                                               | informativo        |
| `#mirror/metadata-only`                     | payload="metadata-only" OU file > 5MB                                                                                                                 | informativo        |
| `#graph/surface-{ui,backend,worker,source}` | classificação de surface por path                                                                                                                     | informativo        |
| `#graph/governance`                         | surface = `governance` ou `pulse-machine`                                                                                                             | informativo        |
| `#graph/proof-test`                         | visual fact `kind:flow` ou `kind:proof`                                                                                                               | informativo        |
| `#graph/runtime-api`                        | `route` / `api-call` fact OU git-dirty controller                                                                                                     | médio              |
| `#graph/orphan`                             | **DEFINIDA mas não emitida** (graph.json:193 — manual)                                                                                                | —                  |
| `#graph/molecule`                           | **DEFINIDA mas não emitida** (graph.json:200 — manual)                                                                                                | —                  |

### 2.2 Cobertura por categoria da missão

| Categoria mínima da missão       | Coberta hoje? | Como?                                                        | Lacuna                                                                      |
| -------------------------------- | ------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| **Sintaxe e parsing**            | ✗             | —                                                            | Sem AST; sem TS Compiler API; sem ESLint integration.                       |
| **Tipos e contratos**            | ✗             | —                                                            | `tsc --noEmit` nunca alimenta o mirror.                                     |
| **Imports quebrados**            | ✗ parcial     | `internal_links: N` no frontmatter, mas só conta, não valida | Imports broken, unused, circular: nada.                                     |
| **Imports não utilizados**       | ✗             | —                                                            | Knip existe (`npm run quality:dead-code`) mas não conecta.                  |
| **Dependências circulares**      | ✗             | —                                                            | Madge existe (`npm run quality:graph`) mas não conecta.                     |
| **Dependências com CVE**         | ✗             | —                                                            | Sem SCA.                                                                    |
| **Código morto**                 | ✗             | —                                                            | Knip não conecta.                                                           |
| **Lint e estilo**                | ✗             | —                                                            | ESLint, Prettier, Biome existem; nada flui pro mirror.                      |
| **Complexidade ciclomática**     | ✗ parcial     | Lizard via Codacy (cloud), não local                         | Não vira tag.                                                               |
| **Segurança (secrets/SQLi/XSS)** | ✗ parcial     | regex `debt:secret-like-token` (heurística básica)           | Sem Semgrep, sem trivy.                                                     |
| **Performance**                  | ✗             | —                                                            | Sem N+1 detector, sem bundle analyzer, sem React render scan.               |
| **Lógica null/undefined**        | ✗             | —                                                            | Sem TS strict null check enforcement.                                       |
| **Promises não awaited**         | ✗ parcial     | `effect-intensity:async:*` conta, não detecta missing await  | ESLint `no-floating-promises` desconectado.                                 |
| **Try sem catch significativo**  | ✗ parcial     | só conta `try`/`catch`, não classifica vazio                 | —                                                                           |
| **Testes ausentes**              | ✗             | —                                                            | mirror-tests.mjs espelha testes mas não correlaciona com módulos sem teste. |
| **`.skip`/`.only` esquecidos**   | ✗             | —                                                            | —                                                                           |
| **Boundaries arquiteturais**     | ✗ parcial     | `check:architecture` existe, não conecta                     | —                                                                           |
| **God files (>500 linhas)**      | ✗ parcial     | `bytes` no frontmatter; checker existe; não vira tag         | —                                                                           |
| **Doc ausente em API pública**   | ✗             | —                                                            | —                                                                           |

**Resumo**: das 11 categorias mínimas exigidas pela missão, **zero estão totalmente cobertas**, **algumas têm sinais parciais via regex/contagem**. O motor existente é forte para **classificação semântica** (effect-_, surface-_, risk-\*) mas fraco para **detecção de erros reais**.

### 2.3 Mecânica de visualização atual

- **Native Obsidian** `colorGroups` em `.obsidian/graph.json` (27 grupos).
- Cada grupo: query do tipo `tag:#foo` → cor RGB.
- **Renderização**: nó inteiro pinta da cor do PRIMEIRO `colorGroups` cuja query casa (Obsidian core behavior). **Não é multi-dot.**
- Sem CSS snippet em `.obsidian/snippets/`.
- Sem plugin custom de graph rendering.

**Implicação para a missão**: o requisito "**ponto colorido por erro**, com cor por severidade, múltiplos erros = múltiplos pontos no mesmo nó" **não é alcançável só com configuração**. Vai exigir **uma das três rotas**:

1. **Plugin custom Obsidian** que renderiza badges/dots sobre o nó na graph view (extends `GraphView`).
2. **Reinterpretação visual**: cor do nó = severidade dominante (max), tags adicionais filtram. Mantém native colorGroups.
3. **CSS snippet + DOM injection** via plugin custom (workaround mais frágil).

A escolha precisa ser do dono do repo.

---

## 3. Pontos de extensão (sem tocar arquivos protegidos)

### 3.1 Engines disponíveis no repo

| Engine                  | Instalado               | Comando                             | Output hoje               | Disponível para virar findings JSON                            |
| ----------------------- | ----------------------- | ----------------------------------- | ------------------------- | -------------------------------------------------------------- |
| **TypeScript Compiler** | ✓ tsc 5.9.3             | `npm run typecheck` (per-workspace) | stderr                    | sim — `tsc --pretty false --listFiles` ou Compiler API         |
| **ESLint**              | ✓ 9.39.4                | `npm run lint`                      | stderr (configs LOCKED)   | sim — `--format json`                                          |
| **Prettier**            | ✓ 3.8.3                 | `npm run format:check`              | stderr (diff)             | sim — `--list-different` + JSON wrapper                        |
| **Knip**                | ✓ 6.9.0                 | `npm run quality:dead-code`         | text                      | sim — `knip --reporter json`                                   |
| **Madge**               | ✓ 8.0.0                 | `npm run quality:graph`             | text                      | sim — `madge --json --circular`                                |
| **Biome**               | ✓ 1.9.4                 | (sem npm alias direto)              | JSON nativo               | sim                                                            |
| **Codacy**              | ✓ (cloud + cache local) | `npm run codacy:sync`               | `PULSE_CODACY_STATE.json` | já é JSON                                                      |
| **PULSE auditors**      | ✓ (locked)              | `npm run pulse:json`                | `PULSE_*.json`            | já é JSON                                                      |
| **Architecture guards** | ✓                       | `npm run check:architecture`        | text                      | precisa wrapper                                                |
| **Ratchet**             | ✓                       | `npm run ratchet:measure`           | `ratchet.json`            | já é JSON                                                      |
| **Semgrep**             | ✓ via Codacy            | (sem alias local)                   | SARIF via Codacy          | requer cloud sync                                              |
| **mypy / Ruff**         | ✗                       | —                                   | —                         | — (só 6 .py legados em `/scripts/instrument-*.py`, fora do CI) |

### 3.2 Surface de plug-in do daemon (sem editar locked)

O daemon **não consome sidecar JSON de findings hoje**. Mas:

- O `_source/manifest.json` é lido pelo daemon a cada run (`MANIFEST_PATH`).
- O `content.mjs` chama `extractVisualFacts()` por arquivo e emite `tags[]` + `visual_facts[]` no frontmatter.

**Estratégia segura** (não toca locked):

1. Criar `scripts/findings-engines/` (não-locked) com um wrapper por engine: `tsc.mjs`, `eslint.mjs`, `knip.mjs`, `madge.mjs`, `semgrep.mjs`, etc. Cada um produz JSON normalizado:
   ```json
   {
     "engine": "tsc",
     "ranAt": "2026-05-02T...",
     "findings": [
       {
         "file": "backend/src/foo.ts",
         "line": 42,
         "category": "type",
         "severity": "high",
         "rule": "TS2322",
         "message": "..."
       }
     ]
   }
   ```
2. Criar `scripts/ops/aggregate-findings.mjs` que agrega tudo em `FINDINGS_AGGREGATE.json` (raiz do repo, gitignored).
3. **Como o daemon vai ler isso?** Duas opções:
   - **Opção A — sidecar passive**: gerar `_source/<file>.findings.json` paralelo a cada `<file>.md`; um futuro plugin custom Obsidian lê esse JSON e renderiza os dots na graph view.
   - **Opção B — pedir ao dono do repo** uma alteração mínima no daemon locked para anexar findings ao frontmatter (`findings: [...]`). Requer autorização explícita por ser arquivo protegido.

**Recomendação**: começar com **Opção A** (zero alteração em locked). Avaliar Opção B só se a UX provar limitação.

### 3.3 Watcher (Fase 2) — viabilidade

- **`chokidar` NÃO está instalado.** `node:fs.watch` é o que o daemon usa hoje.
- `fs.watch` tem limitações conhecidas: macOS dispara events duplicados, falha em renames atômicos editor-side, não atravessa symlinks de forma confiável.
- **Trade-off**:
  - Manter `fs.watch` do daemon e adicionar engines como reação: simples, zero deps, herda os bugs do `fs.watch`.
  - Adicionar `chokidar` num **novo** script `scripts/findings-watch.mjs` paralelo ao daemon (não-locked): mais robusto cross-platform; consome o mesmo lockfile? Decidir.
- **Conflitos**: husky pre-push roda `prepush:scoped` (não toca mirror). Sem conflito.
- **Watchers existentes**: `backend start:dev` (NestJS), `worker start:watch` (nodemon), `frontend test:watch` (vitest). Nenhum mexe no vault. Sem risco de double-write.

### 3.4 CI hooks

- `.github/workflows/ci-cd.yml` job `quality` roda `npm run pulse:ci` (linha 255).
- `.github/workflows/nightly-ops-audit.yml` roda `pulse:report` + `pulse:ci` + `codacy:sync`.
- **Mirror daemon não roda em CI hoje.** Se quisermos findings em PR, precisa adicionar job dedicado.

---

## 4. Recomendações para Fase 1 e Fase 2

> **Apresentação para validação. Não implementadas.**

### Fase 1 — Compilador de erros expandido

1. **Criar `scripts/findings-engines/`** (non-locked) com módulos isolados por engine — começar com `tsc`, `eslint`, `knip`, `madge`, `semgrep` (via Codacy cache), `architecture-guard`, `ratchet`.
2. **Schema único** `Finding`:
   ```ts
   { file, line, column?, category, severity: 'critical'|'high'|'medium'|'low',
     engine, rule, message, fingerprint }
   ```
3. **Aggregator** `scripts/ops/aggregate-findings.mjs` → `FINDINGS_AGGREGATE.json` (gitignored).
4. **Sidecar emit**: `scripts/ops/emit-findings-sidecars.mjs` lê o aggregate e escreve `_source/<path>.findings.json` paralelo a cada mirror node. **Não toca o `.md` locked nem o daemon.**
5. **Visualização**: precisa decisão sobre rota (plugin custom vs reinterpretação de cor — ver §2.3).
6. **Filtros**: tags `#err/<categoria>`, `#err/sev/<severidade>` adicionadas pelo plugin custom OU como tags extra no `.md` se autorizarmos alterar o daemon.

### Fase 2 — Espelhamento dinâmico

1. **Operacionalizar o que já existe**: criar `npm run mirror:watch`, `mirror:status`, `mirror:rebuild` no `package.json` raiz. Documentar.
2. **Novo watcher de findings**: `scripts/findings-watch.mjs` com `chokidar` (debounce 300ms, conforme missão), reanalisa só o arquivo + dependentes via Madge, atualiza sidecar.
3. **Coordenação com daemon**: usar lockfile compartilhado `.obsidian-mirror-daemon.lock` ou criar `.findings-watch.lock` separado (decidir).
4. **CLI uniforme**: `start | stop | pause | resume | rescan-full`.
5. **`.mirrorignore`**: opcional além de `.gitignore`. Onde plugar isso sem editar locked? `utils.mjs` faz o filtering — alteração requer autorização.

### Decisões pendentes (precisam de você)

| #   | Decisão                                        | Opções                                                          | Default sugerido                                   |
| --- | ---------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| D1  | Rota visual dos "pontos"                       | (a) plugin custom, (b) reinterpretar cor de nó, (c) CSS snippet | (b) começar simples, (a) se necessário             |
| D2  | Editar daemon locked p/ injetar findings?      | sim / não                                                       | **não** — usar sidecars                            |
| D3  | Watcher novo: `chokidar` ou herdar `fs.watch`? | chokidar / fs.watch / ambos                                     | chokidar (novo arquivo, não toca daemon)           |
| D4  | `.mirrorignore`?                               | sim / não                                                       | sim, mas só se aprovar editar `utils.mjs` (locked) |
| D5  | CI: rodar findings no PR?                      | sim / não                                                       | sim, em job dedicado                               |

---

## 5. STOP — Aguardando validação

**Esta auditoria conclui a Fase 0 da missão.** Conforme protocolo:

> "Entregue um relatório `MIRROR_AUDIT.md` com: diagrama textual da arquitetura atual, tabela de cobertura de detecção, pontos de extensão identificados para Fase 1 e Fase 2. **PARE aqui. Aguarde validação explícita antes de seguir.**"

Para destravar Fase 1, preciso de:

1. **Aprovação geral** desta auditoria (ou correções).
2. **Decisões D1–D5** acima.
3. **Confirmação** de que vou trabalhar com OpenCode/DeepSeek V4 Pro como substrato exclusivo de subagentes (Claude `Agent` tool proibido — regra salva em memória permanente em 2026-05-02).

Quando autorizar, disparo a Fase 1 com fan-out OpenCode: um subagente DeepSeek por engine (`tsc`, `eslint`, `knip`, `madge`, `semgrep`, `architecture-guard`, `ratchet-bridge`), em paralelo, cada um produzindo seu wrapper + tests. Eu fico só na orquestração e na síntese final.
