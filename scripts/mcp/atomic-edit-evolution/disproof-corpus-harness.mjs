#!/usr/bin/env node
/**
 * disproof-corpus-harness.mjs — deterministic disproof-corpus kernel for Atomic
 * self-evolution (Movimento III substrate).
 *
 * Intentionally narrow, mirroring self-evolution-harness.mjs: it does not run
 * gates and it does not write to disk. It builds/verifies hash-chained disproof
 * witness records, folds them into a wall index with semantic dedup (hitCount),
 * selects disproofs for a proposal briefing under an explicit policy, computes
 * the pre-registered experiment metrics (M1-M5), and selects the deterministic
 * held-out invariant set. Every record is recomputable by third parties; a
 * record whose hash does not recompute is REJECTED, never repaired.
 *
 * HONEST STATUS: this module has ZERO engine consumers at creation time. It is
 * the substrate for III.a-III.f; the promotion path consuming it is a separate,
 * engine-side change (gated by the self-expansion lattice). Claims of a closed
 * gradient loop are false until that consumer exists.
 *
 * Hash compatibility: canonicalSha256(value) === sha256(JSON.stringify(value)),
 * byte-identical to self-evolution-harness.mjs.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 1;
const WITNESS_KIND = 'atomic-disproof-witness-record';
const HIT_KIND = 'atomic-disproof-wall-hit';
const SUPERSEDE_KIND = 'atomic-disproof-wall-superseded';
const RECORD_KINDS = new Set([WITNESS_KIND, HIT_KIND, SUPERSEDE_KIND]);
const HELDOUT_SALT_DEFAULT = 'darwin-godel-heldout-v1';

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalSha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function asNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Locus normalization (pre-registered in docs/evidence/darwin-godel-preregistration-v1.md §2.3):
 * a wall is file + SYMBOLIC region; raw line/byte offsets are stripped so that the same
 * invariant violated at shifted offsets still maps to the same wall. A region that is purely
 * an offset expression (e.g. "L120", "120-140", "L10:22") normalizes to '' (file-level wall).
 */
export function normalizeLocus(locus) {
  if (!isRecord(locus) || !nonEmptyString(locus.file)) throw new Error('locus.file is required');
  const region = typeof locus.region === 'string' ? locus.region.trim() : '';
  const offsetOnly = /^L?\d+([-:]\d+)?$/.test(region);
  return `${locus.file}#${offsetOnly ? '' : region}`;
}

export function wallKey(invariantId, locus) {
  if (!nonEmptyString(invariantId)) throw new Error('invariantId is required');
  return `${invariantId}::${normalizeLocus(locus)}`;
}

function recordHash(body) {
  const copy = { ...body };
  delete copy.recordSha256;
  return canonicalSha256(copy);
}

/**
 * Build a full disproof witness record. Fail-closed: every load-bearing field is
 * required; repairHint is OPTIONAL and is stored with trusted:false ALWAYS (the
 * judge's guess, never a verdict). previousRecordSha256/sequence chain the corpus.
 */
export function buildWitnessRecord(args) {
  if (!isRecord(args)) throw new Error('witness args must be an object');
  const { invariantId, locus, counterexample, proposalDigest, verdictCodes, archiveEntrySha256 } = args;
  if (!nonEmptyString(invariantId)) throw new Error('invariantId is required');
  if (counterexample === undefined || counterexample === null) throw new Error('counterexample is required (the literal object, not a summary)');
  if (!nonEmptyString(proposalDigest)) throw new Error('proposalDigest is required');
  if (!Array.isArray(verdictCodes) || verdictCodes.length === 0 || !verdictCodes.every(nonEmptyString)) {
    throw new Error('verdictCodes must be a non-empty string array');
  }
  if (!nonEmptyString(archiveEntrySha256)) throw new Error('archiveEntrySha256 is required (every wall has an address in lineage)');
  const previous = args.previousRecord ?? null;
  if (previous !== null && !isRecord(previous)) throw new Error('previousRecord must be a record or null');
  const body = {
    kind: WITNESS_KIND,
    schemaVersion: SCHEMA_VERSION,
    sequence: previous ? asNumber(previous.sequence, 0) + 1 : 1,
    previousRecordSha256: previous ? recordHash(previous) : null,
    invariantId,
    locus: clone(locus),
    wallKey: wallKey(invariantId, locus),
    counterexample: clone(counterexample),
    proposalDigest,
    parentSha: nonEmptyString(args.parentSha) ? args.parentSha : null,
    generation: asNumber(args.generation, 0),
    verdictCodes: clone(verdictCodes),
    repairHint: nonEmptyString(args.repairHint) ? { text: args.repairHint, trusted: false } : null,
    archiveEntrySha256,
  };
  return { ...body, recordSha256: recordHash(body) };
}

