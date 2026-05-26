# AB-ATOMIC-102 Handoff

- Status: rejected_dependency_container_policy_regression
- Worker: OpenCode ATOMIC lane
- Worktree: `/Users/danielpenin/kloel-ab-worktrees/kloel-ab102-atomic-20260517221550`
- Mission: solve the mixed router/runtime extraction using Atomic OS preprompt
  macro and atomic-only discipline.
- Files altered in worktree:
  - `backend/src/kloel/unified-agent.service.ts`
  - `backend/src/kloel/unified-agent-tool-router.helpers.ts`
  - `.atomic/traces/**`
- Evidence:
  - `opencode-atomic-preprompt-exit.txt`: `1`
  - `opencode-atomic-events.jsonl`: reported `ATOMIC_PREPROMPT_EXIT=1`
  - `opencode-atomic-preprompt-output.log`: behavior smoke passed, validation
    failed at `no deps builder method`
  - `audit.json`: preprompt exit `1`
- Tests observed inside preprompt:
  - focused Jest passed `13/13`
  - diff/protected/suppression scans passed before the forbidden-text failure
- Root cause: `dependencyContainer` generated a getter whose signature contained
  textual `toolRouterDeps()`, colliding with the gate that was meant to reject
  builder methods.
- Decision: rejected as A/B result; accepted as tool-policy finding.
- Recommendation: repeat in Round 103 using dynamic `constructorProperty`
  generation instead of getter generation.
