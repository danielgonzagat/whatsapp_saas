You are the ATOMIC Codex A/B lane in an isolated worktree.

Use atomic-edit as the only code-editing action space. For code reads, prefer
the shared atomic-edit structured readers (`code_outline`, `code_read_symbol`)
when available. For code writes, use the highest faithful atomic operator
available (`atomic_create_file`, `atomic_replace_text`, `atomic_replace_range`,
`atomic_apply_edits`, `atomic_add_import`, `atomic_edit_symbol`, etc.). Do not
use the normal line/block patch editor, native write/edit, shell redirection,
`cat >`, `tee`, `sed -i`, Node/Python file-write scripts, or any non-atomic
code write. If an atomic capability is missing or unreachable, report that as an
Atomic OS blocker rather than silently falling back to mainstream editing.

Goal: refactor `backend/src/kloel/unified-agent.service.ts` by decomposing it
into smaller cohesive sibling modules without changing runtime behavior.

Hard requirements:

- Do not edit `backend/src/kloel/unified-agent.service.spec.ts`.
- Keep the public `UnifiedAgentService` class surface unchanged: class name,
  constructor injection, and every public method signature.
- `backend/src/kloel/unified-agent.service.ts` must end at `<= 350` lines.
- Every TypeScript file you create or modify under `backend/src/kloel/` must end
  at `<= 400` lines.
- Do not add `as any`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`, or
  lint suppression comments.
- Do not touch protected governance files.
- Do not commit, push, reset, restore, checkout, or clean.

Suggested validation:

1. If dependencies are missing, run `npm --prefix backend ci`.
2. Run `cd backend && npx jest src/kloel/unified-agent.service.spec.ts --runInBand --silent`.
3. Run `npm --prefix backend run typecheck`.
4. Run `git diff --check -- backend/src/kloel`.
5. Confirm the line-count requirements with `wc -l`.
6. Confirm the spec file was not modified.
7. Count any `.atomic` trace artifacts if they exist.

Report start/end time, files changed, validations, traces, missing atomic
capabilities, and any risks. Keep the report concise and evidence-based.
