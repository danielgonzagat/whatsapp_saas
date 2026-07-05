#!/usr/bin/env node
/**
 * ab-round-harness.mjs — deterministic scorer for one Codex A/B round.
 *
 * Library functions are pure: they validate and score supplied JSON, and never
 * write to disk. The executable CLI reads JSON from stdin and prints JSON.
 */
import * as fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MODES = Object.freeze({
  FACTORY: 'FACTORY_BLOCK_ATOMIC',
  ATOMIC: 'ALL_IN_ATOMIC',
});

const MODE_ORDER = Object.freeze([MODES.FACTORY, MODES.ATOMIC]);
const CATEGORIES = Object.freeze(['correctness', 'compliance', 'speed', 'diffSize', 'validation', 'operationalCost', 'overall']);

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function fail(error) {
  return { ok: false, error };
}

function requireNumber(path, value) {
  if (!finiteNumber(value)) return `${path} must be a finite number`;
  return null;
}

function validateArmShape(arm, index) {
  const prefix = `arms[${index}]`;
  if (!isRecord(arm)) return `${prefix} must be an object`;
  if (!nonEmptyString(arm.armId)) return `${prefix}.armId must be a non-empty string`;
  if (!MODE_ORDER.includes(arm.mode)) return `${prefix}.mode must be ${MODES.FACTORY} or ${MODES.ATOMIC}`;
  if (!nonEmptyString(arm.status)) return `${prefix}.status must be a non-empty string`;
  for (const field of ['startedAtMs', 'finishedAtMs']) {
    const error = requireNumber(`${prefix}.${field}`, arm[field]);
    if (error) return error;
  }
  if (arm.finishedAtMs < arm.startedAtMs) return `${prefix}.finishedAtMs must be >= startedAtMs`;
  if (!Array.isArray(arm.changedFiles) || !arm.changedFiles.every(nonEmptyString)) {
    return `${prefix}.changedFiles must be an array of non-empty strings`;
  }
  if (!isRecord(arm.diffStats)) return `${prefix}.diffStats must be an object`;
  for (const field of ['files', 'insertions', 'deletions']) {
    const error = requireNumber(`${prefix}.diffStats.${field}`, arm.diffStats[field]);
    if (error) return error;
    if (arm.diffStats[field] < 0) return `${prefix}.diffStats.${field} must be >= 0`;
  }
  if (!Array.isArray(arm.validation)) return `${prefix}.validation must be an array`;
  for (let i = 0; i < arm.validation.length; i += 1) {
    const item = arm.validation[i];
    if (!isRecord(item)) return `${prefix}.validation[${i}] must be an object`;
    if (!nonEmptyString(item.command)) return `${prefix}.validation[${i}].command must be a non-empty string`;
    if (typeof item.ok !== 'boolean') return `${prefix}.validation[${i}].ok must be boolean`;
  }
  if (!isRecord(arm.tooling)) return `${prefix}.tooling must be an object`;
  for (const field of ['atomicEditOperations', 'forbiddenWrites']) {
    const error = requireNumber(`${prefix}.tooling.${field}`, arm.tooling[field]);
    if (error) return error;
    if (arm.tooling[field] < 0) return `${prefix}.tooling.${field} must be >= 0`;
  }
  if (arm.tooling.shellWriteOperations !== undefined) {
    const error = requireNumber(`${prefix}.tooling.shellWriteOperations`, arm.tooling.shellWriteOperations);
    if (error) return error;
    if (arm.tooling.shellWriteOperations < 0) return `${prefix}.tooling.shellWriteOperations must be >= 0`;
  }
  if (arm.metrics !== undefined) {
    if (!isRecord(arm.metrics)) return `${prefix}.metrics must be an object when provided`;
    for (const field of ['inputTokens', 'outputTokens', 'toolCalls', 'commands']) {
      const value = arm.metrics[field];
      if (value !== undefined) {
        const error = requireNumber(`${prefix}.metrics.${field}`, value);
        if (error) return error;
        if (value < 0) return `${prefix}.metrics.${field} must be >= 0`;
      }
    }
  }
  return null;
}

