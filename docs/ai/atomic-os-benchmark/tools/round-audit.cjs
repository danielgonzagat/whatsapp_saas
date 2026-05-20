#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

function usage() {
  console.error('Usage: round-audit.cjs <round-dir>');
  process.exit(2);
}

const roundDir = process.argv[2] ? path.resolve(process.argv[2]) : '';
const {
  readText,
  firstExisting,
  readJsonl,
  readJsonFile,
  metadataValue,
  laneStatus,
  laneStartedAt,
  readNumberTextFile,
  prepromptMetrics,
  finalUsage,
  eventTimestamp,
  firstTimestamp,
  lastTimestamp,
  elapsedMs,
  sectionList,
  countTraceFiles,
} = require('./round-audit.helpers.cjs');
const { eventMetrics } = require('./round-audit.event-metrics.cjs');
const { validationMetrics } = require('./round-audit.validation-metrics.cjs');
if (!roundDir) usage();


function compareLower(normal, atomic, key) {
  const n = normal[key];
  const a = atomic[key];
  if (typeof n !== 'number' || typeof a !== 'number') return 'unknown';
  if (a < n) return 'atomic';
  if (n < a) return 'normal';
  return 'tie';
}

function comparePassBoolean(normalValue, atomicValue) {
  if (normalValue === atomicValue) return 'tie';
  if (atomicValue === true) return 'atomic';
  if (normalValue === true) return 'normal';
  return 'unknown';
}

const normalEventsFile = firstExisting(['opencode-normal-events.jsonl', 'normal-events.jsonl']);
const atomicEventsFile = firstExisting(['opencode-atomic-events.jsonl', 'atomic-events.jsonl']);

const normal = {
  eventsFile: normalEventsFile,
  events: eventMetrics(normalEventsFile, roundMetadata.normalWorktree, 'normal'),
  validation: validationMetrics('normal-external-validation.log', roundMetadata.normalWorktree),
};
const atomic = {
  eventsFile: atomicEventsFile,
  events: eventMetrics(atomicEventsFile, roundMetadata.atomicWorktree, 'atomic'),
  validation: validationMetrics('atomic-external-validation.log', roundMetadata.atomicWorktree),
};

function validationPass(validation, options = {}) {
  const typecheckOk =
    validation.typecheckStatus === 0 ||
    (options.allowTaskScopedTypecheckNoise === true && validation.typecheckKloelErrorCount === 0);
  const lintOk = validation.lintStatus === null || validation.lintStatus === 0;
  const finalValidationOk =
    validation.finalValidationStatus === null || validation.finalValidationStatus === 0;
  return (
    validation.jestStatus === 0 &&
    finalValidationOk &&
    typecheckOk &&
    lintOk &&
    validation.diffCheckStatus === 0 &&
    validation.forbiddenPatternStatus === 1 &&
    (validation.helperThisStatus === null || validation.helperThisStatus === 1) &&
    (validation.privateMethodsStatus === null || validation.privateMethodsStatus === 1) &&
    (validation.scopePreservationPass === null || validation.scopePreservationPass === true)
  );
}

const sharedTypecheckNoiseOnly =
  normal.validation.typecheckStatus !== 0 &&
  atomic.validation.typecheckStatus !== 0 &&
  normal.validation.typecheckKloelErrorCount === 0 &&
  atomic.validation.typecheckKloelErrorCount === 0;
const globalFunctionalPass = validationPass(normal.validation) && validationPass(atomic.validation);
const normalTaskFunctionalPass = validationPass(normal.validation, {
  allowTaskScopedTypecheckNoise:
    normal.validation.typecheckStatus !== 0 && normal.validation.typecheckKloelErrorCount === 0,
});
const atomicTaskFunctionalPass = validationPass(atomic.validation, {
  allowTaskScopedTypecheckNoise:
    atomic.validation.typecheckStatus !== 0 && atomic.validation.typecheckKloelErrorCount === 0,
});
const taskFunctionalPass = normalTaskFunctionalPass && atomicTaskFunctionalPass;
const shapeComparisonEligible = normalTaskFunctionalPass && atomicTaskFunctionalPass;
const normalLaneCompleted = normal.events.laneStatus === null || normal.events.laneStatus === 'completed';
const atomicLaneCompleted = atomic.events.laneStatus === null || atomic.events.laneStatus === 'completed';

