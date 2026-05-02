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