function validateRound(input) {
  if (!isRecord(input)) return fail('input must be an object');
  for (const field of ['roundId', 'task', 'baselineCommit']) {
    if (!nonEmptyString(input[field])) return fail(`${field} must be a non-empty string`);
  }
  if (!Array.isArray(input.arms)) return fail('arms must be an array');
  if (input.arms.length !== 2) return fail(`exactly two arms are required: ${MODES.FACTORY} and ${MODES.ATOMIC}`);
  const modes = input.arms.map((arm, index) => {
    const error = validateArmShape(arm, index);
    if (error) return { error };
    return { mode: arm.mode };
  });
  const shapeError = modes.find((entry) => entry.error)?.error;
  if (shapeError) return fail(shapeError);
  const seen = new Set(input.arms.map((arm) => arm.mode));
  for (const mode of MODE_ORDER) {
    if (!seen.has(mode)) return fail(`missing required arm mode: ${mode}`);
  }
  if (seen.size !== 2) return fail(`exactly one arm per required mode is required: ${MODES.FACTORY} and ${MODES.ATOMIC}`);
  return { ok: true };
}

function validationSummary(validation) {
  const passed = validation.filter((item) => item.ok === true).length;
  const failed = validation.length - passed;
  return { pass: passed, fail: failed, passed, failed, total: validation.length };
}

function complianceForArm(arm) {
  const reasons = [];
  if (arm.mode === MODES.FACTORY && arm.tooling.atomicEditOperations !== 0) {
    reasons.push(`FACTORY_BLOCK_ATOMIC used ${arm.tooling.atomicEditOperations} atomic edit operation(s)`);
  }
  if (arm.mode === MODES.ATOMIC && arm.tooling.atomicEditOperations === 0) {
    reasons.push('ALL_IN_ATOMIC reported zero atomic edit operations');
  }
  if (arm.mode === MODES.ATOMIC && (arm.tooling.shellWriteOperations ?? 0) !== 0) {
    reasons.push(`ALL_IN_ATOMIC reported ${arm.tooling.shellWriteOperations} shell write operation(s)`);
  }
  if (arm.tooling.forbiddenWrites !== 0) {
    reasons.push(`${arm.mode} reported ${arm.tooling.forbiddenWrites} forbidden write(s)`);
  }
  return {
    ok: reasons.length === 0,
    reasons,
    measured: {
      atomicEditOperations: arm.tooling.atomicEditOperations,
      forbiddenWrites: arm.tooling.forbiddenWrites,
      shellWriteOperations: arm.tooling.shellWriteOperations ?? 0,
    },
  };
}

function diffMagnitude(diffStats) {
  return diffStats.files * 20 + diffStats.insertions + diffStats.deletions;
}

const OPERATIONAL_COST_WEIGHTS = Object.freeze({
  inputTokens: 1,
  outputTokens: 1,
  toolCalls: 200,
  commands: 250,
});

function metricsForArm(arm) {
  const metrics = isRecord(arm.metrics) ? arm.metrics : {};
  return {
    inputTokens: finiteNumber(metrics.inputTokens) ? metrics.inputTokens : 0,
    outputTokens: finiteNumber(metrics.outputTokens) ? metrics.outputTokens : 0,
    toolCalls: finiteNumber(metrics.toolCalls) ? metrics.toolCalls : 0,
    commands: finiteNumber(metrics.commands) ? metrics.commands : 0,
  };
}

function operationalCostForMetrics(metrics) {
  return Object.entries(OPERATIONAL_COST_WEIGHTS).reduce((sum, [field, weight]) => sum + metrics[field] * weight, 0);
}

function hasMeasuredOperationalCost(metrics) {
  return Object.values(metrics).some((value) => value > 0);
}

