/**
 * Utility functions and buildPulseAutonomyMemoryState for the autonomous loop.
 * Contains pure helpers (compact, unique, safeJsonParse) and workspace-detection
 * utilities (commandExists, detectRollbackGuard, rollbackWorkspaceToHead).
 */
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildArtifactRegistry } from './artifact-registry';
import { ensureDir, pathExists, readTextFile, removePath, writeTextFile } from './safe-fs';
import type {
  PulseAgentOrchestrationState,
  PulseAutonomyMemoryConcept,
  PulseAutonomyMemoryState,
  PulseAutonomyState,
} from './types';
import {
  AUTONOMY_ARTIFACT,
  AUTONOMY_MEMORY_ARTIFACT,
  type PulseRollbackGuard,
} from './autonomy-types';
import { fingerprintStrategy } from './structural-memory';

export function compact(value: string, max: number = 400): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function safeJsonParse<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function getAutonomyArtifactPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', AUTONOMY_ARTIFACT);
}

export function getAutonomyMemoryArtifactPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', AUTONOMY_MEMORY_ARTIFACT);
}

export function commandExists(command: string, rootDir: string): boolean {
  const result = spawnSync('zsh', ['-lc', `command -v ${command} >/dev/null 2>&1`], {
    cwd: rootDir,
    stdio: 'ignore',
  });
  return result.status === 0;
}

export function detectRollbackGuard(rootDir: string): PulseRollbackGuard {
  if (!commandExists('git', rootDir)) {
    return {
      enabled: false,
      reason: 'git is not available on PATH, so automatic rollback is disabled.',
    };
  }

  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=all'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (status.status !== 0) {
    return {
      enabled: false,
      reason: compact(status.stderr || status.stdout || 'Unable to inspect git status.', 300),
    };
  }

  if ((status.stdout || '').trim().length > 0) {
    return {
      enabled: false,
      reason: 'working tree is dirty, so automatic rollback is disabled for this run.',
    };
  }

  return { enabled: true, reason: null };
}

