# Safe Cleanup Log

## Scope

Parallel cleanup requested during Round 120, preserving:

- `/Users/danielpenin/whatsapp_saas`;
- active Round 120 worktrees;
- recent Round 117-119 worktrees;
- Codex and Claude local surfaces.

## Removed

- 148 completed temporary benchmark worktrees matching `/private/tmp/kloel-abNNN-(normal|atomic)-*` for rounds 056 through 116.
- NPM cache via `npm cache clean --force`.
- Explicit user cache directories: `~/.cache/puppeteer`, `~/.cache/chroma`, `~/.cache/uv`.
- Stale git worktree metadata via `git worktree prune`.

## Preserved

- Main repo workspace.
- Round 117, 118, 119, and active 120 benchmark worktrees.
- Non-benchmark PR/deploy worktrees.
- `.codex`, `.claude`, and Claude cache surfaces.

## Result

- `df -h /` before: about 25Gi available.
- `df -h /` after: about 43Gi available.
- Safe reclaimed space: about 18Gi.

Freeing 100Gi was not possible from the inspected safe surfaces without touching riskier worktrees or personal/application data.