const scorecard = {
  functionalPass: taskFunctionalPass,
  taskFunctionalPass,
  normalTaskFunctionalPass,
  atomicTaskFunctionalPass,
  shapeComparisonEligible,
  globalFunctionalPass,
  sharedTypecheckNoiseOnly,
  normalLaneStatus: normal.events.laneStatus,
  atomicLaneStatus: atomic.events.laneStatus,
  normalLaneCompleted,
  atomicLaneCompleted,
  laneCompletionWinner: comparePassBoolean(normalLaneCompleted, atomicLaneCompleted),
  benchmarkIsolationPass:
    normal.events.forbiddenAtomicToolUses.length === 0 &&
    normal.events.forbiddenAtomicCommands.length === 0 &&
    atomic.events.atomicCallWorktreeEscapes.length === 0,
  normalModeClean:
    normal.events.forbiddenAtomicToolUses.length === 0 && normal.events.forbiddenAtomicCommands.length === 0,
  normalForbiddenAtomicToolUseCount: normal.events.forbiddenAtomicToolUses.length,
  normalForbiddenAtomicCommandCount: normal.events.forbiddenAtomicCommands.length,
  atomicModeClean:
    atomic.events.nativeFileToolViolations.length === 0 &&
    atomic.events.nativeShellReadCommands.length === 0 &&
    atomic.events.maskedAtomicFailurePipelineCommands.length === 0 &&
    atomic.events.atomicCallWorktreeEscapes.length === 0,
  atomicNativeFileToolViolationCount: atomic.events.nativeFileToolViolations.length,
  atomicNativeShellReadCommandCount: atomic.events.nativeShellReadCommands.length,
  atomicMaskedPipelineCommandCount: atomic.events.maskedAtomicFailurePipelineCommands.length,
  atomicWorktreeEscapeCount: atomic.events.atomicCallWorktreeEscapes.length,
  atomicTraceIsolationPass:
    atomic.validation.traceIsolationStatus === null || atomic.validation.traceIsolationStatus === 0,
  serviceLineWinner: shapeComparisonEligible
    ? compareLower(
        { value: normal.validation.serviceLines },
        { value: atomic.validation.serviceLines },
        'value',
      )
    : 'not_applicable',
  totalProductLineWinner: shapeComparisonEligible
    ? compareLower(
        { value: normal.validation.totalKloelLines },
        { value: atomic.validation.totalKloelLines },
        'value',
      )
    : 'not_applicable',
  normalScopePreservationPass: normal.validation.scopePreservationPass,
  atomicScopePreservationPass: atomic.validation.scopePreservationPass,
  scopePreservationWinner: comparePassBoolean(
    normal.validation.scopePreservationPass,
    atomic.validation.scopePreservationPass,
  ),
  eventRowWinner: compareLower(normal.events, atomic.events, 'rows'),
  firstActionWinner: compareLower(normal.events, atomic.events, 'firstActionMs'),
  totalAgentTimeWinner: compareLower(normal.events, atomic.events, 'totalAgentMs'),
  shellCommandWinner: compareLower(normal.events, atomic.events, 'completedCommands'),
  normalFailedCommandCount: normal.events.failedCommands.length,
  atomicFailedCommandCount: atomic.events.failedCommands.length,
  failedCommandWinner: compareLower(
    { value: normal.events.failedCommands.length },
    { value: atomic.events.failedCommands.length },
    'value',
  ),
  inputTokenWinner: compareLower(normal.events.usage, atomic.events.usage, 'input_tokens'),
  outputTokenWinner: compareLower(normal.events.usage, atomic.events.usage, 'output_tokens'),
  reasoningTokenWinner: compareLower(
    normal.events.usage,
    atomic.events.usage,
    'reasoning_output_tokens',
  ),
  traceWinner:
    atomic.events.completedMcpCalls > 0 || Number(atomic.validation.traceCount || 0) > 0
      ? 'atomic'
      : 'normal',
  protectedDiffTie:
    JSON.stringify(normal.validation.protectedDiff) === JSON.stringify(atomic.validation.protectedDiff),
  touchedFileWinner: shapeComparisonEligible
    ? compareLower(
        { value: normal.validation.touchedKloelFileCount },
        { value: atomic.validation.touchedKloelFileCount },
        'value',
      )
    : 'not_applicable',
  sourceChurnWinner: shapeComparisonEligible
    ? compareLower(
        { value: normal.validation.sourceChurn },
        { value: atomic.validation.sourceChurn },
        'value',
      )
    : 'not_applicable',
}

console.log(JSON.stringify({ roundDir, normal, atomic, scorecard }, null, 2));
