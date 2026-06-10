#!/usr/bin/env node
/**
 * self-evolution-harness.mjs — deterministic promotion kernel for Atomic self-evolution.
 *
 * This is intentionally narrow: it does not generate variants. It decides whether
 * a measured Atomic child variant may replace its parent. The kernel treats
 * public-score-only gains as insufficient, rejects any declared safety regression,
 * requires fixed evaluator/benchmark identities, and emits a receipt whose
 * verifier recomputes the decision from embedded facts instead of trusting the
 * receipt narrative.
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const SCHEMA_VERSION = 1;
const POSITIVE_METRICS = ['publicScore', 'holdoutScore', 'proofCoverage', 'semanticOperators'];
const LOWER_IS_BETTER_METRICS = ['medianLatencyMs'];
const SAFETY_METRICS = ['bypassesIntroduced', 'invalidCommits', 'receiptForgeryAccepted'];

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalSha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function asNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function metric(source, name) {
  return asNumber(source?.metrics?.[name], 0);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function requiredGateStatus(candidate, gateId) {
  const gate = Array.isArray(candidate?.gates) ? candidate.gates.find((entry) => entry?.id === gateId) : undefined;
  return typeof gate?.status === 'string' ? gate.status : 'missing';
}

function metricDeltas(parent, candidate) {
  const names = new Set([
    ...POSITIVE_METRICS,
    ...LOWER_IS_BETTER_METRICS,
    ...SAFETY_METRICS,
    ...Object.keys(parent?.metrics ?? {}),
    ...Object.keys(candidate?.metrics ?? {}),
  ]);
  const deltas = {};
  for (const name of [...names].sort()) {
    deltas[name] = metric(candidate, name) - metric(parent, name);
  }
  return deltas;
}

function validateShape(parent, candidate, policy, rejections) {
  if (!isRecord(policy)) rejections.push('policy.missing');
  if (!isRecord(parent)) rejections.push('parent.missing');
  if (!isRecord(candidate)) rejections.push('candidate.missing');
  if (!isRecord(policy) || !isRecord(parent) || !isRecord(candidate)) return;
  if (typeof policy.policyId !== 'string' || policy.policyId.length === 0) rejections.push('policy.id.missing');
  if (typeof policy.benchmarkSuiteSha256 !== 'string' || policy.benchmarkSuiteSha256.length === 0) rejections.push('policy.benchmarkSuiteSha256.missing');
  if (typeof policy.evaluatorSha256 !== 'string' || policy.evaluatorSha256.length === 0) rejections.push('policy.evaluatorSha256.missing');
  if (candidate.parentId !== parent.variantId) rejections.push('lineage.parent-mismatch');
  if (candidate.evaluatorSha256 !== policy.evaluatorSha256) rejections.push('kernel.evaluator-mismatch');
  if (candidate.benchmarkSuiteSha256 !== policy.benchmarkSuiteSha256) rejections.push('kernel.benchmark-mismatch');
  if (parent.evaluatorSha256 !== policy.evaluatorSha256) rejections.push('parent.evaluator-mismatch');
  if (parent.benchmarkSuiteSha256 !== policy.benchmarkSuiteSha256) rejections.push('parent.benchmark-mismatch');
}

function collectSafetyRejections(parent, candidate, policy) {
  const rejections = [];
  for (const gateId of policy.requiredGates ?? []) {
    const status = requiredGateStatus(candidate, gateId);
    if (status !== 'passed') rejections.push(`gate.${gateId}`);
  }
  for (const metricName of SAFETY_METRICS) {
    const candidateValue = metric(candidate, metricName);
    const parentValue = metric(parent, metricName);
    const ceiling = asNumber(policy.safetyCeilings?.[metricName], parentValue);
    if (candidateValue > ceiling || candidateValue > parentValue) rejections.push(`safety.${metricName}`);
  }
  return rejections;
}

function collectRegressionRejections(parent, candidate) {
  const rejections = [];
  if (metric(candidate, 'holdoutScore') < metric(parent, 'holdoutScore')) rejections.push('holdout.regression');
  if (metric(candidate, 'proofCoverage') < metric(parent, 'proofCoverage')) rejections.push('proofCoverage.regression');
  if (metric(candidate, 'semanticOperators') < metric(parent, 'semanticOperators')) rejections.push('semanticOperators.regression');
  if (metric(candidate, 'medianLatencyMs') > metric(parent, 'medianLatencyMs')) rejections.push('latency.regression');
  return rejections;
}

function improvementReasons(parent, candidate) {
  const reasons = [];
  for (const name of POSITIVE_METRICS) {
    const delta = metric(candidate, name) - metric(parent, name);
    if (delta > 0) reasons.push(`measured improvement: ${name} +${delta}`);
  }
  for (const name of LOWER_IS_BETTER_METRICS) {
    const delta = metric(candidate, name) - metric(parent, name);
    if (delta < 0) reasons.push(`measured improvement: ${name} ${delta}`);
  }
  return reasons;
}

export function decidePromotion({ parent, candidate, policy }) {
  const rejections = [];
  validateShape(parent, candidate, policy, rejections);
  const deltas = metricDeltas(parent, candidate);
  if (rejections.length === 0) {
    rejections.push(...collectSafetyRejections(parent, candidate, policy));
    rejections.push(...collectRegressionRejections(parent, candidate));
  }
  const reasons = rejections.length === 0 ? improvementReasons(parent, candidate) : [];
  if (rejections.length === 0 && reasons.length === 0) rejections.push('no.measured-improvement');
  const decisionCore = {
    schemaVersion: SCHEMA_VERSION,
    policyId: policy?.policyId ?? null,
    parentId: parent?.variantId ?? null,
    candidateId: candidate?.variantId ?? null,
    benchmarkSuiteSha256: policy?.benchmarkSuiteSha256 ?? null,
    evaluatorSha256: policy?.evaluatorSha256 ?? null,
    decision: rejections.length === 0 ? 'promote' : 'reject',
    deltas,
    reasons,
    rejections,
  };
  return {
    ...decisionCore,
    gateRunId: canonicalSha256({ kind: 'atomic-self-evolution-gate-run', ...decisionCore }),
  };
}

export function promotionReceiptHash(receiptBody) {
  const body = { ...receiptBody };
  delete body.receiptSha256;
  return canonicalSha256(body);
}

export function buildPromotionReceipt({ parent, candidate, policy }) {
  const decision = decidePromotion({ parent, candidate, policy });
  const body = {
    kind: 'atomic-self-evolution-promotion-receipt',
    schemaVersion: SCHEMA_VERSION,
    policy: clone(policy),
    parent: clone(parent),
    candidate: clone(candidate),
    ...decision,
    proofLimits: [
      'Receipt proves deterministic promotion policy over embedded benchmark/gate facts only.',
      'Receipt does not prove that the benchmark suite captures all future product behavior.',
    ],
  };
  return { ...body, receiptSha256: promotionReceiptHash(body) };
}

export function archiveEntryHash(entryBody) {
  const body = { ...entryBody };
  delete body.archiveEntrySha256;
  return canonicalSha256(body);
}

export function buildArchiveEntry({ archiveId = 'atomic-self-evolution-archive-v1', previousEntry = null, receipt }) {
  const verified = verifyPromotionReceipt(receipt);
  if (verified.ok !== true) {
    throw new Error(`cannot archive invalid promotion receipt: ${verified.error ?? 'unknown verifier failure'}`);
  }
  const previousEntrySha256 = previousEntry ? archiveEntryHash(previousEntry) : null;
  const sequence = previousEntry ? asNumber(previousEntry.sequence, 0) + 1 : 1;
  const body = {
    kind: 'atomic-self-evolution-archive-entry',
    schemaVersion: SCHEMA_VERSION,
    archiveId,
    sequence,
    previousEntrySha256,
    receiptSha256: receipt.receiptSha256,
    decision: receipt.decision,
    parentId: receipt.parentId,
    candidateId: receipt.candidateId,
    gateRunId: receipt.gateRunId,
    receipt: clone(receipt),
  };
  return { ...body, archiveEntrySha256: archiveEntryHash(body) };
}

export function verifyArchiveEntry(entry, previousEntry = null) {
  if (!isRecord(entry)) return { ok: false, error: 'archive entry must be an object' };
  if (entry.kind !== 'atomic-self-evolution-archive-entry') return { ok: false, error: 'archive entry kind mismatch' };
  const recomputedHash = archiveEntryHash(entry);
  if (entry.archiveEntrySha256 !== recomputedHash) {
    return {
      ok: false,
      error: `archive entry sha256 mismatch; declared ${entry.archiveEntrySha256}, recomputed ${recomputedHash}`,
      archiveHashValid: false,
      archiveEntrySha256: recomputedHash,
    };
  }
  const previousEntrySha256 = previousEntry ? archiveEntryHash(previousEntry) : null;
  if (previousEntry && previousEntry.archiveEntrySha256 !== previousEntrySha256) {
    return { ok: false, error: 'previous archive entry sha256 mismatch', archiveHashValid: true };
  }
  if ((entry.previousEntrySha256 ?? null) !== previousEntrySha256) {
    return { ok: false, error: 'archive previousEntrySha256 does not match supplied previous entry', archiveHashValid: true };
  }
  const expectedSequence = previousEntry ? asNumber(previousEntry.sequence, 0) + 1 : 1;
  if (entry.sequence !== expectedSequence) {
    return { ok: false, error: `archive sequence ${entry.sequence} does not match expected ${expectedSequence}`, archiveHashValid: true };
  }
  const receiptVerified = verifyPromotionReceipt(entry.receipt);
  if (receiptVerified.ok !== true) {
    return { ok: false, error: `embedded promotion receipt rejected: ${receiptVerified.error}`, archiveHashValid: true };
  }
  if (entry.receiptSha256 !== entry.receipt.receiptSha256) return { ok: false, error: 'archive receiptSha256 does not match embedded receipt', archiveHashValid: true };
  for (const key of ['decision', 'parentId', 'candidateId', 'gateRunId']) {
    if (entry[key] !== entry.receipt[key]) return { ok: false, error: `archive ${key} does not match embedded receipt`, archiveHashValid: true };
  }
  return {
    ok: true,
    changed: false,
    archiveHashValid: true,
    archiveEntrySha256: recomputedHash,
    sequence: entry.sequence,
    previousEntrySha256,
    decision: entry.decision,
    candidateId: entry.candidateId,
    receiptSha256: entry.receiptSha256,
  };
}

export function verifyArchiveChain(entries) {
  if (!Array.isArray(entries)) return { ok: false, error: 'archive chain must be an array' };
  let previousEntry = null;
  let archiveId = null;
  const decisions = { promote: 0, reject: 0, other: 0 };
  const verifiedEntries = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!isRecord(entry)) return { ok: false, error: `archive entry ${index + 1} must be an object`, index };
    if (archiveId === null) archiveId = entry.archiveId ?? null;
    else if (entry.archiveId !== archiveId) {
      return {
        ok: false,
        error: `archive entry ${index + 1} archiveId ${String(entry.archiveId)} does not match chain archiveId ${String(archiveId)}`,
        index,
      };
    }
    const verified = verifyArchiveEntry(entry, previousEntry);
    if (verified.ok !== true) {
      return {
        ok: false,
        error: `archive entry ${index + 1} rejected: ${verified.error}`,
        index,
        detail: verified,
      };
    }
    if (entry.decision === 'promote') decisions.promote += 1;
    else if (entry.decision === 'reject') decisions.reject += 1;
    else decisions.other += 1;
    verifiedEntries.push({
      sequence: entry.sequence,
      archiveEntrySha256: entry.archiveEntrySha256,
      previousEntrySha256: entry.previousEntrySha256 ?? null,
      receiptSha256: entry.receiptSha256,
      decision: entry.decision,
      candidateId: entry.candidateId,
    });
    previousEntry = entry;
  }
  return {
    ok: true,
    changed: false,
    archiveId,
    entryCount: entries.length,
    headArchiveEntrySha256: previousEntry?.archiveEntrySha256 ?? null,
    decisions,
    entries: verifiedEntries,
  };
}

export function parseArchiveJsonl(text) {
  const raw = String(text ?? '');
  const lines = raw.split(/\r?\n/);
  const entries = [];
  let nonEmptyLineCount = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line.length === 0) continue;
    nonEmptyLineCount += 1;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      return {
        ok: false,
        error: `archive JSONL line ${index + 1} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        line: index + 1,
      };
    }
    if (!isRecord(parsed)) return { ok: false, error: `archive JSONL line ${index + 1} must be an object`, line: index + 1 };
    entries.push(parsed);
  }
  return { ok: true, changed: false, entries, lineCount: lines.length, nonEmptyLineCount };
}

export function verifyArchiveJsonl(archiveText) {
  const parsed = parseArchiveJsonl(archiveText);
  if (parsed.ok !== true) return parsed;
  const chain = verifyArchiveChain(parsed.entries);
  return {
    ...chain,
    format: 'jsonl',
    lineCount: parsed.lineCount,
    nonEmptyLineCount: parsed.nonEmptyLineCount,
  };
}

function normalizeArchiveText(archiveText) {
  const trimmed = String(archiveText ?? '').trimEnd();
  return trimmed.length === 0 ? '' : `${trimmed}\n`;
}

export function appendArchiveJsonl({ archiveText = '', archiveId = 'atomic-self-evolution-archive-v1', receipt }) {
  const parsed = parseArchiveJsonl(archiveText);
  if (parsed.ok !== true) return parsed;
  const existingChain = verifyArchiveChain(parsed.entries);
  if (existingChain.ok !== true) {
    return {
      ok: false,
      error: `existing archive rejected: ${existingChain.error}`,
      detail: existingChain,
    };
  }
  const previousEntry = parsed.entries.length > 0 ? parsed.entries[parsed.entries.length - 1] : null;
  const effectiveArchiveId = previousEntry?.archiveId ?? archiveId;
  const entry = buildArchiveEntry({ archiveId: effectiveArchiveId, previousEntry, receipt });
  const nextArchiveText = `${normalizeArchiveText(archiveText)}${JSON.stringify(entry)}\n`;
  const verified = verifyArchiveJsonl(nextArchiveText);
  return {
    ok: verified.ok === true,
    changed: true,
    archiveId: effectiveArchiveId,
    entry,
    archiveText: nextArchiveText,
    chain: verified,
  };
}

function compareDecision(receipt, recomputed) {
  const keys = [
    'schemaVersion',
    'policyId',
    'parentId',
    'candidateId',
    'benchmarkSuiteSha256',
    'evaluatorSha256',
    'decision',
    'gateRunId',
  ];
  for (const key of keys) {
    if (receipt[key] !== recomputed[key]) return `receipt ${key} contradicts recomputed decision`;
  }
  for (const key of ['deltas', 'reasons', 'rejections']) {
    if (!sameJson(receipt[key], recomputed[key])) return `receipt ${key} contradicts recomputed decision`;
  }
  return null;
}

export function verifyPromotionReceipt(receipt) {
  if (!isRecord(receipt)) return { ok: false, error: 'receipt must be an object' };
  if (receipt.kind !== 'atomic-self-evolution-promotion-receipt') {
    return { ok: false, error: 'receipt kind mismatch' };
  }
  const recomputedHash = promotionReceiptHash(receipt);
  if (receipt.receiptSha256 !== recomputedHash) {
    return {
      ok: false,
      error: `receipt sha256 mismatch; declared ${receipt.receiptSha256}, recomputed ${recomputedHash}`,
      receiptHashValid: false,
      receiptSha256: recomputedHash,
    };
  }
  const recomputed = decidePromotion({ parent: receipt.parent, candidate: receipt.candidate, policy: receipt.policy });
  const contradiction = compareDecision(receipt, recomputed);
  if (contradiction) {
    return {
      ok: false,
      error: `receipt decision does not recompute from embedded facts: ${contradiction}`,
      receiptHashValid: true,
      receiptSha256: recomputedHash,
      recomputedDecision: recomputed.decision,
      declaredDecision: receipt.decision,
    };
  }
  return {
    ok: true,
    changed: false,
    receiptHashValid: true,
    receiptSha256: recomputedHash,
    decision: receipt.decision,
    rejections: receipt.rejections,
    reasons: receipt.reasons,
    gateRunId: receipt.gateRunId,
  };
}

function parseJsonInput(stdinText) {
  const trimmed = String(stdinText ?? '').trim();
  return trimmed.length === 0 ? {} : JSON.parse(trimmed);
}

function cliSelfTest() {
  const policy = {
    policyId: 'atomic-self-evolution-cli-v1',
    benchmarkSuiteSha256: canonicalSha256({ suite: 'self-evolution-cli', version: 1 }),
    evaluatorSha256: canonicalSha256({ evaluator: 'kernel-fixed-promotion-rules', version: 1 }),
    requiredGates: ['build', 'type', 'security', 'no-bypass'],
    safetyCeilings: {
      bypassesIntroduced: 0,
      invalidCommits: 0,
      receiptForgeryAccepted: 0,
    },
  };
  const parent = {
    variantId: 'atomic-cli-parent',
    parentId: null,
    evaluatorSha256: policy.evaluatorSha256,
    benchmarkSuiteSha256: policy.benchmarkSuiteSha256,
    metrics: {
      publicScore: 10,
      holdoutScore: 10,
      proofCoverage: 4,
      semanticOperators: 3,
      medianLatencyMs: 100,
      bypassesIntroduced: 0,
      invalidCommits: 0,
      receiptForgeryAccepted: 0,
    },
    gates: policy.requiredGates.map((id) => ({ id, status: 'passed' })),
  };
  const candidate = {
    ...parent,
    variantId: 'atomic-cli-child',
    parentId: parent.variantId,
    metrics: {
      ...parent.metrics,
      publicScore: 11,
      holdoutScore: 11,
      proofCoverage: 5,
      medianLatencyMs: 90,
    },
  };
  const receipt = buildPromotionReceipt({ parent, candidate, policy });
  const receiptVerified = verifyPromotionReceipt(receipt);
  const archiveEntry = buildArchiveEntry({ archiveId: 'atomic-self-evolution-cli', receipt });
  const archiveVerified = verifyArchiveEntry(archiveEntry);
  return {
    ok: receiptVerified.ok === true && archiveVerified.ok === true,
    receiptVerified,
    archiveVerified,
  };
}

export function runCli(argv = [], stdinText = '') {
  const mode = argv[0] ?? '--help';
  try {
    if (mode === '--help') {
      return {
        ok: true,
        modes: [
          '--self-test',
          '--decide',
          '--receipt',
          '--verify-receipt',
          '--archive-entry',
          '--verify-archive-entry',
          '--verify-archive-chain',
          '--verify-archive-jsonl',
          '--append-archive-jsonl',
        ],
      };
    }
    if (mode === '--self-test') return cliSelfTest();
    const input = parseJsonInput(stdinText);
    if (mode === '--decide') return { ok: true, decision: decidePromotion(input) };
    if (mode === '--receipt') return { ok: true, receipt: buildPromotionReceipt(input) };
    if (mode === '--verify-receipt') return verifyPromotionReceipt(input.receipt ?? input);
    if (mode === '--archive-entry') return { ok: true, entry: buildArchiveEntry(input) };
    if (mode === '--verify-archive-entry') return verifyArchiveEntry(input.entry ?? input, input.previousEntry ?? null);
    if (mode === '--verify-archive-chain') return verifyArchiveChain(Array.isArray(input) ? input : input.entries);
    if (mode === '--verify-archive-jsonl') return verifyArchiveJsonl(input.archiveText ?? input.text ?? input);
    if (mode === '--append-archive-jsonl') return appendArchiveJsonl(input);
    return { ok: false, error: `unknown self-evolution harness mode: ${mode}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
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
  const inputFile = process.env.ATOMIC_SELF_EVOLUTION_INPUT_FILE;
  const stdinText = needsInput ? (inputFile ? fs.readFileSync(inputFile, 'utf8') : fs.readFileSync(0, 'utf8')) : '';
  const result = runCli([mode], stdinText);
  const rendered = JSON.stringify(result, null, 2) + '\n';
  const outputFile = process.env.ATOMIC_SELF_EVOLUTION_OUTPUT_FILE;
  if (outputFile) {
    fs.writeFileSync(outputFile, rendered);
    process.stdout.write(
      JSON.stringify({ ok: result.ok !== false, outputFile, bytes: Buffer.byteLength(rendered, 'utf8') }) + '\n',
    );
  } else {
    process.stdout.write(rendered);
  }
  process.exit(result.ok === false ? 1 : 0);
}
