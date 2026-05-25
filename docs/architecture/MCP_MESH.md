# MCP Mesh — operational graph across all repo MCPs

Generated 2026-05-21. This is the documented composition map describing
how each MCP in this repo's stack pairs with the others. The mesh is
discoverable at runtime via the `*_mesh_routes` tools on every MCP
(kaisser_mesh_routes, pulse_mesh_routes — others can adopt the same
verb if extended).

## The 7 MCPs

| MCP | Role | Tools | Read / Write |
|---|---|---:|---|
| **gitnexus-mcp** | Graph query layer | 14 | read |
| **codegraph-mcp** | Fast semantic context + readCode | 9 | read |
| **graphify-plus-mcp** | Operational ops on the graph (hot, blast, auto-PR) | 11 | read+act |
| **atomic-edit-mcp** | Safe edit primitives (sha256 + syntax validate) | 50 | write |
| **kaisser-mcp** | SDLC verbs (plan, handoff, doctor, audit, deploy) | 16 | read+write |
| **pulse-mcp** | Auditor + remediation dispatcher | 9 | read+dispatch |
| **saas-compiler-mcp** | intent → spec → code → PR → verify | 11 | end-to-end |

## Canonical layers

```
                ┌─────────────────────────────────────┐
                │  saas-compiler  (intent.md → PR)    │
                └──────────────┬──────────────────────┘
                               │ orchestrates
        ┌──────────────────────┼──────────────────────┐
        │                      │                      │
        ▼                      ▼                      ▼
   READ layer              ACT layer              EDIT layer
   ┌─────────┐         ┌──────────────┐        ┌────────────┐
   │gitnexus │         │graphify-plus │        │atomic-edit │
   │codegraph│         │     pulse    │        │            │
   └─────────┘         └──────────────┘        └────────────┘
        │                      │                      │
        └──────────────┬───────┴──────────────────────┘
                       ▼
              GOVERN / DRIVE layer
                ┌──────────────┐
                │   kaisser    │   ← audit hook + plan/handoff/doctor
                └──────────────┘
```

## Routing recipes (canonical pairs)

### 1. Investigate a bug end-to-end

```
gitnexus.query("error pattern")
  → gitnexus.context(suspect_symbol)
  → gitnexus.impact(suspect_symbol)
  → codegraph.context(suspect_symbol)  (cross-validate)
  → graphify-plus.runtime_errors      (Sentry correlation)
  → kaisser.plan_create               (capture fix plan)
```

### 2. Run PULSE remediation loop

```
pulse_top_gates(limit=10)
  → for each gate:
      pulse_dispatch_fix(gate_id, target_path)
      → OpenCode subagent (uses atomic-edit MCP for safe writes)
      → kaisser_audit_log (verify nothing was blocked silently)
      → pulse_scan_module (re-verify the module)
```

### 3. Session continuity

```
SESSION START:
  kaisser_handoff_read       (load previous session state)
  kaisser_handoff_drift      (verify claimed state vs live git)
  gitnexus.status            (re-verify index up-to-date)
  pulse_health_by_module     (current health snapshot)

SESSION END:
  gitnexus.detect_changes(scope="all")
  pulse_health_by_module                  (snapshot)
  kaisser_handoff_write({...all state})   (persist)
```

### 4. Plan execution with parallel fan-out

```
kaisser_plan_rounds(plan_id)
  → for each round (parallel group):
      for each task: dispatch OpenCode subagent
      → subagent uses atomic-edit for writes
      → kaisser_audit blocks unsafe operations
      → after each task: gitnexus.detect_changes → kaisser_plan_check
```

### 5. Refactor with safety

```
gitnexus.impact(symbol)        (blast radius)
  → gitnexus.rename(...)       (dry-run rename plan)
  → atomic-edit.atomic_rename_symbol_cross_file
  → kaisser_audit_log          (verify no blocks)
  → pulse_scan_module          (validate health)
  → gitnexus.analyze .         (re-index)
```

### 6. Feature ship (broadcast / interactive templates / etc)

```
saas-compiler.intent_to_spec("Broadcast engine MVP")
  → saas-compiler.spec_to_code(spec)
  → atomic-edit transactions for all writes
  → kaisser_plan_check (verify plan↔implementation parity)
  → saas-compiler.verify_in_prod (smoke against staging)
  → kaisser_handoff_write (persist new feature state)
```

## Why each MCP exists

- **gitnexus** — Cypher-queryable graph for cross-cutting questions: "what
  routes does this controller serve?", "what calls this method?". 14 tools.
- **codegraph** — fast tree-sitter + FTS5 semantic search. Use as primer
  before deep cypher queries. 19 langs, 13 frameworks.
