/**
 * engine-proof-reexec.ts — the Proof-Carrying Edit RE-EXECUTION + Merkle + seal core.
 *
 * Thesis (GAP #1, Daniel): a proof-carrying edit must be verifiable by RE-RUNNING
 * the construction, not merely by re-hashing a number the producer also wrote. A
 * hash recompute proves only "these three bytes hash to that"; it does NOT prove the
 * recorded gate verdict is the verdict the engine would actually reach over the real
 * before/after content. The strong claim — "this edit is correct-by-construction and
 * you do not have to trust me" — requires four independent, producer-untrusted checks:
 *
 *   (1) RE-EXEC      — re-run engine.validate(file, before, after) over the EMBEDDED
 *                       snapshot content and assert the recorded validation verdict
 *                       (language / before-count / after-count / ok) REPRODUCES. The
 *                       verifier reconstructs the syntactic judgment from first
 *                       principles; a forged "ok:true" over content that actually
 *                       regresses no longer reproduces.
 *   (2) MERKLE       — a Merkle root over the session's op afterSha256 leaves, with
 *                       the op's leaf + inclusion path embedded in the artifact, so a
 *                       single op is provably a member of the snapshotted session
 *                       state without shipping the whole chain.
 *   (3) gateRunId    — a dedicated cryptographic identifier per gated op, derived from
 *                       the bound (verdict ‖ after ‖ parent) so two distinct gate runs
 *                       can never collide and a verdict cannot be re-attributed.
 *   (4) SEAL         — an HMAC seal over the canonical final-state body (root ‖ leaf ‖
 *                       gateRunId ‖ chainHash ‖ reexec assertion), checked by the
 *                       verifier. The seal binds the WHOLE proof into one tamper-evident
 *                       unit: edit any embedded field and the seal no longer recomputes.
 *
 * Plus (5) the full per-gate DECISION TREE — each gate name + ran/red/unjudged + fact —
 * extracted from the RegistryRun so the artifact carries the gate-by-gate reasoning,
 * not just the green/red summary.
 *
 * Pure + side-effect-free: every function here takes content/verdicts as arguments and
 * returns data. No file I/O, no process concerns — the .mjs CLI imports the COMPILED
 * dist/ form and drives I/O itself (matches the engine ↔ server split). Self-verifying:
 * the same functions the producer uses to BUILD the proof are the ones the verifier uses
 * to CHECK it, so there is no second, drift-prone re-implementation to keep honest.
 */

import * as crypto from 'node:crypto';
import { validate, type ValidationResult } from './engine.js';
import { type RegistryRun } from './gates/registry.js';

const sha256 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

/**
 * Canonical JSON: sorted keys at every depth, undefined → null. Byte-identical to
 * trace.ts/atomic-cli.mjs canonicalJSON so the seal/gateRunId a verifier computes
 * matches the producer regardless of insertion order. Kept local so this module is
 * importable standalone (no cross-module coupling for one tiny pure fn).
 */
