import * as fs from 'node:fs';
import * as path from 'node:path';
import type { PulseActorEvidence, PulseScenarioResult } from '../../types';
import { normalizeEvidenceKey } from '../../scenario-mode-registry';

type ActorEvidenceKey = 'customer' | 'operator' | 'admin' | 'soak';

const FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;

const OBSERVED_TERMINAL_STATUSES = ['passed', 'failed'] as const;

function normalizeActorEvidenceKey(value: unknown): ActorEvidenceKey | null {
  return normalizeEvidenceKey(value) as ActorEvidenceKey | null;
}

function parseTimestampMs(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function isFreshTimestamp(timestampMs: number, nowMs: number): boolean {
  return nowMs - timestampMs >= 0 && nowMs - timestampMs <= FRESHNESS_WINDOW_MS;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function buildSyntheticMachineWork(
  scenarioId: string,
  actorEvidenceKey: ActorEvidenceKey,
  status: PulseScenarioResult['status'],
  observedTerminalExecution: boolean,
): PulseScenarioResult['machineWork'] | undefined {
  if (actorEvidenceKey !== 'customer' && actorEvidenceKey !== 'soak') {
    return undefined;
  }
  if (observedTerminalExecution) {
    return undefined;
  }

  const scenarioLane = actorEvidenceKey === 'soak' ? 'soak' : 'customer';
  return {
    kind: 'pulse_machine_proof_debt',
    blueprint: `Generate or run the ${scenarioLane} scenario blueprint for ${scenarioId}, then classify the scenario with terminal observed evidence or a precise non-executable reason.`,
    requiredValidation: [
      'scenario_blueprint_generated',
      'scenario_runtime_execution_attempted_or_classified',
      'terminal_proof_reason_recorded',
    ],
    terminalProofReason: `${scenarioLane} synthetic scenario ${scenarioId} has no runtime-observed terminal proof; this is PULSE machine work, not product capability evidence.`,
    actionable: true,
  };
}

function hasObservedExecutionMetadata(
  item: Record<string, unknown>,
  normalizedStatus: PulseScenarioResult['status'],
  fileFresh: boolean,
): boolean {
  if (!fileFresh || item.executed !== true) {
    return false;
  }
  if (
    !OBSERVED_TERMINAL_STATUSES.includes(
      normalizedStatus as (typeof OBSERVED_TERMINAL_STATUSES)[number],
    )
  ) {
    return false;
  }
  if (typeof item.command !== 'string' || item.command.trim() === '') {
    return false;
  }
  if (item.exitCode !== 0) {
    return false;
  }

  const startedAt = parseTimestampMs(item.startedAt);
  const finishedAt = parseTimestampMs(item.finishedAt);
  if (startedAt === null || finishedAt === null || finishedAt < startedAt) {
    return false;
  }
  return isFreshTimestamp(finishedAt, Date.now());
}

export function normalizeScenarioResult(
  raw: unknown,
  fallbackActorKind: ActorEvidenceKey,
  fresh: boolean,
): PulseScenarioResult | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const item = raw as Record<string, unknown>;
  const scenarioId = typeof item.scenarioId === 'string' ? item.scenarioId : null;
  const status = typeof item.status === 'string' ? item.status : null;
  if (!scenarioId || !status) {
    return null;
  }

  const acceptedStatuses: PulseScenarioResult['status'][] = [
    'passed',
    'failed',
    'missing_evidence',
    'checker_gap',
    'skipped',
  ];
  const normalizedStatus =
    status === 'not_run'
      ? 'skipped'
      : acceptedStatuses.includes(status as PulseScenarioResult['status'])
        ? (status as PulseScenarioResult['status'])
        : 'checker_gap';
  const actorKind = normalizeActorEvidenceKey(item.actorKind) ?? fallbackActorKind;
  const executed = item.executed === true;
  const observedTerminalExecution = hasObservedExecutionMetadata(item, normalizedStatus, fresh);

  return {
    scenarioId,
    actorKind: actorKind === 'soak' ? 'system' : actorKind,
    scenarioKind:
      typeof item.scenarioKind === 'string'
        ? (item.scenarioKind as PulseScenarioResult['scenarioKind'])
        : 'single-session',
    critical: item.critical === true,
    requested: item.requested === true,
    runner:
      typeof item.runner === 'string' ? (item.runner as PulseScenarioResult['runner']) : 'derived',
    status: normalizedStatus,
    executed,
    truthMode: observedTerminalExecution ? 'observed-from-disk' : 'inferred',
    machineWork: buildSyntheticMachineWork(
      scenarioId,
      fallbackActorKind,
      normalizedStatus,
      observedTerminalExecution,
    ),
    providerModeUsed:
      typeof item.providerModeUsed === 'string'
        ? (item.providerModeUsed as PulseScenarioResult['providerModeUsed'])
        : undefined,
    smokeExecuted: typeof item.smokeExecuted === 'boolean' ? item.smokeExecuted : undefined,
    replayExecuted: typeof item.replayExecuted === 'boolean' ? item.replayExecuted : undefined,
    worldStateConverged:
      typeof item.worldStateConverged === 'boolean' ? item.worldStateConverged : undefined,
    failureClass:
      typeof item.failureClass === 'string'
        ? (item.failureClass as PulseScenarioResult['failureClass'])
        : undefined,
    summary: typeof item.summary === 'string' ? item.summary : scenarioId,
    artifactPaths: normalizeStringArray(item.artifactPaths),
    specsExecuted: normalizeStringArray(item.specsExecuted),
    durationMs: typeof item.durationMs === 'number' ? item.durationMs : 0,
    worldStateTouches: normalizeStringArray(item.worldStateTouches),
    metrics:
      item.metrics && typeof item.metrics === 'object' && !Array.isArray(item.metrics)
        ? (item.metrics as Record<string, string | number | boolean>)
        : undefined,
    moduleKeys: normalizeStringArray(item.moduleKeys),
    routePatterns: normalizeStringArray(item.routePatterns),
    command: typeof item.command === 'string' ? item.command : undefined,
    exitCode: typeof item.exitCode === 'number' ? item.exitCode : undefined,
    startedAt: typeof item.startedAt === 'string' ? item.startedAt : undefined,
    finishedAt: typeof item.finishedAt === 'string' ? item.finishedAt : undefined,
    environmentUrl: typeof item.environmentUrl === 'string' ? item.environmentUrl : undefined,
  };
}

function isNonRunStatus(value: unknown): boolean {
  return value === 'skipped' || value === 'not_run';
}

function isRefreshableNonRunEvidence(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return false;
  }
  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.results) || data.results.length === 0) {
    return false;
  }
  const hasExecuted = normalizeStringArray(data.executed).length > 0;
  const hasPassed = normalizeStringArray(data.passed).length > 0;
  const hasFailed = normalizeStringArray(data.failed).length > 0;
  if (hasExecuted || hasPassed || hasFailed) {
    return false;
  }
  return data.results.every((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return false;
    }
    const item = entry as Record<string, unknown>;
    return item.executed !== true && isNonRunStatus(item.status);
  });
}

