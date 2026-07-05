#!/usr/bin/env node
/**
 * ab-loop-admission-harness.mjs — pure controller for the Codex A/B loop.
 * It decides whether the loop may start, repeat, improve Atomic, or escalate
 * from explicit policy and scored round records. It does not launch workers.
 */
import { scoreRound, MODES } from './ab-round-harness.mjs';

export const ACTIONS = Object.freeze({
  RUN_ROUND: 'RUN_ROUND',
  IMPROVE_ATOMIC: 'IMPROVE_ATOMIC',
  REPEAT_SAME_COMPLEXITY: 'REPEAT_SAME_COMPLEXITY',
  ESCALATE_COMPLEXITY: 'ESCALATE_COMPLEXITY',
  FIX_ROUND_RECORD: 'FIX_ROUND_RECORD',
  BLOCKED_POLICY: 'BLOCKED_POLICY',
});

const DEFAULT_REQUIRED_DOMINANCE_ROUNDS = 2;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(error) {
  return { ok: false, error, action: ACTIONS.FIX_ROUND_RECORD, canStartRound: false };
}

function positiveInteger(value, fallback) {
  if (!Number.isInteger(value) || value < 1) return fallback;
  return value;
}

function normalizePolicy(policy) {
  const input = isRecord(policy) ? policy : {};
  const factoryNoAtomicAllowed = input.factoryNoAtomicAllowed === true;
  const atomicMcpAllowed = input.atomicMcpAllowed !== false;
  const blockers = [];
  if (!factoryNoAtomicAllowed) {
    blockers.push(`${MODES.FACTORY} cannot run: factory/no-atomic path is not allowed by current tool policy`);
  }
  if (!atomicMcpAllowed) {
    blockers.push(`${MODES.ATOMIC} cannot run: atomic MCP path is not allowed by current tool policy`);
  }
  return {
    ok: blockers.length === 0,
    factoryNoAtomicAllowed,
    atomicMcpAllowed,
    reason: typeof input.reason === 'string' ? input.reason : null,
    blockers,
  };
}

function scoreSuppliedRounds(rounds) {
  const scored = [];
  for (const round of rounds) {
    const result = scoreRound(round);
    scored.push(result);
    if (!result.ok) {
      return { ok: false, scored, error: result.error };
    }
  }
  return { ok: true, scored, error: null };
}

function dominanceStreak(scoredRounds) {
  let streak = 0;
  for (let index = scoredRounds.length - 1; index >= 0; index -= 1) {
    if (scoredRounds[index]?.decision?.escalateComplexity === true) {
      streak += 1;
      continue;
    }
    break;
  }
  return streak;
}

function latestRound(scoredRounds) {
  return scoredRounds.length > 0 ? scoredRounds[scoredRounds.length - 1] : null;
}

function baseResponse({ input, policy, scoredRounds, requiredDominanceRounds }) {
  const latest = latestRound(scoredRounds);
  return {
    ok: true,
    complexity: typeof input.complexity === 'string' && input.complexity.trim() ? input.complexity : null,
    canStartRound: policy.ok,
    policy,
    roundsSeen: scoredRounds.length,
    requiredDominanceRounds,
    dominanceStreak: dominanceStreak(scoredRounds),
    latestRoundId: latest?.roundId ?? null,
    latestDecision: latest?.decision ?? null,
    atomicLosses: latest?.atomicLosses ?? [],
    factoryLosses: latest?.factoryLosses ?? [],
    blockers: [...policy.blockers],
    honestCeiling: 'Loop admission only. This does not launch workers, inspect workspaces, or prove real coding superiority.',
  };
}

export function evaluateLoopState(input) {
  if (!isRecord(input)) return fail('input must be a JSON object');
  const rounds = Array.isArray(input.rounds) ? input.rounds : null;
  if (!rounds) return fail('rounds must be an array');
  const policy = normalizePolicy(input.policy);
  const requiredDominanceRounds = positiveInteger(input.requiredDominanceRounds, DEFAULT_REQUIRED_DOMINANCE_ROUNDS);
  const scored = scoreSuppliedRounds(rounds);
  if (!scored.ok) {
    return {
      ok: false,
      error: scored.error,
      action: ACTIONS.FIX_ROUND_RECORD,
      canStartRound: false,
      scoredRounds: scored.scored,
    };
  }

  const response = baseResponse({ input, policy, scoredRounds: scored.scored, requiredDominanceRounds });
  if (!policy.ok) {
    return {
      ...response,
      action: ACTIONS.BLOCKED_POLICY,
      canStartRound: false,
      next: 'change tool policy or do not claim a valid A/B round',
    };
  }

  if (scored.scored.length === 0) {
    return {
      ...response,
      action: ACTIONS.RUN_ROUND,
      next: 'run both isolated arms at the current complexity',
    };
  }

  const latest = latestRound(scored.scored);
  if (latest.atomicLosses.length > 0) {
    return {
      ...response,
      action: ACTIONS.IMPROVE_ATOMIC,
      next: 'formalize Atomic losses and improve only general Atomic capability before repeating this complexity',
    };
  }

  if (latest.decision?.headToHeadComplete !== true || latest.decision?.validationComplete !== true) {
    return {
      ...response,
      action: ACTIONS.REPEAT_SAME_COMPLEXITY,
      next: 'repeat the same complexity because the latest head-to-head is incomplete or under-validated',
    };
  }

  if (latest.decision?.escalateComplexity === true && response.dominanceStreak >= requiredDominanceRounds) {
    return {
      ...response,
      action: ACTIONS.ESCALATE_COMPLEXITY,
      next: 'increase task complexity for the next loop round',
    };
  }

  return {
    ...response,
    action: ACTIONS.REPEAT_SAME_COMPLEXITY,
    next: 'repeat the same complexity until Atomic has enough consecutive dominance evidence',
  };
}

function parseJsonInput(stdinText) {
  if (!stdinText || !stdinText.trim()) throw new Error('stdin JSON is required');
  return JSON.parse(stdinText);
}

export function runCli(argv, stdinText) {
  if (argv.includes('--evaluate')) {
    try {
      return evaluateLoopState(parseJsonInput(stdinText));
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error));
    }
  }
  return {
    ok: false,
    action: ACTIONS.FIX_ROUND_RECORD,
    error: 'usage: node ab-loop-admission-harness.mjs --evaluate < input.json',
    inputShape: '{ complexity, policy, requiredDominanceRounds, rounds }',
  };
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
