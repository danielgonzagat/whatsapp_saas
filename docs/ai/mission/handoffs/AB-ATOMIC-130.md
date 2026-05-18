# AB-ATOMIC-130

- Status: rejected_rigid_oldtext_macro_anchor
- Worker: OpenCode ATOMIC, atomic-only preprompt fast-path.
- Worktree: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab130-atomic-20260518100157`
- Mission: repeat the seven-helper `unified-agent.service.ts` split with macro
  facade compaction using Atomic OS only.

## Evidence

- Watchdog lane status: completed.
- Preprompt exit: `1`.
- Failure: `atomic_replace_text expected 1 occurrence(s), observed 0`.
- External validation: focused Jest `1`, focused ESLint `1`, backend typecheck
  `2`.
- Atomic discipline: `atomicModeClean=true`.
- Service lines remained `396` vs NORMAL `184`.
- Aggregate Kloel lines `968` vs NORMAL `1,045`; source churn `1,073` vs
  NORMAL `1,534`.

## Decision

Rejected as a functional A/B result. The failure is accepted as a tooling
diagnosis: macro compaction cannot depend on stale oldText snapshots.

## Next

Round 131 uses `replace_file_with_current_anchor`, which derives the anchor from
the current worktree file and then mutates through Atomic MCP.
