# GitNexus MCP — Code Intelligence Engine

## Overview

GitNexus indexes the entire Kloel codebase into a knowledge graph — every symbol,
dependency, call chain, cluster, and execution flow — and exposes it through MCP
tools so AI agents can understand architecture, blast radius, and impact before
editing code.

**Version installed:** 1.6.3
**Install method:** Global npm (`npm install -g gitnexus`)
**Index date:** 2026-04-26
**Index stats:** 45,733 symbols · 79,852 edges · 1,014 clusters · 300 flows · 2,556 files

## What was installed

| Component            | Location                        | Purpose                                        |
| -------------------- | ------------------------------- | ---------------------------------------------- |
| GitNexus CLI         | `/opt/homebrew/bin/gitnexus`    | Index, query, impact analysis                  |
| Knowledge graph      | `.gitnexus/lbug` (120 MB)       | LadybugDB — full codebase graph                |
| MCP config (project) | `.mcp.json`                     | Stdio MCP server for Claude Code, Cursor, etc. |
| MCP config (Kilo)    | `.kilo/kilo.json`               | Kilo CLI MCP integration                       |
| Global registry      | `~/.gitnexus/registry.json`     | Multi-repo tracking                            |
| Docs                 | `docs/devtools/gitnexus-mcp.md` | This file                                      |
| .gitignore entry     | `.gitignore` line 69            | Excludes `.gitnexus/` from version control     |

## How to re-index

```bash
# Full re-index (run from repo root)
gitnexus analyze --skip-agents-md --verbose

# With semantic embeddings (slower, needs OPENAI_API_KEY)
gitnexus analyze --skip-agents-md --embeddings --verbose

# Force full rebuild
gitnexus analyze --skip-agents-md --force --verbose

# Generate repo-specific skill files for each detected module
gitnexus analyze --skills
```

**Note:** `--skip-agents-md` is required because `AGENTS.md` and `CLAUDE.md`
are governance-protected files in this repo. GitNexus would otherwise append
index stats to them.

## How to start MCP

```bash
# Stdio MCP server (serves all indexed repos)
gitnexus mcp

# Or via npx (same as configured in .mcp.json)
npx -y gitnexus@latest mcp

# HTTP server for web UI connection (port 4747)
gitnexus serve
```

## How to connect in AI CLI

GitNexus is already configured in this repo's MCP configs:

- **Claude Code / Kilo:** `.kilo/kilo.json` — auto-loaded on session start
- **Generic MCP clients (Cursor, Windsurf, etc.):** `.mcp.json`

To manually add to Claude Code:

```bash
claude mcp add gitnexus -- npx -y gitnexus@latest mcp
```

To manually add to Cursor (`~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "gitnexus": {
      "command": "npx",
      "args": ["-y", "gitnexus@latest", "mcp"]
    }
  }
}
```

## Available MCP Tools

| Tool             | Purpose                                                    |
| ---------------- | ---------------------------------------------------------- |
| `list_repos`     | Discover all indexed repositories                          |
| `query`          | Process-grouped hybrid search (BM25 + semantic)            |
| `context`        | 360-degree symbol view — callers, callees, processes       |
| `impact`         | Blast radius analysis with depth grouping and confidence   |
| `detect_changes` | Git-diff impact — maps changed lines to affected processes |
| `rename`         | Multi-file coordinated rename with graph + text search     |
| `cypher`         | Raw Cypher graph queries                                   |

## Uso obrigatório antes de refactors grandes

Antes de qualquer mudança grande em código, o agente deve:

1. **Consultar GitNexus** — use `gitnexus impact <symbol>` para análise de blast radius
2. **Listar dependências impactadas** — identifique todos os arquivos que serão afetados
3. **Listar arquivos que serão alterados** — `gitnexus context <symbol>` para visão 360
4. **Prever riscos** — classifique o risco (1–3) baseado no número de dependências
5. **Propor plano de rollback** — documente como reverter se algo quebrar
6. **Só então editar código** — nunca pule para edição sem análise

### Exemplo de fluxo

```bash
# 1. Analisar impacto de mudar AuthService
gitnexus impact "AuthService" --direction upstream

# 2. Ver contexto completo do símbolo
gitnexus context "AuthService"

# 3. Verificar processos/fluxos afetados
gitnexus query "authentication login flow"

# 4. Ver mudanças atuais vs index
gitnexus detect-changes --scope all

# 5. Após o commit, reindexar para manter o grafo atualizado
gitnexus analyze --skip-agents-md
```

## Validation Results

### Query: "authentication"

- Retornou resultados via BM25 + vector search
- Aviso FTS (full-text search index): `Cannot execute write operations in a read-only database`
  — Limitação conhecida do LadybugDB; não afeta queries de grafo (context, impact, cypher)

### Context: "AuthService"

- Encontrado em `backend/src/auth/auth.service.ts:19–219`
- 22 métodos: `register`, `login`, `oauthLogin`, `refresh`, `requestMagicLink`, etc.
- 8 propriedades: `rateLimitService`, `tokenService`, `passwordService`, `prisma`, `jwt`, etc.
- 5 arquivos importam AuthService (incluindo `auth.module.ts`, `auth.controller.ts`)

### Impact: "PrismaService" (upstream)

- 118+ arquivos que importam PrismaService
- Cobertura completa: auth, billing, checkout, kloel, payments, admin, wallet, etc.

## Troubleshooting

### "Repository not indexed"

```bash
gitnexus analyze --skip-agents-md
```

### FTS index errors ("read-only database")

LadybugDB abre o índice em modo read-only quando outra sessão está usando.
Para resolver:

```bash
# Fechar todas as sessões MCP que usam gitnexus e reindexar
gitnexus analyze --skip-agents-md --force
```

### Index está desatualizado

```bash
# Verificar status
gitnexus status

# Reindexar (incremental, preserva embeddings se existirem)
gitnexus analyze --skip-agents-md
```

### "command not found: gitnexus"

```bash
npm install -g gitnexus
```

### Limpar índice corrompido

```bash
# Deletar índice do repo atual
gitnexus clean

# Recriar
gitnexus analyze --skip-agents-md
```

## Limitations

1. **FTS indexes read-only:** O índice full-text search (FTS) pode falhar em modo read-only.
   Queries de grafo (context, impact, cypher) funcionam normalmente.
2. **--embeddings requer API key:** Para busca semântica, configure `OPENAI_API_KEY`.
3. **Index não é automático:** Precisa rodar `gitnexus analyze` após mudanças grandes.
4. **AGENTS.md/CLAUDE.md protegidos:** `--skip-agents-md` é necessário porque esses
   arquivos são governance-protected neste repo.
5. **Tempo de indexação:** ~46s para 2,556 arquivos (sem embeddings). Com embeddings,
   pode levar vários minutos.

## Security Notes

- `.gitnexus/` está em `.gitignore` — não será commitado
- Nenhum segredo foi exposto durante a indexação
- O MCP server roda localmente e não faz chamadas de rede
- `.gitnexusignore` pode ser criado para excluir arquivos sensíveis da indexação

## Next Steps

1. Rodar `gitnexus analyze --embeddings` quando tiver `OPENAI_API_KEY` configurada
2. Criar `.gitnexusignore` se houver arquivos que não devem ser indexados
3. Configurar hook PostToolUse no Claude Code para sugerir reindex após commits
4. Avaliar `gitnexus wiki` para gerar documentação automática da arquitetura
