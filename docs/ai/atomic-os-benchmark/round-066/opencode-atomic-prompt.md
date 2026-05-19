You are the ATOMIC lane in an A/B benchmark. Work only in the current worktree.

Task: extract exactly two top-level helpers from
`backend/src/kloel/unified-agent.service.ts` into
`backend/src/kloel/unified-agent-runtime.helpers.ts`, then import them back into
the service:

- `isAllowedTool`
- `formatPromptValue`

Preserve behavior exactly.

First and only command MUST be exactly this. No `git status`, `ls`, read, glob,
grep, cat, sed, head, tail, nl, awk, hashing, exploration, or extra validation
command before or after it:

`node /Users/danielpenin/whatsapp_saas/docs/ai/atomic-os-benchmark/tools/atomic-call.cjs extract_symbols_to_file '{"sourceFile":"backend/src/kloel/unified-agent.service.ts","targetFile":"backend/src/kloel/unified-agent-runtime.helpers.ts","selectors":["isAllowedTool","formatPromptValue"],"importNames":["isAllowedTool","formatPromptValue"],"importModule":"./unified-agent-runtime.helpers","validate":true}'`

Native OpenCode file tools are forbidden on code: `read`, `glob`, `grep`,
`list`, `write`, `edit`, `patch`. Shell mutation/read paths are forbidden.
Touch only the two target Kloel files plus `.atomic/traces`.

The command performs mutation and embedded validation: focused Jest, backend
typecheck, diff-check, protected diff and forbidden suppression scan.

Finish with files changed, atomic tools used, embedded validation results and
`atomicModeClean=true/false`.
