/**
 * gates/corpus.ts — THE OUTWARD AXIS of the verified-edit algebra.
 *
 * The gates decide whether ONE write is admissible (inward). The algebra decides
 * whether TWO verified edits interfere (lateral). This file does the THIRD thing:
 * it EMITS — every repair the convergence operator made, and every commute verdict
 * the algebra rendered, is appended as one sha-anchored, locus-precise JSONL line
 * to `<repoRoot>/.atomic/corpus/triples.jsonl`. That file is a HUMAN-LABEL-FREE
 * training/audit corpus.
 *
 * WHY THE REWARD IS NOT A LABEL. A repair triple's reward is `redBefore - redAfter`
 * — the registry's OWN red-count delta (gates/registry.ts → runGates → reds.length).
 * It is:
 *   - DETERMINISTIC: the gates are pure byte/edge facts over the same makeContext;
 *     the same bytes always yield the same red set, so the same splice always yields
 *     the same delta. No model, no human, no RNG sits in the reward path.
 *   - REPLAYABLE: the payload records the exact splice (file + byte span + before/
 *     after text) and the two red counts, so any consumer can re-derive the reward
 *     by re-running the registry on the reconstructed bytes and assert it matches.
 *   - HONEST: a repair that did NOT drive a red to green has reward ≤ 0 and
 *     `gateWentGreen: false`; the corpus records the failure exactly, never a
 *     guessed/optimistic label. (Mirrors the project's green/red/UNJUDGED doctrine:
 *     the corpus reports what the gates observed, never what a model assumed.)
 *
 * A commute triple has NO reward — it is a pure independence/coupling JUDGEMENT
 * (the `commute` boolean) at a precise `sharedLocus`. It is the multi-agent
 * concurrency signal ("these two may merge without an integration test") AND the
 * coupling signal ("these two are bound at locus X") in one record.
 *
 * SHA ANCHORING. `sha` is sha256 of the CANONICAL JSON of the payload (keys in
 * insertion order, the producer's responsibility to keep stable — see canonJson).
 * Two emissions of the same payload produce the same sha, so the corpus is
 * deduplicable and tamper-evident without a human ever touching it. The sha is NOT
 * over the whole triple (kind/sha would self-reference); it is over the payload,
 * exactly as gates/algebra.ts CorpusTriple documents ("sha256 of the canonical
 * payload — dedup + tamper-evidence").
 *
 * APPEND-ONLY. We only ever append a line; we never rewrite or truncate the corpus
 * (same append-only discipline the ledger/trace surfaces use). The directory is
 * created on first emit. The format is JSONL (one JSON object per line) so the
 * corpus streams and a partial last line is recoverable by line.
 *
 * HONEST CEILING. This file proves nothing about whether a repair was the RIGHT
 * repair — only that the reward equals the deterministic red-count delta the gates
 * measured. A model trained on this corpus is trained on what the gates can see;
 * reds the gates honestly cannot decide (UNJUDGED) never enter the count, so they
 * never enter the reward. The corpus is as honest — and as blind — as the gate set.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CorpusTriple } from './algebra.js';

/** Repo-relative location of the corpus, under atomic's own scratch root. */
export const CORPUS_REL = '.atomic/corpus/triples.jsonl';

/**
 * The exact byte-splice a repair committed — enough to REPLAY the edit and re-derive
 * the reward. `before`/`after` are the literal substrings at `[byteStart, byteEnd)`
 * pre- and post-edit (so a consumer can reconstruct both buffers without the file).
 */
export interface RepairSplice {
  /** repo-relative file the splice landed in */
  file: string;
  /** byte offset where the replaced region begins */
  byteStart: number;
  /** byte offset where the replaced region ends (exclusive); byteStart <= byteEnd */
  byteEnd: number;
  /** the bytes that were at [byteStart, byteEnd) BEFORE the splice */
  before: string;
  /** the bytes now at that locus AFTER the splice */
  after: string;
}

/**
 * The payload of a REPAIR triple. The reward is `redBefore - redAfter` — NOT stored
 * as its own field, because storing it would let a producer LIE; instead it is
 * DERIVED from the two counts by `repairReward`, so the corpus carries the evidence
 * (the counts + the splice) and the reward is a pure function of that evidence.
 * `gateWentGreen` is the boolean witness that the targeted red reached zero
 * (redAfter === 0) — recorded explicitly so a consumer need not re-derive it.
 */
export interface RepairPayload {
  /** registry red count BEFORE the splice (runGates(...).reds.length on prior bytes) */
  redBefore: number;
  /** the exact byte-splice the convergence operator committed */
  appliedSplice: RepairSplice;
  /** registry red count AFTER the splice (runGates(...).reds.length on new bytes) */
  redAfter: number;
  /** true ⟺ redAfter === 0: the splice drove the gate(s) fully green (honest witness) */
  gateWentGreen: boolean;
}

