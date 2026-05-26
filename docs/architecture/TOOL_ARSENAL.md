# Kloel Tool Arsenal — Complete Reference for Agents

> Every MCP server, LSP language server, script, and data file an agent can
> use inside this monorepo. Read this **before** writing your own scripts —
> almost everything you need is already wired and pre-tested.

Last verified: 2026-05-26 — wave 26 (after LSP-mesh + cognitive-hub wiring).
Agent contexts covered: **Claude Code**, **Codex CLI**, **Hermes CLI**, **OpenCode**.

---

## 1. How MCP discovery works in this repo

Three config files control which MCPs your CLI connects to:

| Agent       | Config file                                                             | Scope                |
| ----------- | ----------------------------------------------------------------------- | -------------------- |
| Claude Code | `.mcp.json` (project) + `~/.claude.json` (global)                       | per-project + global |
| Codex CLI   | `~/.codex/config.toml`                                                  | global               |
| Hermes CLI  | `~/.hermes/config.yaml` or `cli-config.yaml`                            | global               |
| OpenCode    | `opencode.json` (project) + `~/.config/opencode/opencode.json` (global) | per-project + global |

**MCPs load only at session start.** Mid-session you cannot hot-add an MCP;
you must `/clear` (Claude) or restart the CLI.

After session start, deferred-loaded tools surface via `ToolSearch` — use
`ToolSearch(query: "select:mcp__<name>__<tool>")` to materialize the schema.

---

## 2. Layer 1 — The Cognitive Interface (the meta layer)

### `cognitive-hub` (6 tools)

Unified front-end aggregating 10 protocol families. Launcher:
`scripts/mcp/cognitive-hub-mcp-launcher.sh` → `tools/cognitive-hub/protocol-hub.mjs`.

| Tool                    | What it returns                                                 | Example                                     |
| ----------------------- | --------------------------------------------------------------- | ------------------------------------------- |
| `protocol_hub_status`   | Availability of all 10 protocols + actionable hint when missing | `{}`                                        |
| `protocol_hub_openapi`  | NestJS routes matching a string                                 | `{"query":"checkout"}` → 38 of 580 routes   |
| `protocol_hub_asyncapi` | Event channels by namespace                                     | `{"domain":"commerce"}` → 54 of 73 channels |
| `protocol_hub_sarif`    | Static-analysis findings index                                  | `{}`                                        |
| `protocol_hub_sbom`     | CycloneDX inventory per workspace                               | `{"workspace":"worker"}` → 443 components   |
| `protocol_hub_manifest` | Full protocol inventory + agent config-paths                    | `{}`                                        |

Data lives in `tools/{openapi,asyncapi,sarif,sbom}/*.json`. Refresh via
`scripts/cognitive/{openapi-extract,asyncapi-extract,sarif-aggregate,sbom-generate}.mjs`.

### `lsp-mesh` (10 tools)

Real language-server intelligence over 14 LSPs in 7 workspaces. Launcher:
`scripts/mcp/lsp-mesh-mcp-launcher.sh` → `tools/lsp-mesh/lsp-router.mjs`.

| Tool               | Purpose                           | Required args                          |
| ------------------ | --------------------------------- | -------------------------------------- |
| `lsp_definition`   | Go to definition                  | `file`, `line`, `character`            |
| `lsp_references`   | Find all references               | `file`, `line`, `character`            |
| `lsp_hover`        | Type info + JSDoc                 | `file`, `line`, `character`            |
| `lsp_symbols`      | Document outline                  | `file`                                 |
| `lsp_diagnostics`  | LSP diagnostics for file          | `file`                                 |
| `lsp_completion`   | Completions at position           | `file`, `line`, `character`            |
| `lsp_code_actions` | Quickfixes/refactors              | `file`, `startLine`, `endLine`         |
| `lsp_rename`       | Workspace edit for rename         | `file`, `line`, `character`, `newName` |
| `lsp_health`       | Health-check all LSPs             | optional `language` filter             |
| `lsp_shutdown`     | Graceful kill of all spawned LSPs | `{}`                                   |