- **graphify-plus** — operational glue: which clusters are hot (runtime
  errors × blast radius), what stubs exist, what specs are affected.
- **atomic-edit** — every write goes through sha256 + syntax validation.
  Refuses ambiguous matches, refuses to persist syntactically-broken
  output. 50 primitives covering insert/delete/replace/rename/import.
- **kaisser** — the SDLC governance layer. Plan files, audit hook (46
  rules), handoff persistence, deploy manifests. The kaisser audit hook
  is the single biggest value: it blocks silent failure declarations
  before they reach the user.
- **pulse** — read-only auditor with action surface. PULSE itself never
  modifies code (CLAUDE.md rule). `pulse_dispatch_fix` emits OpenCode
  subagent jobs that use the OTHER MCPs (atomic-edit, kaisser) to apply
  the actual fix.
- **saas-compiler** — the end-to-end pipeline. Closes the intent→prod
  loop; uses every other MCP as a layer.

## Composition principles

1. **READ before WRITE**: always start with gitnexus / codegraph queries
   before invoking atomic-edit. Cheaper, safer, lets you reason.
2. **ATOMIC for every write**: never use raw Edit/Write when atomic-edit
   covers the case. The sha256 guard catches accidental races; the
   syntax validation catches malformed output.
3. **AUDIT every action**: kaisser PreToolUse hook runs automatically.
   Don't bypass it — fix the underlying issue when it blocks.
4. **HANDOFF every session**: kaisser_handoff_write at the end. Without
   it, the next session loses context and re-does work.
5. **DISPATCH over MODIFY**: pulse never patches code itself. It emits a
   job for an OpenCode subagent that uses atomic-edit + kaisser audit.
6. **DOCUMENT the route**: every MCP that exposes a `*_mesh_routes` tool
   shares its preferred pairs. Discovery beats memorization.

## Smoke commands

```sh
# Test any MCP tools/list
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0.1.0"}}}
{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | bash scripts/mcp/<mcp-name>/launcher.sh | grep -o '"name":"[^"]*"'

# Inspect mesh routes from inside an agent
# (tool call to kaisser_mesh_routes or pulse_mesh_routes)
```

## Tool inventory by MCP

### kaisser-mcp (16 tools)
`kaisser_doctor`, `kaisser_deploy_dry_run`, `kaisser_audit_log`,
`kaisser_plan_list`, `kaisser_plan_tasks`, `kaisser_plan_rounds`,
`kaisser_backlog_list`, `kaisser_handoff_write`, `kaisser_handoff_read`,
`kaisser_handoff_drift`, `kaisser_meta`, `kaisser_full`,
`kaisser_detect_stack`, `kaisser_nextid`, `kaisser_pr_review_fetch`,
`kaisser_mesh_routes`

### pulse-mcp (9 tools)
`pulse_scan`, `pulse_scan_module`, `pulse_report`,
`pulse_health_by_module`, `pulse_top_gates`, `pulse_dispatch_fix`,
`pulse_dispatch_status`, `pulse_history`, `pulse_mesh_routes`

### gitnexus-mcp (14 tools)
`list_repos`, `query`, `cypher`, `context`, `detect_changes`, `rename`,
`impact`, `route_map`, `tool_map`, `shape_check`, `api_impact`,
`group_list`, `group_sync`

### atomic-edit-mcp (50 tools)
50 primitives — `atomic_edit`, `atomic_replace_range`,
`atomic_rename_symbol_cross_file`, `atomic_transaction`, `code_browse`,
`code_outline`, `code_read_symbol`, etc. See server.mjs for full list.

### codegraph-mcp (9 tools via `codegraph serve --mcp`)
`query`, `context`, `callers`, `callees`, `impact`, `node`, `status`,
`files`, `affected`.

### graphify-plus-mcp (11 tools)
`hot_clusters`, `blast_radius`, `metadata_for_file`,
`stub_route_inventory`, `runtime_errors`, `affected_specs`,
`auto_pr_dispatch`, `playwright_diff`, `codacy_drain_jobs`,
`session_state`, `taskgraph_lock_status`.

### saas-compiler-mcp (11 tools)
`compile_intent`, `intent_to_spec`, `spec_to_code`, `verify_in_prod`,
`crystallize_stub`, `capture_fingerprint`, `replay_fingerprint`,
`twin_up`, `twin_down`, `twin_shadow`, `twin_metrics`.

## Persistence

- Project config: `.mcp.json` — all 7 MCPs registered.
- Global config: `~/.claude.json` — all 7 enabled in `enabledMcpjsonServers`.
- Launchers in `scripts/mcp/*/launcher.sh`.
- Each MCP is stdio JSON-RPC 2.0; Claude Code loads them at session start.
