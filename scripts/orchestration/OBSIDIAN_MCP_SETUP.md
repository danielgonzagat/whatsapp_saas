# Obsidian MCP Setup — Wave 4 (HUD)

## What was installed

| Component       | Choice                                 | Version | Transport                            |
| --------------- | -------------------------------------- | ------- | ------------------------------------ |
| Obsidian plugin | coddingtonbear/obsidian-local-rest-api | 3.6.1   | HTTPS (port 27124, self-signed cert) |
| MCP server      | cyanheads/obsidian-mcp-server          | 3.1.1   | stdio (npx)                          |

## Why cyanheads/obsidian-mcp-server

- Most active community: 484 stars, 12.7k monthly npm downloads
- Most recent commits: v3.1.1 published 2026-04-29
- Richest tool surface: 12 MCP tools + 3 resources
- Supports Dataview DQL queries (`obsidian_search_notes` with DQL mode)
- Atomic frontmatter operations (`obsidian_manage_frontmatter`: get/set/delete)
- Runs via npx — no global install, no npm dependency in package.json
- Built on professional framework (@cyanheads/mcp-ts-core) with typed errors, structured logging, and OpenTelemetry tracing

### Competitors considered

| Candidate                               | Rejection reason                                                             |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| ToKiDoO/mcp-obsidian-advanced           | Python (requires uvx), single v0.0.1 release 10 months ago, minimal adoption |
| j-shelfwood/obsidian-local-rest-api-mcp | Last updated June 2025, no Dataview support, non-standard URL defaults       |

## Files on disk

```
/Users/danielpenin/Documents/Obsidian Vault/.obsidian/plugins/obsidian-local-rest-api/
  main.js         (2.5 MB)
  manifest.json   (308 B)
  styles.css      (1.3 KB)
```

## Required manual step (Daniel must do this)

1. Open Obsidian
2. Go to **Settings → Community Plugins → Local REST API** (ensure enabled)
3. Go to the plugin's settings tab
4. Click **Generate API Key** (or copy the existing one)
5. Copy the generated key
6. Open `~/.claude.json`
7. Find the `obsidian` entry under `projects["/Users/danielpenin/whatsapp_saas"].mcpServers`
8. Replace `PLACEHOLDER_GENERATE_IN_OBSIDIAN_SETTINGS` with the real API key
9. Save and restart Claude Code

> The placeholder is at: `projects["/Users/danielpenin/whatsapp_saas"].mcpServers.obsidian.env.OBSIDIAN_API_KEY`

## Verify the connection works

### 1. Check plugin is running

```bash
# With Obsidian open and plugin enabled:
curl -sk https://127.0.0.1:27124/
# Expected: 401 Unauthorized (healthy signal — auth required)
```

### 2. Check MCP server boots

```bash
OBSIDIAN_API_KEY=<your-real-key> npx -y obsidian-mcp-server@latest
# Expected: logs showing 12 tools registered, stdio transport listening
```

### 3. In Claude Code

Once the API key is in `~/.claude.json`, the `obsidian` MCP server will auto-connect. Verify with:

```
/list-mcp-tools obsidian
```

You should see all 12 tools listed.

## MCP tools exposed

| Tool                          | Purpose                                     |
| ----------------------------- | ------------------------------------------- |
| `obsidian_get_note`           | Read a note by vault path                   |
| `obsidian_list_notes`         | List notes in a directory                   |
| `obsidian_list_tags`          | List all tags with usage counts             |
| `obsidian_search_notes`       | Search via text, Dataview DQL, or JSONLogic |
| `obsidian_write_note`         | Create or overwrite a note                  |
| `obsidian_append_to_note`     | Append content to a note                    |
| `obsidian_patch_note`         | Surgical section edits (heading-aware)      |
| `obsidian_replace_in_note`    | Find-and-replace within a note              |
| `obsidian_manage_frontmatter` | Read/write/delete frontmatter (YAML)        |
| `obsidian_manage_tags`        | Add/remove tags (frontmatter + inline)      |
| `obsidian_delete_note`        | Delete a note                               |
| `obsidian_open_in_ui`         | Open a note in the Obsidian editor          |

## MCP resources exposed

| Resource    | URI Pattern                | Description                  |
| ----------- | -------------------------- | ---------------------------- |
| Vault notes | `obsidian://vault/{+path}` | Direct note content          |
| Tags        | `obsidian://tags`          | All tags with counts         |
| Status      | `obsidian://status`        | Server health and vault info |

