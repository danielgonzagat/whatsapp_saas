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
predicate the theorem is about, exhaustively over all **73,728 cross-file AND all 73,728 same-file**
configurations (every branch). Same-file edits are an instance of the same predicate: the loci are
the per-span identifiers, so the model's `mod ∩ read = ∅` becomes "the two spans' identifier sets are
disjoint" — a shared identifier (e.g. a rename in one span and a use in the other) is intra-file
def-use coupling and is refused; unknown identifiers (unreadable file) are `UNJUDGED`. The remaining
residual is positional/non-identifier coupling, the exact analogue of the cross-file dynamic-import
residual — narrow, undecidable in general, and named, not hidden.

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
- **Open residuals (engineering):** ~~the no-bypass deny-hook has not yet fired on live traffic~~ —
  **closed 2026-06-10**: in a host-launched session the PreToolUse deny-hook blocked **1,088 real
  native mutation attempts** (`.atomic/bypass-ledger.jsonl`, `blockedByDenyHook:true`), satisfying
  the T7 bar (`blockedByDenyHook > 0` in live traffic). Remaining enforcement residual is the
  harness-layer scope: the hook binds the agent tool surface; cron workers/spawned subprocesses
  outside PreToolUse still require OS-level enforcement (MXC tier) for a kernel-grade floor;
  the `DisproofWitness` is not yet wired through every MCP tool entry point; same-file independence is
  now proven for the identifier-coupling fragment, leaving only positional/non-identifier coupling
  (the cross-file dynamic-import analogue) undecidable.
- **Recognition is not correctness (and is not yet met).** "Unprecedented" is conferred by the
  field, not by code: a public priority record (this document), an independently re-runnable
  artifact, peer review that adjudicates novelty, **independent replication**, and external adoption.
  This work supplies the first two; the last three require the outside world and are **not** claimed.

## 6. Reproduce

See `README.md` (Z3 theorem, refinement link, T3 corpus). Everything in §2–§3 is re-runnable from a
clean checkout with `node` and `z3-solver`.

## 7. Live demonstrations (2026-06-09/10): the disproof artifact as a proposer signal

The escalation dossier identified one mechanism slot no surveyed system occupies: **feeding the
proof artifact (the disproof) back into the proposer** — every instantiated system treats proof as
downstream filtration. Two pre-registered experiments (commit-stamped before any dispatch; full
protocols, ledgers and raw artifacts in-repo) made that slot measurable:

**Experiment 1 — III.f REAL v1.1** (`docs/evidence/darwin-godel-iiif-real-v1.md`,
`.atomic/evolution/iiif-real-v1.1/`): frozen LLM proposers (haiku/opus tiers), synthetic
stepping-stone arena with anti-Goodhart invariants, arms SCALAR (pass/fail+score) × GRADIENT
(wall briefing), 60 fresh proposals, hash-chained run ledgers. Pre-registered verdicts, recorded
without reinterpretation: the geometry-only briefing did **not** reduce wall repetition (P1 died by
its declared death condition); the **stronger** proposer underperformed the weaker in *both* arms
while violating zero invariants (P3 refuted with inversion — perfect gate compliance under goal
misinterpretation); and, exploratorily, the **scalar feedback channel was actively harmful** to the
strong proposer ("PASSED score=-3" read as approval). A concurrent-dispatcher contamination of v1
was detected, structurally fixed (stale-dispatch refusal in the judge, compare-and-swap semantics)
and the clean v1.1 re-run — the experiment about disproof-gradients was itself saved by a disproof.

**Experiment 2 — HumanEval lift v1** (`docs/evidence/darwin-godel-humaneval-v1.md`,
`.atomic/evolution/humaneval-v1/`): full canonical HumanEval (164 tasks, official dataset sha
`1d49078b…`), frozen haiku proposer, engine-side judge executing the Python checks inside the
atomic envelope, four arms — baseline (1 attempt), blind resample, scalar ("FAILED"), and **proof**
(the judge's digest-bound disproof package: invariant id, recomputable counterexample, lesson,
proposal digest, receipt sha). Result: baseline 85.4% → blind 92.1% → scalar 92.7% → **proof 93.9%**
(+8.5pp; paired recovery on the 24 baseline failures: proof 14 > scalar 12 > blind 11), reproducing
Experiment 1's channel ranking on a real benchmark. The final report is **claim-taxonomy-validated**:
`toolAugmentedHumanEvalClaim=true`, `rawHumanEvalClaim=false`, 24/24 feedback packages
digest-verified, forged digests refused — to our knowledge the first full canonical-HumanEval run in
which every piece of model feedback carries a recomputable digest and the headline claim itself is
machine-validated by a gate. Honest limits, pre-declared: retry-arm margins are directional at
n=24 (a replication amendment r2–r5 with a pre-fixed permutation test is registered and running);
the strong-tier bar was not crossed (opus baseline 98.2% saturates this arena — the true sentence is
"the gate's disproof raises the model that uses it", not "it makes a weak model strong").

These are demonstrations of the **mechanism**, not of capability records: they show the (a)-style
disproof object of §1 functioning as a *generation-side* signal — the first measured step from
"reliable self-improvement licenses capability search" toward the proof artifact contributing to it.