function statusCredit(status) {
  if (status === 'DONE') return 1;
  if (status === 'DONE_WITH_CONCERNS') return 0.5;
  return 0;
}

function deriveArm(arm) {
  const validation = validationSummary(arm.validation);
  const compliance = complianceForArm(arm);
  const elapsedMs = arm.finishedAtMs - arm.startedAtMs;
  const diffSize = diffMagnitude(arm.diffStats);
  const success = statusCredit(arm.status) === 1 && validation.failed === 0 && compliance.ok;
  const correctnessScore = statusCredit(arm.status) * 100;
  const complianceScore = compliance.ok ? 100 : Math.max(0, 100 - compliance.reasons.length * 60);
  const validationScore = validation.total === 0 ? 0 : (validation.passed / validation.total) * 100 - validation.failed * 25;
  const deliveryCredit = statusCredit(arm.status);
  const speedScore = deliveryCredit * (1000 / (1 + elapsedMs));
  const diffScore = deliveryCredit * (1000 / (1 + diffSize));
  const metrics = metricsForArm(arm);
  const operationalCost = operationalCostForMetrics(metrics);
  const hasOperationalMetrics = hasMeasuredOperationalCost(metrics);
  const operationalScore = hasOperationalMetrics ? deliveryCredit * (1000 / (1 + operationalCost / 100)) : 0;
  const weightedScore =
    correctnessScore * 0.32 +
    complianceScore * 0.22 +
    validationScore * 0.18 +
    diffScore * 0.1 +
    speedScore * 0.08 +
    operationalScore * 0.1;
  const overallScore = Number((deliveryCredit * weightedScore).toFixed(6));
  return {
    ...clone(arm),
    elapsedMs,
    validation,
    compliance,
    success,
    diffSize,
    metrics,
    operationalCost,
    hasOperationalMetrics,
    scores: {
      correctness: Number(correctnessScore.toFixed(6)),
      compliance: Number(complianceScore.toFixed(6)),
      validation: Number(validationScore.toFixed(6)),
      speed: Number(speedScore.toFixed(6)),
      diffSize: Number(diffScore.toFixed(6)),
      operationalCost: Number(operationalScore.toFixed(6)),
      overall: overallScore,
    },
  };
}

function categoryMeasurement(arm, category) {
  if (category === 'correctness') return { success: arm.success, status: arm.status, score: arm.scores.correctness };
  if (category === 'compliance') return { ok: arm.compliance.ok, reasons: arm.compliance.reasons, score: arm.scores.compliance };
  if (category === 'speed') return { elapsedMs: arm.elapsedMs, score: arm.scores.speed };
  if (category === 'diffSize') return { diffSize: arm.diffSize, diffStats: arm.diffStats, score: arm.scores.diffSize };
  if (category === 'validation') return { ...arm.validation, score: arm.scores.validation };
  if (category === 'operationalCost') {
    return { operationalCost: arm.operationalCost, metrics: arm.metrics, measured: arm.hasOperationalMetrics, score: arm.scores.operationalCost };
  }
  return { score: arm.scores.overall, success: arm.success };
}

function compareCategory(left, right, category) {
  if (category === 'operationalCost' && (!left.hasOperationalMetrics || !right.hasOperationalMetrics)) return 0;
  const leftScore = left.scores[category];
  const rightScore = right.scores[category];
  if (leftScore > rightScore) return -1;
  if (leftScore < rightScore) return 1;
  if (category === 'speed') {
    if (left.elapsedMs < right.elapsedMs) return -1;
    if (left.elapsedMs > right.elapsedMs) return 1;
  }
  if (category === 'diffSize') {
    if (left.diffSize < right.diffSize) return -1;
    if (left.diffSize > right.diffSize) return 1;
  }
  if (category === 'operationalCost') {
    if (!left.hasOperationalMetrics || !right.hasOperationalMetrics) return 0;
    if (left.operationalCost < right.operationalCost) return -1;
    if (left.operationalCost > right.operationalCost) return 1;
  }
  if (category === 'validation') {
    if (left.validation.failed < right.validation.failed) return -1;
    if (left.validation.failed > right.validation.failed) return 1;
    if (left.validation.passed > right.validation.passed) return -1;
    if (left.validation.passed < right.validation.passed) return 1;
  }
  return MODE_ORDER.indexOf(left.mode) - MODE_ORDER.indexOf(right.mode);
}