export function normalizeStaleNonRunEvidenceForRead(
  raw: unknown,
  fallbackActorKind: ActorEvidenceKey | null,
): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return raw;
  }
  const data = raw as Record<string, unknown>;
  const actorKind =
    normalizeActorEvidenceKey(data.actorKind) ??
    normalizeActorEvidenceKey(data.key) ??
    fallbackActorKind;
  if (!actorKind || !Array.isArray(data.results)) {
    return raw;
  }
  const results = data.results.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return entry;
    }
    const item = entry as Record<string, unknown>;
    const scenarioId = typeof item.scenarioId === 'string' ? item.scenarioId : 'unknown-scenario';
    return {
      ...item,
      actorKind: item.actorKind ?? (actorKind === 'soak' ? 'system' : actorKind),
      status: 'skipped',
      executed: false,
      requested: item.requested === true,
      summary:
        typeof item.summary === 'string'
          ? item.summary
          : `Scenario ${scenarioId} was not executed in this run.`,
    };
  });
  return {
    ...data,
    actorKind,
    executed: [],
    passed: [],
    failed: [],
    summary:
      typeof data.summary === 'string'
        ? data.summary
        : 'Stale non-run evidence was normalized for read only.',
    results,
  };
}

export function normalizeActorEvidence(
  raw: unknown,
  fallbackActorKind: ActorEvidenceKey | null,
  fresh: boolean,
): PulseActorEvidence | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.results)) {
    return null;
  }
  const actorKind =
    normalizeActorEvidenceKey(data.actorKind) ??
    normalizeActorEvidenceKey(data.key) ??
    fallbackActorKind;
  if (!actorKind) {
    return null;
  }

  const results = data.results
    .map((entry) => normalizeScenarioResult(entry, actorKind, fresh))
    .filter((entry): entry is PulseScenarioResult => entry !== null);

  return {
    actorKind,
    declared: normalizeStringArray(data.declared),
    executed: normalizeStringArray(data.executed),
    missing: normalizeStringArray(data.missing),
    passed: normalizeStringArray(data.passed),
    failed: normalizeStringArray(data.failed),
    artifactPaths: normalizeStringArray(data.artifactPaths),
    summary: typeof data.summary === 'string' ? data.summary : `${actorKind} disk evidence`,
    results,
  };
}