function buildHitRecord({ previousRecord, targetRecord, proposalDigest, archiveEntrySha256, generation }) {
  const body = {
    kind: HIT_KIND,
    schemaVersion: SCHEMA_VERSION,
    sequence: asNumber(previousRecord.sequence, 0) + 1,
    previousRecordSha256: recordHash(previousRecord),
    wallKey: targetRecord.wallKey,
    targetRecordSha256: targetRecord.recordSha256,
    proposalDigest,
    generation: asNumber(generation, 0),
    archiveEntrySha256,
  };
  return { ...body, recordSha256: recordHash(body) };
}

export function buildSupersedeRecord({ previousRecord, targetWallKey, supersededBy, reason }) {
  if (!nonEmptyString(targetWallKey)) throw new Error('targetWallKey is required');
  if (!nonEmptyString(supersededBy)) throw new Error('supersededBy (the new invariantId) is required');
  const body = {
    kind: SUPERSEDE_KIND,
    schemaVersion: SCHEMA_VERSION,
    sequence: previousRecord ? asNumber(previousRecord.sequence, 0) + 1 : 1,
    previousRecordSha256: previousRecord ? recordHash(previousRecord) : null,
    wallKey: targetWallKey,
    supersededBy,
    reason: nonEmptyString(reason) ? reason : null,
  };
  return { ...body, recordSha256: recordHash(body) };
}

export function verifyRecord(record, previousRecord = null) {
  if (!isRecord(record)) return { ok: false, error: 'record must be an object' };
  if (!RECORD_KINDS.has(record.kind)) return { ok: false, error: `unknown record kind: ${String(record.kind)}` };
  const recomputed = recordHash(record);
  if (record.recordSha256 !== recomputed) {
    return { ok: false, error: `recordSha256 mismatch; declared ${record.recordSha256}, recomputed ${recomputed}` };
  }
  const previousSha = previousRecord ? recordHash(previousRecord) : null;
  if ((record.previousRecordSha256 ?? null) !== previousSha) {
    return { ok: false, error: 'previousRecordSha256 does not match supplied previous record' };
  }
  const expectedSequence = previousRecord ? asNumber(previousRecord.sequence, 0) + 1 : 1;
  if (record.sequence !== expectedSequence) {
    return { ok: false, error: `sequence ${record.sequence} does not match expected ${expectedSequence}` };
  }
  if (record.kind === WITNESS_KIND) {
    if (!Array.isArray(record.verdictCodes) || record.verdictCodes.length === 0) {
      return { ok: false, error: 'witness verdictCodes must be non-empty' };
    }
    if (record.repairHint !== null && record.repairHint?.trusted !== false) {
      return { ok: false, error: 'repairHint must carry trusted:false (judge guess, never verdict)' };
    }
  }
  return { ok: true, recordSha256: recomputed };
}

export function parseCorpusJsonl(corpusText) {
  const text = String(corpusText ?? '');
  const lines = text.split('\n');
  const records = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.length === 0) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      return { ok: false, error: `corpus JSONL line ${index + 1} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`, line: index + 1 };
    }
    if (!isRecord(parsed)) return { ok: false, error: `corpus JSONL line ${index + 1} must be an object`, line: index + 1 };
    records.push(parsed);
  }
  return { ok: true, records };
}

/**
 * Fold the append-only record stream into the wall index. Disproofs are never
 * deleted: a superseded wall stays as history with supersededBy set.
 */