function winnerFor(category, armsByMode) {
  const arms = MODE_ORDER.map((mode) => armsByMode[mode]);
  const [first, second] = arms;
  const comparison = compareCategory(first, second, category);
  const firstScore = first.scores[category];
  const secondScore = second.scores[category];
  const measured = Object.fromEntries(arms.map((arm) => [arm.mode, categoryMeasurement(arm, category)]));
  if (firstScore === secondScore) {
    return {
      category,
      winnerMode: 'TIE',
      tiedModes: [...MODE_ORDER],
      reason: `${category} tie at ${firstScore}`,
      measured,
    };
  }
  const winner = comparison <= 0 ? first : second;
  const loser = winner.mode === first.mode ? second : first;
  return {
    category,
    winnerMode: winner.mode,
    loserMode: loser.mode,
    reason: `${winner.mode} scored ${winner.scores[category]} vs ${loser.scores[category]} for ${loser.mode}`,
    measured,
  };
}

function lossesFor(losingMode, winners) {
  return CATEGORIES.filter((category) => winners[category].winnerMode !== 'TIE' && winners[category].winnerMode !== losingMode).map((category) => ({
    category,
    winnerMode: winners[category].winnerMode,
    reason: winners[category].reason,
    measured: winners[category].measured,
  }));
}

function normalizeWorkspaceRoot(root) {
  return nonEmptyString(root) ? path.resolve(root) : null;
}

function workspaceRootsOverlap(left, right) {
  const leftRoot = normalizeWorkspaceRoot(left);
  const rightRoot = normalizeWorkspaceRoot(right);
  if (!leftRoot || !rightRoot) return false;
  const leftToRight = path.relative(leftRoot, rightRoot);
  const rightToLeft = path.relative(rightRoot, leftRoot);
  return leftToRight === ''
    || rightToLeft === ''
    || (!leftToRight.startsWith('..') && !path.isAbsolute(leftToRight))
    || (!rightToLeft.startsWith('..') && !path.isAbsolute(rightToLeft));
}

function workspaceIsolationFor(armsByMode) {
  const roots = Object.fromEntries(MODE_ORDER.map((mode) => [mode, normalizeWorkspaceRoot(armsByMode[mode].workspaceRoot)]));
  const supplied = MODE_ORDER.filter((mode) => roots[mode]);
  if (supplied.length < MODE_ORDER.length) {
    return {
      ok: false,
      measured: false,
      roots,
      reasons: ['workspace isolation was not fully supplied; score cannot prove isolated workspaces'],
    };
  }
  const overlap = workspaceRootsOverlap(roots[MODES.FACTORY], roots[MODES.ATOMIC]);
  return {
    ok: !overlap,
    measured: true,
    roots,
    reasons: overlap ? ['workspace roots overlap; A/B round is contaminated and cannot support dominance or escalation'] : [],
  };
}

