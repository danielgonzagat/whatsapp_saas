# Atomic-Edit Operating Guide (read this every session)

> Permanent operating instruction for any AI CLI working in this repo.
> Companion to `docs/ai/AGENT_RUNBOOK.md`. Not protected; keep it accurate.

## Why this exists

The built-in editors (`Edit`/`str_replace`, `apply_patch`) operate at
line/block granularity. Microscopic intentions (swap a literal, rename a
binding, change one function) become macroscopic patches → diff noise,
artificial multi-agent conflicts, silent drift, blind edits, review cost.
This is the **Line-Oriented Action Bottleneck**, confirmed by CodeStruct
(Amazon, arXiv 2604.05407 — removing structured read costs −7.8pp Pass@1 and
7.8× more brittle `str_replace`), _To Diff or Not to Diff?_ (arXiv 2604.27296),
the Aider edit-format study, Diff-XYZ, and Kiro's program-analysis argument.

This repo ships a fix: the **`atomic-edit` MCP server**
(`scripts/mcp/atomic-edit/`), registered in `.mcp.json`, exposing a structured
read + atomic-edit action space as `mcp__atomic-edit__*` tools.

## Operating rule

For **TS/JS/JSON** changes, prefer the atomic-edit tools over the blunt
built-in `Edit` whenever the intention is structural or sub-line. They
validate syntax before writing and refuse to persist broken code — the
built-in `Edit` does not.

**Recommended loop (mirrors CodeStruct read→edit):**

1. `code_outline <file>` — get the signature map (cheap, no bodies).
2. `code_read_symbol <file> <selector>` — read only the unit you'll change,
   with its exact range returned.
3. Edit with the narrowest operator that expresses the intention:
   - one literal → `atomic_replace_literal`
   - any multi-line / block / verbatim-text edit → `atomic_replace_text`
     (builtin-`edit` ergonomics, no coordinates, but syntax-validated +
     atomic + guarded). Never fall back to builtin `edit`/`patch` for code.
   - a token / sub-expression at a known range → `atomic_replace_range` /
     `atomic_insert_at` / `atomic_delete_range`
   - several sites, one intention → `atomic_apply_edits` (LSP `TextEdit[]`)
   - a whole function/class/method → `atomic_edit_symbol`
     (`replace` | `insert_after` | `remove`)
   - rename within a file → `atomic_rename_symbol`
   - rename across the project → `atomic_rename_symbol_cross_file`
   - add/remove a named import → `atomic_add_import` / `atomic_remove_import`
   - change one object property's value → `atomic_replace_property_value`
4. Unsure? Pass `preview: true` first — get the validated diff, write nothing,
   then re-call without `preview` to commit.
5. Concurrent-agent risk on this repo: pass `expectedSha256` (the hash from
   your last read; mutating ops return `afterSha256`) so a stale write is
   refused instead of silently colliding.

## Hard guarantees (rely on these)

- No edit that _introduces_ a new syntax error is written (pre-existing errors
  tolerated — surgical, never "make it worse").
- Writes are atomic (temp + fsync + rename); batched edits and cross-file
  rename are all-or-nothing.
- Governance-protected files (`CLAUDE.md`, `AGENTS.md`, `ops/*.json`,
  `scripts/ops/check-*.mjs`, the PULSE auditor, eslint configs, …) and paths
  outside the repo root are hard-refused. This is additive safety; it does not
  replace the human-owner rule.
- Every mutation reports an Expansion Factor (`intentionChars` vs
  `lineRewriteSurfaceChars`) so the bottleneck stays measurable.

## Scope / honest limits

- Cross-file rename needs a reachable `tsconfig.json` (falls back to a
  directory-scoped project otherwise).
- Non-TS/JS/JSON: range/insert/delete work; validation is range-validity only.
- Selectors resolve named declarations; arbitrary sub-expression selectors are
  a future layer, not faked.

## Verify after touching the server

```sh
npx tsx scripts/mcp/atomic-edit/smoke.ts   # expect: 47 passed, 0 failed
```

## Activation

- **Claude Code:** `.mcp.json` carries it to every session (one-time MCP
  trust approval on a fresh session).
- **OpenCode (all agents + subagents, permanent default):** registered in
  project `opencode.json` + global `~/.config/opencode/opencode.json`; the
  prefer-atomic rule lives in global `~/.config/opencode/AGENTS.md` and is
  combined into every subagent prompt. The fleet's `opencode run` subagents
  inherit it automatically — no per-invocation flag. Verify with
  `opencode mcp list` (expect `✓ atomic-edit connected`).
- **Codex CLI (universal, same shared tool):** registered in
  `~/.codex/config.toml` `[mcp_servers.atomic-edit]` pointing at the _same_
  launcher; `~/.codex/AGENTS.md` carries the universal doctrine (mainstream
  banned, shared MCP atomic is default; the old local cjs is offline fallback
  only). Verify with `codex mcp list` (expect `atomic-edit … enabled`). Note:
  `~/.local/bin/codex` is a shim routing `codex exec`→OpenCode; the real Codex
  is `/opt/homebrew/bin/codex` and `codex mcp` targets the real config.
- One shared tool, three CLIs — see `ATOMIC_EDIT_CLI_ACTIVATION_MATRIX.md`.

Runtime is plain `node dist/server.js` (launcher self-builds on staleness; no
tsx/npx). Full design + tool reference: `scripts/mcp/atomic-edit/README.md`.

---

## LAW — Native CLI Shell Allowed; Native Diff Renderer Banned (2026-05-15)

The native CLI (Claude Code / Codex) stays as the chat/orchestration shell.
The native **edit/diff renderer is banned**: the only thing that may appear
on screen when code changes is the atomic tool's output.

Prohibited (for CODE):

- native `Edit` / `Write` / `MultiEdit` / `NotebookEdit`
- native `apply_patch`
- shell in-place mutation of code (`sed -i`, `> file.ts`, `tee`, `perl -i`…)
- line-oriented red/green diff as edit proof
- a file changed without an `AtomicEditTrace`

Mandatory:

- every code mutation via `mcp__atomic-edit__*`
- the tool returns a compact human `summary` (✅ + file + `[-removed-]{+added+}`
  - validation + zeroCodeTrust + trace path) and persists the full
    `AtomicEditTrace` to `docs/ai/traces/`
- the native TUI shows only the tool output
- session end: `trace-coverage-audit.mjs` flags any code change with no trace

Default: **atomic tool or nothing.** Prose/`.md` and non-edit tools
(npm/git/build/grep/cat) are NOT blocked — the rule is about code.

Enforcement wired:

- Claude Code: `.claude/settings.json` PreToolUse →
  `scripts/mcp/atomic-edit/atomic-only-hook.mjs` (denies native code edit +
  shell in-place code mutation; tested). Stop →
  `scripts/mcp/atomic-edit/trace-coverage-audit.mjs` (advisory; `--strict`
  for a hard CI gate). Activates on the next fresh session (hooks + MCP load
  at session start — documented limitation).
- Codex: `[mcp_servers.atomic-edit]` in `~/.codex/config.toml` + the
  "mainstream BANNED for code" doctrine in `~/.codex/AGENTS.md` (both in
  place). A hard Codex PreToolUse deny-hook is the honest residual — it
  needs Codex's hook-I/O schema verified from a real Codex run; not faked.

Acceptance: inside Claude/Codex you see only
`whatsappPhoneNumberId: [-'5511999999999'-]{+null+}` — never
`- whatsappPhoneNumberId: '5511999999999'` / `+ … null`. If a sub-line
change shows a whole-line red/green block, the rule was bypassed.