export function foldWalls(records) {
  const walls = new Map();
  for (const record of records) {
    if (record.kind === WITNESS_KIND) {
      walls.set(record.wallKey, {
        record,
        hitCount: 1,
        proposalDigests: [record.proposalDigest],
        generations: { min: asNumber(record.generation, 0), max: asNumber(record.generation, 0) },
        supersededBy: null,
      });
    } else if (record.kind === HIT_KIND) {
      const wall = walls.get(record.wallKey);
      if (!wall) return { ok: false, error: `wall-hit targets unknown wallKey ${record.wallKey}` };
      wall.hitCount += 1;
      wall.proposalDigests.push(record.proposalDigest);
      wall.generations.min = Math.min(wall.generations.min, asNumber(record.generation, 0));
      wall.generations.max = Math.max(wall.generations.max, asNumber(record.generation, 0));
    } else if (record.kind === SUPERSEDE_KIND) {
      const wall = walls.get(record.wallKey);
      if (!wall) return { ok: false, error: `supersede targets unknown wallKey ${record.wallKey}` };
      wall.supersededBy = record.supersededBy;
    }
  }
  return { ok: true, walls };
}

export function verifyCorpusJsonl(corpusText) {
  const parsed = parseCorpusJsonl(corpusText);
  if (parsed.ok !== true) return parsed;
  let previous = null;
  const anomalies = [];
  for (let i = 0; i < parsed.records.length; i += 1) {
    const verified = verifyRecord(parsed.records[i], previous);
    if (verified.ok !== true) {
      return { ok: false, error: `corpus record ${i + 1} rejected: ${verified.error}`, index: i, anomalies };
    }
    previous = parsed.records[i];
  }
  const folded = foldWalls(parsed.records);
  if (folded.ok !== true) return { ok: false, error: folded.error };
  const wallSummaries = [...folded.walls.entries()].map(([key, wall]) => ({
    wallKey: key,
    invariantId: wall.record.invariantId,
    hitCount: wall.hitCount,
    generations: wall.generations,
    supersededBy: wall.supersededBy,
  }));
  return {
    ok: true,
    recordCount: parsed.records.length,
    wallCount: folded.walls.size,
    headRecordSha256: previous ? previous.recordSha256 : null,
    walls: wallSummaries,
  };
}

/**
 * Append-only with SEMANTIC dedup: a witness whose wallKey already exists (and is
 * not superseded) collapses into a wall-hit record (hitCount++), preserving the
 * append-only chain. A forged/non-recomputing existing corpus is REFUSED.
 */
export function appendWitnessJsonl({ corpusText = '', witnessArgs }) {
  const existing = verifyCorpusJsonl(corpusText);
  if (existing.ok !== true) return { ok: false, error: `existing corpus rejected: ${existing.error}` };
  const parsed = parseCorpusJsonl(corpusText);
  const records = parsed.records;
  const previousRecord = records.length > 0 ? records[records.length - 1] : null;
  const folded = foldWalls(records);
  const key = wallKey(witnessArgs.invariantId, witnessArgs.locus);
  const existingWall = folded.walls.get(key);
  let record;
  let deduped = false;
  if (existingWall && existingWall.supersededBy === null) {
    if (!previousRecord) return { ok: false, error: 'corpus index has walls but no records (corrupt fold)' };
    record = buildHitRecord({
      previousRecord,
      targetRecord: existingWall.record,
      proposalDigest: witnessArgs.proposalDigest,
      archiveEntrySha256: witnessArgs.archiveEntrySha256,
      generation: witnessArgs.generation,
    });
    deduped = true;
  } else {
    record = buildWitnessRecord({ ...witnessArgs, previousRecord });
  }
  const normalized = String(corpusText ?? '').trimEnd();
  const nextCorpusText = `${normalized.length === 0 ? '' : `${normalized}\n`}${JSON.stringify(record)}\n`;
  const verified = verifyCorpusJsonl(nextCorpusText);
  return { ok: verified.ok === true, changed: true, deduped, record, corpusText: nextCorpusText, chain: verified };
}

export function appendSupersedeJsonl({ corpusText = '', targetWallKey, supersededBy, reason }) {
  const existing = verifyCorpusJsonl(corpusText);
  if (existing.ok !== true) return { ok: false, error: `existing corpus rejected: ${existing.error}` };
  const records = parseCorpusJsonl(corpusText).records;
  const previousRecord = records.length > 0 ? records[records.length - 1] : null;
  const record = buildSupersedeRecord({ previousRecord, targetWallKey, supersededBy, reason });
  const normalized = String(corpusText ?? '').trimEnd();
  const nextCorpusText = `${normalized.length === 0 ? '' : `${normalized}\n`}${JSON.stringify(record)}\n`;
  const verified = verifyCorpusJsonl(nextCorpusText);
  return { ok: verified.ok === true, changed: true, record, corpusText: nextCorpusText, chain: verified };
}

