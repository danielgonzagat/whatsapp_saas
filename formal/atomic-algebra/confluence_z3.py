#!/usr/bin/env python3
"""
confluence_z3.py — MACHINE-CHECKED soundness theorem for the verified-edit algebra (FASE-1, T1).

This is NOT the trivial "disjoint spans => byte-commute" lemma that Darcs/Pijul/OT/CRDT patch
theory already mechanize. It is the half no patch theory states:

    THEOREM (confluence modulo a semantic read-set invariant).
    For two independently-verified edits P1, P2 with edited loci mod_i and gate read-sets read_i
    (the loci each edit's gate READ to discharge its obligation — INCLUDING, per FASE-0.1, the
    (a) inverted-default disproof read-loci), define
        commute(P1,P2)  :=  mod1∩mod2=∅  ∧  mod2∩read1=∅  ∧  mod1∩read2=∅.
    Then commute(P1,P2) implies, in the merged state m = apply2(apply1(s)):
        (L1) verdict1(m)            — P1's obligation stays DISCHARGED  (the differentiator)
        (L2) verdict2(m)            — P2's obligation stays DISCHARGED
        (L3) apply2(apply1(s)) = apply1(apply2(s))   — byte-confluence (the easy half, included)

The model is ABSTRACT (uninterpreted Byte sort, array States, function mod/read/apply/verdict),
so Z3 proves the implication for ALL configurations — not a bounded enumeration — by showing the
negation is UNSAT. Gates live in the DECIDABLE fragment: a verdict is a function of its read-set
(axiom (2)), and an edit's written bytes depend only on its read-set (axiom (3)). Nested
"agree-on-read-set" quantifiers are SKOLEMIZED to witness functions (vdiff_i, adiff_i) so the goal
lies in a fragment Z3 decides.

HONEST SCOPE (T8 — Rice is NOT defeated):
  * This is a theorem about the EDIT ALGEBRA's confluence over a decidable gate fragment, NOT
    "edits are correct for all computation". UNJUDGED stays a first-class verdict elsewhere.
  * The runtime same-file/disjoint-spans case is OUTSIDE this fragment (intra-file binding coupling
    is not modelled — algebra.ts says so). The refinement test (gates/algebra-refinement.proof.mjs)
    proves runtime commute() equals THIS predicate on the cross-file fragment and surfaces the
    same-file case as the documented unproven residual.
  * Every guided ground instance below is AUDITED: `universals ⊨ hint` is checked unsat before the
    hint is trusted, so no spurious assumption can produce a spurious UNSAT.

Reproduce (T4):  python3 -m venv .venv && .venv/bin/pip install z3-solver && .venv/bin/python3 confluence_z3.py
Expect: every audit + L1 + L2 + L3 print "PASS ... unsat", final line "ALL GREEN".
"""
from z3 import (
    DeclareSort, IntSort, BoolSort, ArraySort, Function, Const, ForAll, Implies, And, Not,
    Select, Solver, unsat,
)

Locus = IntSort()
Byte = DeclareSort("Byte")
State = ArraySort(Locus, Byte)

mod1 = Function("mod1", Locus, BoolSort()); mod2 = Function("mod2", Locus, BoolSort())
read1 = Function("read1", Locus, BoolSort()); read2 = Function("read2", Locus, BoolSort())
apply1 = Function("apply1", State, State); apply2 = Function("apply2", State, State)
verdict1 = Function("verdict1", State, BoolSort()); verdict2 = Function("verdict2", State, BoolSort())
vdiff1 = Function("vdiff1", State, State, Locus); vdiff2 = Function("vdiff2", State, State, Locus)
adiff1 = Function("adiff1", State, State, Locus, Locus); adiff2 = Function("adiff2", State, State, Locus, Locus)

s = Const("s", State); l = Const("l", Locus); sa = Const("sa", State); sb = Const("sb", State)