function decisionForRound(armsByMode, winners) {
  const competitiveCategories = CATEGORIES.filter((category) => category !== 'compliance');
  const atomicCompetitiveWins = competitiveCategories.filter((category) => winners[category].winnerMode === MODES.ATOMIC);
  const atomicCompetitiveLosses = competitiveCategories.filter((category) => winners[category].winnerMode === MODES.FACTORY);
  const workspaceIsolation = workspaceIsolationFor(armsByMode);
  const headToHeadComplete = MODE_ORDER.every((mode) => armsByMode[mode].success === true) && workspaceIsolation.ok;
  const validationComplete = MODE_ORDER.every((mode) => armsByMode[mode].validation.total > 0 && armsByMode[mode].validation.failed === 0);
  const complianceClean = MODE_ORDER.every((mode) => armsByMode[mode].compliance.ok === true);
  const atomicSucceeded = armsByMode[MODES.ATOMIC].success === true;
  const atomicWonOverall = winners.overall.winnerMode === MODES.ATOMIC;
  const atomicDominance = headToHeadComplete && validationComplete && atomicSucceeded && atomicWonOverall && complianceClean && workspaceIsolation.ok && atomicCompetitiveLosses.length === 0;
  const escalateComplexity = atomicDominance && atomicCompetitiveWins.length >= 3;
  const reasons = [];
  if (!headToHeadComplete) reasons.push('head-to-head incomplete: both arms must deliver validated success in isolated workspaces before complexity escalation');
  if (!validationComplete) reasons.push('validation incomplete: both arms need at least one passing validation and zero failed validations');
  if (!complianceClean) reasons.push('compliance is not clean across both arms');
  if (!workspaceIsolation.ok) reasons.push(...workspaceIsolation.reasons);
  if (!atomicSucceeded) reasons.push('Atomic arm did not produce a successful delivery');
  if (!atomicWonOverall) reasons.push('Atomic did not win overall');
  if (atomicCompetitiveLosses.length > 0) reasons.push(`Atomic lost competitive categories: ${atomicCompetitiveLosses.join(', ')}`);
  if (atomicCompetitiveWins.length < 3) reasons.push(`Atomic competitive wins below threshold: ${atomicCompetitiveWins.length}/3`);
  return {
    headToHeadComplete,
    validationComplete,
    complianceClean,
    workspaceIsolation,
    atomicDominance,
    escalateComplexity,
    atomicCompetitiveWins,
    atomicCompetitiveLosses,
    requiredBeforeEscalation: 'complete isolated head-to-head, clean validation/compliance, no Atomic competitive losses, and at least three Atomic competitive wins in this round plus repeat evidence across rounds',
    reasons,
  };
}

function parseJsonInput(stdinText) {
  const trimmed = String(stdinText ?? '').trim();
  if (trimmed.length === 0) return {};
  return JSON.parse(trimmed);
}

export function scoreRound(input) {
  const valid = validateRound(input);
  if (valid.ok !== true) return valid;
  const armsByMode = Object.fromEntries(input.arms.map((arm) => [arm.mode, deriveArm(arm)]));
  const winners = Object.fromEntries(CATEGORIES.map((category) => [category, winnerFor(category, armsByMode)]));
  const atomicLosses = lossesFor(MODES.ATOMIC, winners);
  const factoryLosses = lossesFor(MODES.FACTORY, winners);
  const decision = decisionForRound(armsByMode, winners);
  return {
    ok: true,
    roundId: input.roundId,
    task: input.task,
    baselineCommit: input.baselineCommit,
    success: MODE_ORDER.every((mode) => armsByMode[mode].success),
    overallScores: Object.fromEntries(MODE_ORDER.map((mode) => [mode, armsByMode[mode].scores.overall])),
    arms: MODE_ORDER.map((mode) => armsByMode[mode]),
    armsByMode,
    winners,
    categoryWinners: winners,
    decision,
    atomicLosses,
    factoryLosses,
  };
}

export function runCli(argv, stdinText) {
  const mode = argv[0] ?? '--help';
  try {
    if (mode === '--help') {
      return {
        ok: true,
        modes: ['--help', '--score'],
        inputShape: '{ roundId, task, baselineCommit, arms: [FACTORY_BLOCK_ATOMIC, ALL_IN_ATOMIC] }',
        categories: [...CATEGORIES],
      };
    }
    if (mode === '--score') return scoreRound(parseJsonInput(stdinText));
    return { ok: false, error: `unknown ab-round harness mode: ${mode}` };
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
  const stdinText = mode === '--help' ? '' : fs.readFileSync(0, 'utf8');
  const result = runCli([mode], stdinText);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 1);
}
