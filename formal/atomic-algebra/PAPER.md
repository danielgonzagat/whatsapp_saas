# A verified-edit algebra with an inverted byte-default: confluence modulo a semantic read-set invariant

**Priority record / pre-print draft.** This document fixes the contribution and its date against the
prior art. It is deliberately conservative: every claim is backed by a machine-checked artifact in
this repository, and the honest ceiling (Rice's theorem) is stated, not hidden.

## Abstract

We present a verified-edit algebra for autonomous code-mutation agents that pairs two mechanisms the
surveyed prior art does not combine: **(a) an inverted byte-default** — removing or replacing bytes
is *refused* unless accompanied by a SHA-bound, machine-recomputed **proof-of-incorrectness** — and
**(e) a commute-modulo-invariant edit algebra** whose independence relation is judged over the same
semantic resolution-closure the verification gates read. We give a **machine-checked soundness
theorem** (Z3): if two independently-verified edits commute, then in the merged state *both* gate
obligations — including the negative (disproof) obligations of (a) — remain discharged, and the two
application orders are byte-identical. We demonstrate the algebra on **169,171 real edit-pairs from
three external open-source repositories** with **zero** unsound false-independence verdicts (an
independent oracle cross-checks every verdict; the run itself surfaced and we fixed a real
under-approximation bug). The result is decidable-fragment-only: we **do not** defeat Rice's theorem,
and we say so.

## 1. The two mechanisms, integrated (not adjacent)

- **(a) Inverted byte-default.** Conventional verified-mutation systems require a proof of
  *correctness* to *keep* a change, or use deny-lists to block dangerous ones. We invert the burden:
  *correct-by-construction bytes are immutable to negative actions*. To delete or replace bytes an
  agent must supply a `DisproofWitness` that the gate **re-computes** against the actual removed
  bytes (`duplicate`: the removed region still occurs in the result; `gate-red`: a named decidable
  gate returns RED over the removed bytes). A witness that does not hold is refused. A free-text
  rationale is still accepted but the receipt records it **honestly** as `asserted`/`recomputed:false`
  — it never claims a disproof was verified when it was only asserted.
  *Artifact:* `scripts/mcp/atomic-edit/server-helpers-negative-proof.ts`,
  `gates/negative-proof-teeth.proof.mjs`.

- **(e) Commute-modulo-invariant algebra.** Two verified edits `commute` iff their edited spans are
  disjoint **and** neither edit modifies a locus the other's gate *read* to discharge its obligation
  (the resolution closure `Cl`, over-approximated as the file plus its transitive import closure).
  *Artifact:* `scripts/mcp/atomic-edit/gates/algebra.ts`, `gates/algebra.proof.mjs`.

- **The integration (the point).** `Cl` and the read-set of (a)'s disproof are the **same** object:
  an `EditFact` carries the negative-proof's `readLoci`, and `commute` reads them as a coupling
  surface. So (a) and (e) are *one* property, not two subsystems that merely coexist: a commuting
  merge provably preserves the negative-action justification, not only the positive gate verdict.

## 2. The theorem (machine-checked, all configurations)

`formal/atomic-algebra/confluence_z3.py` discharges, via Z3 over an **abstract** model
(uninterpreted bytes, array states, function `mod`/`read`/`apply`/`verdict`), the implication for
**all** configurations (UNSAT-of-negation), not a bounded enumeration:

> `commute(P1,P2)` ∧ `P1` verified ∧ `P2` verified ⟹
> **L1** `verdict1(merge)` ∧ **L2** `verdict2(merge)` (both obligations stay discharged) ∧
> **L3** `apply2(apply1(s)) = apply1(apply2(s))` (byte-confluence).

**L1/L2 are the differentiator.** Byte-confluence (L3) is the classical diamond lemma that Darcs,
Pijul, OT, and CRDT patch theory already mechanize. The *obligation-preservation* result — a gate
verdict, once green, **survives** a commuting concurrent edit, because that edit provably touches no
locus the gate read — is, to our knowledge, unstated in agent or patch-theory prior art. It holds in
the **decidable fragment**: a gate verdict is a function of its read-set (axiom 2) and an edit's
written bytes depend only on its read-set (axiom 3). Every guided proof step is **audited** entailed
by the model axioms (`universals ⊨ hint` checked UNSAT), so no spurious assumption can produce a
spurious result.

**Refinement link.** `gates/algebra-refinement.proof.mjs` proves the runtime `commute()` *equals* the
predicate the theorem is about, exhaustively over all **73,728** cross-file configurations (every
branch). The runtime same-file/disjoint-spans case is **outside** the proven fragment (intra-file
binding coupling is not modelled) and is surfaced as a documented residual, never claimed as proven.

## 3. External demonstration (FASE-2 T3)

`formal/atomic-algebra/t3_corpus.mjs` ran the algebra over **169,171** real edit-pairs from three
OSS repos the authors did not write (zod, type-fest, zustand), cross-checking every independence
verdict against a **separately-written** import-reachability oracle. Soundness direction:
false-independence = **0 / 169,171**. The run *found* a real bug (re-export edges `export … from`
were missed by the per-symbol closure → 242 false-independent pairs on a re-export hub); the fix
restored soundness and is locked by a regression test. `t3_result.json` archives the numbers.

## 4. Prior art (T5) — why the (a)+(e) cell is empty

| System | (a) inverted byte-default | (e) commute-mod-invariant algebra | machine-checked | demonstrated at scale |
|---|---|---|---|---|
| **This work** | **yes** (recomputed disproof) | **yes** (read-set invariant, Z3-proven) | **yes (Z3)** | 169k external pairs |
| Nidus (arXiv 2604.05080) | no (positive proof-of-correctness) | no (Git-as-WAL, no edit algebra) | yes | 100k-LOC self-host (stronger here) |
| Microsoft MXC / AGT (2026) | no (kernel deny, no edit semantics) | no | n/a (OS sandbox) | commercial adoption (stronger here) |
| SEVerA (arXiv 2603.25111) | no (white-list, Dafny) | no | yes (Dafny subset) | restricted subset |
| CompCert / KeY | no (positive verification) | no | yes | — |
| Coccinelle | no | no (syntactic CTL transforms) | partial | wide |
| Hazel / Hazelnut | no | no | yes (Agda) | — |
| Darcs / Pijul / OT / CRDT | no | **commute over bytes/ops, NOT modulo a semantic read-set invariant; no proof-gating** | some | wide |

No surveyed system delivers **both** (a) and (e). Two pieces atomic *also* has — a sole-mutation-path
no-bypass envelope and self-extension under a monotonic proof lattice — are **no longer novel** after
Nidus (independent implementation) and MXC (shipped infrastructure); we explicitly do **not** claim
them as contributions.

## 5. Honest ceiling and what is NOT yet earned

- **Rice is not defeated.** The theorem is about the edit algebra's confluence over a *decidable*
  gate fragment, never "edits are correct for all computation." `UNJUDGED` remains a first-class
  verdict (`gates/formal-gate.ts:80` already concedes this).
- **Open residuals (engineering):** the same-file/intra-file coupling fragment is unproven; the
  no-bypass deny-hook is logic-real but has not yet fired on live traffic (`blockedByDenyHook` = 0);
  the `DisproofWitness` is not yet wired through every MCP tool entry point.
- **Recognition is not correctness (and is not yet met).** "Unprecedented" is conferred by the
  field, not by code: a public priority record (this document), an independently re-runnable
  artifact, peer review that adjudicates novelty, **independent replication**, and external adoption.
  This work supplies the first two; the last three require the outside world and are **not** claimed.

## 6. Reproduce

See `README.md` (Z3 theorem, refinement link, T3 corpus). Everything in §2–§3 is re-runnable from a
clean checkout with `node` and `z3-solver`.