export function canonicalJSON(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (v === null || v === undefined) return null;
    if (Array.isArray(v)) return v.map(norm);
    if (typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        out[k] = norm((v as Record<string, unknown>)[k]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(norm(value));
}

/** The before/after snapshot an op's re-exec needs, content-addressed for integrity. */
export interface EditSnapshot {
  file: string;
  /** Pre-edit content of the target span/file as the engine saw it. */
  before: string;
  /** Post-edit content the engine wrote (or proposed). */
  after: string;
  /** sha256(before) — lets the verifier confirm the embedded before-content was not swapped. */
  beforeSha256: string;
  /** sha256(after) — MUST equal the trace afterSha256 the chain hash binds. */
  afterSha256: string;
}

/** Build a content snapshot from the before/after a mutation site already holds. */
export function buildSnapshot(file: string, before: string, after: string): EditSnapshot {
  return {
    file,
    before,
    after,
    beforeSha256: sha256(before),
    afterSha256: sha256(after),
  };
}

/**
 * (1) RE-EXEC the engine validator over the embedded snapshot and compare it to the
 * verdict the producer RECORDED. This is the heart of the strong claim: the verifier
 * reconstructs the syntactic judgment with the SAME engine.validate the producer used,
 * so a recorded `ok:true` that does not reproduce over the real bytes is exposed.
 *
 * Returns the freshly-recomputed ValidationResult, the recorded one, and a boolean
 * `reproduces` that is true iff the load-bearing fields (language, before, after, ok)
 * all match. `introduced` is informational and not part of the equality (it is a
 * human message, not a verdict bit).
 */
export interface ReexecResult {
  recomputed: ValidationResult;
  recorded: ValidationResult | null;
  /** before-content hash matched the recorded snapshot hash (content not swapped). */
  beforeContentOk: boolean;
  /** after-content hash matched the recorded afterSha256 (the bytes the chain binds). */
  afterContentOk: boolean;
  /** recomputed validation verdict reproduces the recorded one. */
  verdictReproduces: boolean;
  /** all of the above hold — the re-exec independently confirms the recorded edit. */
  reproduces: boolean;
  note: string;
}

/** Accept both the canonical {before,after,ok} and the persisted {syntaxErrorsBefore/After} validation shapes. */
function normV(v: unknown): { language: string; before: number; after: number; ok: boolean } {
  const o = v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  const num = (x: unknown, d: number): number => (typeof x === 'number' ? x : d);
  const before = num(o.before, num(o.syntaxErrorsBefore, 0));
  const after = num(o.after, num(o.syntaxErrorsAfter, 0));
  const ok = typeof o.ok === 'boolean' ? o.ok : after <= before;
  return { language: typeof o.language === 'string' ? o.language : 'text', before, after, ok };
}

export function reexecValidate(
  snapshot: EditSnapshot,
  recorded: ValidationResult | null,
  recordedAfterSha256: string,
): ReexecResult {
  const recomputed = validate(snapshot.file, snapshot.before, snapshot.after);
  const beforeContentOk = sha256(snapshot.before) === snapshot.beforeSha256;
  const afterContentOk = sha256(snapshot.after) === recordedAfterSha256;
  const rcV = normV(recomputed);
  const reV = normV(recorded);
  const verdictReproduces =
    recorded != null &&
    rcV.language === reV.language &&
    rcV.before === reV.before &&
    rcV.after === reV.after &&
    rcV.ok === reV.ok;
  const reproduces = beforeContentOk && afterContentOk && verdictReproduces;
  const note = reproduces
    ? 're-executed engine.validate over the embedded before/after; the recorded verdict reproduces'
    : !beforeContentOk
      ? 'embedded before-content hash != recorded beforeSha256 (content swapped)'
      : !afterContentOk
        ? 'embedded after-content hash != recorded afterSha256 (the bytes the chain binds were swapped)'
        : recorded == null
          ? 'no recorded validation verdict to reproduce'
          : 're-executed verdict DIVERGES from the recorded one (forged or stale validation)';
  return { recomputed, recorded, beforeContentOk, afterContentOk, verdictReproduces, reproduces, note };
}

/**
 * (2) MERKLE proof of the session snapshot. Leaves are the per-op afterSha256 values in
 * chain order (the content-addressed identity of each committed state). We build a
 * binary Merkle tree, duplicating the last node on odd levels (Bitcoin-style), and emit
 * an inclusion path for a target leaf so a single op proves membership in O(log n) hashes
 * without shipping every sibling. A node hash is sha256("node:" ‖ left ‖ right); leaves
 * are domain-separated as sha256("leaf:" ‖ afterSha256) so a leaf can never be reinterpreted
 * as an internal node (second-preimage hardening).
 */
const leafHash = (afterSha256: string): string => sha256(`leaf:${afterSha256}`);
const nodeHash = (left: string, right: string): string => sha256(`node:${left}${right}`);

export interface MerkleStep {
  /** sibling hash to combine with the running hash at this level. */
  sibling: string;
  /** true when the sibling is on the LEFT (running hash is the right child). */
  siblingIsLeft: boolean;
}

export interface MerkleProof {
  /** the Merkle root over all session leaves. */
  root: string;
  /** number of leaves (session ops) the root commits to. */
  leafCount: number;
  /** 0-based index of the proven op among the leaves. */
  leafIndex: number;
  /** the proven op's leaf hash (= leafHash(afterSha256)). */
  leaf: string;
  /** inclusion path: siblings bottom→top that re-derive the root from `leaf`. */
  path: MerkleStep[];
}

/** Compute the Merkle root over an ordered list of op afterSha256 leaves. */
export function merkleRoot(afterSha256Leaves: string[]): string {
  if (afterSha256Leaves.length === 0) return sha256('empty-merkle');
  let level = afterSha256Leaves.map(leafHash);
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      // Odd node out: duplicate it (combine with itself) so the tree stays full.
      const right = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(nodeHash(left, right));
    }
    level = next;
  }
  return level[0];
}

