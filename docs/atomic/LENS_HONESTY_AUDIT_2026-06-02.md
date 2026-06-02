# Atomic Lens Honesty Audit — 2026-06-02

> Goal (from the owner directive): make the atomic **reader/lens** stop lying on
> this codebase — every byte it marks *negative* must be truly non-correct-by-
> construction, every *positive* truly correct, with no false positives and no
> false negatives. Method: read the lens **with the lens**, and turn every proven
> false verdict into a reader update ("o delta vira atualizacao do leitor").
>
> This run executed that loop entirely through the atomic envelope (native Bash
> was refused by the `atomic_exec`-mandatory hook; every shell command was wrapped
> in the host broker sandbox + byte-effect proof). That is points #1 and #2 of the
> revolution — *no-bypass* and *byte-level truth* — observed live, not asserted.

## TL;DR

`atomic_lens scripts/mcp/atomic-edit` → **197 reds over 179 files**. After
verifying each class against source, **~86% of those reds are the lens lying**
(false positives — correct-by-construction bytes wrongly marked negative), caused
by **three** specific gate soundness bugs. The lens's own contract says each gate
emits "sound under-approximations (never a false positive)"; these three break it.

| # | Gate | Reds | Verdict | Status |
|---|------|------|---------|--------|
| 1 | `structural-lint` / prefer-const | ~120 | **LIE** | fix authored + **proven** (25/26 self-expansion validators green); blocked on landing |
| 2 | `structural-lint` / no-useless-escape | ~40 | **LIE** | fix designed |
| 3 | `prisma-reference` | ~9 | **LIE (minor)** | fix designed |
| — | `structural-lint` / no-unused-vars | ~4 | true positive (real dead imports) | n/a |
| — | `security` | ~11 | shape-true, intentional test fixtures | policy |

## Reader bug #1 — prefer-const blind to compound assignment (DOMINANT)

**Lie:** the lens marks `let i` in `for (let i = 0; i < 12; i += 1)`
(`gates/lens.ts:94`) and `let judged = 0; … judged += 1`
(`server-tools-lens.ts:134`) as `prefer-const: never reassigned`. Both **are**
reassigned. Real ESLint never flags these. The same lie fires on ~120 sites:
`pass`/`fail` counters (`pass += 1`) in nearly every `*.proof.mjs`, loop `i`
(`i += 1`), `totA/totL/totAL`, etc.

**Root cause:** tree-sitter parses `x += 1` as `augmented_assignment_expression`
— a node type distinct from both `assignment_expression` (`x = 1`) and
`update_expression` (`x++`). `emitPreferConst` (structural-lint-gate.ts) never
requested or handled it, so a name reassigned only via a compound operator was
seen as never-reassigned.

**Fix (authored, proven-correct, not yet landed):**
1. add `'augmented_assignment_expression'` to the `astNodes` node-set in
   `analyzeStructural` (line ~213);
2. add a branch in the `reassigned` loop in `emitPreferConst`:
   ```ts
   } else if (n.type === 'augmented_assignment_expression') {
     // `x += 1`, `x **= 2`, `x &&= y`, `x >>>= 1`, … — a compound assignment IS a
     // reassignment. Match a plain-identifier LHS directly followed by the operator;
     // a member/index LHS (`obj.p += 1`) cannot match → never a false suppression.
     const m = /^([A-Za-z_$][\w$]*)\s*[-+*/%&|^<>?]{1,3}=/.exec(n.text.trim());
     if (m) reassigned.add(m[1]);
   }
   ```
3. lock it with a regression test in `structural-lint-gate.proof.mjs`: a `let`
   reassigned only via `+=` / `i++` must stay GREEN (RED before the fix).

**Evidence the fix is correct-by-construction:** submitted via `atomic_expand_self`.
The mandatory 26-validator lattice ran; **25 passed** — build, type-soundness,
the structural-lint proof itself (`semantic`), reachability, binding, security,
capability-monotonicity, codex-no-bypass, codex-entrypoint-contract, usability.
The **only** failure was an unrelated whole-host certificate (see Blocker), so the
write was rolled back byte-exact. The fix is staged and ready.

## Reader bug #2 — no-useless-escape fires on regex and String.raw

**Lie (~40 reds):** every flagged `\s \d \( \) \} \.` is meaningful, not useless:
- `property-gate.ts:250` → `/^int\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/` is a **regex
  literal**; `\( \s \d \)` are regex metacharacters.
- `converge-operator.ts:284`, `repair.ts:45`, `atomic-only-hook.mjs:109` →
  ``String.raw`export\s+…` `` **raw templates**; in `String.raw`, backslashes are
  literal. ESLint never flags either case.

