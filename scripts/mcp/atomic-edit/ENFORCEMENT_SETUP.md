# Atomic-edit enforcement — owner wiring (paste-ready)

The atomic-edit MCP ships two PreToolUse hooks. They are **inert until wired**
into `.claude/settings.json` (a governance-protected file — only the repo owner
may edit it). This doc is the paste-ready snippet so wiring is a copy/paste, not
a build.

| Hook | File | Purpose |
|---|---|---|
| **atomic-only** (enforce) | `scripts/mcp/atomic-edit/atomic-only-hook.mjs` | Denies native `Edit`/`Write`/`MultiEdit`/`NotebookEdit`/`apply_patch` on **code** files, and `Bash` commands that mutate code in place (`sed -i`, `> file.ts`, `cat > file.ts`, `cp/mv onto code`, inline `node -e writeFileSync`, …). Pure prose (`.md`/`.txt`) passes. **Fail-closed**: unparseable/empty stdin → deny. |
| **bypass-observer** (measure) | `scripts/mcp/atomic-edit/bypass-observer-hook.mjs` | Read-only ledger of every tool call to `.atomic/bypass-ledger.jsonl`, classified by `bypass-classify.mjs`. Powers `node bypass-report.mjs` → the bypass-rate metric. **Fail-open** (never blocks). |

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
