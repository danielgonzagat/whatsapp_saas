# Sentry MCP Setup — W8.2 (HUD)

## What was installed

| Component  | Choice               | Version | Transport   |
| ---------- | -------------------- | ------- | ----------- |
| MCP server | getsentry/sentry-mcp | 0.33.0  | stdio (npx) |

## Why getsentry/sentry-mcp

- **Official Sentry project**: maintained by Sentry's engineering team (674 stars, 105 forks)
- **22 MCP tools** in standard mode covering issues, events, traces, replays, profiles, projects, teams, docs
- **Embedded AI agent**: `search_events`, `search_issues`, `search_issue_events` use embedded LLM to translate natural language to Sentry query syntax
- **Agent mode**: `use_sentry` tool delegates multi-step operations to an internal AI agent
- **Skill-based authorization**: inspect, seer, docs, triage, project-management — granular scoping
- **runs via npx** — no global install, no npm dependency in package.json

### Competitors considered

| Candidate | Rejection reason                                           |
| --------- | ---------------------------------------------------------- |
| (none)    | This is the only Sentry MCP integration. The official one. |

## Files on disk

No local files required. The server runs via `npx @sentry/mcp-server@latest` — npm caches the package automatically.

## Required manual step (Daniel must do this)

### 1. Generate a Sentry Auth Token

1. Log into Sentry: https://sentry.io
2. Go to **Settings → Account → API → Auth Tokens**
3. Click **Create New Token**
4. Check these scopes:
   - `org:read`
   - `project:read`
   - `project:write`
   - `team:read`
   - `team:write`
   - `event:write`
5. Click **Create Token**
6. Copy the token (it looks like `sntryu_...`)

### 2. Inject the token into ~/.claude.json

1. Open `~/.claude.json`
2. Find the `sentry` entry under `projects["/Users/danielpenin/whatsapp_saas"].mcpServers`
3. Replace `PLACEHOLDER_GENERATE_SENTRY_AUTH_TOKEN` with the real token
4. Save and restart Claude Code

> The placeholder is at: `projects["/Users/danielpenin/whatsapp_saas"].mcpServers.sentry.env.SENTRY_ACCESS_TOKEN`

### 3. (Optional) Set up LLM provider for AI-powered search

The embedded AI agent in `search_events`, `search_issues`, and `search_issue_events` requires an LLM provider. Claude Code already has access to Anthropic's API, so **no extra setup is needed** — the sentry-mcp server auto-detects `ANTHROPIC_API_KEY` from the Claude Code environment.

If you want to use OpenAI instead, add to the `env` block:

```json
"EMBEDDED_AGENT_PROVIDER": "openai",
"OPENAI_API_KEY": "sk-..."
```

## Verify the connection works

### 1. Check the server boots

```bash
SENTRY_ACCESS_TOKEN=<your-real-token> npx -y @sentry/mcp-server@latest
# Expected: logs showing "Using Anthropic for AI-powered search tools"
# Expected: server starts with stdio transport
```

### 2. In Claude Code (OpenCode)

Once the token is in `~/.claude.json`, restart Claude Code. The `sentry` MCP server will auto-connect. Verify with:

```
/list-mcp-tools sentry
```

You should see all available tools listed.

### 3. Quick smoke test

Ask Claude:

```
show me the latest unresolved errors in Sentry
```

Claude should use the sentry MCP tools to query your Sentry project.

## MCP tools exposed (22 in standard mode)

### Read tools (inspect skill — enabled by default)

| Tool                   | Purpose                                      |
| ---------------------- | -------------------------------------------- |
| `whoami`               | Current user identity and organization list  |
| `find_organizations`   | List available organizations                 |
| `find_teams`           | List teams in an organization                |
| `find_projects`        | List projects in an organization             |
| `find_releases`        | List releases with health data               |
| `get_issue_tag_values` | Tag value distribution for an issue          |
| `get_replay_details`   | Session replay summary and activity          |
| `get_event_attachment` | Download event attachments (screenshots etc) |
| `get_profile_details`  | Performance profile details                  |
| `search_events`        | AI-powered event/span/profile/log search     |
| `search_issues`        | AI-powered issue search with facet support   |
| `search_issue_events`  | AI-powered event search within an issue      |
| `get_sentry_resource`  | Fetch any Sentry resource by URL or type+ID  |

