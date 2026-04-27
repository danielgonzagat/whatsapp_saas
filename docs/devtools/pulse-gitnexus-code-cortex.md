# PULSE Code Cortex — GitNexus Integration

GitNexus is a knowledge-graph engine that indexes codebases into a queryable structural graph. PULSE Code Cortex integrates GitNexus as a provider/sensor for code structure evidence, keeping PULSE as the governance brain.

## What it does

- **Status check**: Detect if GitNexus is installed, if `.gitnexus/` exists, and if the index is fresh for the current commit.
- **Indexing**: Run `pulse:gitnexus:index` to index the repo for code graph queries.
- **Impact analysis**: Before large refactors, run `pulse:gitnexus:impact` to see which capabilities/flows are affected.
- **MCP server**: GitNexus exposes a stdio MCP server for Claude/Codex/Cursor/OpenCode to query the graph directly.
- **PULSE signal**: GitNexus produces an external signal (`source: gitnexus, type: codegraph`) consumed by certification.

## Setup

**Option 1 — Index from scratch:**

```bash
npm run pulse:gitnexus:index
```

This runs `npx -y gitnexus@latest analyze . --skip-agents-md`.

**Option 2 — Force re-index:**

```bash
npm run pulse:gitnexus:index -- --force
```

## Daily Usage

### Check status

```bash
npm run pulse:gitnexus:status
```

Output:

```json
{
  "available": true,
  "indexExists": true,
  "indexState": "fresh",
  "currentCommit": "abc123...",
  ...
}
```

### Run impact analysis before refactors

```bash
# Analyze current unstaged + staged changes:
npm run pulse:gitnexus:impact

# Analyze specific files:
npm run pulse:gitnexus:impact -- --changed backend/src/checkout/,backend/src/wallet/
```

### Generate full report

```bash
npm run pulse:gitnexus:report
```

## MCP Configuration

The project's `.mcp.json` already includes the `gitnexus` MCP server. AI coding assistants (Claude, Codex, Cursor, OpenCode) automatically pick up this config.

Manual connection:

```bash
npm run gitnexus:mcp
```

## Agent Operating Protocol

Before any large refactor, the AI CLI MUST:

1. `npm run pulse:gitnexus:status` — check index freshness
2. `npm run pulse:gitnexus:impact` — calculate blast radius
3. `npm run pulse:report` — verify certification state
4. List impacted capabilities and flows
5. Define required tests
6. Only then edit code

The rule: **never edit before understanding impact**.

## Artifacts

The following artifacts are generated locally and gitignored:

- `PULSE_GITNEXUS_EVIDENCE.json` — status and raw command evidence
- `PULSE_GITNEXUS_IMPACT.json` — impact analysis report
- `PULSE_GITNEXUS_IMPACT.md` — human-readable impact report

## Troubleshooting

| Issue                         | Solution                                                     |
| ----------------------------- | ------------------------------------------------------------ |
| `gitnexus: command not found` | Run `npm run gitnexus:help` to verify npx resolution         |
| Index is stale                | Run `npm run pulse:gitnexus:index -- --force`                |
| Index is missing              | Run `npm run pulse:gitnexus:index`                           |
| MCP fails to connect          | Run `npx -y gitnexus@latest mcp` directly to debug           |
| Impact analysis empty         | Ensure `.gitnexus/` exists and is fresh; if not, index first |

## Limitations

1. GitNexus runs via `npx` (no global install required).
2. First-time indexing can take several minutes for large repos.
3. Impact analysis via `detect-changes` requires an indexed repo.
4. When GitNexus is unavailable, PULSE falls back to path-based heuristics for capability/flow mapping.
5. The integration does NOT modify CLAUDE.md or AGENTS.md (uses `--skip-agents-md` by default).

## Security

- `.gitnexus/` is gitignored — never committed.
- `PULSE_GITNEXUS_*.json` artifacts are gitignored.
- MCP launcher uses no secrets.
- No API keys or tokens required for code graph operations.
- GitNexus respects `.gitignore` for indexing exclusions.

## Commands Reference

| Command                         | Description                        |
| ------------------------------- | ---------------------------------- |
| `npm run gitnexus:help`         | Show all GitNexus CLI commands     |
| `npm run gitnexus:status`       | Show index status for current repo |
| `npm run gitnexus:index`        | Index current repo                 |
| `npm run gitnexus:index:force`  | Force re-index current repo        |
| `npm run gitnexus:list`         | List all indexed repos             |
| `npm run gitnexus:mcp`          | Start MCP server (stdio)           |
| `npm run pulse:gitnexus`        | PULSE gitnexus subcommand          |
| `npm run pulse:gitnexus:status` | PULSE-wrapped status check         |
| `npm run pulse:gitnexus:index`  | PULSE-wrapped indexing             |
| `npm run pulse:gitnexus:impact` | PULSE-wrapped impact analysis      |
| `npm run pulse:gitnexus:report` | PULSE-wrapped report               |

## Acceptance Criteria

- [x] GitNexus integrated as CodeGraphProvider inside PULSE
- [x] Provider is replaceable (implements CodeGraphProvider interface)
- [x] MCP launcher exists at `scripts/mcp/gitnexus-mcp-launcher.sh`
- [x] `.mcp.json` includes gitnexus server
- [x] `package.json` has gitnexus/pulse:gitnexus scripts
- [x] `.gitignore` prevents committing index and artifacts
- [x] `npm run pulse:gitnexus:status` works
- [x] `npm run pulse:gitnexus:index` works
- [x] `npm run pulse:gitnexus:impact` generates evidence
- [x] Documentation exists at `docs/devtools/pulse-gitnexus-code-cortex.md`
- [x] No secrets exposed
- [x] No protected files altered
- [x] No business logic refactored