/**
 * selectDisproofs(region, k) — the pre-registered injection policy (III.c):
 *   priority 1: walls whose locus intersects the region the proposal touches;
 *   priority 2: highest global hitCount (the species' most-hit walls);
 *   priority 3: 1-2 deterministic "distant" walls (anti-myopia), ordered by
 *               sha256(recordSha256 + seed) — no Math.random, replayable.
 * Superseded walls are history, never injected.
 */
export function selectDisproofs({ corpusText, region = '', k = 8, seed = 'briefing-v1' }) {
  const verified = verifyCorpusJsonl(corpusText);
  if (verified.ok !== true) return { ok: false, error: `corpus rejected: ${verified.error}` };
  const folded = foldWalls(parseCorpusJsonl(corpusText).records);
  const live = [...folded.walls.values()].filter((wall) => wall.supersededBy === null);
  const byHits = (a, b) => b.hitCount - a.hitCount || a.record.recordSha256.localeCompare(b.record.recordSha256);
  const inRegion = (wall) => {
    if (!nonEmptyString(region)) return false;
    const file = wall.record.locus.file;
    return file === region || file.startsWith(region.endsWith('/') ? region : `${region}/`) || file.includes(region);
  };
  const p1 = live.filter(inRegion).sort(byHits);
  const rest = live.filter((wall) => !p1.includes(wall)).sort(byHits);
  const antiMyopiaBudget = Math.min(2, Math.max(live.length > k ? 1 : 0, Math.floor(k / 4)));
  const mainBudget = Math.max(0, k - antiMyopiaBudget);
  const main = [...p1, ...rest].slice(0, mainBudget);
  const distantPool = live.filter((wall) => !main.includes(wall));
  const distant = distantPool
    .map((wall) => ({ wall, order: sha256Text(wall.record.recordSha256 + seed) }))
    .sort((a, b) => a.order.localeCompare(b.order))
    .slice(0, Math.min(antiMyopiaBudget, Math.max(0, k - main.length)))
    .map((entry) => entry.wall);
  const selected = [...main, ...distant];
  return {
    ok: true,
    policyId: 'selectDisproofs-v1',
    region,
    k,
    seed,
    selected: selected.map((wall) => ({
      wallKey: wall.record.wallKey,
      invariantId: wall.record.invariantId,
      locus: wall.record.locus,
      hitCount: wall.hitCount,
      generations: wall.generations,
      counterexample: wall.record.counterexample,
      verdictCodes: wall.record.verdictCodes,
      repairHint: wall.record.repairHint,
      recordSha256: wall.record.recordSha256,
    })),
  };
}

/**
 * buildBriefing — the gradient step artifact (III.c). Three layers:
 *   L1 lessonLine per wall (cheapest), L2 literal counterexamples for the most
 *   relevant maxCounterexamples walls, L3 repairTraces (disproof→accepted-diff
 *   pairs, the densest gradient). The briefing is a deterministic string whose
 *   sha256 (briefingDigest) MUST be archived with the proposal it informed.
 */
export function buildBriefing({ selected = [], lessons = [], repairTraces = [], maxCounterexamples = 5 }) {
  const lines = [];
  lines.push('## BRIEFING DE PAREDES (disprovas formais; aprenda a geometria, não os loci)');
  for (const lesson of lessons) {
    lines.push(`LEI: ${lesson.statement} [evidência: ${asNumber(lesson.witnessCount, 0)} witnesses]`);
  }
  for (const wall of selected) {
    const gen = wall.generations ? `ger. ${wall.generations.min}-${wall.generations.max}` : 'ger. ?';
    lines.push(`PAREDE: ${wall.invariantId} @ ${wall.locus.file}#${wall.locus.region ?? ''} — ${wall.hitCount} colisões, ${gen} [${wall.verdictCodes.join(',')}]`);
  }
  const withCounterexamples = [...selected].sort((a, b) => b.hitCount - a.hitCount).slice(0, maxCounterexamples);
  for (const wall of withCounterexamples) {
    lines.push(`CONTRA-EXEMPLO ${wall.wallKey}: ${JSON.stringify(wall.counterexample)}`);
  }
  for (const trace of repairTraces) {
    lines.push(`TRAVESSIA ${trace.wallKey}: disprova ${trace.witnessRecordSha256} → diff aceito ${trace.acceptedProposalDigest}`);
  }
  const text = lines.join('\n');
  return {
    ok: true,
    text,
    briefingDigest: sha256Text(text),
    layers: { l1: selected.length + lessons.length, l2: withCounterexamples.length, l3: repairTraces.length },
  };
}

