#!/usr/bin/env node
/**
 * ab-loss-formalizer-harness.mjs — turns measured Atomic losses into universal
 * improvement briefs. It never proposes task-specific patches.
 */

const ACTIONS = Object.freeze({
  IMPROVE_ATOMIC: 'IMPROVE_ATOMIC',
  NO_ATOMIC_LOSS: 'NO_ATOMIC_LOSS',
  ROUND_EVIDENCE_INCOMPLETE: 'ROUND_EVIDENCE_INCOMPLETE',
  INVALID_INPUT: 'INVALID_INPUT',
});

const CLASS_BY_CATEGORY = Object.freeze({
  correctness: 'atomic-correctness-repair',
  compliance: 'atomic-policy-hardening',
  speed: 'atomic-fast-path',
  diffSize: 'atomic-preservation-topology',
  validation: 'atomic-validation-routing',
  operationalCost: 'atomic-operational-cost-routing',
  overall: 'atomic-system-balance',
});

const PRINCIPLE_BY_CATEGORY = Object.freeze({
  correctness: 'improve semantic operation routing or pre-write behavioral proof without narrowing to one task fixture',
  compliance: 'harden tool-policy enforcement, bypass detection, and allowed-writer accounting for all tasks',
  speed: 'add or route to macro-atomic fast paths that preserve validation while reducing tool calls and elapsed time',
  diffSize: 'improve preservation topology so unchanged anchors are retained and mutation surface shrinks generally',
  validation: 'route to the smallest sufficient validation lattice and reject unvalidated completion claims generally',
  operationalCost: 'reduce tokens, commands, and tool calls through general macro-atomic routing, receipt compaction, and prompt minimization without reducing proof quality',
  overall: 'rebalance orchestration policy across cost, speed, proof, and correctness without special-casing a scenario',
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function categoryClass(category) {
  return CLASS_BY_CATEGORY[category] ?? 'atomic-general-capability';
}

function categoryPrinciple(category) {
  return PRINCIPLE_BY_CATEGORY[category] ?? 'improve the general Atomic operating system capability represented by this measured loss';
}

function roundEvidenceIncomplete(scoredRound) {
  const decision = scoredRound?.decision;
  return decision?.headToHeadComplete !== true || decision?.validationComplete !== true;
}

function lossToBrief(loss, scoredRound) {
  return {
    category: loss.category,
    winnerMode: loss.winnerMode ?? null,
    improvementClass: categoryClass(loss.category),
    scope: 'universal',
    taskSpecific: false,
    principle: categoryPrinciple(loss.category),
    evidence: {
      roundId: scoredRound.roundId ?? null,
      reason: loss.reason ?? null,
      measured: loss.measured ?? null,
    },
    acceptance: [
      'must improve the measured category on repeated rounds of this class',
      'must not encode task names, file paths, literals, or fixtures as winning conditions',
      'must preserve Atomic governance, trace, rollback, and validation guarantees',
    ],
    prohibited: [
      'task-specific patch',
      'fixture-specific rule',
      'benchmark-only shortcut',
      'validation bypass',
    ],
  };
}

export function formalizeAtomicLosses({ scoredRound }) {
  if (!isRecord(scoredRound) || scoredRound.ok !== true) {
    return { ok: false, action: ACTIONS.INVALID_INPUT, error: 'scoredRound must be an ok scoreRound result' };
  }
  const losses = asArray(scoredRound.atomicLosses);
  if (losses.length > 0) {
    return {
      ok: true,
      action: ACTIONS.IMPROVE_ATOMIC,
      roundId: scoredRound.roundId ?? null,
      items: losses.map((loss) => lossToBrief(loss, scoredRound)),
      reasons: losses.map((loss) => loss.reason).filter(Boolean),
      evidenceLimit: roundEvidenceIncomplete(scoredRound) ? 'round_not_escalatable_but_atomic_losses_are_measured' : null,
      honestCeiling: 'Universal improvement briefs only. This does not implement or validate an Atomic tool upgrade.',
    };
  }
  if (roundEvidenceIncomplete(scoredRound)) {
    return {
      ok: true,
      action: ACTIONS.ROUND_EVIDENCE_INCOMPLETE,
      roundId: scoredRound.roundId ?? null,
      items: [],
      reasons: asArray(scoredRound.decision?.reasons),
      honestCeiling: 'Incomplete or under-validated rounds without measured Atomic losses cannot justify Atomic tool changes.',
    };
  }
  return {
    ok: true,
    action: ACTIONS.NO_ATOMIC_LOSS,
    roundId: scoredRound.roundId ?? null,
    items: [],
    reasons: [],
    honestCeiling: 'No measured Atomic losses were present in this scored round.',
  };
}

function parseJsonInput(stdinText) {
  if (!stdinText || !stdinText.trim()) throw new Error('stdin JSON is required');
  return JSON.parse(stdinText);
}

export function runCli(argv, stdinText) {
  try {
    if (argv.includes('--formalize-losses')) {
      const input = parseJsonInput(stdinText);
      return formalizeAtomicLosses({ scoredRound: input.scoredRound ?? input });
    }
    return {
      ok: false,
      action: ACTIONS.INVALID_INPUT,
      error: 'usage: node ab-loss-formalizer-harness.mjs --formalize-losses < input.json',
    };
  } catch (error) {
    return { ok: false, action: ACTIONS.INVALID_INPUT, error: error instanceof Error ? error.message : String(error) };
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
