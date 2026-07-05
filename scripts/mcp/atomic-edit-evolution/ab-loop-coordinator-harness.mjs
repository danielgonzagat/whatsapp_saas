#!/usr/bin/env node
/**
 * ab-loop-coordinator-harness.mjs — pure coordinator for one A/B loop
 * iteration. It composes existing gates; it does not launch workers, write disk,
 * or special-case a task fixture.
 */
import { evaluateLoopState } from './ab-loop-admission-harness.mjs';
import { appendLoopEvaluationJsonl } from './ab-loop-ledger-harness.mjs';
import { formalizeAtomicLosses } from './ab-loss-formalizer-harness.mjs';
import { ingestRoundManifests } from './ab-round-ingest-harness.mjs';
import { scoreRound } from './ab-round-harness.mjs';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(error, extra = {}) {
  return { ok: false, error, ...extra };
}

function parseJsonInput(stdinText) {
  try {
    return { ok: true, value: JSON.parse(stdinText || '{}') };
  } catch (error) {
    return { ok: false, error: `invalid JSON input: ${error.message}` };
  }
}

function normalizeIterationInput(input) {
  if (!Array.isArray(input.manifests)) return { ok: true, input, ingestedRound: null };
  const ingestedRound = ingestRoundManifests({
    roundId: input.roundId,
    task: input.task,
    baselineCommit: input.baselineCommit,
    manifests: input.manifests,
  });
  if (ingestedRound.ok !== true) return fail(`manifest ingestion failed: ${ingestedRound.error}`, { ingestedRound });
  const existingRounds = Array.isArray(input.rounds) ? input.rounds : [];
  return {
    ok: true,
    input: {
      ...input,
      rounds: [...existingRounds, ingestedRound.round],
    },
    ingestedRound,
  };
}

function buildLossBrief({ input, evaluation }) {
  if (evaluation.action !== 'IMPROVE_ATOMIC') return { ok: true, lossBrief: null };
  const rounds = Array.isArray(input.rounds) ? input.rounds : [];
  const latestRawRound = rounds[rounds.length - 1];
  if (!latestRawRound) return fail('cannot formalize Atomic losses without a latest round');
  const scoredRound = scoreRound(latestRawRound);
  if (scoredRound.ok !== true) return fail(`latest round scoring failed: ${scoredRound.error}`, { scoredRound });
  const lossBrief = formalizeAtomicLosses({ scoredRound });
  if (lossBrief.ok !== true) return fail(`loss formalization failed: ${lossBrief.error ?? lossBrief.action}`, { lossBrief });
  return { ok: true, lossBrief };
}

export function runLoopIteration(input) {
  if (!isRecord(input)) return fail('input must be a JSON object');
  const normalized = normalizeIterationInput(input);
  if (normalized.ok !== true) return normalized;

  const loopInput = normalized.input;
  const evaluation = evaluateLoopState(loopInput);
  if (evaluation.ok !== true) {
    return fail(evaluation.error ?? 'loop evaluation failed', {
      action: evaluation.action ?? null,
      evaluation,
      ingestedRound: normalized.ingestedRound,
    });
  }

  const loss = buildLossBrief({ input: loopInput, evaluation });
  if (loss.ok !== true) {
    return fail(loss.error, {
      action: evaluation.action,
      evaluation,
      lossBrief: loss.lossBrief ?? null,
      scoredRound: loss.scoredRound ?? null,
      ingestedRound: normalized.ingestedRound,
    });
  }

  const appended = appendLoopEvaluationJsonl({
    ledgerText: loopInput.ledgerText ?? '',
    evaluation,
  });
  if (appended.ok !== true) {
    return fail(appended.error ?? 'loop ledger append failed', {
      action: evaluation.action,
      evaluation,
      lossBrief: loss.lossBrief,
      ingestedRound: normalized.ingestedRound,
    });
  }

  return {
    ok: true,
    action: evaluation.action,
    canStartRound: evaluation.canStartRound === true,
    evaluation,
    lossBrief: loss.lossBrief,
    ingestedRound: normalized.ingestedRound,
    ledgerRecord: appended.record,
    ledgerText: appended.ledgerText,
    chain: appended.chain,
    next: evaluation.next,
    honestCeiling: 'One pure loop iteration only: decision, optional universal loss brief, and hash-chained ledger text. It does not launch workers or prove real coding superiority.',
  };
}

export function runCli(argv, stdinText) {
  const args = Array.isArray(argv) ? argv : [];
  if (args.includes('--run-loop-iteration')) {
    const parsed = parseJsonInput(stdinText);
    if (!parsed.ok) return parsed;
    return runLoopIteration(parsed.value);
  }
  return fail('usage: node ab-loop-coordinator-harness.mjs --run-loop-iteration < input.json');
}

function isCliMain() {
  return process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href;
}

if (isCliMain()) {
  const chunks = [];
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', () => {
    const result = runCli(process.argv.slice(2), Buffer.concat(chunks).toString('utf8'));
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
  });
}
