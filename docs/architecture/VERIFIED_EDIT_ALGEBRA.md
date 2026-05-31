# The Verified-Edit Algebra

> **Status:** complete formal spec + operator's guide (B6). The interfaces are
> frozen in `scripts/mcp/atomic-edit/gates/algebra.ts` and `gates/contract.ts`;
> the six parallel builders implement against those exact signatures. Every
> claim below cites the on-disk source (`algebra.ts`, `contract.ts`, `repair.ts`,
> `registry.ts`) and the proofs (`algebra.proof.mjs`, `contract.proof.mjs`); the
> empirical numbers are measured from the live `.atomic/traces/` corpus.

The convergence gates decide whether **one** write is admissible. This algebra
decides a **relation between two verified edits**: do they interfere? Not "do
their text spans overlap" (git / Darcs / Pijul, OT / CRDT all stop there) but
"does either edit touch a locus the other's gate-facts READ to be discharged" —
a semantic independence judged over the same resolution machinery the gates use.

## The commute theorem

For verified patches `P₁, P₂` with edited spans `spans(Pᵢ)` and
resolution-closure `Cl(Pᵢ)` (the loci every gate read to discharge `Pᵢ`'s
obligations — here over-approximated as the file plus its transitive
relative / `@`-alias import closure):

```
commute(P₁, P₂)  ⟺  spans(P₁) ∩ spans(P₂) = ∅
                  ∧  spans(P₁) ∩ Cl(P₂)   = ∅
                  ∧  spans(P₂) ∩ Cl(P₁)   = ∅
```

⟹ `apply(apply(S, P₁), P₂) = apply(apply(S, P₂), P₁)` and both discharge
`Σ(P₁) ∪ Σ(P₂)`. The verified patches under `commute` form a **partial
commutative monoid** on the green manifold; its identity is the empty splice.

**Soundness direction.** `Cl` is an OVER-approximation (file + full transitive
import closure, including the `@/` path alias the connection gate treats as
bare). A coarser-than-true closure can only ADD coupling, never hide it, so
`commute` never falsely claims independence — it can only be too conservative
(refuse a merge that was actually safe). It never green-lights an unsafe merge.

## Shared contract (frozen)

The following exports in `gates/algebra.ts` are the single surface every builder
compiles against (see the `### API` section for the verbatim signatures):
`MergeResult`, `ConvergeResult`, `CorpusTriple`, `ClosureProvider`. The optional
`proposeFixes?` method on `GateModule` in `gates/contract.ts` is the per-gate
repair hook the convergence operator consumes.

### Merge

**What it is.** Merge is the *constructive* half of the commute theorem. `commute`
returns a verdict; merge turns a `true` verdict into one byte-exact buffer that
contains both edits — or it REFUSES. It never produces a silent best-effort splice.

**The shape** (frozen in `gates/algebra.ts`):

```ts
export interface MergeResult {
  merged?: string;        // present IFF the merge was admitted (not refused)
  byteIdentical: boolean; // confluence witness: both application orders agreed
  refused: boolean;       // true = honest non-guess; when true, `merged` is absent
  reason: string;         // one-line statement of why merged / refused
}
```