Servers wired (see `tools/lsp-mesh/lsp-mesh.json`): typescript, eslint, prisma,
tailwindcss, css, html, json, yaml, bash, markdown (marksman), toml (taplo),
sql (sqls), dockerfile, docker-compose.

Workspaces: `root`, `backend`, `frontend`, `frontend-admin`, `worker`, `e2e`, `scripts`.

Pooled per `(language, workspace)`; lazy spawn; 15s timeout per request; id-keyed
response routing so concurrent calls don't collide.

---

## 3. Layer 2 — Code intelligence

### `codegraph` (deterministic AST+symbol graph)

SQLite + FTS5 + tree-sitter. Index at `.codegraph/codegraph.db` (180 MB). Live-watched.

| Tool                                | Use when                                              |
| ----------------------------------- | ----------------------------------------------------- |
| `mcp__codegraph__codegraph_search`  | Find symbols by name (with optional `kind` filter)    |
| `mcp__codegraph__codegraph_context` | **PRIMARY** — build comprehensive context for a task  |
| `mcp__codegraph__codegraph_callers` | Find functions/methods calling a symbol               |
| `mcp__codegraph__codegraph_callees` | Find what a symbol calls (dependencies)               |
| `mcp__codegraph__codegraph_impact`  | Blast-radius analysis (depth-bounded)                 |
| `mcp__codegraph__codegraph_node`    | Detailed info on one symbol (location, signature)     |
| `mcp__codegraph__codegraph_files`   | Tree of indexed files with metadata                   |
| `mcp__codegraph__codegraph_status`  | Index statistics (63.6k nodes / 137k edges currently) |

Example: `codegraph_search { query: "asRecord", kind: "function", limit: 15 }`.

### `gitnexus` (code-knowledge graph — execution flows)

Semantic + BM25 hybrid ranking over flows.

| Tool                            | Use when                                                 |
| ------------------------------- | -------------------------------------------------------- |
| `mcp__gitnexus__query`          | Natural-language search returning ranked execution flows |
| `mcp__gitnexus__impact`         | Blast-radius with execution flow + risk assessment       |
| `mcp__gitnexus__shape_check`    | Detect API contract drift                                |
| `mcp__gitnexus__context`        | 360° view (callers + callees + categorized refs)         |
| `mcp__gitnexus__route_map`      | All HTTP routes                                          |
| `mcp__gitnexus__detect_changes` | What changed in the graph since N                        |
| `mcp__gitnexus__rename`         | Cross-cutting rename plan                                |
| `mcp__gitnexus__list_repos`     | List all indexed repos                                   |

Use `gitnexus` over `codegraph` when you need execution flows or natural-language
queries; use `codegraph` when you need precise symbol-level data.

### `atomic-edit` (50 tools, structured action space)

Every edit is sha256-guarded, syntax-validated, all-or-nothing.

**Read primitives (use these BEFORE editing):**

| Tool                                   | Returns                                                      |
| -------------------------------------- | ------------------------------------------------------------ |
| `mcp__atomic-edit__code_browse`        | Repo-relative directory listing                              |
| `mcp__atomic-edit__code_outline`       | Symbols + line ranges (no bodies) for one file — token-cheap |
| `mcp__atomic-edit__code_outline_batch` | Outline for every file matching a glob (≤ 20 files)          |
| `mcp__atomic-edit__code_read_symbol`   | Complete syntactic unit for a selector, with exact range     |
| `mcp__atomic-edit__code_file_stat`     | sha256 + size + line count for stale-check                   |

**Write primitives (atomic, validated):**