# The model axioms. (1) FRAME, (2) verdict read-determinism (decidable fragment), (3) edit
# write-determinism, (4) commute = the three disjointness conditions. (2)/(3) Skolemized.
UNIV = [
    ForAll([s, l], Implies(Not(mod1(l)), Select(apply1(s), l) == Select(s, l))),
    ForAll([s, l], Implies(Not(mod2(l)), Select(apply2(s), l) == Select(s, l))),
    ForAll([sa, sb], Implies(verdict1(sa) != verdict1(sb),
        And(read1(vdiff1(sa, sb)), Select(sa, vdiff1(sa, sb)) != Select(sb, vdiff1(sa, sb))))),
    ForAll([sa, sb], Implies(verdict2(sa) != verdict2(sb),
        And(read2(vdiff2(sa, sb)), Select(sa, vdiff2(sa, sb)) != Select(sb, vdiff2(sa, sb))))),
    ForAll([sa, sb, l], Implies(And(mod1(l), Select(apply1(sa), l) != Select(apply1(sb), l)),
        And(read1(adiff1(sa, sb, l)), Select(sa, adiff1(sa, sb, l)) != Select(sb, adiff1(sa, sb, l))))),
    ForAll([sa, sb, l], Implies(And(mod2(l), Select(apply2(sa), l) != Select(apply2(sb), l)),
        And(read2(adiff2(sa, sb, l)), Select(sa, adiff2(sa, sb, l)) != Select(sb, adiff2(sa, sb, l))))),
    ForAll([l], Not(And(mod1(l), mod2(l)))),
    ForAll([l], Not(And(mod2(l), read1(l)))),
    ForAll([l], Not(And(mod1(l), read2(l)))),
]


def solver():
    so = Solver(); so.set("mbqi", True); so.set("timeout", 120000)
    for ax in UNIV:
        so.add(ax)
    return so


fails = []


def expect_unsat(name, extra):
    so = solver()
    for e in extra:
        so.add(e)
    r = so.check()
    ok = r == unsat
    print(f"  {'PASS' if ok else 'FAIL'} {name}: {r}")
    if not ok:
        fails.append(name)


m = apply2(apply1(s))   # P1 then P2 (the merged state)
mp = apply1(apply2(s))  # P2 then P1
k2 = vdiff2(m, apply2(s)); d2 = adiff2(apply1(s), s, k2)

HINTS2 = [
    Implies(verdict2(m) != verdict2(apply2(s)), And(read2(k2), Select(m, k2) != Select(apply2(s), k2))),
    Implies(And(mod2(k2), Select(m, k2) != Select(apply2(s), k2)), And(read2(d2), Select(apply1(s), d2) != Select(s, d2))),
    Implies(Not(mod2(k2)), Select(m, k2) == Select(apply1(s), k2)),
    Implies(Not(mod2(k2)), Select(apply2(s), k2) == Select(s, k2)),
    Implies(Not(mod1(k2)), Select(apply1(s), k2) == Select(s, k2)),
    Implies(Not(mod1(d2)), Select(apply1(s), d2) == Select(s, d2)),
    Implies(read2(k2), Not(mod1(k2))),
    Implies(read2(d2), Not(mod1(d2))),
]

c = Const("c", Locus); e1 = adiff1(apply2(s), s, c); e2 = adiff2(apply1(s), s, c)
HINTSC = [
    Implies(Not(mod1(c)), Select(apply1(apply2(s)), c) == Select(apply2(s), c)),
    Implies(Not(mod1(c)), Select(apply1(s), c) == Select(s, c)),
    Implies(Not(mod2(c)), Select(apply2(apply1(s)), c) == Select(apply1(s), c)),
    Implies(Not(mod2(c)), Select(apply2(s), c) == Select(s, c)),
    Implies(And(mod1(c), Select(apply1(apply2(s)), c) != Select(apply1(s), c)),
        And(read1(e1), Select(apply2(s), e1) != Select(s, e1))),
    Implies(And(mod2(c), Select(apply2(apply1(s)), c) != Select(apply2(s), c)),
        And(read2(e2), Select(apply1(s), e2) != Select(s, e2))),
    Implies(read1(e1), Not(mod2(e1))),
    Implies(read2(e2), Not(mod1(e2))),
    Implies(Not(mod2(e1)), Select(apply2(s), e1) == Select(s, e1)),
    Implies(Not(mod1(e2)), Select(apply1(s), e2) == Select(s, e2)),
]

print("ENTAILMENT AUDIT (universals ⊨ each guided hint — no spurious assumption):")
for i, h in enumerate(HINTS2):
    expect_unsat(f"hint2[{i}] entailed", [Not(h)])
for i, h in enumerate(HINTSC):
    expect_unsat(f"hintC[{i}] entailed", [Not(h)])

print("THEOREMS (negation unsat => theorem holds for ALL configurations):")
expect_unsat("L1 verdict1 preserved in merge (the differentiator)", [verdict1(apply1(s)), Not(verdict1(m))])
expect_unsat("L2 verdict2 preserved in merge", [verdict2(apply2(s)), Not(verdict2(m))] + HINTS2)
expect_unsat("L3 byte-confluence (orders agree)", [Select(m, c) != Select(mp, c)] + HINTSC)

if fails:
    raise SystemExit(f"THEOREM FAILED: {fails}")
print("\nALL GREEN — confluence-mod-(semantic-read-set) theorem machine-checked by Z3; every hint entailed.")