**Root cause:** `emitNoUselessEscape` flags *every* `escape_sequence` node whose
char ∉ MEANINGFUL_STRING_ESCAPE. The gate's doc claims it excludes regex, but the
implementation relies on the false assumption that regex escapes are not
`escape_sequence` nodes — this tree-sitter version emits them inside `regex` and
inside `String.raw` templates too.

**Fix (designed):** request `regex` + `template_string` nodes; in
`emitNoUselessEscape` skip any `escape_sequence` (a) byte-contained in a `regex`
node, or (b) inside a `template_string` immediately preceded by a `String.raw` /
`.raw` tag. Both use the existing `containedInAny` helper.

## Reader bug #3 — prisma-reference matches string/comment-embedded refs (minor)

**Lie (~9 reds):** confined to meta-code. `prisma-reference-gate.ts:152` is the
gate's **own JSDoc** ("a commented `prismaAny.x`"); `:316` is its **own message
template** `` `prismaAny.${ref.accessor}` `` (regex captured `$`); the
`.proof.mjs` ghosts are **test-fixture strings**. `collectPrismaAnyRefs` blanks
comments but not string/template literals, so `prismaAny.X` text embedded in
those is still matched.

**Fix (designed):** blank string/template literal spans (token-correct, via the
perception organ) the same way comments are blanked, before the `prismaAny.<acc>`
scan — so only real member expressions are matched. Low severity (string-embedded
`prismaAny.X` is rare outside the gate's own code/tests).

## Not lies

- `no-unused-vars`: `path` in `smoke-part-a/d/ef.ts`, `readUtf8` in
  `server-tools-converge.ts` — real unused imports. **True positives.**
- `security`: fake AWS/PEM/Stripe/JWT shapes in `security-gate.proof.mjs` are
  deliberate detection fixtures. The gate's contract is "shape, not taint", so it
  correctly reds secret-shaped bytes; they are intentional test data, not a lie.
  Policy choice: exonerate proof-fixtures, or leave shape-true.

## BLOCKER — why none of the fixes could be landed this session

The only legal way to edit `scripts/mcp/atomic-edit/**` is `atomic_expand_self`,
which runs a 26-validator mandatory lattice and rolls back byte-exact if **any**
validator reds. One validator —
`gates/compiled-mcp-y-certificate.proof.mjs` — requires **every** mandatory
domain of the compiled Y certificate to be GREEN, and that list now includes the
literal whole-host-control domains:

- `externalRuntimeState` = **RED**
- `arbitraryInterpreterSandbox` = **UNJUDGED** ("nested no-write sandboxing is not
  available")
- `codexEntrypointContract` = **RED** *inside the spawned sub-MCP* (it passes
  **standalone**, EXIT 0).

**Root cause of the block:** this is a **host-launched (sandboxed) session**. The
compiled-cert proof spawns its own broker + a fresh MCP and tries to *prove*
sandbox denial (no out-of-cwd writes, no network, denied interpreters). That
proof needs to create a sandbox — but a sandbox cannot be nested inside the
already-active host sandbox (`nestedSandbox:false`). So the two whole-host domains
can never go green from inside the sandbox, and every self-expansion rolls back.

This is exactly the **"Y" frontier** the directive names ("precisaria controlar o
ambiente inteiro: filesystem overlay, sandbox, permissões, rede, processos
filhos…"). The reader fixes (file-byte truth, fully proven) are gated behind the
*environment-control* domains, which require genuine OS-level nested-sandbox /
kernel support — the honest ceiling the engine's own `atomic_y_certificate` docs
acknowledge.

## Unblock path (owner / launcher decision — not autonomously safe)

1. Run the atomic MCP so the compiled-cert proof can spawn its broker+sandbox+MCP
   **un-nested** (a top-level host launcher that is itself not inside a sandbox),
   so `externalRuntimeState` + `arbitraryInterpreterSandbox` can be proven; **or**
2. Make the compiled-cert / self-expansion lattice **nested-sandbox-aware**: when
   running inside an active host sandbox, accept these two domains as
   `honestBlocked` (the proof already models an honest-blocked acceptance for
   `bypassLedger` — extend the same honesty to the nested-sandbox case) instead of
   requiring a fresh sandbox it provably cannot create; **or**
3. The owner lands fixes #1–#3 directly (these edits touch governance/no-bypass-
   adjacent machinery and the whole-host cert, which are owner territory).

Once unblocked, fix #1 is staged verbatim above and re-applies in one
`atomic_expand_self` call; #2 and #3 follow the same loop (lens → fix → proof).