| Tool                                                            | Purpose                                              |
| --------------------------------------------------------------- | ---------------------------------------------------- |
| `mcp__atomic-edit__atomic_edit_symbol`                          | Replace/insert-after/remove a symbol by selector     |
| `mcp__atomic-edit__atomic_rename_symbol`                        | In-file rename via TS language service               |
| `mcp__atomic-edit__atomic_rename_symbol_cross_file`             | Project-wide semantic rename (TS LS, all-or-nothing) |
| `mcp__atomic-edit__atomic_replace_literal`                      | Scoped exact-count literal replacement               |
| `mcp__atomic-edit__atomic_replace_range`                        | Ranged byte/line replacement                         |
| `mcp__atomic-edit__atomic_insert_at`                            | Insert at line/column                                |
| `mcp__atomic-edit__atomic_delete_range`                         | Delete byte range                                    |
| `mcp__atomic-edit__atomic_apply_edits`                          | LSP TextEdit[] batch on one file                     |
| `mcp__atomic-edit__atomic_transaction`                          | Multi-file batch, all-or-nothing                     |
| `mcp__atomic-edit__atomic_add_import` / `atomic_remove_import`  | Deduped, comma-safe import management                |
| `mcp__atomic-edit__atomic_replace_property_value`               | Scoped property edit                                 |
| `mcp__atomic-edit__atomic_lock_acquire` / `atomic_lock_release` | Cross-agent file locks                               |

**Prefer atomic-edit over Edit/Write when:** rename, multi-file changes,
ambiguous match scenarios, or when you need rollback guarantees.

### `codacy` (organization-wide static analysis + coverage)

| Tool                                                | Use when                                   |
| --------------------------------------------------- | ------------------------------------------ |
| `mcp__codacy__codacy_list_repository_issues`        | Issue triage by severity/category/language |
| `mcp__codacy__codacy_get_file_issues`               | Per-file findings                          |
| `mcp__codacy__codacy_get_file_coverage`             | Per-file coverage                          |
| `mcp__codacy__codacy_get_pull_request_git_diff`     | PR diff                                    |
| `mcp__codacy__codacy_search_repository_srm_items`   | Security findings                          |
| `mcp__codacy__codacy_list_repository_pull_requests` | PR list                                    |

**Hard rule** (per repo `REGRA DE CODACY`): never weaken Codacy. Always
operate in `MAX-RIGOR LOCK`. To reduce issues, fix real code.

---

## 4. Layer 3 — Operations & Governance

### `kaisser` (Kaisser SDLC verbs — 164 commands as MCP)

| Tool                                                       | Use when                      |
| ---------------------------------------------------------- | ----------------------------- |
| `mcp__kaisser__kaisser_doctor`                             | Quick health check of dev env |
| `mcp__kaisser__kaisser_detect_stack`                       | Auto-detect repo stack        |
| `mcp__kaisser__kaisser_plan_list` / `_tasks` / `_rounds`   | Plan inspection               |
| `mcp__kaisser__kaisser_backlog_list`                       | Backlog items                 |
| `mcp__kaisser__kaisser_handoff_read` / `_write` / `_drift` | Session handoff machinery     |
| `mcp__kaisser__kaisser_audit_log`                          | Audit trail                   |
| `mcp__kaisser__kaisser_deploy_dry_run`                     | Deploy preview                |
| `mcp__kaisser__kaisser_pr_review_fetch`                    | PR review data                |
| `mcp__kaisser__kaisser_nextid`                             | Next ID generator             |
| `mcp__kaisser__kaisser_mesh_routes`                        | Inter-MCP routing             |

### `pulse` (governance scanner + dispatcher)

| Tool                                           | Use when                                     |
| ---------------------------------------------- | -------------------------------------------- |
| `mcp__pulse__pulse_status`                     | Is the runner healthy + where artifacts live |
| `mcp__pulse__pulse_scan` / `pulse_scan_module` | Run a fresh scan                             |
| `mcp__pulse__pulse_report`                     | Generate PULSE_REPORT.md                     |
| `mcp__pulse__pulse_health_by_module`           | Module-level health roll-up                  |
| `mcp__pulse__pulse_top_gates`                  | Worst-offender gates                         |
| `mcp__pulse__pulse_history`                    | Trend                                        |
| `mcp__pulse__pulse_dispatch_fix`               | Auto-dispatch remediation to a subagent      |

PULSE's `scripts/pulse/no-hardcoded-reality-audit.ts` is a **locked auditor** —
never modified by any AI.

### `test-runner` (structured test execution)

