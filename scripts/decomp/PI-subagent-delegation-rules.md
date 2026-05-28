# PI Subagent Delegation Rules

> **Read this before launching any PI subagent in this repo.** These rules
> codify the orchestration protocol that this CLI agent (Claude as CEO) uses
> to delegate work to PI atomic subagents running locally.

## The PI fork is locked

- **Only PI**: `/Users/danielpenin/pi-inspect` (the personal atomic fork of
  oh-my-pi). The vanilla PI is **banned**; never invoke `pi`, `omp`, or any
  global PATH binary. Always use the bundled CLI at
  `packages/coding-agent/src/cli.ts` via Bun.
- **Live home `~/.hermes` is off-limits.** This fork has no business there.
- **Model**: `deepseek/deepseek-v4-pro` is the default; never silently
  downgrade. The API key lives in `/Users/danielpenin/.pi-ab.env` (gitignored).

## The launcher contract

Every subagent launch must:

1. Run inside a **detached git worktree** off `HEAD` so the subagent cannot
   touch the working tree of the orchestrator.
2. **Symlink `node_modules`** for every workspace (backend / frontend /
   frontend-admin / worker) so tools requiring deps work without a fresh
   `npm install`.
3. **Isolate `HOME`** to a temp dir so the subagent inherits no global
   skills / rules / sessions / extensions.
4. Run **`--mode json`** redirected to a per-id log file under
   `/Users/danielpenin/pi-ab/canon/logs/<id>.json`. JSON mode is the
   interactive-mode-of-record: every think / tool call / response is one
   event line, fully observable in real time via `tail -f`.
5. Pass `--no-extensions --no-skills --no-rules --no-session --allow-home`.
6. Pin `ATOMIC_EDIT_REPO_ROOT="$WT"` and `ATOMIC_EDIT_ALLOWED_ROOTS="$WT"`
   so the atomic firewall refuses writes outside the worktree.
7. Pass `--tools=<comma-list>` enumerating exactly the tools the task needs;
   never pass `--no-tools`.
8. Use `-p` (print) for one-shot tasks. The orchestrator stays interactive
   by reading the json log, never by typing into the subagent's stdin.

## The atomic toolset

Default tool envelope for canonicalization / refactor tasks:

```
read, search, find, grep, ast_grep,
convert_to_reexport, convert_group_to_reexport,
atomic_do, atomic_do_eval,
splice, ast_plan
```

For pure investigation / analysis tasks (no mutations expected):

```
read, search, find, grep, ast_grep
```

NEVER include legacy `edit` / `write` / `bash` directly — the atomic
firewall macros are the only sanctioned mutation path. `atomic_do` wraps
arbitrary shell mutation with snapshot + rollback.

## RAM budget on this Mac (16 GB)

- Each PI subagent costs ~400-500 MB resident.
- Cap simultaneous live subagents at **4-6** (leave 2 GB headroom for the
  orchestrator + Node typecheck / lint).
- Clean up finished subagents: `rm -rf /Users/danielpenin/pi-ab/canon/wt/wt-<id>
  /Users/danielpenin/pi-ab/canon/wt/home-<id>` and `git worktree prune` on the
  main repo. Failure to prune leaks ~50-200 MB per subagent.

## The hardening contract (no-cargo-cult)

When a subagent exits, the orchestrator MUST:

1. Read the full json log (every event, start to finish) — never skim.
2. Read every file the subagent modified (via the trace events or
   `git diff` inside the worktree).
3. Run `npm run typecheck` for the affected workspace(s) inside the
   worktree before integrating.
4. Run the spec(s) closest to the changed code (`npm test -- <pattern>`).
5. If anything fails, HARDEN the delivery (fix imports, missing types,
   stylistic issues) before integrating — never integrate broken code, never
   integrate code you haven't read.
6. Apply the delivery to the main repo as a single focused commit. Commit
   message attributes co-authorship to the subagent id.

Stop conditions that REQUIRE escalation back to the human:

- Touch of any protected file (see `CLAUDE.md` § Arquivos Protegidos).
- Production secret required.
- Destructive DB operation required.
- Deploy required.
- Payment / governance decision without an existing ADR.

## What to delegate

- **Investigation / cognitive work**: symbol-graph audits, dead-export hunts,
  PULSE module scans, security audits, hidden-duplication discovery.
- **Refactor execution**: byte-identical canonicalization, semantic merges of
  same-intent helpers, file decomposition under the 800-line cap.
- **Test authoring**: spec generation for newly canonicalized helpers.
- **Documentation**: rendering audit reports into `docs/architecture/*` so the
  next agent inherits the discovery.

What NOT to delegate without human authorization:

- Schema / migration design.
- Stripe / payment-flow code paths (read ADR-0003 + STRIPE_MIGRATION_PLAN
  first; if unclear, escalate).
- Anything that requires a live production secret.

## Filesystem layout

```
/Users/danielpenin/pi-ab/canon/
├── launch-canon.sh          # canonical byte-identical re-export launcher (legacy)
├── launch-pi.sh             # general-purpose PI launcher (see scripts/decomp/launch-pi.sh template)
├── logs/<id>.json           # event log per subagent
├── logs/<id>.err            # stderr
├── logs/<id>.done           # "EXIT <code>" written when done
├── logs/<id>.pid            # bg pid
├── tasks/<id>.md            # task spec (human-readable for the orchestrator's record)
└── wt/wt-<id>/              # worktree the subagent operates in
└── wt/home-<id>/            # isolated HOME for the subagent
```

The orchestrator must keep `logs/`, `tasks/`, and `wt/` in sync. When a
subagent is cleaned up, all four artifacts for that id go away together.