/**
 * The payload of a COMMUTE triple. A pure independence/coupling judgement between two
 * verified edits (the CommuteVerdict the algebra rendered). `sharedLocus` is present
 * ⟺ they do NOT commute (it names the file/span at which they couple); a commuting
 * pair has no shared locus by construction.
 */
export interface CommutePayload {
  /** repo-relative file of the first edit */
  fileA: string;
  /** repo-relative file of the second edit */
  fileB: string;
  /** the verdict: true = order-independent (safe to merge concurrently), false = coupled */
  commute: boolean;
  /** the file/span at which the two edits couple — present iff commute === false */
  sharedLocus?: string;
}

/**
 * Canonical JSON of a payload: stable key order via JSON.stringify with an explicit
 * replacer that sorts keys recursively. This makes the sha deterministic regardless
 * of the order a producer happened to assign fields, so the same logical payload
 * always hashes identically (the dedup contract).
 */
export function canonJson(payload: unknown): string {
  const sortKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value !== null && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(value as Record<string, unknown>).sort()) {
        out[k] = sortKeys((value as Record<string, unknown>)[k]);
      }
      return out;
    }
    return value;
  };
  return JSON.stringify(sortKeys(payload));
}

/** sha256 (hex) of the canonical payload JSON — the triple's content anchor. */
export function payloadSha(payload: unknown): string {
  return crypto.createHash('sha256').update(canonJson(payload), 'utf8').digest('hex');
}

/**
 * The reward of a repair, DERIVED (never stored): the registry's own red-count delta.
 * Positive ⟺ the splice removed reds; zero ⟺ no net change; negative ⟺ it INTRODUCED
 * reds (the convergence operator would reject such a splice, but the corpus records it
 * honestly if it is ever emitted). This is the single function that defines the reward
 * semantics — every consumer must read the reward through it, not by inventing a field.
 */
export function repairReward(payload: RepairPayload): number {
  return payload.redBefore - payload.redAfter;
}

/** Absolute path to the corpus file for a given repo root. */
function corpusPath(repoRoot: string): string {
  return path.join(repoRoot, CORPUS_REL);
}

/**
 * Append one triple as a single JSONL line. Creates `.atomic/corpus/` on first emit.
 * APPEND-ONLY: never rewrites or truncates. Returns the exact triple that was written
 * (with its computed sha) so the caller has the content anchor without re-reading.
 */
function emit(repoRoot: string, kind: CorpusTriple['kind'], payload: unknown): CorpusTriple {
  const triple: CorpusTriple = { kind, sha: payloadSha(payload), payload };
  const file = corpusPath(repoRoot);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(triple)}\n`, 'utf8');
  return triple;
}

/**
 * Emit a REPAIR triple. `gateWentGreen` is set from the recorded `redAfter` so the
 * witness can never contradict the evidence (a producer cannot claim green while
 * recording residual reds). Returns the written triple.
 */
export function emitRepairTriple(
  repoRoot: string,
  record: { redBefore: number; appliedSplice: RepairSplice; redAfter: number },
): CorpusTriple {
  const payload: RepairPayload = {
    redBefore: record.redBefore,
    appliedSplice: record.appliedSplice,
    redAfter: record.redAfter,
    gateWentGreen: record.redAfter === 0,
  };
  return emit(repoRoot, 'repair', payload);
}

/**
 * Emit a COMMUTE triple. `sharedLocus` is carried through only when present (a
 * commuting pair has none). Returns the written triple.
 */
export function emitCommuteTriple(
  repoRoot: string,
  record: { fileA: string; fileB: string; commute: boolean; sharedLocus?: string },
): CorpusTriple {
  const payload: CommutePayload = {
    fileA: record.fileA,
    fileB: record.fileB,
    commute: record.commute,
    ...(record.sharedLocus !== undefined ? { sharedLocus: record.sharedLocus } : {}),
  };
  return emit(repoRoot, 'commute', payload);
}

/**
 * Read the whole corpus back as parsed triples (skips blank/partial lines). For
 * audit, replay, and the proof. Read-only; returns [] when the corpus does not exist.
 */
export function readCorpus(repoRoot: string): CorpusTriple[] {
  const file = corpusPath(repoRoot);
  if (!fs.existsSync(file)) return [];
  const out: CorpusTriple[] = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      out.push(JSON.parse(t) as CorpusTriple);
    } catch {
      /* partial last line / corruption → skip; the corpus is line-recoverable */
    }
  }
  return out;
}