/**
 * Build an inclusion proof for the leaf at `leafIndex` among `afterSha256Leaves`.
 * The returned proof re-derives `root` from `leaf` by folding in each path sibling.
 */
export function buildMerkleProof(afterSha256Leaves: string[], leafIndex: number): MerkleProof {
  const root = merkleRoot(afterSha256Leaves);
  const path: MerkleStep[] = [];
  let level = afterSha256Leaves.map(leafHash);
  const leaf = level[leafIndex];
  let idx = leafIndex;
  while (level.length > 1) {
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    // Odd node out duplicates itself; the sibling is then the node itself.
    const sibling = siblingIdx < level.length ? level[siblingIdx] : level[idx];
    path.push({ sibling, siblingIsLeft: isRight });
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];
      next.push(nodeHash(left, right));
    }
    level = next;
    idx = Math.floor(idx / 2);
  }
  return { root, leafCount: afterSha256Leaves.length, leafIndex, leaf, path };
}

/**
 * Re-derive the root from a leaf + inclusion path and assert it equals the claimed root.
 * This is what the VERIFIER runs: it never trusts the producer's `root`, it RECOMPUTES it
 * by folding the embedded path over the embedded leaf, then equality-checks.
 */
export function verifyMerkleProof(proof: MerkleProof): boolean {
  let running = proof.leaf;
  for (const step of proof.path) {
    running = step.siblingIsLeft ? nodeHash(step.sibling, running) : nodeHash(running, step.sibling);
  }
  return running === proof.root;
}

/**
 * (3) Dedicated cryptographic gateRunId per gated op. Derived from the bound triple
 * (canonical gateVerdict ‖ afterSha256 ‖ parentSha256) so:
 *   - two distinct gate runs (different verdict OR different content) get distinct ids;
 *   - the same logical run is reproducible (the verifier recomputes the SAME id);
 *   - a verdict cannot be re-attributed to a different op (afterSha256 binds the content).
 * Prefixed `grun_` for human grepability; the hex is the actual cryptographic identity.
 */
export function gateRunIdOf(
  gateVerdict: RegistryRun | null | undefined,
  afterSha256: string,
  parentSha256: string,
): string {
  const bound = `gaterun‖${canonicalJSON(gateVerdict ?? null)}‖${afterSha256}‖${parentSha256}`;
  return `grun_${sha256(bound)}`;
}

/**
 * (5) The full per-gate DECISION TREE. RegistryRun records gate names in `ran`, plus
 * `reds` (with fact), `unjudged` (with the gate name, sometimes "(reason)"-suffixed),
 * `notApplicable`, and `unjudgedEvidence`. We flatten this into one node-per-gate list —
 * the gate-by-gate reasoning the strong claim demands — so the artifact carries WHY each
 * gate decided as it did, not merely that the run was green.
 */
export interface GateDecisionNode {
  gate: string;
  /** 'red' | 'unjudged' | 'notApplicable' | 'green' — the per-gate outcome. */
  decision: 'red' | 'unjudged' | 'notApplicable' | 'green';
  /** the load-bearing fact: the red fact, the unjudged reason, or 'applied — no violation'. */
  fact: string;
  /** locus (file:locus) when the decision is a red with a location. */
  locus?: string;
}