| Tool                                    | Returns                          |
| --------------------------------------- | -------------------------------- |
| `mcp__test-runner__run_tsc`             | TS errors per workspace          |
| `mcp__test-runner__run_jest`            | Jest results (backend)           |
| `mcp__test-runner__run_vitest`          | Vitest results (frontend/worker) |
| `mcp__test-runner__run_eslint`          | Lint results                     |
| `mcp__test-runner__affected_tests`      | Tests affected by changed files  |
| `mcp__test-runner__coverage_for_module` | Coverage of a module             |
| `mcp__test-runner__test_summary`        | Test command inventory           |

### `task-graph` (persistent queue + cross-agent locks)

| Tool                                                      | Use when                 |
| --------------------------------------------------------- | ------------------------ |
| `mcp__task-graph__task_lock_acquire` / `_release`         | Cross-agent coordination |
| `mcp__task-graph__task_next`                              | Claim next ready task    |
| `mcp__task-graph__task_import_plan` / `task_import_issue` | Ingest plans/issues      |
| `mcp__task-graph__task_update`                            | Mutate task fields       |
| `mcp__task-graph__task_list` / `task_stats`               | Inspection               |

Persistent storage in `.task-graph/`. Survives sessions.

### `graphify-plus` (enrichment + operational layer)

| Tool                                        | Use when                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| `mcp__graphify-plus__hot_clusters`          | Composite priority (errors+blast-radius+doc-drift) — top-N for next PR wave |
| `mcp__graphify-plus__blast_radius`          | What breaks if symbol X changes                                             |
| `mcp__graphify-plus__metadata_for_file`     | All metadata indexed for a file                                             |
| `mcp__graphify-plus__stub_route_inventory`  | Endpoints returning placeholder responses                                   |
| `mcp__graphify-plus__runtime_errors`        | Files with recent Sentry traffic                                            |
| `mcp__graphify-plus__affected_specs`        | Specs likely to fail when X changes                                         |
| `mcp__graphify-plus__auto_pr_dispatch`      | Open a focused PR for a cluster                                             |
| `mcp__graphify-plus__codacy_drain_jobs`     | Drain Codacy queue                                                          |
| `mcp__graphify-plus__playwright_diff`       | Visual regression diff                                                      |
| `mcp__graphify-plus__session_state`         | Read enriched session state                                                 |
| `mcp__graphify-plus__taskgraph_lock_status` | Lock-state across agents                                                    |

### `saas-compiler` (intent → spec → code pipeline)

| Tool                                                                         | Use when                            |
| ---------------------------------------------------------------------------- | ----------------------------------- |
| `mcp__saas-compiler__compile_intent`                                         | Plain-text intent → executable plan |
| `mcp__saas-compiler__intent_to_spec`                                         | Generate spec.json from intent      |
| `mcp__saas-compiler__spec_to_code`                                           | Materialize code from spec          |
| `mcp__saas-compiler__crystallize_stub`                                       | Replace stub with real impl         |
| `mcp__saas-compiler__verify_in_prod`                                         | Verify intent satisfied in prod     |
| `mcp__saas-compiler__twin_up` / `twin_down` / `twin_metrics` / `twin_shadow` | Production-twin shadow testing      |
| `mcp__saas-compiler__capture_fingerprint` / `replay_fingerprint`             | Behavior capture/replay             |

---

## 5. Layer 4 — Data layer

### `postgres` (read-only via DATABASE_URL)

| Tool                               | Use when                                    |
| ---------------------------------- | ------------------------------------------- |
| `mcp__postgres__pg_status`         | Connection config (no secrets exposed)      |
| `mcp__postgres__pg_tables`         | List visible public tables                  |
| `mcp__postgres__pg_table_describe` | Column metadata for a table                 |
| `mcp__postgres__pg_count`          | Row count                                   |
| `mcp__postgres__pg_query`          | **SELECT-only**, parameterized, 100-row cap |
| `mcp__postgres__pg_recent`         | Recent rows                                 |
| `mcp__postgres__pg_explain`        | Explain a query plan                        |

