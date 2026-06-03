# Atomic-Edit — Multi-CLI Activation Matrix

One shared tool — the `atomic-edit` MCP server
(`scripts/mcp/atomic-edit-mcp-launcher.sh`, 15 tools, `node dist/server.js`,
self-building) — connected as the **default operating mode** for every AI CLI
in this workspace. The coarse mainstream editor is banned for code; the
authorial hierarchical/atomic mode is the persistent default.

Per-CLI activation contract (1 loads standard · 2 accesses state · 3 routes
tools · 4 obeys the LEI/operating rule · 5 records progress · 6 workboard/lock ·
7 **real blind-execution proof** · 8 limits · 9 next).

## Claude Code CLI

| #           | Status                                                                                                                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 standard  | `.mcp.json` `atomic-edit` (committed) + `docs/ai/ATOMIC_EDIT_OPERATING_GUIDE.md` + auto-memory                                                 |
| 2 state     | repo (`.mcp.json`, docs/ai/, dist self-build)                                                                                                  |
| 3 tools     | `mcp__atomic-edit__*` after one-time project trust on a fresh session                                                                          |
| 4 obeys     | OPERATING_GUIDE loop; prefers atomic over builtin Edit                                                                                         |
| 5 progress  | `docs/ai/ATOMIC_EDIT_PROGRESS.md`                                                                                                              |
| 6 workboard | this orchestrator session; isolated commits                                                                                                    |
| 7 **proof** | ✅ blind test 2026-05-15: self-edited `server.ts` via `atomic_replace_literal` through production launcher; smoke 47/47; zero builtin fallback |
| 8 limits    | native tools need a fresh session after `.mcp.json` change (mid-session edits not hot-loaded)                                                  |
| 9 next      | none — operating                                                                                                                               |

## OpenCode CLI (all agents + subagents, incl. fleet)

| #           | Status                                                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 standard  | project `opencode.json` + global `~/.config/opencode/opencode.json` (MCP) + global `~/.config/opencode/AGENTS.md` (rule, combined into every subagent prompt) |
| 2 state     | repo + global config                                                                                                                                          |
| 3 tools     | `atomic-edit_*`; `opencode mcp list` → ✓ connected                                                                                                            |
| 4 obeys     | global AGENTS.md mandates atomic; `atomic_replace_text` over builtin edit for multi-line                                                                      |
| 5 progress  | PROGRESS.md                                                                                                                                                   |
| 6 workboard | fleet runner staggered pool; per-task supervised                                                                                                              |
| 7 **proof** | ✅ multiple blind tests 2026-05-15: rename/literal/property/symbol unprompted, zero builtin fallback, byte-correct; h13 swarm validated under hardening       |
| 8 limits    | guard restricts writes to KLOEL repo; non-TS/JS/JSON = range-only validation                                                                                  |
| 9 next      | none — operating; default for fleet subagents                                                                                                                 |

## Codex CLI

| #           | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 standard  | `~/.codex/config.toml` `[mcp_servers.atomic-edit]` (same shared launcher) + `~/.codex/AGENTS.md` universal doctrine (mainstream banned)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 2 state     | global codex config + shared repo tool                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 3 tools     | `atomic-edit__*`; `codex mcp list` → `atomic-edit … enabled`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 4 obeys     | `~/.codex/AGENTS.md` mandates shared MCP atomic as default; local cjs demoted to offline fallback                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 5 progress  | PROGRESS.md (shared)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 6 workboard | shared; orchestrator-dispatched                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 7 **proof** | ✅ PROVEN (connectivity+functional, real evidence). After fixing a real defect — blind #1 failed (Codex used local cjs+`apply_patch`; root cause: `rmcp` transport died, no `startup_timeout_sec`, cold `dist` build blew window) → fix: pre-build `dist` + `startup_timeout_sec=45` — the `codex exec --json` event stream from **real Codex (`/opt/homebrew/bin/codex`, codex-cli 0.130.0, gpt-5.5)** shows `{"type":"mcp_tool_call","server":"atomic-edit","tool":"code_outline",...,"status":"completed"}` with a correct structured result and correct answer. Residual `rmcp` stderr line is now non-fatal (followed by a completed successful call). |
| 8 limits    | **Honest (no faked parity):** connectivity+function PROVEN; _unprompted-default_ strength weaker than OpenCode's — Codex doctrine now hard-precedence-fixed (`~/.codex/AGENTS.md`) but a fully-blind unprompted Codex run on gpt-5.5 is slow/rate-limited here, so the unprompted-preference re-confirmation is pending a non-flaky window (not faked as done). real Codex = `/opt/homebrew/bin/codex` (`~/.local/bin/codex` shims `exec`→OpenCode)                                                                                                                                                                                                         |
| 9 next      | re-confirm unprompted preference when a non-flaky `codex exec` window is available; tool+connectivity require no further work                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

> Honest rule (§9): no CLI row claims proven without real per-CLI execution
> evidence. "Pending" stays pending until a blind run is observed. No faked
> parity.

## E8 — visual + token atomicity layer (2026-05-15)

Shared across all 3 CLIs because it lives in the one shared MCP payload, not
in any CLI. Every mutating tool now returns `atomicDiff` (char-level
`[-removed-]{+added+}`, ANSI) + `operationId` + `tracePath`; full
`AtomicEditTrace` persisted to gitignored `docs/ai/traces/`.

| Concern                           | Reality (honest)                                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Char-level visual proof           | ✅ all 3 — in the tool result text every CLI prints                                                                              |
| Disable native line-level +/- TUI | ❌ Claude Code, ❌ Codex (closed binaries — impossible from repo); ⚠️ OpenCode only via a fork (rejected: maintenance liability) |
| Net effect                        | additive: `atomicDiff` shows the true atomic change **beside** the harness's unavoidable line block                              |
| Token economy                     | committed path `ATOMIC_EDIT_VERBOSITY=L1` default (compact proof + trace pointer, no verbose legacy diff); preview floors L2     |
| Per-CLI verbosity                 | env `ATOMIC_EDIT_VERBOSITY` (L0/L1/L2/L3) in each CLI's MCP env block; unset ⇒ L1                                                |
| Regression guard                  | `node scripts/mcp/atomic-edit/audit-atomicity.mjs [--json] [--min-ratio=]` — fail-closed, fixtures filtered                      |

Acceptance honest-statement: if the owner still sees a whole-line red/green
block for a sub-line change, that is the **closed harness renderer**, which
no in-repo change can disable. The atomic proof is the `atomicDiff`/trace
printed alongside it. This was delivered; the renderer replacement was not
(and was correctly reported as impossible, not attempted-and-faked).
