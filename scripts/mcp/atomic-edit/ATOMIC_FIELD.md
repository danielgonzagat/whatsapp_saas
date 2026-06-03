# The field of atomicity — what "cover everything" actually means

One substance: the **byte**. A terminal is only two things — **bytes at rest**
(files) and **bytes in motion** (process I/O). Every computational action is that
substance reorganized. The atom's job: let the agent declare intent at the
**highest faithful level**, compile it **down** to the smallest faithful
byte-mutation, **preserve** the rest, **prove** the delta, and make it
**reversible** — one envelope (snapshot → validate → trace → rollback → proof)
for every action. The byte is the execution floor, never the agent's steering
wheel (forcing byte-coordinate math would be the disease wearing the cure).

The field is **finite** because every action lands in exactly one of three tiers.
"Covered" = every action-type is (A) byte-reversible via the substrate, or (B)
governed as a byte-effect transaction, or (C) honestly ceilinged by the ledger
discipline. There is no Tier D.

## Tier A — bytes at rest (files): byte-reversible · COVERED

The Mutation Firewall: `resolveSafeTarget` (containment + protected-file guard) →
syntax-validate → `atomicWrite` (temp+fsync+rename, mode-preserving) → char-level
trace → rollback.

| Action | Operator | Substrate fact |
|---|---|---|
| create / edit / delete a file | `atomic_create_file` / `atomic_edit` / `atomic_delete_file` | every write is byte-proven + traced |
| literal / import / property / decorator / signature / operator / arg / symbol | `atomic_*` family (20+ ops) | high intent → compiles to a byte-splice, traced |
| rename across files | `atomic_rename_symbol_cross_file` / `atomic_rename_member` | all-or-nothing + rollback + per-file trace |
| many files in one intent | `atomic_transaction` / `atomic_apply_workspace_edit` | one transaction, rollback on mid-write |
| structural search/edit, any language | `atomic_ast_search` / `atomic_ast_edit` (web-tree-sitter WASM) | byte-offset exact, multibyte-correct |
| read / search / outline | `code_read_symbol` / `atomic_grep` / `atomic_glob` / `atomic_outline` | read-only — proven, never mutates |

## Tier B — shell / process effects: byte-effect transaction · COVERED

The filesystem is the **universal observable**: a command's persistent effect is
just a byte-delta on files. So govern the **effect**, not the command.

`atomic_exec` (`proveEffect`; `rollbackOnNonZero` is recovery-only): snapshot the
file-bytes under cwd before spawn → run → report the EXACT per-file change
(modified/created/deleted, char-level diff) → reverse **byte-exact +
untracked-inclusive** on failure after proof. Plus: real exit code (never faked),
invariant denylist (defense-in-depth,
not a sandbox), protected-file shell-write refusal, secret redaction, timeout,
cwd guard.

**This is the generator, not a zoo.** build, test, git, npm/install, codegen,
migration scripts, formatters — anything whose effect lands on files — is covered
by this ONE substrate. We do **not** build a tool per action-type.

## Tier C — external irreversible effects: honest ceiling · LEDGER DISCIPLINE

Bytes that **leave the machine** cannot be un-sent: a POSTed request, a charged
card, a deleted prod row across replicas, a sent email. Here atomicity is **not**
fake reversal — it is the financial-ledger law already in this codebase:

- **declare the effect** (idempotency key, external id),
- **make it replay-safe** (webhook/payment dedup),
- **reverse only by a compensating action** (refund entry, tombstone, retraction) —
  append-only, never an UPDATE that pretends it didn't happen.

Honest atomicity. The atom is **inescapable where the bytes stay** (Tier A/B) and
**honest where they leave** (Tier C).

## The metric and the discipline

- **bypass-rate → 0**: every action flows through the one envelope. The
  PreToolUse hooks (`atomic-only-hook` + `bypass-observer`, wired per
  `ENFORCEMENT_SETUP.md`) measure and drive this.
- **Expand the generator, not the catalog.** Universality is reached by the
  substrate (Tier A byte-splice + Tier B byte-effect) being uniform — not by
  enumerating actions. A new language, a new command, a new tool: already covered
  if its effect is bytes; ledger-compensated if it leaves the machine.
- **One verified derivation at a time.** Each capability ships already
  proven-by-behavior and reversible (no unverified half-work) — that is what keeps
  the build **convergent**, not a loop. "Done" is severity-convergence + tier
  coverage, never asymptotic perfection.

## Completion criterion

The field is covered when, for every computational action an agent can take in a
terminal, the answer to all three is yes:

1. Is its effect either byte-reversible (A/B) or honestly compensated (C)?
2. Is the change proven (char/byte delta) without the human reading code?
3. Can another session continue from the trace?

If yes for all action-types, the substrate is complete to its honest ceiling.
There is no further tier to reach — only finer coverage and lower bypass-rate.
