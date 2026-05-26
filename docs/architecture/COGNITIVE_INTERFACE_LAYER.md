# Kloel Cognitive Interface Layer

> Canonical reference for all agents (Claude Code / Codex CLI / Hermes / OpenCode)
> on how to access the unified protocol layer that connects code intelligence,
> debug, browser, API contracts, event contracts, telemetry, findings,
> dependencies, AST and test reports through a single MCP surface.

Last updated: 2026-05-26 — wave 26 (post-LSP-mesh).

## The protocol family

| Protocol          | What the agent gets                                                                                                      | Where it lives                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| **LSP**           | Real language-server intelligence: definition, references, hover, symbols, diagnostics, completion, code actions, rename | MCP `lsp-mesh` (10 tools, 14 servers, 7 workspaces)                           |
| **DAP**           | Debug adapter — breakpoints, eval, stack frames                                                                          | Planned (Node `--inspect` bridge); not yet wired                              |
| **CDP**           | Chrome DevTools Protocol — DOM, network, screenshots, performance                                                        | MCP `chrome-devtools` (global, `~/.claude.json`) + `claude-in-chrome`         |
| **OpenAPI**       | HTTP API contract — paths, params, schemas, auth                                                                         | `tools/openapi/openapi-spec.json` via `cognitive-hub.protocol_hub_openapi`    |
| **AsyncAPI**      | Event-driven architecture contract — channels, payloads, emitters, consumers                                             | `tools/asyncapi/asyncapi-spec.json` via `cognitive-hub.protocol_hub_asyncapi` |
| **SARIF**         | Unified static-analysis findings (ESLint, TS, Codacy)                                                                    | `tools/sarif/*.sarif` via `cognitive-hub.protocol_hub_sarif`                  |
| **SBOM**          | CycloneDX dependency inventory per workspace                                                                             | `tools/sbom/*.json` via `cognitive-hub.protocol_hub_sbom`                     |
| **OpenTelemetry** | Traces, metrics, logs                                                                                                    | Datadog MCP (`datadog`) + Sentry MCP (`sentry`, `sentry-bridge`)              |
| **Tree-sitter**   | Multi-language AST                                                                                                       | CodeGraph MCP (`codegraph` — SQLite-indexed at `.codegraph/codegraph.db`)     |
| **Test reports**  | Pass/fail, coverage, affected tests                                                                                      | `test-runner` MCP (`run_jest`, `run_tsc`, `coverage_for_module`)              |
| **CI/CD checks**  | GitHub Actions status, PR checks                                                                                         | `github` MCP                                                                  |

## Single entry: `cognitive-hub`

The MCP entry `cognitive-hub` in `.mcp.json` is the unified front-end. It
exposes 6 tools that query each protocol's pre-generated data file:

| Tool                    | Returns                                              | Backing data                        |
| ----------------------- | ---------------------------------------------------- | ----------------------------------- |
| `protocol_hub_status`   | Health-check of all 10 protocols (available/missing) | runtime check of paths              |
| `protocol_hub_openapi`  | NestJS routes matching `query` string                | `tools/openapi/openapi-spec.json`   |
| `protocol_hub_asyncapi` | Event channels under `domain` namespace              | `tools/asyncapi/asyncapi-spec.json` |
| `protocol_hub_sarif`    | List of SARIF findings files + counts                | `tools/sarif/*.sarif`               |
| `protocol_hub_sbom`     | CycloneDX BOM for one or all workspaces              | `tools/sbom/*.json`                 |
| `protocol_hub_manifest` | Full protocol inventory + agent config paths         | computed at call time               |

## Data generators (refresh)

When source code changes, refresh the underlying data files:

```sh
# extract OpenAPI from NestJS controllers (static AST scan, no backend boot)
node scripts/cognitive/openapi-extract.mjs

# scan EventEmitter2 + BullMQ to build AsyncAPI 2.6
node scripts/cognitive/asyncapi-extract.mjs

# run ESLint per workspace → SARIF 2.1.0 + manifest
node scripts/cognitive/sarif-aggregate.mjs

# CycloneDX SBOM per workspace + manifest
node scripts/cognitive/sbom-generate.mjs
```