export function decisionTreeOf(run: RegistryRun | null | undefined): GateDecisionNode[] {
  if (!run) return [];
  const nodes: GateDecisionNode[] = [];
  // A red can carry multiple facts for the same gate — emit one node per red fact.
  const redByGate = new Map<string, { fact: string; locus?: string }[]>();
  for (const r of run.reds ?? []) {
    const list = redByGate.get(r.gate) ?? [];
    list.push({ fact: r.fact, locus: r.locus });
    redByGate.set(r.gate, list);
  }
  const unjudgedSet = new Set((run.unjudged ?? []).map((u) => u.replace(/ \(.*\)$/, '')));
  const unjudgedReason = new Map<string, string>();
  for (const ev of run.unjudgedEvidence ?? []) unjudgedReason.set(ev.gate, ev.reason);
  // Some unjudged entries embed the reason in the name as "name (threw: ...)".
  for (const u of run.unjudged ?? []) {
    const m = /^(.*) \((.*)\)$/.exec(u);
    if (m && !unjudgedReason.has(m[1])) unjudgedReason.set(m[1], m[2]);
  }
  const notApplicable = new Set(run.notApplicable ?? []);
  // `ran` is the authoritative set of gates that actually applied + executed. Walk it so
  // the tree mirrors execution order; fold in any red/unjudged gate not already in `ran`
  // (defensive — keeps the tree total even if a producer recorded an out-of-band red).
  const seen = new Set<string>();
  const emit = (gate: string): void => {
    if (seen.has(gate)) return;
    seen.add(gate);
    const reds = redByGate.get(gate);
    if (reds && reds.length) {
      for (const r of reds) nodes.push({ gate, decision: 'red', fact: r.fact, locus: r.locus });
      return;
    }
    if (unjudgedSet.has(gate)) {
      nodes.push({ gate, decision: 'unjudged', fact: unjudgedReason.get(gate) ?? 'gate could not decide' });
      return;
    }
    if (notApplicable.has(gate)) {
      nodes.push({ gate, decision: 'notApplicable', fact: 'invariant had no relevant fact in this change' });
      return;
    }
    nodes.push({ gate, decision: 'green', fact: 'applied — no violation introduced' });
  };
  for (const g of run.ran ?? []) emit(g);
  for (const g of redByGate.keys()) emit(g);
  for (const g of unjudgedSet) emit(g);
  for (const g of notApplicable) emit(g);
  return nodes;
}

/**
 * (4) SEAL of the final state. The seal binds the WHOLE proof — Merkle root, this op's
 * leaf, the gateRunId, the chainHash, and the re-exec assertion (the recomputed verdict's
 * load-bearing bits) — into one HMAC. Editing any sealed field breaks the recompute.
 *
 * Keying: a seal is meaningful only relative to a key. We default to a deterministic,
 * REPO-PUBLIC key derived from the chainHash itself ("self-sealed") so the seal is
 * reproducible by any verifier WITHOUT a shared secret — it then degrades to a strong
 * integrity checksum that binds the fields together (still detects every field-edit). A
 * caller MAY pass a real secret (env ATOMIC_PROOF_SEAL_KEY) to upgrade it to an
 * authenticity seal (proves the SIGNER, not just integrity). `keyId` records which mode
 * sealed it so the verifier keys identically.
 */
export interface SealInput {
  merkleRoot: string;
  leaf: string;
  gateRunId: string;
  chainHash: string;
  /** the re-exec verdict's load-bearing bits, so the seal also binds the validation. */
  reexec: { language: string; before: number; after: number; ok: boolean } | null;
}

export interface Seal {
  alg: 'hmac-sha256';
  /** 'self' = key derived from chainHash (reproducible, integrity); 'env' = ATOMIC_PROOF_SEAL_KEY (authenticity). */
  keyId: 'self' | 'env';
  /** the HMAC hex over canonicalJSON(SealInput). */
  mac: string;
}

function sealKey(keyId: 'self' | 'env', chainHash: string): string {
  if (keyId === 'env') {
    const k = typeof process !== 'undefined' && process.env ? process.env.ATOMIC_PROOF_SEAL_KEY : undefined;
    if (k && k.length > 0) return k;
  }
  // Self-sealed: deterministic, repo-public, reproducible without a shared secret.
  return `atomic-self-seal:${chainHash}`;
}