/**
 * Deterministic held-out selection, pre-committed in the pre-registration §2.4:
 * sort invariantIds by sha256(id + salt), reserve the top ceil(n*fraction).
 */
export function selectHeldOut({ invariantIds, fraction = 0.2, salt = HELDOUT_SALT_DEFAULT }) {
  if (!Array.isArray(invariantIds) || invariantIds.length === 0 || !invariantIds.every(nonEmptyString)) {
    return { ok: false, error: 'invariantIds must be a non-empty string array' };
  }
  const unique = [...new Set(invariantIds)];
  const ordered = unique
    .map((id) => ({ id, order: sha256Text(id + salt) }))
    .sort((a, b) => a.order.localeCompare(b.order));
  const count = Math.ceil(unique.length * fraction);
  const heldOut = ordered.slice(0, count).map((entry) => entry.id);
  const taught = ordered.slice(count).map((entry) => entry.id);
  return { ok: true, salt, fraction, heldOut, taught, total: unique.length };
}

function tokenShingles(text, n = 4) {
  const tokens = String(text ?? '').split(/\s+/).filter((token) => token.length > 0);
  const shingles = new Set();
  for (let i = 0; i + n <= tokens.length; i += 1) shingles.add(tokens.slice(i, i + n).join(' '));
  return shingles;
}

export function jaccardDistance4gram(a, b) {
  const sa = tokenShingles(a);
  const sb = tokenShingles(b);
  if (sa.size === 0 && sb.size === 0) return 0;
  let intersection = 0;
  for (const item of sa) if (sb.has(item)) intersection += 1;
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : 1 - intersection / union;
}

/**
 * computeMetrics — the pre-registered curves (III.f / pre-reg §2.3) from a flat
 * proposal log: [{generation, admitted, wallKey?, diffText?, publicScore?,
 * shadowCount?, unjudged?}]. M2 counts a rejection as a wall-REPEAT iff its
 * wallKey was first seen in an EARLIER generation.
 */
export function computeMetrics({ proposals }) {
  if (!Array.isArray(proposals) || proposals.length === 0) return { ok: false, error: 'proposals must be a non-empty array' };
  const generations = [...new Set(proposals.map((p) => asNumber(p.generation, 0)))].sort((a, b) => a - b);
  const firstSeen = new Map();
  for (const proposal of proposals) {
    if (proposal.wallKey && !firstSeen.has(proposal.wallKey)) {
      firstSeen.set(proposal.wallKey, asNumber(proposal.generation, 0));
    }
  }
  const perGeneration = [];
  let runningCapability = 0;
  let sinceLastAdmission = 0;
  const costToAdmission = [];
  for (const generation of generations) {
    const inGen = proposals.filter((p) => asNumber(p.generation, 0) === generation);
    const admitted = inGen.filter((p) => p.admitted === true);
    const rejected = inGen.filter((p) => p.admitted !== true);
    const repeats = rejected.filter((p) => p.wallKey && firstSeen.get(p.wallKey) < generation);
    for (const proposal of inGen) {
      sinceLastAdmission += 1 + asNumber(proposal.shadowCount, 0);
      if (proposal.admitted === true) {
        costToAdmission.push(sinceLastAdmission);
        sinceLastAdmission = 0;
      }
    }
    for (const proposal of admitted) runningCapability = Math.max(runningCapability, asNumber(proposal.publicScore, 0));
    const diffs = inGen.map((p) => p.diffText).filter((d) => nonEmptyString(d));
    let noveltySum = 0;
    let noveltyPairs = 0;
    for (let i = 0; i < diffs.length; i += 1) {
      for (let j = i + 1; j < diffs.length; j += 1) {
        noveltySum += jaccardDistance4gram(diffs[i], diffs[j]);
        noveltyPairs += 1;
      }
    }
    perGeneration.push({
      generation,
      proposals: inGen.length,
      m1AdmissionRate: inGen.length === 0 ? null : admitted.length / inGen.length,
      m2WallRepeatRate: rejected.length === 0 ? null : repeats.length / rejected.length,
      m3Capability: runningCapability,
      m5NoveltyIndex: noveltyPairs === 0 ? null : noveltySum / noveltyPairs,
      unjudgedRate: inGen.length === 0 ? null : inGen.filter((p) => p.unjudged === true).length / inGen.length,
    });
  }
  return { ok: true, perGeneration, m4CostToAdmission: costToAdmission };
}