**Rejects INSERT/UPDATE/DELETE/DROP/ALTER.** Safe for runtime inspection.
DB host: `localhost`, database: `whatsapp_saas`.

### `codecov` (PR coverage diff API)

| Tool                                       | Use when                     |
| ------------------------------------------ | ---------------------------- |
| `mcp__codecov__codecov_status`             | Auth status + repo binding   |
| `mcp__codecov__codecov_raw_get`            | Raw API passthrough          |
| `mcp__codecov__get_commit_coverage_totals` | Coverage totals for a commit |

---

## 6. Layer 5 — Cloud / external operations

### `github` (gh CLI wrapper)

| Tool                                                                                  | Use when               |
| ------------------------------------------------------------------------------------- | ---------------------- |
| `mcp__github__list_pull_requests` / `get_pull_request` / `create_pull_request`        | PR CRUD                |
| `mcp__github__list_issues` / `get_issue` / `create_issue` / `update_issue`            | Issue CRUD             |
| `mcp__github__list_commits`                                                           | Commit history         |
| `mcp__github__get_pull_request_status`                                                | Combined status checks |
| `mcp__github__merge_pull_request`                                                     | Merge (use with care)  |
| `mcp__github__search_code` / `search_issues` / `search_repositories` / `search_users` | Search                 |
| `mcp__github__push_files` / `create_or_update_file`                                   | Direct file ops        |
| `mcp__github__create_branch` / `fork_repository`                                      | Repo mgmt              |

### `sentry-bridge` (Sentry REST passthrough)

| Tool                                             | Use when                           |
| ------------------------------------------------ | ---------------------------------- |
| `mcp__sentry-bridge__sentry_top_issues`          | Triage                             |
| `mcp__sentry-bridge__sentry_recent_issues`       | Regression detection (since N min) |
| `mcp__sentry-bridge__sentry_issue_detail`        | Stack trace                        |
| `mcp__sentry-bridge__sentry_issue_events`        | Event list                         |
| `mcp__sentry-bridge__sentry_releases`            | Crash-free % per release           |
| `mcp__sentry-bridge__sentry_errors_since_commit` | Diff vs commit                     |
| `mcp__sentry-bridge__sentry_event_search`        | Sentry query syntax                |
| `mcp__sentry-bridge__sentry_resolve_issue`       | Resolve (WRITE)                    |
| `mcp__sentry-bridge__sentry_assign_issue`        | Assign (WRITE)                     |

### `sentry` (official Sentry MCP, broader)

`mcp__sentry__find_projects`, `find_dsns`, `find_releases`, `find_teams`,
`get_event_attachment`, `get_profile_details`, `get_replay_details`,
`analyze_issue_with_seer` (AI triage), `search_events`, `search_issues`,
`search_docs`, `whoami`.

### `datadog` (observability)

| Tool                                                | Use when                   |
| --------------------------------------------------- | -------------------------- |
| `mcp__datadog__search-logs`                         | Find logs matching a query |
| `mcp__datadog__aggregate-logs`                      | Aggregate log counts       |
| `mcp__datadog__get-monitors` / `get-monitor`        | Monitor state              |
| `mcp__datadog__get-incidents`                       | Active incidents           |
| `mcp__datadog__get-metrics` / `get-metric-metadata` | Metric inspection          |
| `mcp__datadog__get-events`                          | Event stream               |
| `mcp__datadog__get-dashboards` / `get-dashboard`    | Dashboard data             |

### `stripe` (Stripe API)

`mcp__stripe__list_customers`, `create_customer`, `list_payment_intents`,
`list_subscriptions`, `cancel_subscription`, `update_subscription`,
`list_invoices`, `create_invoice`, `finalize_invoice`, `list_disputes`,
`update_dispute`, `create_refund`, `list_refunds`, `list_products`,
`create_product`, `list_prices`, `create_price`, `list_coupons`,
`create_coupon`, `create_payment_link`, `retrieve_balance`,
`fetch_stripe_resources`, `search_stripe_resources`, `search_stripe_documentation`,
`stripe_api_execute`, `stripe_api_details`, `stripe_api_search`,
`stripe_integration_recommender`, `send_stripe_mcp_feedback`.