### AI debug tools (seer skill — enabled by default)

| Tool                      | Purpose                                   |
| ------------------------- | ----------------------------------------- |
| `analyze_issue_with_seer` | AI-powered root cause analysis for issues |

### Write tools (triage skill — opt-in)

| Tool           | Purpose                       |
| -------------- | ----------------------------- |
| `update_issue` | Resolve, assign, comment, tag |

### Admin tools (project-management skill — opt-in)

| Tool             | Purpose                     |
| ---------------- | --------------------------- |
| `create_team`    | Create a new team           |
| `create_project` | Create a new project        |
| `update_project` | Modify project settings     |
| `create_dsn`     | Generate a new DSN key      |
| `find_dsns`      | List DSN keys for a project |

### Docs tools (docs skill — opt-in)

| Tool          | Purpose                     |
| ------------- | --------------------------- |
| `search_docs` | Search Sentry documentation |
| `get_doc`     | Retrieve a doc page by path |

### Agent mode only (--agent flag)

| Tool         | Purpose                                             |
| ------------ | --------------------------------------------------- |
| `use_sentry` | Natural-language multi-step operations via AI agent |

### Internal-only (not exposed via MCP)

| Tool                | Purpose                                        |
| ------------------- | ---------------------------------------------- |
| `get_issue_details` | Raw issue detail (used by get_sentry_resource) |
| `get_trace_details` | Raw trace detail (used by get_sentry_resource) |

## Architecture

```
Claude Code (OpenCode)
    │
    ├── MCP stdio transport
    │       │
    │       └── npx @sentry/mcp-server@latest
    │               │
    │               ├── Sentry API (sentry.io — REST)
    │               │   ├── Issues, Events, Traces, Replays
    │               │   ├── Projects, Teams, DSNs
    │               │   └── Documentation (search_docs)
    │               │
    │               ├── Embedded Agent (Anthropic Claude)
    │               │   └── Natural language → Sentry query syntax
    │               │
    │               └── use_sentry agent (multi-step ops)
    │
    └── Global sentry entry (scripts/mcp/sentry-mcp-launcher.sh)
          — reads SENTRY_TOKEN from .env.pulse.local
          — alternative auth method, not project-scoped
```

## Token scopes reference

| Scope           | Why needed                                     |
| --------------- | ---------------------------------------------- |
| `org:read`      | List organizations, read org-level data        |
| `project:read`  | Read projects, issues, events, traces, replays |
| `project:write` | Create projects, modify settings               |
| `team:read`     | List teams in an organization                  |
| `team:write`    | Create teams, assign members                   |
| `event:write`   | Read event data (required by Sentry API auth)  |

## Global entry vs project entry

Two Sentry MCP entries exist in `~/.claude.json`:

| Level   | Key                                                              | Launcher                             |
| ------- | ---------------------------------------------------------------- | ------------------------------------ |
| Global  | `mcpServers.sentry`                                              | `scripts/mcp/sentry-mcp-launcher.sh` |
| Project | `projects["/Users/danielpenin/whatsapp_saas"].mcpServers.sentry` | Direct `npx @sentry/mcp-server`      |

The **global entry** reads `SENTRY_TOKEN` from `.env.pulse.local` and is shared across all projects. The **project entry** (this setup) uses an inline `SENTRY_ACCESS_TOKEN` env var, scoped to KLOEL only.

When working in the KLOEL project, Claude uses the project-scoped entry. In other directories, it falls back to the global launcher.

## Wave 8 integration

This MCP server is consumed by:

- HUD orchestration (W8.1) — Pulse reads runtime error data via Sentry
- OpsAlertModule — error budget tracking and incident correlation
- Error investigation — Claude queries Sentry directly during debugging sessions

Claude/OpenCode will use `search_issues` and `get_sentry_resource` to investigate errors surfaced by the PULSE system.

---

## Idempotency

- `~/.claude.json` edit is checked for existence before insert (manual if re-running)
- Backup at `/tmp/claude-backup-sentry-*.json` preserves prior state
- Token placeholder is stable — no risk of overwriting a real token

## Backup

A backup of `~/.claude.json` was saved to `/tmp/claude-backup-sentry-<timestamp>.json` before modification. To restore:

```bash
cp /tmp/claude-backup-sentry-<timestamp>.json ~/.claude.json
```
