#!/usr/bin/env node
/**
 * ab-loop-ledger-harness.mjs — hash-chained ledger for Codex A/B loop decisions.
 * Pure functions only: callers decide where to persist returned JSONL text.
 */
import crypto from 'node:crypto';

const SCHEMA_VERSION = 1;
const KIND = 'atomic-ab-loop-evaluation-record';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalSha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function recordHash(record) {
  const copy = { ...record };
  delete copy.recordSha256;
  return canonicalSha256(copy);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asInteger(value, fallback = 0) {
  return Number.isInteger(value) ? value : fallback;
}

function normalizePolicy(policy) {
  if (!isRecord(policy)) return null;
  return {
    ok: policy.ok === true,
    factoryNoAtomicAllowed: policy.factoryNoAtomicAllowed === true,
    atomicMcpAllowed: policy.atomicMcpAllowed === true,
    reason: typeof policy.reason === 'string' ? policy.reason : null,
    blockers: asArray(policy.blockers).map(String),
  };
}

function buildLoopRecord({ previousRecord, evaluation }) {
  if (!isRecord(evaluation)) return { ok: false, error: 'evaluation must be an object' };
  if (evaluation.ok !== true) return { ok: false, error: 'only ok loop evaluations can be appended' };
  if (typeof evaluation.action !== 'string' || !evaluation.action) return { ok: false, error: 'evaluation.action is required' };
  const body = {
    schemaVersion: SCHEMA_VERSION,
    kind: KIND,
    sequence: previousRecord ? previousRecord.sequence + 1 : 1,
    previousRecordSha256: previousRecord ? previousRecord.recordSha256 : null,
    complexity: typeof evaluation.complexity === 'string' ? evaluation.complexity : null,
    action: evaluation.action,
    canStartRound: evaluation.canStartRound === true,
    roundsSeen: asInteger(evaluation.roundsSeen),
    requiredDominanceRounds: asInteger(evaluation.requiredDominanceRounds),
    dominanceStreak: asInteger(evaluation.dominanceStreak),
    latestRoundId: typeof evaluation.latestRoundId === 'string' ? evaluation.latestRoundId : null,
    latestDecision: evaluation.latestDecision ?? null,
    atomicLosses: asArray(evaluation.atomicLosses),
    factoryLosses: asArray(evaluation.factoryLosses),
    blockers: asArray(evaluation.blockers).map(String),
    next: typeof evaluation.next === 'string' ? evaluation.next : null,
    policy: normalizePolicy(evaluation.policy),
    evaluationSha256: canonicalSha256(evaluation),
  };
  return { ok: true, record: { ...body, recordSha256: recordHash(body) } };
}

function parseLedgerJsonl(text) {
  const normalized = String(text ?? '').trim();
  if (!normalized) return { ok: true, records: [] };
  const records = [];
  const lines = normalized.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    try {
      const parsed = JSON.parse(lines[index]);
      if (!isRecord(parsed)) return { ok: false, error: `ledger line ${index + 1} must be an object` };
      records.push(parsed);
    } catch (error) {
      return { ok: false, error: `ledger line ${index + 1} is invalid JSON: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
  return { ok: true, records };
}

function verifyRecord(record, previousSha, expectedSequence, index) {
  if (record.kind !== KIND) return { ok: false, error: `ledger record ${index + 1} has unknown kind` };
  if (record.schemaVersion !== SCHEMA_VERSION) return { ok: false, error: `ledger record ${index + 1} has unsupported schemaVersion` };
  if (record.sequence !== expectedSequence) return { ok: false, error: `ledger record ${index + 1} has invalid sequence` };
  if ((record.previousRecordSha256 ?? null) !== previousSha) return { ok: false, error: `ledger record ${index + 1} breaks the chain` };
  const recomputed = recordHash(record);
  if (record.recordSha256 !== recomputed) {
    return { ok: false, error: `ledger record ${index + 1} recordSha256 mismatch (declared ${record.recordSha256}, recomputed ${recomputed})` };
  }
  if (typeof record.action !== 'string' || !record.action) return { ok: false, error: `ledger record ${index + 1} missing action` };
  if (typeof record.evaluationSha256 !== 'string' || record.evaluationSha256.length !== 64) return { ok: false, error: `ledger record ${index + 1} missing evaluationSha256` };
  return { ok: true, recordSha256: recomputed };
}

export function verifyLoopLedgerJsonl(text) {
  const parsed = parseLedgerJsonl(text);
  if (!parsed.ok) return parsed;
  let previousSha = null;
  const actions = [];
  for (let index = 0; index < parsed.records.length; index += 1) {
    const record = parsed.records[index];
    const checked = verifyRecord(record, previousSha, index + 1, index);
    if (!checked.ok) return checked;
    previousSha = checked.recordSha256;
    actions.push(record.action);
  }
  return {
    ok: true,
    recordCount: parsed.records.length,
    headRecordSha256: previousSha,
    actions,
    latestAction: actions.length > 0 ? actions[actions.length - 1] : null,
  };
}

export function appendLoopEvaluationJsonl({ ledgerText = '', evaluation }) {
  const verified = verifyLoopLedgerJsonl(ledgerText);
  if (verified.ok !== true) return { ok: false, error: `existing ledger rejected: ${verified.error}` };
  const parsed = parseLedgerJsonl(ledgerText);
  const previousRecord = parsed.records.length > 0 ? parsed.records[parsed.records.length - 1] : null;
  const built = buildLoopRecord({ previousRecord, evaluation });
  if (!built.ok) return built;
  const normalized = String(ledgerText ?? '').trimEnd();
  const ledgerNext = `${normalized}${normalized ? '\n' : ''}${JSON.stringify(built.record)}\n`;
  const verifyNext = verifyLoopLedgerJsonl(ledgerNext);
  return {
    ok: verifyNext.ok === true,
    changed: true,
    record: built.record,
    ledgerText: ledgerNext,
    chain: verifyNext,
    error: verifyNext.ok === true ? null : verifyNext.error,
  };
}

export function latestLoopEvaluation({ ledgerText = '' }) {
  const verified = verifyLoopLedgerJsonl(ledgerText);
  if (verified.ok !== true) return verified;
  const parsed = parseLedgerJsonl(ledgerText);
  const record = parsed.records.length > 0 ? parsed.records[parsed.records.length - 1] : null;
  return { ok: true, record, chain: verified };
}

function parseJsonInput(stdinText) {
  if (!stdinText || !stdinText.trim()) throw new Error('stdin JSON is required');
  return JSON.parse(stdinText);
}

export function runCli(argv, stdinText) {
  try {
    const input = parseJsonInput(stdinText);
    if (argv.includes('--append-loop-evaluation-jsonl')) {
      return appendLoopEvaluationJsonl({ ledgerText: input.ledgerText ?? '', evaluation: input.evaluation });
    }
    if (argv.includes('--verify-loop-ledger-jsonl')) {
      return verifyLoopLedgerJsonl(input.ledgerText ?? input.text ?? '');
    }
    if (argv.includes('--latest-loop-evaluation')) {
      return latestLoopEvaluation({ ledgerText: input.ledgerText ?? input.text ?? '' });
    }
    return {
      ok: false,
      error: 'usage: node ab-loop-ledger-harness.mjs --append-loop-evaluation-jsonl|--verify-loop-ledger-jsonl|--latest-loop-evaluation < input.json',
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function isCliMain() {
  if (!process.argv[1]) return false;
  const current = new URL(import.meta.url).pathname;
  return process.argv[1] === current;
}

if (isCliMain()) {
  const result = runCli(process.argv.slice(2), await new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
  }));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 1);
}