### `mercadopago-mcp-server` (MercadoPago)

`add_money_test_user`, `application_list`, `create_test_user`,
`notifications_history`, `quality_checklist`, `quality_evaluation`,
`save_webhook`, `search_documentation`.

### `railway` (infrastructure)

20+ tools across service/deploy/environment/domain/database/volume/team/security/
backup/monitoring/networking management.

### `vercel` (frontend hosting)

HTTP MCP at `https://mcp.vercel.com`. Plus deep skill set: `bootstrap`, `deploy`,
`env`, `marketplace`, `status`, plus AI-SDK / AI-Gateway / next-upgrade /
turbopack / verifyTokens.

---

## 7. Layer 6 — Browser / DOM

### `chrome-devtools` (CDP via Google's chrome-devtools-mcp)

Full DevTools API: `mcp__chrome-devtools__click`, `evaluate_script`, `fill`,
`fill_form`, `get_console_message`, `list_console_messages`, `get_network_request`,
`list_network_requests`, `navigate_page`, `new_page`, `select_page`, `close_page`,
`take_screenshot`, `take_snapshot`, `take_memory_snapshot`, `lighthouse_audit`,
`performance_start_trace`/`stop_trace`/`analyze_insight`, `hover`, `drag`,
`press_key`, `type_text`, `upload_file`, `wait_for`, `resize_page`, `emulate`,
`handle_dialog`.

### `claude-in-chrome` (alternative browser layer)

`mcp__claude-in-chrome__navigate`, `tabs_context_mcp`, `tabs_create_mcp`,
`get_page_text`, `read_page`, `read_console_messages`, `read_network_requests`,
`javascript_tool`, `find`, `form_input`, `gif_creator`, `upload_image`,
`file_upload`, `browser_batch`, `shortcuts_list` / `shortcuts_execute`,
`switch_browser` / `list_connected_browsers`.

**Important**: read the project's `claude-in-chrome` MCP doc before using —
specific guidance about dialog handling and tab discipline applies.

---

## 8. Layer 7 — Domain-specific MCPs

| MCP                      | What it gives                                        |
| ------------------------ | ---------------------------------------------------- |
| `codacy`                 | Codacy organization-wide static analysis + coverage  |
| `context7`               | Library docs (current versions, not training-cutoff) |
| `sequential-thinking`    | Structured reasoning helper                          |
| `obsidian`               | Obsidian vault CRUD (notes, tags)                    |
| `gitnexus`               | Code-knowledge graph (see Layer 2)                   |
| `graphify-plus`          | Enriched graph operations (see Layer 3)              |
| `mercadopago-mcp-server` | MercadoPago payments (PIX BR)                        |
| `stripe`                 | Stripe Connect platform (cards + Connect)            |
| `pulse`                  | Governance scanner (see Layer 3)                     |
| `kaisser`                | SDLC verbs (see Layer 3)                             |

---

## 9. Data files (consumed by `cognitive-hub`)

| Path                                                      | Generator                                                 | Last verified                    |
| --------------------------------------------------------- | --------------------------------------------------------- | -------------------------------- |
| `tools/openapi/openapi-spec.json`                         | `scripts/cognitive/openapi-extract.mjs` (static AST mode) | 580 paths / 663 ops / 60 tags    |
| `tools/asyncapi/asyncapi-spec.json`                       | `scripts/cognitive/asyncapi-extract.mjs`                  | 73 channels / 7 namespaces       |
| `tools/sarif/<workspace>.sarif` + `manifest.json`         | `scripts/cognitive/sarif-aggregate.mjs`                   | per-workspace ESLint → SARIF 2.1 |
| `tools/sbom/sbom-<workspace>.json` + `sbom-manifest.json` | `scripts/cognitive/sbom-generate.mjs`                     | CycloneDX 1.5                    |
| `.codegraph/codegraph.db`                                 | live-watched by codegraph CLI                             | 63.6k nodes / 137k edges         |

---

## 10. Scripts (operational helpers)

