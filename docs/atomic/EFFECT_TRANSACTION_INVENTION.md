# The Effect-Transaction — lifting correct-by-construction from bytes to semantics

> Status: **invention designed + running PoC validated in scratch** (2026-06-01).
> NOT yet landed in atomic. Landing is item 11 of the no-bypass plan and requires the
> host relaunch (atomic live). This doc is the spec + evidence so landing is mechanical.

## Thesis

Universal *writing* became correct-by-construction because it stands on a universal
**syntactic** substrate: **bytes**. "Correct by construction" there never meant "the
content is good" — it meant the *operation* is **total, faithful, confined, reversible,
evidenced** (snapshot→splice→hash→diff→rollback).

Validation stayed fragmented (typecheck/lint per language) because semantics has no
*given* universal substrate. **But it has one that nobody assembled:** the only thing
every computation shares — any language, any runtime — is that it **runs and produces
observable effects** (files, net, processes, db, state).

**Effects are to semantics what bytes are to syntax: the universal substrate.**

The invention is one move: **lift the five correct-by-construction properties from the
byte-splice to the *effect-transaction*.** Validators stop being the foundation and become
**pluggable invariants over the effect-delta**. "Correct by construction" becomes
*"this action's observable effects are confined to its declared envelope and preserve the
invariants that held before"* — differential, observational, **decidable**, and it does
**not** violate Rice (it relocates correctness from absolute-source-property to
confined-observed-effect-property).

## The three-substrate ladder (universality recovers at the top)

1. **bytes/trees** (tree-sitter, ~75 langs): universal, syntactic well-formedness only.
2. **resolved structure** (LSP/type graph, ~30–40 langs): referential + type integrity as
   a *delta* — where the existing `type-soundness-gate` lives. Strong, but only where a
   language-server exists.
3. **observable effects** (sandboxed capture, **all** langs/runtimes): behavioral
   confinement + invariant preservation as a delta over the observed run. Universal again,
   because even an untyped language has effects.

## Two-regime closure (the honest part)

The byte-splice is reversible because bytes are local + overwritable. Effects are **not**
all reversible (you can't un-send a packet / un-commit a remote INSERT). So:

- **local effects** (filesystem, in-repo state) → **fully reversible transaction**.
- **external irreversible effects** (net, remote db, email) → **confine / deny / require
  declared-idempotent-or-compensating**, never "rollback."

Closure = **every effect falls into one of the two regimes; nothing escapes both.** That
"no escape from both regimes" is the real environment-closure.

## PoC — validated, running (scratch, filesystem-effect substrate)

A self-contained engine demonstrated all six load-bearing claims (transcript captured
2026-06-01):

| Case | Claim | Result |
|------|-------|--------|
| A | universal: a **Node** process authored a **Python** edit; one primitive validated it | ADMITTED |
| B | new Python syntax error | REJECTED + **rollback byte-exact** |
| C | differential past Rice: edit a good file while `legacy` stays broken (admit); break a good file (reject) | ADMITTED / REJECTED |
| D | `sk_live_` secret introduced | REJECTED + rollback |
| E | irreversible network charge | DENY (two-regime closure) |
| F | **monotone invariant-mining**: engine mined `no-deletion` from its own history, enforced it, rejected a delete | mined + REJECTED |

**What the PoC proves:** the primitive is real, buildable, language-agnostic-by-effect, and
the mining loop autonomously grows coverage with no human-written validator.
**What it does NOT prove (honest):** complete OS-level effect capture (PoC captures
filesystem effects only; net/proc/db were policy-simulated), production hardening, landing
in atomic, and measured-0 bypass in real use. A /tmp PoC is necessary, not sufficient.

## Landing spec (item 11 — after the 9 no-bypass fixes, through atomic)

1. **Promote `proveEffect`** from "byte-diff of repo files" to a **complete, tamper-evident
   effect capture**: filesystem (already), plus net/proc/db/clock/env via the broker
   sandbox + interposition. The audit's rank-9 (SKIP_DIRS blind spot, ledger truncation) is
   exactly the first capture-completeness bug to close — capture honesty is the whole game.
2. **Refactor the gates into invariants over the effect-delta.** Today gates run on bytes;
   re-found them as `inv(workspace, effectDelta, preState) -> violation|null`. typecheck/
   lint/secret/contract become *entries in a registry*, not the foundation. The
   effect-transaction (`admit`) becomes the single foundational primitive every atomic
   mutation (write **and** `atomic_exec`) flows through — which also closes audit rank-3
   (atomic_exec writes bypassing WRITE_GATES) for free.
3. **Differential everywhere:** every invariant judges `delta(pre,post)`, never absolute
   correctness — the Rice-honest move, already how `type-soundness-gate` behaves.
4. **Two-regime enforcement:** local effects → transactional rollback; external → deny-or-
   declared-compensable. Wire to the existing `EXTERNAL_OR_HOST_EFFECT` classifier.
5. **Monotone invariant-mining loop:** after N admitted txs, mine properties that held
   across all of them, propose, and (under capability-monotonicity / proof #5) register them
   so coverage ratchets up autonomously and **never** down. This is the part closest to a
   genuinely surprising result: a correctness substrate that strengthens itself from
   observed reality, forever, without human-authored validators.
6. **Cert truthfully measures it:** add a `effectTransactionCoverage` domain (RED until every
   mutation path flows through `admit` with complete capture) + the `claudeHostWiring` /
   `interpreterRoutingCompleteness` domains from rank-2. The cert goes GREEN only when the
   live path is provably closed — no green-by-absence.

## Honest verdict on "revolutionary"

- **Synthesis-novel + regime-strong, not element-new.** Components have prior art (effect
  systems, runtime verification, record-replay, capability security, invariant mining /
  Daikon). The unification — *one forced primitive, universal effect substrate, pluggable
  monotone-mined invariants, two-regime closure, on an autonomous agent* — is what's not
  assembled elsewhere.
- **Does not break Rice.** It is "360° over the observed behavior horizon" (growable, never
  the whole space), not the metaphysical absolute.
- **The verdict is empirical, post-landing:** decided by capture-completeness +
  measured-0 bypass in real use, not by declaration.
