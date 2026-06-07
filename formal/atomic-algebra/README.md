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

**Honest residual (T8).** The runtime `commute()` also grants commute for *same-file, byte-disjoint*
edits with the caveat "intra-file binding coupling not modelled — conservative" (`algebra.ts`). That
case is **outside** this proven fragment. The refinement test
(`scripts/mcp/atomic-edit/gates/algebra-refinement.proof.mjs`) proves runtime `commute()` equals
the predicate proven here on the **cross-file fragment** (exhaustively, every branch) and surfaces
the same-file case as the documented unproven residual — it is not claimed as proven.

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

## Toolchain

- Python 3.11+ and `z3-solver` (the Z3 SMT solver Python bindings). Nothing else.
- The theorem is the `.py` + Z3's UNSAT verdict — reproducible by any third party with Z3, which is
  exactly the "external prover artifact" an unprecedented-claim acceptance test (T1) requires.