function parseJsonInput(stdinText) {
  const trimmed = String(stdinText ?? '').trim();
  if (trimmed.length === 0) return {};
  return JSON.parse(trimmed);
}

export function runCli(argv, stdinText) {
  const mode = argv[0] ?? '--help';
  try {
    if (mode === '--help') {
      return {
        ok: true,
        modes: [
          '--help',
          '--self-test',
          '--verify-corpus-jsonl',
          '--append-witness-jsonl',
          '--append-supersede-jsonl',
          '--select-disproofs',
          '--build-briefing',
          '--select-held-out',
          '--compute-metrics',
        ],
      };
    }
    if (mode === '--self-test') return cliSelfTest();
    const input = parseJsonInput(stdinText);
    if (mode === '--verify-corpus-jsonl') return verifyCorpusJsonl(input.corpusText ?? input.text ?? input);
    if (mode === '--append-witness-jsonl') return appendWitnessJsonl(input);
    if (mode === '--append-supersede-jsonl') return appendSupersedeJsonl(input);
    if (mode === '--select-disproofs') return selectDisproofs(input);
    if (mode === '--build-briefing') return buildBriefing(input);
    if (mode === '--select-held-out') return selectHeldOut(input);
    if (mode === '--compute-metrics') return computeMetrics(input);
    return { ok: false, error: `unknown disproof-corpus harness mode: ${mode}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function cliSelfTest() {
  const witnessArgs = {
    invariantId: 'security-gate.regex.17',
    locus: { file: 'server-helpers-io.ts', region: 'atomicWrite' },
    counterexample: { fixture: 'byte-floor-bypass-attempt', survived: false },
    proposalDigest: sha256Text('demo-diff'),
    generation: 1,
    verdictCodes: ['gate.security'],
    archiveEntrySha256: sha256Text('demo-archive-entry'),
  };
  const first = appendWitnessJsonl({ corpusText: '', witnessArgs });
  if (first.ok !== true) return { ok: false, error: `self-test append failed: ${first.error}` };
  const second = appendWitnessJsonl({ corpusText: first.corpusText, witnessArgs: { ...witnessArgs, proposalDigest: sha256Text('demo-diff-2'), generation: 2 } });
  if (second.ok !== true || second.deduped !== true) return { ok: false, error: 'self-test dedup failed' };
  const verified = verifyCorpusJsonl(second.corpusText);
  if (verified.ok !== true || verified.wallCount !== 1 || verified.recordCount !== 2) {
    return { ok: false, error: 'self-test verify failed' };
  }
  const forged = second.corpusText.replace('"hitCount"', '"hitCount"'); // no-op guard
  const tampered = second.corpusText.replace('security-gate.regex.17', 'security-gate.regex.99');
  const tamperedVerify = verifyCorpusJsonl(tampered);
  if (tamperedVerify.ok === true) return { ok: false, error: 'self-test FAILED: tampered corpus verified (forgery accepted)' };
  return { ok: true, walls: verified.wallCount, records: verified.recordCount, forgedRejected: true, noop: forged.length > 0 };
}

function isCliMain() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isCliMain()) {
  const mode = process.argv[2] ?? '--help';
  const needsInput = !['--help', '--self-test'].includes(mode);
  const stdinText = needsInput ? fs.readFileSync(0, 'utf8') : '';
  const result = runCli([mode], stdinText);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  // exitCode (não exit()): write em pipe >64KiB bufferiza além do 1º chunk e
  // exit() descarta o restante — o pai recebia EXATAMENTE 65536 bytes e o
  // JSON.parse upstream morria ('Unterminated string at position 65536'),
  // bloqueando todo atomic_expand_self. Provado: write+exit()=65536 bytes,
  // write+exitCode=completo (exec-ledger 2026-06-10).
  process.exitCode = result.ok === false ? 1 : 0;
}
