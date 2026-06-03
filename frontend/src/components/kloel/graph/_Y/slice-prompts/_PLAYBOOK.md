# MCP PLAYBOOK (embed integral em CADA slice-prompt)

> The task supplied `undefined` for the playbook body. This is the canonical MCP
> loop for KLOEL, reconstructed from project memory (MCP mesh + feedback loop).
> Every slice-prompt references this file AND inlines the relevant calls.

## Read (BEFORE editing — query the graph, don't grep blind)
- `mcp__codegraph__codegraph_search` / `codegraph_context` / `codegraph_callers` /
  `codegraph_callees` — resolve "what touches X / who calls Y" in 1 call.
  ⚠️ Maps warn the codegraph index is STALE for `KloelGraph*` (reported phantom
  `EducarScreen` + wrong offsets). For THIS dir, trust the literal file offsets in
  `WIRING_CONTRACT.md` over codegraph; re-read the file directly.
- `mcp__gitnexus__route_map` / `context` / `impact` — Next.js route map, blast radius.
- `mcp__graphify-plus__blast_radius` / `affected_specs` / `metadata_for_file` —
  what specs cover the file before you touch it.
- `Read` the literal offsets (re-read `NodePanel@4441..5258`, `KloelInner@6287..end`
  if the runtime was mute).

## Coordinate (concurrency — 4-6 worktrees on this seam)
- `mcp__task-graph__task_lock_acquire` on EXACTLY your slice's files; refuse to edit
  if a lock is held by another agent. `task_lock_release` when done.
- `mcp__graphify-plus__taskgraph_lock_status` — see live locks (there is a live
  `.atomic-edit-locks` entry on `KloelGraphShell.spec.tsx`).
- Confirm the canonical worktree is `/Users/danielpenin/whatsapp_saas-kg`
  (`feat/kloelgraph-literal-prototype`) before editing the literal.

## Edit (atomic, traced — DEFAULT over Edit/Write)
- `mcp__atomic-edit__*` (sha256 before+after, syntax-validate, atomic write, trace
  receipt, rollback). Use `code_outline`/`code_read_symbol` instead of reading whole
  files; use rename/transactions for cross-file. NEVER `git restore`.
- Edits land ONLY in carved `domains/<name>/*` modules + your `*.data` adapter.
- NO bypass comments (`@ts-ignore`/`eslint-disable`/`biome-ignore`/`NOSONAR`) — they
  live ONLY on the verbatim literal `.jsx`. Carved modules pass full gates.

## Verify (prove it, don't claim it)
- `mcp__test-runner__run_tsc` + `run_eslint` + `affected_tests` → `run_vitest` for
  the graph specs. `test_summary` for the rollup.
- Byte-identity gate: `__tests__/KloelGraph.byte-identity.spec.ts` (seed `Math.random`).
- Chrome devtools render diff: `mcp__chrome-devtools__navigate_page` +
  `take_screenshot` + (S0/S8) pixel compare vs `docs/ai/assets/kloelgraph-harness.html`.
  `evaluate_script` to dump the serialized graph for the byte diff.
- `mcp__pulse__pulse_scan_module` on the graph module → no regression.

## Govern / finish
- `mcp__kaisser__*` for SDLC verbs if promoting. Small conventional commits, byte-neutral.
- Co-Authored-By trailer per repo rule. Commit/push ONLY when the owner asks.

## Hard rules (CLAUDE.md)
- Honest empty state, never fake seed. Preserve the casca. Protected files off-limits.
- Money/ledger/payments: append-only, bigint cents, no float — N/A here but Vendas/
  Wallet data must read real endpoints, never seed.