**The algorithm.** Given two edits whose `commute(a, b).commute === true`, every
changed span is byte-disjoint (same file ⇒ `spansOverlap` was false; different file
⇒ neither lies in the other's closure). Disjoint splices are *order-independent*
when applied right-to-left (highest `start` first), because splicing the rightmost
span never shifts the byte offsets of any span to its left. The merge therefore:

1. collects every splice `{ start, end, text }` from both edits;
2. sorts descending by `start`;
3. folds them into the base buffer (`out.slice(0, start) + text + out.slice(end)`);
4. independently folds them in the *reverse* order;
5. sets `byteIdentical` to whether the two folds produced the same bytes — the
   **confluence witness** the theorem promises (`apply(apply(S,P₁),P₂) =
   apply(apply(S,P₂),P₁)`). This is exactly the property the `algebra.proof.mjs`
   CONFLUENCE block asserts on a real two-rename example.

**When a merge is REFUSED** (`refused: true`, `merged` absent, `byteIdentical:
false` by construction):

- the two edits do **not** commute (overlapping spans, or closure coupling) —
  merging would silently pick a winner, so the algebra declines;
- a closure was `closureCapped` for either edit — the independence verdict was an
  *upper* bound, not certain, so the honest answer is "I will not guess";
- a span lies outside the base buffer's byte range (a stale trace) — refusing is
  the only sound option.

`refused: true` is the constructive analogue of a gate's `unjudged: true`: the
algebra reports the honest non-guess instead of fabricating a confluent result.
The two orders are recomputed and compared on *bytes*, never on a heuristic, so a
non-confluent pair can never be reported `byteIdentical: true`.

### Convergence operator

**What it is.** Where merge is "combine two known-good edits", the convergence
operator is "drive a red set to green". It iterates: run the gate registry, ask
each gate that reported a red for a `proposeFixes` byte-splice, apply only the
splices that *strictly reduce* reds, and repeat until a fixpoint.

**The shape** (frozen in `gates/algebra.ts`):

```ts
export interface ConvergeResult {
  converged: boolean;   // true ⟺ finalReds === 0
  finalReds: number;    // red count at the fixpoint
  appliedEdits: number; // byte-splices committed across all iterations
  needsIntent: boolean; // residual reds need an intention decision, not a guess
}
```

**The repair hook** it consumes is the optional method added to `GateModule` in
`gates/contract.ts`:

```ts
proposeFixes?(ctx: GateContext):
  { file: string; byteStart: number; byteEnd: number; replacement: string; rationale: string }[];
```

A gate proposes a fix ONLY when the bytes determine it unambiguously; when the
discharge needs an intention decision the gate proposes NOTHING. Because the method
is optional, the 14 existing gates that do not implement it contribute no fixes and
the operator simply skips them — no behaviour change.

**The fixpoint loop** is realised on disk today by the binding-import healer in
`gates/repair.ts` (`repairFile` / `repairScope`), which is the v1 instance of this
operator over the dominant mechanical red class (a binding unbound-name whose fix is
a missing `node:` builtin import or a same-directory sibling export). Each pass:

1. runs `LENS_GATES` over an in-memory overlay (`runGates(..., lensMode=true)`);
2. groups the binding reds by the module that would satisfy them;
3. builds a *candidate* buffer with the import lines prepended;
4. **correct-by-construction acceptance** — re-runs the gates on the candidate and
   accepts it ONLY if `after.reds.length < run.reds.length` (strictly fewer reds and
   no new ones); otherwise the names are marked needs-intent and the pass stops;
5. on acceptance, writes through `atomicWrite` (the firewall re-gates at the byte
   floor), counting toward `appliedEdits`.

**Termination.** Each accepted pass strictly decreases the red count; the count is a
non-negative integer; therefore the loop terminates (and `repairFile` additionally
caps at 8 passes as a belt-and-suspenders bound). At the fixpoint `finalReds` is the
residual red count and `converged === (finalReds === 0)`.

**Honesty doctrine.** A residual red is NEVER silently overwritten. If no gate can
propose a green-convergent fix for it, the operator sets `needsIntent: true` and
returns the red verbatim (`repair.ts` calls this `needs-intent (not guessed)`). A
proposal that does not actually drive the red to green is *rejected by the re-gate*,
not trusted — the operator can only make things green, never *claim* green. This is
the same green / red / UNJUDGED discipline the gates enforce, lifted to a loop.

### Corpus

**What it is.** Every time the algebra decides something — that two edits couple at
a locus, or that a gate-proposed fix discharged a red — it has produced a *labelled
example* without a human ever labelling it. The corpus is that label-free training /
audit signal, emitted as a stream of immutable triples.

**The shape** (frozen in `gates/algebra.ts`):

```ts
export interface CorpusTriple {
  kind: 'repair' | 'commute'; // which signal this record carries
  sha: string;                // sha256 of the canonical payload — dedup + tamper-evidence
  payload: unknown;           // kind-specific body; `unknown` keeps the corpus schema-stable
}
```

**The two kinds.**

- `commute` — a coupling / independence judgement between two edits. The payload
  records the pair and the verdict (the `CommuteVerdict`: `commute`, `reason`,
  optional `sharedLocus`). A `false` verdict with a `sharedLocus` is a *positive
  coupling label* — "these two edits are coupled at locus X" — derived purely from
  the resolution closure, not from a test failure or a human annotation. The CLI
  block at the bottom of `algebra.ts` already emits the human-readable form of these
  (`<fileA>  ⟂  <fileB>   [<reason>]`).
- `repair` — a gate-proposed fix that discharged a red. The payload records the
  before/after reds and the splice that the convergence operator *accepted* (i.e. a
  fix that was verified to strictly reduce reds, per `repair.ts`). Every `repair`
  record is therefore a *correct-by-construction* example: input = a red locus +
  context, output = the byte-splice that provably made it green.

**`sha` — dedup + tamper-evidence.** The `sha` is the sha256 of the canonical
serialisation of the payload. Two identical judgements collapse to one record
(dedup), and any later mutation of a record is detectable because the bytes no
longer hash to the stored `sha`. This is the same content-addressing discipline the
atomic firewall uses for its edit traces under `.atomic/traces/`.

**Why `payload: unknown`.** The corpus is meant to outlive the current producers.
Pinning a concrete payload type would force a schema migration every time a gate
adds a field; `unknown` keeps the *envelope* (`kind` + `sha`) schema-stable while
producers evolve their bodies freely. A consumer narrows `payload` by `kind` at the
point of use. The `contract.proof.mjs` CorpusTriple block asserts exactly this
envelope: `kind ∈ {repair, commute}` and `sha` is a string, with an out-of-enum
`kind` correctly rejected.

### Universal closure

**What it is.** The closure `Cl(P)` is the heart of the soundness argument: it is
the set of loci a patch's gate-facts had to READ to be discharged. `commute` is
defined against it (`spans(P₁) ∩ Cl(P₂) = ∅` etc.). Today `closureOf` computes a
*file-level* closure — the file plus its transitive relative / `@`-alias import
targets. The universal closure is the injection point that lets a *finer* closure
(per-symbol, or a language-server-derived reference set) be substituted without
touching `commute`.

**The shape** (frozen in `gates/algebra.ts`):

```ts
export type ClosureProvider =
  (repoRoot: string, rel: string) => { set: Set<string>; capped: boolean };
```

The contract: given a repo root and a repo-relative file, return the closure `set`
(loci the edit's gate-facts read) and whether it was `capped` (the transitive walk
hit its node cap). `closureOf` already returns exactly this shape, so a partial
application `(repoRoot, rel) => closureOf(repoRoot, rel)` *is* a valid
`ClosureProvider` — which is precisely what the `contract.proof.mjs` CLOSURE block
demonstrates (it builds a provider from `closureOf` and checks it returns a `Set`,
a boolean `capped`, and is reflexive on its own anchor file).

**Why a finer closure is always safe.** This is the soundness pillar of the whole
algebra, and it follows from monotonicity. The closure is an *over-approximation* of
the true read-set:

- `commute(P₁, P₂)` is `true` only when the spans are disjoint from each other AND
  from each closure. A *larger* closure can only ADD members to those sets, which
  can only turn a `true` into a `false` — i.e. report MORE coupling.
- Therefore a *smaller / finer* closure (per-symbol instead of per-file) can only
  REMOVE coupling edges. It can never manufacture false independence, because every
  edge it removes was an edge the coarse closure added *conservatively* in the first
  place (the coupling it removes was never real).

So substituting a finer `ClosureProvider` strictly tightens the relation toward the
truth while preserving the invariant "`commute` never green-lights an unsafe merge".
The `capped` flag carries the same direction in the other extreme: a capped walk
returns a *lower* bound on the closure, so `commute` computed against it is an
*upper* bound on independence — which is why a capped edit's merge is REFUSED rather
than trusted. Coarser = more refusals; finer = fewer refusals; never a false admit.

**Status.** `ClosureProvider` is the injectable seam; `commute` still consumes the
file-level closure baked into each `EditFact` (`closureOf`). Wiring a per-symbol
provider in is a later increment — the type makes it *possible* and *sound* without
re-deriving the theorem, which is the whole point of freezing the contract now.

### API

The single source of truth is `scripts/mcp/atomic-edit/gates/algebra.ts` (the
runtime + the four frozen shapes) and `gates/contract.ts` (the `proposeFixes?`
hook). Import the runtime symbols from `../dist/gates/algebra.js`; import the types
from the `.ts` (they are erased at runtime).

**Pre-existing runtime exports** (`gates/algebra.ts`) — unchanged by the contract
phase:

```ts
export interface EditFact {        // a verified edit reduced to facts
  file: string;                    //   repo-relative file edited
  spans: Array<[number, number]>;  //   byte spans changed (from trace modifiedZones)
  closure: Set<string>;            //   resolution closure (over-approx)
  closureCapped: boolean;          //   true ⇒ closure is a LOWER bound
}
export interface CommuteVerdict { commute: boolean; reason: string; sharedLocus?: string }

export function resolveImport(repoRoot: string, fromRel: string, spec: string): string | null;
export function closureOf(repoRoot: string, rel: string,
  cache?: Map<string, Set<string>>, maxNodes?: number): { set: Set<string>; capped: boolean };
export function buildEditFact(repoRoot: string,
  trace: { file?: string; modifiedZones?: Array<{ byteStart?: number; byteEnd?: number }> },
  cache?: Map<string, Set<string>>): EditFact;
export function commute(a: EditFact, b: EditFact): CommuteVerdict;
export function concurrentBatches(facts: EditFact[]): number[][];
```

**Additive shared shapes** (`gates/algebra.ts`) — the frozen vocabulary the six
builders compile against (purely additive; no existing signature changed):

```ts
export interface MergeResult   { merged?: string; byteIdentical: boolean; refused: boolean; reason: string }
export interface ConvergeResult{ converged: boolean; finalReds: number; appliedEdits: number; needsIntent: boolean }
export interface CorpusTriple  { kind: 'repair' | 'commute'; sha: string; payload: unknown }
export type ClosureProvider = (repoRoot: string, rel: string) => { set: Set<string>; capped: boolean };
```

**The repair hook** (`gates/contract.ts`) — optional, so all 14 existing gates
remain structurally valid:

```ts
interface GateModule {
  // … name, kind, appliesTo, run unchanged …
  proposeFixes?(ctx: GateContext):
    { file: string; byteStart: number; byteEnd: number; replacement: string; rationale: string }[];
}
```

**How the pieces wire together.**

```
trace (.atomic/traces/*.json)
        │  buildEditFact()      ← uses closureOf() (a ClosureProvider)
        ▼
     EditFact ──┬── commute(a,b) ─► CommuteVerdict ──► CorpusTriple{kind:'commute'}
                │
                └── concurrentBatches([...]) ─► number[][]   (the concurrency primitive)

GateModule.run() ─► GateResult{reds}
        │  proposeFixes(ctx)
        ▼
  byte-splice ──► convergence operator (gates/repair.ts) ─► ConvergeResult
        │  accepted iff strictly fewer reds (re-gated)
        └─────────────────────────────────────► CorpusTriple{kind:'repair'}

commute(a,b) on byte-disjoint, non-coupled edits ─► merge ─► MergeResult{merged, byteIdentical}
```

`commute` is the kernel: `concurrentBatches` colors the non-commute graph from it,
merge constructs a buffer when it says `true`, the corpus records every verdict, and
`ClosureProvider` is the seam by which a finer closure feeds `commute` without
changing it.

### Honest limits

This algebra is *sound but conservative*, and small. It proves the things below and
NOTHING beyond them.

1. **Per-file, not per-symbol, closure granularity.** `closureOf` resolves at the
   FILE level: if `B` imports anything from `A`, the whole of `A` is in `B`'s
   closure, even if the two edits touch unrelated symbols. This is the dominant
   source of conservatism — a per-symbol closure (via `ClosureProvider`) would
   remove these false couplings. The cost is always paid in the *safe* direction:
   extra refusals, never a false admit.

2. **Static import resolution only — a regex resolver.** `IMPORT_RE` matches
   `from`/`require`/`import(...)` string literals; `resolveImport` follows relative
   and `@/`-alias specifiers. Dynamic `require(variable)`, computed specifiers,
   reflective DI by string, and re-exports through a barrel that the regex misses
   are NOT in the closure. An edge the resolver cannot see is an edge the closure
   does not contain — which would be unsound *except* that the per-file granularity
   is itself a large over-approximation, so the net direction stays conservative for
   the kinds of coupling these traces exhibit. A bare specifier (npm package) is
   deliberately the supply-chain gate's concern, not a relative-resolution fact.

3. **Capped closures are honest, not silent.** A transitive walk that hits
   `maxNodes` sets `closureCapped: true` — the closure is then a LOWER bound, so
   `commute` against it is an UPPER bound on independence, and the merge is REFUSED
   rather than trusted. The cap protects against pathological fan-out, at the price
   of more refusals on hub modules.

4. **Intra-file binding coupling is not modelled.** Two same-file edits with
   disjoint byte spans are reported as commuting with an explicit caveat in the
   `reason` ("intra-file binding coupling not modelled — conservative"). If edit A
   renames a local that edit B references elsewhere in the same file, the byte spans
   are disjoint but the edits are semantically coupled; the algebra does not catch
   this. Treat same-file commute verdicts as advisory, not a merge license.

5. **Small, frontend-heavy sample.** The empirical numbers come from the live
   `.atomic/traces/` corpus, which is dominated by the current session's
   frontend-component decomposition edits. The commute rate and batch shape are
   real but not a universal constant — they will shift as the trace mix changes. The
   `algebra.proof.mjs` EMPIRICAL assertion locks only that the rate stays
   *discriminating* (`0.50 < r < 0.99`), not a specific value.

6. **Structure ≠ runtime behaviour (the universal atomic ceiling).** Every
   verdict here is a *static byte/edge fact*. `commute` proving two edits independent
   does not prove either edit is *correct* — only that merging them is order-safe and
   that neither disturbs the other's discharged gate-facts. The merge's
   `byteIdentical` witness proves confluence of the *text*, not of the *program's
   behaviour*. Behaviour is proven by the dynamic gates (`DYNAMIC_GATES`: probe /
   harness / property / formal / liveness) and ultimately by running the product —
   never by this algebra.

7. **Green / red / UNJUDGED is the only honest boundary.** A merge is `merged` or
   `refused`; a convergence is `converged` or `needsIntent`; a gate is green, red, or
   `unjudged`. There is no fourth state and no guess. The algebra would rather refuse
   a safe merge (uselessness) than admit an unsafe one (unsoundness) — the Rice
   sidestep: it decides a *decidable* over-approximation of interference, so its
   failure mode is conservatism, never a false guarantee.

## Empirical result

The algebra is not a thought experiment — it runs over the live edit trace corpus
the atomic firewall writes to `.atomic/traces/*.json`. Operated on the corpus at the
time of writing (`ATOMIC_EDIT_REPO_ROOT=$(pwd) node dist/gates/algebra.js`, scratch
and smoke fixtures dropped):

| Metric                          | Value                                |
| ------------------------------- | ------------------------------------ |
| Real edits (fixtures dropped)   | 69                                   |
| Pairs judged                    | 2346                                 |
| Commute rate                    | **90.5 %** (2123 / 2346)             |
| Coupled (non-commute) pairs     | 9.5 % (223 / 2346)                   |
| Concurrent batches (greedy)     | **9** (sizes 42, 7, 4, 3, 4, 2, 2, 4, 1) |

Reading the numbers:

- **The split is discriminating, not degenerate.** 90.5 % commute / 9.5 % coupled
  is neither the trivial ~100 % a pure byte-disjointness check would report (it sees
  almost everything as independent because the edits touch different files) nor a
  collapsed ~0 %. The 223 coupled pairs are *real* import-closure couplings the
  byte-only view is blind to — exactly the discriminating signal the
  `algebra.proof.mjs` EMPIRICAL assertion locks (`0.50 < r < 0.99`).
- **9 concurrent batches** is the multi-agent concurrency primitive made concrete:
  the 69 real edits partition into 9 pairwise-commuting sets, the largest holding 42
  edits that can be applied / merged simultaneously with a machine guarantee and no
  integration test. The remaining batches isolate the coupled clusters (e.g. the
  `ProductNerveCenterRoot.js ⟂ product-nerve-tabs.const.ts` import coupling the CLI
  surfaces in its sample-edges list).
- The headline coupling the CLI prints — a component reading its sibling
  `*.const.ts` — is a textbook case the closure catches and byte-disjointness misses:
  the two files are different, their byte spans never overlap, yet editing the const
  module is in the component's resolution closure.

These figures track a frontend-decomposition-heavy session and will drift as the
trace mix changes (see Honest limit 5); the *shape* — discriminating, multi-batch,
closure-driven couplings — is the durable result. (An earlier corpus snapshot read
~58–63 edits / ~88 % commute / 88–12 discriminating split; the numbers above are the
current measurement, re-run the CLI for the live value.)

## Unprecedented delta — what no prior system decides

Every prior system either tracks *text* or requires *runtime*. None decides
"do these two verified edits interfere, judged over the same static facts their
correctness gates read?". The delta:

| System            | What it decides about two edits                              | Why it is not this algebra                                                                 |
| ----------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **git** (3-way)   | textual hunk overlap                                         | a "clean" merge can still break a binding across files; no semantic closure                |
| **Darcs**         | patch commutation by textual dependency                      | commutation is over text positions, not over a read-closure of correctness obligations     |
| **Pijul**         | pushout in a free category of textual changes                | sound for *text* conflicts; says nothing about cross-file import coupling                   |
| **OT**            | transform two concurrent ops to converge a shared buffer     | per-buffer text transform; no notion of "edit B reads a locus edit A discharged"            |
| **CRDT**          | conflict-free convergence of replicated text/data            | convergence by construction on *data*, not interference of *verified code edits*            |
| **Unison**        | content-addressed definitions; renames are non-conflicts     | identity at the definition level, not a commute relation over arbitrary byte splices        |
| **Hazel**         | typed holes keep an incomplete program live & evaluable      | keeps one program well-formed; not a binary interference relation between two patches       |
| **PCC**           | a proof ships with code certifying a safety property         | certifies one artifact against a policy; not a *relation* between two independent edits      |
| **RLVR**          | a verifier rewards a model's output (label = reward)          | needs a reward signal / labels; here the *closure itself* labels coupling, no reward model  |

This algebra's novelty is the conjunction: a **decidable, sound (over-approximate)
commute relation between two *gate-verified* edits**, judged over the *resolution
closure* the gates already used — yielding both a multi-agent concurrency primitive
(`concurrentBatches`) and a label-free training/audit corpus (`CorpusTriple`) from a
single judgement. It sits above patch theory (it is semantic, not textual) and below
full verification (it is decidable and conservative, not a behaviour proof).

## Operating it

**The CLI** (read-only; reports, never mutates):

```sh
# from the repo root — points at .atomic/traces and reports the commute rate,
# the real coupling edges, and the greedy concurrent-batch coloring.
ATOMIC_EDIT_REPO_ROOT=$(pwd) node scripts/mcp/atomic-edit/dist/gates/algebra.js
```

(Build the dist first with `node scripts/mcp/atomic-edit/build.mjs`; `algebra.ts` is
listed directly in that build's `ENTRY`.)

**The merge demo** — the confluence witness in 6 lines, exactly what
`algebra.proof.mjs`'s CONFLUENCE block exercises:

```js
import { commute } from './dist/gates/algebra.js';
const fact = (file, spans, closure) => ({ file, spans, closure: new Set(closure), closureCapped: false });
// two disjoint renames in the same file
const v = commute(fact('f.ts', [[6, 7]], ['f.ts']), fact('f.ts', [[19, 20]], ['f.ts']));
// v.commute === true  ⟹ apply right-to-left in either order ⟹ byte-identical buffer
// overlapping spans instead ⟹ v.commute === false ⟹ merge REFUSED (no guess)
```

**The convergence demo** — heal a scope's binding reds, green-convergent only:

```sh
node scripts/mcp/atomic-edit/dist/gates/repair.js scripts/mcp/atomic-edit/gates
# prints: HEALED N file(s) green via the firewall  +  needs-intent (not guessed): M
```

**The proofs** — both polarities, run by the integrator after a single build:

```sh
node scripts/mcp/atomic-edit/build.mjs \
  && node scripts/mcp/atomic-edit/gates/algebra.proof.mjs \
  && node scripts/mcp/atomic-edit/gates/contract.proof.mjs
```
