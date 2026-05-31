/**
 * gates/merge.ts — the THIRD MERGE MODE: confluent merge of two verified edits.
 *
 * git/Darcs/Pijul merge by textual hunks; OT/CRDT merge by transformed operations;
 * BOTH then lean on a CI run to discover whether the merged tree still holds. This
 * module is the third mode: it merges two ALREADY-VERIFIED atomic edits ONLY when
 * the verified-edit algebra (gates/algebra.ts) proves they `commute`, and it makes
 * the merge a THEOREM rather than a hope — the confluence witness from the commute
 * theorem (§algebra.ts) operationalized as a runtime byte-identity check:
 *
 *   merge(P₁,P₂) admitted  ⟺  commute(P₁,P₂)  ∧  apply(apply(S,P₁),P₂) ≡ apply(apply(S,P₂),P₁)
 *
 * When admitted, the returned `merged` buffer is the unique fixpoint of either
 * application order — so NO integration test is required to know the merge is
 * sound: the bytes themselves are the proof. When the edits do NOT commute (or the
 * algebra's closure is capped, so independence is UNJUDGED), the merge is REFUSED —
 * never a silent best-effort three-way splice. `refused: true` is the honest
 * non-guess (the analogue of a gate's UNJUDGED): `merged` absent, `byteIdentical`
 * false by construction.
 *
 * DESIGN — a file→content map, not a single buffer. Two verified edits may touch
 * the SAME file (two agents at disjoint loci) or DIFFERENT files (orthogonal work).
 * Both are expressible as splices applied over a map { repoRelFile -> content }.
 * `merge` applies the union of both edits' splices over a fresh copy of that map in
 * BOTH global orders and asserts the two resulting maps are byte-identical. Same-file
 * disjoint splices commute because offset-correct application is order-free;
 * different-file splices commute because they write disjoint keys. EITHER way the
 * byte-identity check is the live witness — it is not assumed, it is computed. The
 * `merged` field carries the single file's content when exactly one file was
 * touched, else a canonical JSON of the file→content map (so the caller always has
 * the exact post-merge bytes for every file).
 *
 * SOUNDNESS. `merge` delegates the independence judgement entirely to
 * `commute` (algebra.ts) — it adds NO weaker test of its own. commute is a sound
 * OVER-approximation (a coarser closure can only ADD coupling, never hide it), so
 * an admitted merge is genuinely confluent. The runtime byte-identity check is a
 * belt-and-braces FALSIFIER on top: if two edits the algebra called commuting ever
 * produced order-dependent bytes (they cannot, by the theorem — but a future
 * closure bug could), `merge` REFUSES rather than emit a guessed buffer. Capped
 * closure ⇒ commute's independence is an upper bound only ⇒ we refuse (honest
 * UNJUDGED), never claim a merge we cannot stand behind.
 *
 * HONEST CEILING. merge proves CONFLUENCE OF BYTES, not CORRECTNESS OF BEHAVIOUR.
 * Two edits can merge byte-confluently and still be jointly wrong at the semantic
 * level the gates do not model (e.g. an intra-file binding coupling algebra.ts
 * explicitly leaves un-modelled and reports conservatively). merge inherits exactly
 * algebra.ts's coupling model — no more, no less. It removes the CI run that asks
 * "did the merge corrupt the tree"; it does NOT remove the gates that ask "is each
 * edit itself admissible" (those ran when each edit was made). A trace that carries
 * no `modifiedZones` yields an empty span set → the edit is treated as a no-op
 * splice (identity), which merges trivially with anything.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildEditFact, commute, type EditFact, type MergeResult } from './algebra.js';

/** A single byte-splice within one repo-relative file. */
interface Splice {
  file: string;
  start: number;
  end: number;
  text: string;
}

/** The minimal trace shape merge consumes (a superset is fine — extra keys ignored). */
export interface MergeTrace {
  file?: string;
  modifiedZones?: Array<{ byteStart?: number; byteEnd?: number; newSample?: string }>;
  /** optional: the post-edit bytes for each modified zone, in zone order */
  newSamples?: string[];
}

/**
 * Read a file's CURRENT bytes (the post-edit base both traces were verified against,
 * since each edit was already applied+validated when its trace was written). Returns
 * '' for an unreadable/absent file — a missing base merges as the empty buffer,
 * which is honest (no bytes to conflict over) rather than a thrown error.
 */