| Path                                           | Purpose                                                    |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `scripts/cognitive/openapi-extract.mjs`        | NestJS routes → OpenAPI 3.0 (static AST or network fetch)  |
| `scripts/cognitive/asyncapi-extract.mjs`       | EventEmitter2 + BullMQ → AsyncAPI 2.6                      |
| `scripts/cognitive/sarif-aggregate.mjs`        | ESLint per-workspace → SARIF 2.1                           |
| `scripts/cognitive/sbom-generate.mjs`          | CycloneDX SBOM per workspace                               |
| `scripts/mcp/<name>-mcp-launcher.sh`           | MCP stdio launcher (one per MCP)                           |
| `scripts/ops/eslint-canonical-rules/`          | Custom ESLint plugin enforcing canonical helpers (3 rules) |
| `scripts/ops/check-canonical-duplicates.mjs`   | `npm run canonical:check` gate                             |
| `scripts/ops/check-canonical-events.mjs`       | Event-taxonomy gate                                        |
| `scripts/ops/check-formatting.mjs`             | Prettier gate (pre-commit)                                 |
| `scripts/pulse/*.ts`                           | PULSE governance scanner (locked auditor)                  |
| `tools/canonicalize/scan.mjs`                  | Regenerate `docs/architecture/*` from code                 |
| `tools/canonicalize/graphify-driven-dedup.mjs` | Find cross-context duplicates                              |

---

## 11. Skills (when `/skill-name` is mentioned)

The runtime loads ~130 skills (Claude Code session). Most-used groups:

- **Code analysis**: `audit`, `code-review`, `root-cause`, `quick`, `plan`, `plan-approved`, `plan-review`, `verify`, `run`, `coverage`, `run-tests`
- **Git workflow**: `commit`, `ship`, `push`, `pr`, `address-pr`, `merge-chain`, `auto-pr`, `auto-merge`, `flow`, `finish`, `promote`, `hotfix`, `create-branch`
- **Backlog/planning**: `backlog`, `handoff`, `handoff-resume`, `quick`, `report`, `user-report`
- **Codebase ops**: `context`, `audit`, `frontend-design`, `static-to-react`, `drop-feature`, `generate-component`, `squash-migrations`
- **MCP / DevOps**: `cf-auto-deploy`, `cf-pages-deploy`, `cf-wire-domain`, `cf-mint-token`, `cf-browser`, `cf-new`, `vercel:*` (20+ Vercel skills), `compose`, `ci-pipeline`, `env`
- **Stripe**: `stripe:explain-error`, `stripe:test-cards`, `stripe:upgrade-stripe`, `stripe:stripe-best-practices`
- **Sentry**: `sentry:seer` (natural-language Sentry queries), `sentry:sentry-workflow`, `sentry:sentry-sdk-setup`, `sentry:sentry-feature-setup`
- **Loops**: `loop` (recurring tasks), `schedule` (cron-style)
- **Misc**: `firecrawl` (web scraping), `markitdown` (PDF/DOCX→md), `pagespeed`, `pagespeed-optimizer`, `notebooklm`, `airbrush` (image gen), `excalidraw-diagram`, `remotion-video`, `home-assistant-manager`, `unifi`, `listmonk`, `uptime-kuma`, `n8n`

Invoke with `Skill(skill: "<name>", args: "...")` or via `/<name>` in user input.

---

## 12. The Bash + dedicated tools

Even with all MCPs, plain Bash remains essential for:

- `git` — branch state, log/diff/blame
- `find` + `grep` + `awk` — text-level search when symbol search is wrong tool
- `npm run typecheck` / `lint` / `test` — full-workspace gates
- `gh` CLI — when GitHub MCP doesn't expose a verb you need

Built-in tools (always available):

- `Read` — file read (preferred over `cat`)
- `Write` / `Edit` — file edit (must Read first)
- `Bash` — anything else
- `TaskCreate` / `TaskUpdate` / `TaskList` / `TaskGet` — task list
- `Monitor` — long-running streamed watcher
- `WebSearch` — current information beyond training cutoff
- `ToolSearch` — load deferred MCP schemas
- `AskUserQuestion` — pause for clarification when ambiguity is high
- `ScheduleWakeup` — `/loop` self-pacing