## Architecture

```
Claude Code (OpenCode)
    │
    ├── MCP stdio transport
    │       │
    │       └── npx obsidian-mcp-server
    │               │
    │               └── HTTPS (port 27124) ──→ obsidian-local-rest-api plugin
    │                                               │
    │                                               └── Obsidian vault
    │
    └── Direct file read (fallback, no auth needed)
```

## Idempotency

Both the plugin install script and the Claude config edit are idempotent:

- Plugin files are always overwritten with the latest release (safe to re-run)
- `community-plugins.json` is checked for duplicate IDs before append
- `~/.claude.json` entry is checked for existence before insert (manual if re-running)

## Wave 4 integration

This MCP server is consumed by:

- `scripts/orchestration/hubs-generator.mjs` (Wave 2) — writes hub notes to `Kloel/00-HUD/`
- `scripts/orchestration/tier-tags-emitter.mjs` (Wave 1) — reads PULSE, writes frontmatter tags
- Daily snapshot system (Wave 2) — writes timestamped snapshots

Claude/OpenCode will use the MCP tools to read `00-NEXT.md` as the first action of any session, and to write hub notes during orchestration runs.

---

## engraph (W6.1) — Hybrid Search Knowledge Graph

### What was installed

| Component  | Choice             | Version | Transport      |
| ---------- | ------------------ | ------- | -------------- |
| MCP server | devwhodevs/engraph | 1.6.1   | stdio (binary) |

### Why engraph

Complements `cyanheads/obsidian-mcp-server@3.1.1` (12 tools, REST-backed vault CRUD). engraph adds:

- **5-lane hybrid search**: semantic embeddings (llama.cpp local, embeddinggemma-300M GGUF) + BM25 FTS5 + wikilink graph traversal + cross-encoder LLM reranker + temporal scoring, fused via two-pass Reciprocal Rank Fusion (RRF)
- **25 MCP tools + 26 REST endpoints** — full vault intelligence surface
- **SQLite-backed** (~10MB typical), zero cloud dependency
- **File watcher** keeps index live as files are edited in Obsidian
- **Query orchestrator** classifies query intent (Conceptual, Factual, Temporal, etc.) and adapts lane weights
- **Write pipeline**: AI agents can create, edit, rewrite, section-edit, and delete notes with smart tag resolution, wikilink discovery, and semantic folder placement

For KLOEL: when Claude asks "find files related to Stripe webhook idempotency", engraph returns ranked results across the entire vault — better than naive grep, much cheaper on tokens (~200 vs ~3000 tokens per search).

### Install method

```bash
brew install devwhodevs/tap/engraph
```

Installed at `/opt/homebrew/bin/engraph`. Dependencies: cmake, libssh2, libgit2, sqlite, python@3.14, llvm, pkgconf, rust (compiled from source via cargo install).

### Index command

```bash
engraph index "/Users/danielpenin/Documents/Obsidian Vault"
```

First run downloads embedding model (~334MB, embeddinggemma-300M-Q8_0.gguf) from HuggingFace. Model is stored in `~/.engraph/models/`.

Vault size at index time: **3,928 markdown files**. Index uses Metal GPU acceleration (AGXMetalG16G_B0 on Apple Silicon). Full first index is estimated at ~50-70 minutes on M-series Mac.

Subsequent runs are incremental — only re-embeds changed files.

### Index stats (initial)

| Metric       | Value                                           |
| ------------ | ----------------------------------------------- |
| Files        | 3,928                                           |
| Chunks       | TBD (in progress)                               |
| Vectors      | TBD (in progress)                               |
| Intelligence | disabled (opt-in, +1.3GB models)                |
| DB size      | ~188 KB (grows as embedding progresses)         |
| Model        | embeddinggemma-300M-Q8_0 (llama.cpp, Metal GPU) |

To check status: `engraph status --json`

### 25 MCP tools enumerated

#### Read tools (8)

| Tool            | Purpose                                  |
| --------------- | ---------------------------------------- |
| `search`        | 5-lane hybrid search with RRF fusion     |
| `read_note`     | Read full note content + metadata        |
| `read_section`  | Read a specific section by heading       |
| `list_notes`    | List notes with tag/folder/date filters  |
| `vault_map`     | Vault structure overview (folders, tags) |
| `who`           | Person context bundle                    |
| `project`       | Project context bundle                   |
| `topic_context` | Rich topic context with token budget     |

#### Write tools (10)