All four scripts are idempotent and safe to re-run.

## How to use from a fresh session

Claude Code, Codex CLI, and Hermes all auto-load `.mcp.json` at session start.

1. **Inspect what's there**: call `cognitive-hub.protocol_hub_status` first.
2. **Query routes**: `cognitive-hub.protocol_hub_openapi { query: "checkout" }`.
3. **Query events**: `cognitive-hub.protocol_hub_asyncapi { domain: "commerce" }`.
4. **Direct LSP ops** (definition, rename, etc.) go through `lsp-mesh.lsp_*` — not the hub.
5. **Direct browser ops** go through `chrome-devtools.*`.
6. **Direct test runs** go through `test-runner.run_jest` / `run_tsc`.
7. **Refresh data** via the four `scripts/cognitive/*.mjs` scripts when stale.

## Currently wired MCPs (project `.mcp.json` — 22 entries)

```
atomic-edit    — structured code action space (LSP-backed rename, 14 tools)
codacy         — static analysis findings + coverage
codecov        — PR coverage diffs
codegraph      — tree-sitter + SQLite code index (19 langs)
cognitive-hub  — unified protocol layer (this layer, 6 tools)
datadog        — runtime telemetry (dashboards, metrics, traces, logs)
github         — gh CLI wrapper (issues, PRs, actions, releases)
gitnexus       — code knowledge graph (symbol context, blast radius)
graphify-plus  — operational graph layer (hot clusters, blast radius)
kaisser        — Kaisser SDLC verbs (164 commands)
lsp-mesh       — 10 LSP tools across 14 servers / 7 workspaces
mercadopago    — payments integration
postgres       — read-only Postgres via DATABASE_URL
pulse          — PULSE actionable scanner + remediation dispatch
railway        — Railway infrastructure
saas-compiler  — intent → spec → code pipeline
sentry         — error tracking
sentry-bridge  — Sentry REST API
stripe         — Stripe Connect + payments
task-graph     — persistent task queue with locks
test-runner    — Jest / Vitest / TSC / ESLint with structured results
vercel         — frontend hosting
```

Plus ~13 global MCPs in `~/.claude.json`: `chrome-devtools`, `context7`,
`sequential-thinking`, etc.

## Agent config files this layer plugs into

| Agent       | Config                                                          | What to add                                                                       |
| ----------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Claude Code | `.mcp.json` (project) + `~/.claude.json` (global)               | Already wired — auto-loads on next session                                        |
| Codex CLI   | `~/.codex/config.toml`                                          | `[mcp_servers.lsp-mesh]` + `[mcp_servers.cognitive-hub]` entries                  |
| Hermes CLI  | `~/.hermes/config.yaml` or fork's `cli-config.yaml`             | YAML mcp entry with `command: bash, args: [scripts/mcp/lsp-mesh-mcp-launcher.sh]` |
| OpenCode    | `opencode.json` (project) or `~/.config/opencode/opencode.json` | Same shape as Claude                                                              |

## Verification

```sh
# minimal MCP handshake
(
  printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n'
  printf '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n'
  sleep 1
) | bash scripts/mcp/cognitive-hub-mcp-launcher.sh 2>/dev/null | head -2

# real-world tool call
(
  printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n'
  printf '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"protocol_hub_openapi","arguments":{"query":"checkout"}}}\n'
  sleep 1
) | bash scripts/mcp/cognitive-hub-mcp-launcher.sh
```

Validated 2026-05-26: 580 OpenAPI paths, 73 AsyncAPI channels, 8/10 protocol slots
available. lsp-mesh smoke test: 5 TypeScript workspaces all healthy with
distinct PIDs.

## Related

- [[../../tools/cognitive-hub/protocol-hub.mjs]] — hub source
- [[../../tools/lsp-mesh/lsp-router.mjs]] — LSP mesh source
- [[../../scripts/mcp/cognitive-hub-mcp-launcher.sh]] — launcher
- [[../../scripts/cognitive/]] — data generators
- [CANONICAL_DOMAINS](CANONICAL_DOMAINS.md) — domain boundaries this layer indexes