---

## 13. Quick recipes

### Find every endpoint that touches `Workspace`

```js
mcp__codegraph__codegraph_callers({ symbol: 'WorkspaceService' });
// or
mcp__gitnexus__query({ query: 'workspace authorization flow', limit: 10 });
```

### Refactor a function name across all files safely

```js
mcp__atomic -
  edit__atomic_rename_symbol_cross_file({
    file: 'backend/src/common/types.ts',
    line: 39,
    column: 17,
    newName: 'asObjectRecord',
    preview: true, // dry-run first
  });
```

### Verify a feature works end-to-end before declaring done

```js
mcp__test - runner__affected_tests({ files: ['backend/src/checkout/checkout.service.ts'] });
mcp__test - runner__run_jest({ testPath: 'backend/src/checkout' });
mcp__test - runner__run_tsc({ package: 'backend' });
```

### Check production health right now

```js
mcp__sentry - bridge__sentry_top_issues({ window_hours: 24, limit: 10 });
mcp__datadog__search - logs({ query: 'service:kloel-backend status:error' });
```

### Triage what to fix next (composite priority)

```js
mcp__graphify - plus__hot_clusters({ top: 10 });
// returns top-N nodes weighted by errors + in-degree + doc-drift
```

### Inspect db schema without touching prod

```js
mcp__postgres__pg_tables();
mcp__postgres__pg_table_describe({ table: 'RAC_Workspace' });
mcp__postgres__pg_count({ table: 'RAC_Workspace' });
```

### Get a brand-new agent up to speed

1. Read [MACHINE_STATE.md](MACHINE_STATE.md) (state of the machine)
2. Read [COGNITIVE_INTERFACE_LAYER.md](COGNITIVE_INTERFACE_LAYER.md) (protocol-hub spec)
3. Read this file (TOOL_ARSENAL.md)
4. Call `cognitive-hub.protocol_hub_status` to verify connectivity
5. Pick the right tool from Section 13 above for your task

---

## 14. Verification

The arsenal is verified end-to-end when:

```sh
# Hub handshake — should return 10 protocol entries
( printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n'
  printf '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"protocol_hub_status","arguments":{}}}\n'
  sleep 1
) | bash scripts/mcp/cognitive-hub-mcp-launcher.sh | tail -1

# LSP handshake — should return 10 LSP tool definitions
( printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n'
  printf '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n'
  sleep 1
) | bash scripts/mcp/lsp-mesh-mcp-launcher.sh | tail -1

# Codegraph index — should report ~63k nodes
codegraph status --json | jq '.nodes // .totalNodes // .summary'

# Test runner inventory — should list all 5 commands
node -e "console.log('use mcp__test-runner__test_summary in an MCP-capable CLI')"

# Postgres connectivity (read-only)
node -e "console.log('use mcp__postgres__pg_status')"

# Build gates
npm run canonical:check && npm run typecheck
```

All of the above were last verified on **2026-05-26** — `cognitive-hub` reported
**9 of 10 protocols available** (only DAP pending). LSP-mesh confirmed 5 healthy
TypeScript LSP processes across `backend/frontend/frontend-admin/worker/e2e`.

---

## Related canonical docs

- [MACHINE_STATE.md](MACHINE_STATE.md) — current measured state
- [COGNITIVE_INTERFACE_LAYER.md](COGNITIVE_INTERFACE_LAYER.md) — protocol-hub spec
- [CANONICAL_DOMAINS.md](CANONICAL_DOMAINS.md) — bounded contexts
- [CANONICAL_VOCABULARY.md](CANONICAL_VOCABULARY.md) — naming
- [EVENT_TAXONOMY.md](EVENT_TAXONOMY.md) — canonical events
- [SERVICE_CATALOG.md](SERVICE_CATALOG.md) — service inventory
- [CAPABILITY_MAP.md](CAPABILITY_MAP.md) — what the system does