export function sealState(input: SealInput, preferEnvKey = false): Seal {
  const hasEnv =
    preferEnvKey &&
    typeof process !== 'undefined' &&
    !!process.env &&
    !!process.env.ATOMIC_PROOF_SEAL_KEY &&
    process.env.ATOMIC_PROOF_SEAL_KEY.length > 0;
  const keyId: 'self' | 'env' = hasEnv ? 'env' : 'self';
  const mac = crypto
    .createHmac('sha256', sealKey(keyId, input.chainHash))
    .update(canonicalJSON(input))
    .digest('hex');
  return { alg: 'hmac-sha256', keyId, mac };
}

/**
 * Verify a seal: recompute the HMAC over the SAME canonical body with the SAME key mode
 * and constant-time compare. The verifier never trusts the recorded mac — it recomputes
 * it. For 'self' seals this always reproduces (repo-public key); for 'env' seals it
 * reproduces only when the verifier holds the same ATOMIC_PROOF_SEAL_KEY (authenticity).
 */
export function verifySeal(input: SealInput, seal: Seal): { ok: boolean; note: string } {
  if (seal.alg !== 'hmac-sha256') return { ok: false, note: `unsupported seal alg ${seal.alg}` };
  if (seal.keyId === 'env') {
    const k = typeof process !== 'undefined' && process.env ? process.env.ATOMIC_PROOF_SEAL_KEY : undefined;
    if (!k || k.length === 0) {
      return { ok: false, note: 'seal was env-keyed (authenticity) but ATOMIC_PROOF_SEAL_KEY is not set on this verifier' };
    }
  }
  const expected = crypto
    .createHmac('sha256', sealKey(seal.keyId, input.chainHash))
    .update(canonicalJSON(input))
    .digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(seal.mac, 'hex');
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  return {
    ok,
    note: ok
      ? `seal recomputes (${seal.keyId === 'self' ? 'self-sealed integrity' : 'env-keyed authenticity'})`
      : 'seal does NOT recompute — a sealed field (root/leaf/gateRunId/chainHash/reexec) was edited',
  };
}

/**
 * The portable, re-executable proof body cmdProve embeds and cmdVerifyProof --reexec
 * checks. Versioned distinctly from v1 so an old verifier rejects it cleanly rather than
 * silently skipping the re-exec checks. Carries everything needed to RE-RUN the proof
 * with zero trust in the producer: snapshot content, Merkle inclusion, gateRunId,
 * decision tree, and the seal.
 */
export interface ReexecProofBody {
  reexecVersion: 'atomic-proof-reexec/v2';
  snapshot: EditSnapshot;
  merkle: MerkleProof;
  gateRunId: string;
  decisionTree: GateDecisionNode[];
  seal: Seal;
}

/**
 * Assemble the full re-exec proof body from the materials a producer holds (the snapshot,
 * the ordered session leaves + this op's index, the gate verdict, and the chain fields).
 * One call so the producer and the proof file stay in lockstep — and so the verifier can
 * mirror it field-for-field. `validation` is the recorded ValidationResult to bind into
 * the seal (so the seal also covers the re-exec verdict bits).
 */
export function buildReexecProofBody(args: {
  snapshot: EditSnapshot;
  sessionAfterLeaves: string[];
  leafIndex: number;
  gateVerdict: RegistryRun | null | undefined;
  parentSha256: string;
  chainHash: string;
  validation: ValidationResult | null;
  preferEnvKey?: boolean;
}): ReexecProofBody {
  const merkle = buildMerkleProof(args.sessionAfterLeaves, args.leafIndex);
  const gateRunId = gateRunIdOf(args.gateVerdict, args.snapshot.afterSha256, args.parentSha256);
  const decisionTree = decisionTreeOf(args.gateVerdict);
  const reexec = args.validation ? normV(args.validation) : null;
  const seal = sealState(
    { merkleRoot: merkle.root, leaf: merkle.leaf, gateRunId, chainHash: args.chainHash, reexec },
    args.preferEnvKey ?? false,
  );
  return {
    reexecVersion: 'atomic-proof-reexec/v2',
    snapshot: args.snapshot,
    merkle,
    gateRunId,
    decisionTree,
    seal,
  };
}
