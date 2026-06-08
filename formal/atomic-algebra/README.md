# Atomic verified-edit algebra — machine-checked confluence theorem (FASE-1)

This directory holds the **machine-checked soundness theorem** for the commute-mod-invariant
edit algebra in `scripts/mcp/atomic-edit/gates/algebra.ts` — the T1 deliverable of the
"genuinely unprecedented" program. It exists because an empirical commute *band* (the
99.4%-over-7.4M-pairs statistic in `algebra.proof.mjs`) is a **witness, not a proof**: a hostile
PL/systems reviewer does not award priority for a property stated as a measurement.

## What is proven (and what is NOT)

`confluence_z3.py` proves, via Z3 (UNSAT-of-negation over an **abstract** model — all
configurations, not a bounded enumeration):

| Lemma | Statement | Note |
|------|-----------|------|
| **L1** | `commute(P1,P2)` ⇒ P1's gate verdict stays **discharged** in the merged state | the differentiator — no OT/CRDT/Darcs/Pijul patch theory states this |
| **L2** | `commute(P1,P2)` ⇒ P2's gate verdict stays **discharged** in the merged state | |
| **L3** | `apply2(apply1(s)) = apply1(apply2(s))` (byte-confluence) | the "easy" half, included for completeness; Darcs/OT/CRDT already have it |

where `commute(P1,P2) := mod1∩mod2=∅ ∧ mod2∩read1=∅ ∧ mod1∩read2=∅`, and `read_i` is the set of
loci edit `i`'s gate **read** to discharge its obligation — **including** the (a) inverted-default
disproof read-loci (FASE-0.1). That inclusion is what makes this the **(a)+(e) integration**: the
theorem proves a commuting merge preserves both the positive gate obligation *and* the negative
(disproof) obligation.

**Decidable fragment (the only place the theorem lives).** A gate verdict is a function of its
read-set (axiom 2) and an edit's written bytes depend only on its read-set (axiom 3). Gates that
are total functions of the AST (brace/bracket balance, import presence, arity) satisfy this. The
theorem says nothing about undecidable semantic gates — **Rice's theorem is not defeated, only
side-stepped for the decidable fragment** (consistent with `gates/formal-gate.ts:80`).

**Honest residual (T8).** Same-file edits are now covered (FASE-2b): they are an instance of the same
predicate with the per-span identifier sets as loci. The refinement test
(`scripts/mcp/atomic-edit/gates/algebra-refinement.proof.mjs`) proves runtime `commute()` equals the
predicate proven here on **all 73,728 cross-file AND all 73,728 same-file** configs (exhaustively,
every branch): a shared identifier across byte-disjoint same-file spans is intra-file def-use coupling
(refused, catches rename-above-use); unknown identifiers are `UNJUDGED`. The only remaining residual
is positional/non-identifier coupling — the exact analogue of the cross-file dynamic-import residual,
narrow and undecidable in general — named here, not hidden.

**No spurious assumptions.** L2/L3 use guided ground instances to pin Z3's E-matching. Every hint is
**audited**: `universals ⊨ hint` is checked UNSAT before the hint is trusted, so a hint can only be a
sound instantiation of an axiom already in the model — it cannot manufacture a spurious UNSAT.

## Reproduce (cold machine, no project secrets)

```bash
cd formal/atomic-algebra
python3 -m venv .venv
.venv/bin/pip install z3-solver        # z3-solver 4.16.x
.venv/bin/python3 confluence_z3.py
```

Expected: every `ENTAILMENT AUDIT` line, then `L1`/`L2`/`L3`, print `PASS … unsat`, ending with
`ALL GREEN`. A non-zero exit means a theorem (or audit) failed.

The refinement link runs with the engine's own toolchain (no Z3):

```bash
cd scripts/mcp/atomic-edit && node build.mjs && node gates/algebra-refinement.proof.mjs
```

## FASE-2 T3 — external-corpus demonstration (`t3_corpus.mjs`, `t3_result.json`)

The theorem proves soundness over a model. T3 demonstrates the algebra **runs on real code the
atomic team did not write** and that its independence verdicts are sound there. `t3_corpus.mjs`
builds one `EditFact` per `.ts` file of an external OSS repo (closure resolved against the real
imports) and, for every pair the algebra calls **commuting (independent)**, cross-checks it with a
**second, independently-written import-reachability oracle**. The soundness direction is the claim:
the algebra may over-couple (coarser closure) but must **never** call two import-coupled files
independent.

Latest run (3 external repos — zod, type-fest, zustand):

| repo | files | pairs | commute rate | **false-independence (UNSOUND)** |
|------|------:|------:|-------------:|-------------:|
| zod | 401 | 80,200 | 89.78% | **0** |
| type-fest | 421 | 88,410 | 56.31% | **0** |
| zustand | 34 | 561 | 95.72% | **0** |
| **total** | | **169,171** | | **0** |

This run **found and fixed a real soundness bug**: `perSymbolClosureOf` originally missed
`export … from './x'` re-export edges (zustand's `index.ts` is a pure re-export hub), under-
approximating the read-set and reporting 242 false-independent pairs. The fix (re-exports are now
always-coupled, like side-effect imports) drove false-independence to **0** and is locked by the
`RE-EXPORT` regression in `gates/algebra.proof.mjs`. Reproduce:

```bash
mkdir -p .corpus && cd .corpus
git clone --depth 400 https://github.com/colinhacks/zod
git clone --depth 50  https://github.com/sindresorhus/type-fest
git clone --depth 50  https://github.com/pmndrs/zustand
cd .. && node scripts/mcp/atomic-edit/build.mjs
node formal/atomic-algebra/t3_corpus.mjs .corpus/zod .corpus/type-fest .corpus/zustand
```

## Toolchain

- Python 3.11+ and `z3-solver` (the Z3 SMT solver Python bindings). Nothing else.
- The theorem is the `.py` + Z3's UNSAT verdict — reproducible by any third party with Z3, which is
  exactly the "external prover artifact" an unprecedented-claim acceptance test (T1) requires.