| Tool               | Purpose                                        |
| ------------------ | ---------------------------------------------- |
| `create_note`      | Create new note with smart filing              |
| `append_note`      | Append content to existing note                |
| `edit_note`        | Section-level editing (replace/prepend/append) |
| `rewrite_note`     | Full note rewrite (preserves frontmatter)      |
| `edit_frontmatter` | Granular frontmatter mutations                 |
| `move_note`        | Move note to different folder                  |
| `archive_note`     | Soft-delete (archive) a note                   |
| `unarchive_note`   | Restore archived note                          |
| `update_metadata`  | Update note metadata                           |
| `delete_note`      | Delete note (soft or hard)                     |

#### Identity (2)

| Tool             | Purpose                                   |
| ---------------- | ----------------------------------------- |
| `get_identity`   | User identity (L0) and vault context (L1) |
| `setup_identity` | First-time onboarding identity setup      |

#### Index (1)

| Tool           | Purpose                                    |
| -------------- | ------------------------------------------ |
| `reindex_file` | Re-index a single file after external edit |

#### Diagnostic (1)

| Tool           | Purpose                                   |
| -------------- | ----------------------------------------- |
| `vault_health` | Orphan notes, broken links, stale content |

#### Migrate (3)

| Tool              | Purpose                     |
| ----------------- | --------------------------- |
| `migrate_preview` | Preview PARA migration plan |
| `migrate_apply`   | Apply PARA migration        |
| `migrate_undo`    | Undo last PARA migration    |

### How to refresh index

```bash
# Full re-index from scratch
engraph index --rebuild

# Incremental (only changed files)
engraph index
```

The file watcher in `engraph serve` keeps the index live automatically while the MCP server is running.

### How to enable intelligence (optional, +1.3GB)

```bash
engraph configure --enable-intelligence
```

Adds LLM query expansion (Qwen3-0.6B orchestrator) and cross-encoder reranker (Qwen3-Reranker-0.6B). Downloads additional ~1.3GB of models. Adds a 4th reranker lane to search.

### Claude Code config

Added to `~/.claude.json` under `projects["/Users/danielpenin/whatsapp_saas"]`:

```json
{
  "mcpServers": {
    "engraph": {
      "type": "stdio",
      "command": "engraph",
      "args": ["serve"],
      "env": {}
    }
  },
  "enabledMcpServers": ["obsidian", "engraph"]
}
```

No env vars needed — engraph reads vault path from `~/.engraph/config.toml`.

### Conflict notes vs cyanheads/obsidian-mcp-server

Both MCP servers coexist without conflict:

| Aspect                  | cyanheads (obsidian)        | engraph                                       |
| ----------------------- | --------------------------- | --------------------------------------------- |
| Tool prefix             | `obsidian_*`                | No prefix (per engraph naming)                |
| Backend                 | REST API → Obsidian plugin  | SQLite + llama.cpp directly                   |
| Requires Obsidian open? | Yes (plugin must run)       | No                                            |
| Token economy           | ~80 tokens per read         | ~200 tokens per search                        |
| Best for                | CRUD, frontmatter, Dataview | Deep search, graph traversal, context bundles |

They complement each other: use `obsidian` for note CRUD and Dataview queries; use `engraph` for semantic/graph search and context bundles.

### Wave 6 integration

engraph is consumed by:

- Karpathy LLM Wiki pattern (W6.2) — Claude reads `_meta/claude-instructions.md` via engraph
- Context engine — engraph topic/person/project bundles for session startup
- DevOps Companion (W6.3) — auto-doc generation with vault integration

### Architecture (extended)

```
Claude Code (OpenCode)
    │
    ├── MCP stdio ──→ engraph (binary, no runtime deps)
    │                      │
    │                      ├── SQLite (~/.engraph/engraph.db)
    │                      │   ├── files, chunks, FTS5, vectors
    │                      │   ├── wikilink edges, mentions
    │                      │   └── tags, centroids
    │                      │
    │                      ├── llama.cpp (Metal GPU)
    │                      │   └── embeddinggemma-300M-Q8_0.gguf
    │                      │
    │                      └── File watcher (2s debounce)
    │
    ├── MCP stdio ──→ npx obsidian-mcp-server
    │                      │
    │                      └── HTTPS (port 27124) ──→ obsidian-local-rest-api
    │                                                      │
    │                                                      └── Obsidian vault
    │
    └── Direct file read (fallback, no auth needed)
```