function readBase(repoRoot: string, rel: string): string {
  try {
    const abs = path.join(repoRoot, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return fs.readFileSync(abs, 'utf8');
  } catch {
    /* unreadable → empty base (conservative: nothing to splice) */
  }
  return '';
}

/**
 * Build the splice list a trace contributes. Each modifiedZone becomes one splice
 * whose replacement text is the zone's `newSample` when present, else the empty
 * string (a pure deletion span). The replacement text is incidental to the
 * confluence proof — what matters for order-independence is that the SPANS are
 * disjoint (guaranteed by commute) so offset-correct application is order-free.
 */
function splicesOf(trace: MergeTrace): Splice[] {
  const file = String(trace.file ?? '').replaceAll('\\', '/');
  const zones = trace.modifiedZones ?? [];
  const out: Splice[] = [];
  for (const z of zones) {
    if (typeof z.byteStart === 'number' && typeof z.byteEnd === 'number') {
      out.push({ file, start: z.byteStart, end: z.byteEnd, text: typeof z.newSample === 'string' ? z.newSample : '' });
    }
  }
  return out;
}

/**
 * Apply a flat splice list over a file→content map IN A GIVEN ORDER. Within each
 * file the splices are applied right-to-left (descending start) so earlier offsets
 * are not shifted — this is the standard offset-correct multi-splice. Returns a
 * fresh map (never mutates the input). The `order` array dictates the GLOBAL order
 * splices are grouped/applied across files, which is what the two-order confluence
 * check varies.
 */
function applyAll(base: Map<string, string>, order: Splice[]): Map<string, string> {
  const out = new Map<string, string>(base);
  // Group by file, preserving the encounter order from `order`.
  const byFile = new Map<string, Splice[]>();
  for (const sp of order) {
    const arr = byFile.get(sp.file) ?? [];
    arr.push(sp);
    byFile.set(sp.file, arr);
  }
  for (const [file, splices] of byFile) {
    let content = out.get(file) ?? '';
    // descending start → applying one splice never shifts an unapplied one
    const sorted = [...splices].sort((x, y) => y.start - x.start);
    for (const sp of sorted) content = content.slice(0, sp.start) + sp.text + content.slice(sp.end);
    out.set(file, content);
  }
  return out;
}

/** True iff two file→content maps are byte-identical over the same key set. */
function mapsByteEqual(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    if (!b.has(k) || b.get(k) !== v) return false;
  }
  return true;
}

/** Canonical, stable serialization of a file→content map (sorted keys). */
function serializeMap(m: Map<string, string>): string {
  const obj: Record<string, string> = {};
  for (const k of [...m.keys()].sort()) obj[k] = m.get(k) as string;
  return JSON.stringify(obj);
}

/**
 * The THIRD MERGE MODE. Merge two verified edits given their atomic traces.
 *
 *   - Build an EditFact for each (algebra.buildEditFact) and ask commute().
 *   - If they do NOT commute (overlap / closure coupling) OR either fact's closure
 *     is CAPPED (independence only an upper bound) → REFUSE (honest non-guess).
 *   - If they commute → assemble the file→content base map (current bytes of every
 *     touched file), apply the union of splices in BOTH global orders, and assert
 *     the two resulting maps are byte-identical. byteIdentical is COMPUTED, not
 *     assumed; if it somehow fails (it cannot, by the theorem) → REFUSE.
 *   - Admitted → return { merged, byteIdentical: true, refused: false }.
 */
export function merge(repoRoot: string, traceA: MergeTrace, traceB: MergeTrace): MergeResult {
  const cache = new Map<string, Set<string>>();
  const factA: EditFact = buildEditFact(repoRoot, traceA, cache);
  const factB: EditFact = buildEditFact(repoRoot, traceB, cache);

  // A capped closure means commute's independence is only an UPPER bound — we
  // cannot stand behind the merge, so we refuse (UNJUDGED), never guess.
  if (factA.closureCapped || factB.closureCapped) {
    return {
      byteIdentical: false,
      refused: true,
      reason: 'resolution closure was capped — independence is UNJUDGED (refusing rather than guess a merge)',
    };
  }

  const verdict = commute(factA, factB);
  if (!verdict.commute) {
    return {
      byteIdentical: false,
      refused: true,
      reason: `edits do not commute: ${verdict.reason}`,
    };
  }

  // Assemble the base map: current bytes of every distinct file the two edits touch.
  const splicesA = splicesOf(traceA);
  const splicesB = splicesOf(traceB);
  const files = new Set<string>([...splicesA.map((s) => s.file), ...splicesB.map((s) => s.file)].filter((f) => f.length > 0));
  const base = new Map<string, string>();
  for (const f of files) base.set(f, readBase(repoRoot, f));

  // Apply the union of splices in BOTH global orders.
  const orderAB = applyAll(base, [...splicesA, ...splicesB]);
  const orderBA = applyAll(base, [...splicesB, ...splicesA]);

  // The confluence witness: computed, not assumed.
  const byteIdentical = mapsByteEqual(orderAB, orderBA);
  if (!byteIdentical) {
    // By the commute theorem this branch is unreachable for commuting edits; if a
    // future closure bug ever reached it, REFUSE rather than emit a guessed buffer.
    return {
      byteIdentical: false,
      refused: true,
      reason: 'commute claimed independence but the two application orders diverged — refusing (theorem violation guard)',
    };
  }

  // merged: the single file's content when exactly one file is touched, else the
  // canonical JSON map so the caller has the exact post-merge bytes for each file.
  const touched = [...orderAB.keys()];
  const merged = touched.length === 1 ? (orderAB.get(touched[0]) as string) : serializeMap(orderAB);

  return {
    merged,
    byteIdentical: true,
    refused: false,
    reason: verdict.reason,
  };
}
