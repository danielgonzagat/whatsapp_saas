# Atomic-edit enforcement — owner wiring (paste-ready)

The atomic-edit MCP ships host-boundary hooks for Claude and Codex. Claude hooks
are **inert until wired** into `.claude/settings.json` (a governance-protected
file — only the repo owner may edit it). Codex strict mode is wired through
`.codex/hooks.json` or an equivalent host policy. This doc is the paste-ready
operator surface; the live truth is still the certificate, not this prose.

| Hook | File | Purpose |
|---|---|---|
| **atomic-only** (enforce) | `scripts/mcp/atomic-edit/atomic-only-hook.mjs` | Denies native `Edit`/`Write`/`MultiEdit`/`NotebookEdit`/`apply_patch` on **code** files, and `Bash` commands that mutate code in place (`sed -i`, `> file.ts`, `cat > file.ts`, `cp/mv onto code`, inline `node -e writeFileSync`, …). Pure prose (`.md`/`.txt`) passes. **Fail-closed**: unparseable/empty stdin → deny. |
| **bypass-observer** (measure) | `scripts/mcp/atomic-edit/bypass-observer-hook.mjs` | Read-only ledger of every tool call to `.atomic/bypass-ledger.jsonl`, classified by `bypass-classify.mjs`. Powers `node bypass-report.mjs` → the bypass-rate metric. **Fail-open** (never blocks). |
| **codex-atomic-only** (strict Codex) | `scripts/mcp/atomic-edit/codex-atomic-only-hook.mjs` | Denies every non-atomic Codex tool call fail-closed. Legal paths are only: execute through an atomic-edit MCP tool, or use atomic-edit to implement the missing computation inside atomic-edit first. This is stricter than the Claude TUI hook: no prose/read/search/native-shell exception. |

## Codex closed-loop protocol

For Codex, the target posture is not merely "prefer atomic". It is a closed loop:

1. If an existing `mcp__atomic_edit.*` tool can execute the computation, use it.
2. If no atomic tool can execute the computation, first use atomic-edit edit tools to add that capability to atomic-edit.
3. Native/TUI computation (`exec_command`, `apply_patch`, native read/search/edit wrappers, or generic tool wrappers) is denied before execution.

Proof:

```sh
node scripts/mcp/atomic-edit/codex-atomic-only-hook.proof.mjs
```

In this workspace, Codex host wiring is no longer a prose TODO: `atomic_y_certificate` must prove `codexHostWiring`, `codexNoBypassStaticPolicy`, `codexEntrypointContract`, `mcpLauncherHostBoundary`, and `wholeHostActionSpace` GREEN before it may return `Y_COMPLETE`. On a new host or checkout where those domains are not green, the certificate must stay `UNJUDGED` or `RED`; never copy this workspace's result by documentation.

## Convergence is built in — no wiring, no flag, no toggle

The two hooks above are the **outer ring** (route mutations through the MCP). The
**inner ring** needs no wiring: every atomic write funnels through one byte-write
floor (`atomicWrite` in `server-helpers-io.ts`), which refuses any write that
would **introduce a dangling relative import**. It is unconditional — there is no
env var, no flag, and no code path that writes around it (`atomic_converge` and
every other tool call the same floor). A mutation that would leave a wire
resolving to nothing is not committed: the agent can only persist a *connected*
tree.

- Multi-file atomic sets (`atomic_converge`, transactions, cross-file rename)
  register their whole target set as **pending** before writing, so a set that
  legitimately wires `A → a-brand-new-B` is judged as a whole, not false-reddened
  by the order the firewall happens to write the files.
- Only **NEW** wires are a write's claim: a pre-existing dangling import in a
  legacy file never blocks an unrelated edit (essential for ungated repos), but no
  write may *introduce* one.
- Proven permanently by the smoke suite (`byte-floor REFUSES…` / `byte-floor
  COMMITS…`), so it cannot silently regress.

## Wire both — paste into `.claude/settings.json`

```jsonc
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|NotebookEdit|apply_patch|Bash",
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/scripts/mcp/atomic-edit/atomic-only-hook.mjs\"" }
        ]
      },
      {
        "matcher": "Read|Grep|Glob|Bash|Write|Edit|MultiEdit|NotebookEdit",
        "hooks": [
          { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/scripts/mcp/atomic-edit/bypass-observer-hook.mjs\"" }
        ]
      }
    ]
  }
}
```

If `PreToolUse` already exists in your settings, **append** these two matcher
objects to its array rather than replacing it.

## Verify after wiring

```sh
# deny-hook fires on a code Edit (should print a deny decision naming mcp__atomic-edit__*)
echo '{"tool_name":"Edit","tool_input":{"file_path":"/x/foo.ts"}}' | node scripts/mcp/atomic-edit/atomic-only-hook.mjs
# prose passes (exit 0, no payload)
echo '{"tool_name":"Edit","tool_input":{"file_path":"/x/README.md"}}' | node scripts/mcp/atomic-edit/atomic-only-hook.mjs
# bypass metric (after a session)
node scripts/mcp/atomic-edit/bypass-report.mjs
```

## Honest scope

- **avoidance, not renderer-disable**: the deny-hook makes the agent route code
  edits through `mcp__atomic-edit__*` (whose char-level diff is the only proof
  shown); it does not disable the native diff renderer (impossible from inside).
- **bypass-rate → 0** is the goal: with the observer wired, `bypass-report.mjs`
  surfaces every native/shell edit the agent *attempted* (the deny-hook blocks
  them) so the residual can be driven to zero.
- The MCP tools themselves (`mcp__atomic-edit__*`) are **never** blocked by these
  hooks — only the native/shell mutation paths are.