export function rollbackWorkspaceToHead(rootDir: string): string {
  const registry = buildArtifactRegistry(rootDir);
  ensureDir(registry.tempDir, { recursive: true });
  const patchPath = path.join(registry.tempDir, `pulse-rollback-${Date.now()}.patch`);
  const diff = spawnSync('git', ['diff', '--binary', '--no-ext-diff', 'HEAD', '--', '.'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (diff.status !== 0) {
    return compact(diff.stderr || diff.stdout || 'Unable to compute rollback patch.', 300);
  }

  const patch = diff.stdout || '';
  if (patch.trim().length > 0) {
    writeTextFile(patchPath, patch);
    const apply = spawnSync('git', ['apply', '-R', '--whitespace=nowarn', patchPath], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (apply.status !== 0) {
      return compact(apply.stderr || apply.stdout || 'Unable to apply rollback patch.', 300);
    }
  }

  const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (untracked.status === 0) {
    for (const relativePath of (untracked.stdout || '').split('\n').map((v) => v.trim())) {
      if (!relativePath) continue;
      const absolutePath = path.join(rootDir, relativePath);
      if (pathExists(absolutePath)) removePath(absolutePath, { recursive: true, force: true });
    }
  }

  return 'Automatic rollback restored the workspace to the pre-run HEAD state.';
}

export function readAgentsSdkVersion(rootDir: string): string | null {
  const packagePath = path.join(rootDir, 'node_modules', '@openai', 'agents', 'package.json');
  if (!pathExists(packagePath)) return null;
  const packageJson = safeJsonParse<{ version?: string }>(readTextFile(packagePath));
  return packageJson?.version || null;
}

export function readOptionalArtifact<T>(filePath: string): T | null {
  if (!pathExists(filePath)) return null;
  return safeJsonParse<T>(readTextFile(filePath));
}

function buildAutonomyConceptConfidence(recurrence: number): 'low' | 'medium' | 'high' {
  if (recurrence >= 4) return 'high';
  if (recurrence >= 2) return 'medium';
  return 'low';
}

function autonomyRecordFailed(record: PulseAutonomyState['history'][number]): boolean {
  if (record.improved === false) return true;
  if (record.status === 'failed' || record.status === 'blocked') return true;
  if (record.codex.executed && record.codex.exitCode !== null && record.codex.exitCode !== 0) {
    return true;
  }
  return (
    record.validation.executed &&
    record.validation.commands.some((command) => command.exitCode !== 0)
  );
}

function autonomyRecordStrategy(record: PulseAutonomyState['history'][number]): string {
  return `${record.strategyMode ?? 'normal'}_${record.plannerMode}`;
}

/** Build pulse autonomy memory state. */
export function buildPulseAutonomyMemoryState(input: {
  autonomyState: PulseAutonomyState | null;
  orchestrationState?: PulseAgentOrchestrationState | null;
}): PulseAutonomyMemoryState {
  const concepts: PulseAutonomyMemoryConcept[] = [];
  const autonomyHistory = input.autonomyState?.history || [];
  const orchestrationHistory = input.orchestrationState?.history || [];

  const repeatedStalls = new Map<
    string,
    { title: string; iterations: number[]; firstSeenAt: string | null; lastSeenAt: string | null }
  >();
  for (const record of autonomyHistory) {
    const unitId = record.unit?.id;
    if (!unitId || record.improved !== false) continue;
    const current = repeatedStalls.get(unitId) || {
      title: record.unit?.title || unitId,
      iterations: [],
      firstSeenAt: record.startedAt || null,
      lastSeenAt: record.finishedAt || null,
    };
    current.iterations.push(record.iteration);
    current.firstSeenAt = current.firstSeenAt || record.startedAt || null;
    current.lastSeenAt = record.finishedAt || current.lastSeenAt;
    repeatedStalls.set(unitId, current);
  }

  for (const [unitId, entry] of repeatedStalls.entries()) {
    if (entry.iterations.length < 2) continue;
    concepts.push({
      id: `repeated-stall-${unitId}`,
      type: 'repeated_stall',
      title: `Repeated stall on ${entry.title}`,
      summary: `Unit ${entry.title} stalled without measurable convergence in ${entry.iterations.length} iteration(s).`,
      confidence: buildAutonomyConceptConfidence(entry.iterations.length),
      recurrence: entry.iterations.length,
      firstSeenAt: entry.firstSeenAt,
      lastSeenAt: entry.lastSeenAt,
      unitIds: [unitId],
      iterations: entry.iterations,
      suggestedStrategy: 'narrow_scope',
    });
  }

  const failedStrategyClusters = new Map<
    string,
    {
      unitId: string;
      title: string;
      fingerprint: string;
      strategy: string;
      iterations: number[];
      firstSeenAt: string | null;
      lastSeenAt: string | null;
    }
  >();
  for (const record of autonomyHistory) {
    const unitId = record.unit?.id;
    if (!unitId || !autonomyRecordFailed(record)) continue;
    const strategy = autonomyRecordStrategy(record);
    const fingerprint = fingerprintStrategy(strategy);
    const key = `${unitId}:${fingerprint}`;
    const current = failedStrategyClusters.get(key) || {
      unitId,
      title: record.unit?.title || unitId,
      fingerprint,
      strategy,
      iterations: [],
      firstSeenAt: record.startedAt || null,
      lastSeenAt: record.finishedAt || null,
    };
    current.iterations.push(record.iteration);
    current.firstSeenAt = current.firstSeenAt || record.startedAt || null;
    current.lastSeenAt = record.finishedAt || current.lastSeenAt;
    failedStrategyClusters.set(key, current);
  }

  for (const cluster of failedStrategyClusters.values()) {
    if (cluster.iterations.length < 2) continue;
    concepts.push({
      id: `repeated-failed-strategy-${cluster.unitId}-${cluster.fingerprint}`,
      type: 'repeated_stall',
      title: `Repeated failed strategy on ${cluster.title}`,
      summary: `Unit ${cluster.title} retried failed strategy fingerprint ${cluster.fingerprint} in ${cluster.iterations.length} iteration(s); avoid reusing ${cluster.strategy} without new evidence.`,
      confidence: buildAutonomyConceptConfidence(cluster.iterations.length),
      recurrence: cluster.iterations.length,
      firstSeenAt: cluster.firstSeenAt,
      lastSeenAt: cluster.lastSeenAt,
      unitIds: [cluster.unitId],
      iterations: cluster.iterations,
      suggestedStrategy: 'escalated_validation',
    });
  }

  const validationFailureIterations = autonomyHistory.filter(
    (record) =>
      record.validation.executed &&
      record.validation.commands.some((command) => command.exitCode !== 0),
  );
  if (validationFailureIterations.length > 0) {
    concepts.push({
      id: 'validation-failure-cluster',
      type: 'validation_failure',
      title: 'Validation failure cluster',
      summary: `Validation commands failed in ${validationFailureIterations.length} autonomy iteration(s).`,
      confidence: buildAutonomyConceptConfidence(validationFailureIterations.length),
      recurrence: validationFailureIterations.length,
      firstSeenAt: validationFailureIterations[0]?.startedAt || null,
      lastSeenAt:
        validationFailureIterations[validationFailureIterations.length - 1]?.finishedAt || null,
      unitIds: validationFailureIterations
        .map((r) => r.unit?.id)
        .filter((v): v is string => Boolean(v)),
      iterations: validationFailureIterations.map((r) => r.iteration),
      suggestedStrategy: 'increase_validation',
    });
  }

  const executionFailureIterations = autonomyHistory.filter(
    (record) =>
      record.codex.executed && record.codex.exitCode !== null && record.codex.exitCode !== 0,
  );
  if (executionFailureIterations.length > 0) {
    concepts.push({
      id: 'execution-failure-cluster',
      type: 'execution_failure',
      title: 'Execution failure cluster',
      summary: `Codex execution failed in ${executionFailureIterations.length} autonomy iteration(s).`,
      confidence: buildAutonomyConceptConfidence(executionFailureIterations.length),
      recurrence: executionFailureIterations.length,
      firstSeenAt: executionFailureIterations[0]?.startedAt || null,
      lastSeenAt:
        executionFailureIterations[executionFailureIterations.length - 1]?.finishedAt || null,
      unitIds: executionFailureIterations
        .map((r) => r.unit?.id)
        .filter((v): v is string => Boolean(v)),
      iterations: executionFailureIterations.map((r) => r.iteration),
      suggestedStrategy: 'retry_in_isolation',
    });
  }

  const oversizedUnits = autonomyHistory.filter((record) => {
    const capabilityCount = record.unit?.affectedCapabilities.length || 0;
    const flowCount = record.unit?.affectedFlows.length || 0;
    return capabilityCount >= 8 || flowCount >= 3 || record.unit?.kind === 'scenario';
  });
  if (oversizedUnits.length > 0) {
    concepts.push({
      id: 'oversized-unit-cluster',
      type: 'oversized_unit',
      title: 'Oversized convergence units',
      summary: `${oversizedUnits.length} autonomy iteration(s) targeted wide-scope units that are likely poor fits for autonomous execution.`,
      confidence: buildAutonomyConceptConfidence(oversizedUnits.length),
      recurrence: oversizedUnits.length,
      firstSeenAt: oversizedUnits[0]?.startedAt || null,
      lastSeenAt: oversizedUnits[oversizedUnits.length - 1]?.finishedAt || null,
      unitIds: oversizedUnits.map((r) => r.unit?.id).filter((v): v is string => Boolean(v)),
      iterations: oversizedUnits.map((r) => r.iteration),
      suggestedStrategy: 'narrow_scope',
    });
  }

  const failedWorkerBatches = orchestrationHistory.filter((batch) =>
    batch.workers.some((worker) => worker.applyStatus === 'failed' || worker.status === 'failed'),
  );
  if (failedWorkerBatches.length > 0) {
    concepts.push({
      id: 'parallel-failure-cluster',
      type: 'execution_failure',
      title: 'Parallel worker integration failures',
      summary: `${failedWorkerBatches.length} orchestration batch(es) contained worker or patch-integration failures.`,
      confidence: buildAutonomyConceptConfidence(failedWorkerBatches.length),
      recurrence: failedWorkerBatches.length,
      firstSeenAt: failedWorkerBatches[0]?.startedAt || null,
      lastSeenAt: failedWorkerBatches[failedWorkerBatches.length - 1]?.finishedAt || null,
      unitIds: failedWorkerBatches.flatMap((batch) =>
        batch.workers.map((w) => w.unit?.id).filter((v): v is string => Boolean(v)),
      ),
      iterations: failedWorkerBatches.map((batch) => batch.batch),
      suggestedStrategy: 'reduce_parallelism',
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalConcepts: concepts.length,
      repeatedStalls: concepts.filter((c) => c.type === 'repeated_stall').length,
      validationFailures: concepts.filter((c) => c.type === 'validation_failure').length,
      executionFailures: concepts.filter((c) => c.type === 'execution_failure').length,
      oversizedUnits: concepts.filter((c) => c.type === 'oversized_unit').length,
    },
    concepts,
  };
}
