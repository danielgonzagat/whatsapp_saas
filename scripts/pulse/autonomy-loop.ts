import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { Agent, MemorySession, run, tool, type JsonSchemaDefinition } from '@openai/agents';
import { buildArtifactRegistry } from './artifact-registry';
import type {
  PulseAgentOrchestrationBatchRecord,
  PulseAgentOrchestrationState,
  PulseAgentOrchestrationWorkerResult,
  PulseAutonomyMemoryConcept,
  PulseAutonomyMemoryState,
  PulseAutonomyIterationRecord,
  PulseAutonomyState,
  PulseAutonomyUnitSnapshot,
  PulseAutonomyValidationCommandResult,
} from './types';

interface PulseAutonomousDirectiveUnit {
  id: string;
  kind: string;
  priority: string;
  source: string;
  executionMode: 'ai_safe' | 'human_required' | 'observation_only';
  riskLevel: string;
  evidenceMode: string;
  confidence: string;
  productImpact: string;
  ownerLane: string;
  title: string;
  summary: string;
  whyNow?: string;
  visionDelta?: string;
  targetState?: string;
  affectedCapabilities?: string[];
  affectedFlows?: string[];
  expectedGateShift?: Record<string, string>;
  validationTargets?: string[];
  validationArtifacts?: string[];
  exitCriteria?: string[];
  gateNames?: string[];
  scenarioIds?: string[];
}

interface PulseAutonomousDirective {
  generatedAt?: string;
  currentCheckpoint?: Record<string, unknown> | null;
  targetCheckpoint?: Record<string, unknown> | null;
  visionGap?: string | null;
  currentState?: {
    certificationStatus?: string | null;
    blockingTier?: number | null;
    score?: number | null;
  } | null;
  topBlockers?: string[];
  topProblems?: Array<{
    source?: string;
    type?: string;
    summary?: string;
    impactScore?: number;
    executionMode?: string;
  }>;
  nextExecutableUnits?: PulseAutonomousDirectiveUnit[];
  blockedUnits?: Array<{
    id?: string;
    title?: string;
    executionMode?: string;
    summary?: string;
    whyBlocked?: string;
  }>;
  doNotTouchSurfaces?: string[];
  antiGoals?: string[];
  suggestedValidation?: {
    commands?: string[];
    artifacts?: string[];
  };
  stopCondition?: string[];
}

interface PulseAutonomyDecision {
  shouldContinue: boolean;
  selectedUnitId: string;
  rationale: string;
  codexPrompt: string;
  validationCommands: string[];
  stopReason: string;
  strategyMode: 'normal' | 'adaptive_narrow_scope';
}

interface PulseAutonomyRunOptions {
  rootDir: string;
  dryRun: boolean;
  continuous: boolean;
  maxIterations: number;
  intervalMs: number;
  parallelAgents: number;
  maxWorkerRetries: number;
  riskProfile: 'safe' | 'balanced' | 'dangerous';
  plannerModel: string | null;
  codexModel: string | null;
  disableAgentPlanner: boolean;
  validateCommands: string[];
}

interface PulseAutonomyArtifactSeedInput {
  directive: PulseAutonomousDirective;
  previousState?: PulseAutonomyState | null;
  codexCliAvailable?: boolean;
  orchestrationMode?: 'single' | 'parallel';
  parallelAgents?: number;
  maxWorkerRetries?: number;
  riskProfile?: 'safe' | 'balanced' | 'dangerous';
  plannerMode?: 'agents_sdk' | 'deterministic';
  plannerModel?: string | null;
  codexModel?: string | null;
}

interface PulseAgentOrchestrationArtifactSeedInput {
  directive: PulseAutonomousDirective;
  previousState?: PulseAgentOrchestrationState | null;
  codexCliAvailable?: boolean;
  parallelAgents?: number;
  maxWorkerRetries?: number;
  riskProfile?: 'safe' | 'balanced' | 'dangerous';
  plannerMode?: 'agents_sdk' | 'deterministic';
}

interface PulseAutonomySummarySnapshot {
  certificationStatus: string | null;
  blockingTier: number | null;
  score: number | null;
  visionGap: string | null;
}

interface PulseRollbackGuard {
  enabled: boolean;
  reason: string | null;
}

const AUTONOMY_ARTIFACT = 'PULSE_AUTONOMY_STATE.json';
const AGENT_ORCHESTRATION_ARTIFACT = 'PULSE_AGENT_ORCHESTRATION_STATE.json';
const AUTONOMY_MEMORY_ARTIFACT = 'PULSE_AUTONOMY_MEMORY.json';
const DEFAULT_MAX_ITERATIONS = 5;
const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_PARALLEL_AGENTS = 1;
const DEFAULT_MAX_WORKER_RETRIES = 1;
const DEFAULT_PLANNER_MODEL = 'gpt-4.1';
const DEFAULT_VALIDATION_COMMANDS = ['npm run typecheck', 'node scripts/pulse/run.js --guidance'];
const ISOLATED_WORKSPACE_DEPENDENCY_DIRS = [
  'node_modules',
  'backend/node_modules',
  'frontend/node_modules',
  'worker/node_modules',
  'e2e/node_modules',
];
const ISOLATED_WORKSPACE_EXCLUDED_PREFIXES = ['.git', '.pulse/tmp', 'coverage', '.turbo'];
const ISOLATED_WORKSPACE_EXCLUDED_SEGMENTS = ['node_modules', '.next'];

interface PulseWorkerWorkspace {
  workspaceMode: 'isolated_copy';
  workspacePath: string;
  patchPath: string;
}

const PLANNER_OUTPUT_SCHEMA: JsonSchemaDefinition = {
  type: 'json_schema',
  name: 'pulse_autonomy_decision',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: [
      'shouldContinue',
      'selectedUnitId',
      'rationale',
      'codexPrompt',
      'validationCommands',
      'stopReason',
    ],
    properties: {
      shouldContinue: { type: 'boolean' },
      selectedUnitId: {
        type: 'string',
        description: 'Chosen ai_safe unit id. Use an empty string when no unit should be executed.',
      },
      rationale: { type: 'string' },
      codexPrompt: {
        type: 'string',
        description:
          'A concrete prompt for codex exec. Use an empty string only when shouldContinue is false.',
      },
      validationCommands: {
        type: 'array',
        items: { type: 'string' },
      },
      stopReason: {
        type: 'string',
        description:
          'Reason to stop the loop. Use an empty string when execution should continue normally.',
      },
    },
  },
};

const READ_PULSE_ARTIFACT_TOOL_SCHEMA: {
  type: 'object';
  additionalProperties: false;
  required: string[];
  properties: {
    artifact: {
      type: 'string';
      enum: string[];
    };
  };
} = {
  type: 'object',
  additionalProperties: false,
  required: ['artifact'],
  properties: {
    artifact: {
      type: 'string',
      enum: ['directive', 'convergence', 'vision', 'external_signals', 'autonomy_state'],
    },
  },
};

function compact(value: string, max: number = 400): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max - 3)}...`;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function safeJsonParse<T>(value: string | null | undefined): T | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function getAutonomyArtifactPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', AUTONOMY_ARTIFACT);
}

function getAutonomyMemoryArtifactPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', AUTONOMY_MEMORY_ARTIFACT);
}

function commandExists(command: string, rootDir: string): boolean {
  const result = spawnSync('zsh', ['-lc', `command -v ${command} >/dev/null 2>&1`], {
    cwd: rootDir,
    stdio: 'ignore',
  });
  return result.status === 0;
}

function detectRollbackGuard(rootDir: string): PulseRollbackGuard {
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

  return {
    enabled: true,
    reason: null,
  };
}

function rollbackWorkspaceToHead(rootDir: string): string {
  const registry = buildArtifactRegistry(rootDir);
  fs.mkdirSync(registry.tempDir, { recursive: true });
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
    fs.writeFileSync(patchPath, patch);
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
    for (const relativePath of (untracked.stdout || '').split('\n').map((value) => value.trim())) {
      if (!relativePath) {
        continue;
      }
      const absolutePath = path.join(rootDir, relativePath);
      if (fs.existsSync(absolutePath)) {
        fs.rmSync(absolutePath, { recursive: true, force: true });
      }
    }
  }

  return 'Automatic rollback restored the workspace to the pre-run HEAD state.';
}

function readAgentsSdkVersion(rootDir: string): string | null {
  const packagePath = path.join(rootDir, 'node_modules', '@openai', 'agents', 'package.json');
  if (!fs.existsSync(packagePath)) {
    return null;
  }
  const packageJson = safeJsonParse<{ version?: string }>(fs.readFileSync(packagePath, 'utf8'));
  return packageJson?.version || null;
}

function readOptionalArtifact<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return safeJsonParse<T>(fs.readFileSync(filePath, 'utf8'));
}

function buildAutonomyConceptConfidence(recurrence: number): 'low' | 'medium' | 'high' {
  if (recurrence >= 4) {
    return 'high';
  }
  if (recurrence >= 2) {
    return 'medium';
  }
  return 'low';
}

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
    if (!unitId || record.improved !== false) {
      continue;
    }
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
    if (entry.iterations.length < 2) {
      continue;
    }
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
        .map((record) => record.unit?.id)
        .filter((value): value is string => Boolean(value)),
      iterations: validationFailureIterations.map((record) => record.iteration),
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
        .map((record) => record.unit?.id)
        .filter((value): value is string => Boolean(value)),
      iterations: executionFailureIterations.map((record) => record.iteration),
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
      unitIds: oversizedUnits
        .map((record) => record.unit?.id)
        .filter((value): value is string => Boolean(value)),
      iterations: oversizedUnits.map((record) => record.iteration),
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
        batch.workers
          .map((worker) => worker.unit?.id)
          .filter((value): value is string => Boolean(value)),
      ),
      iterations: failedWorkerBatches.map((batch) => batch.batch),
      suggestedStrategy: 'reduce_parallelism',
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalConcepts: concepts.length,
      repeatedStalls: concepts.filter((concept) => concept.type === 'repeated_stall').length,
      validationFailures: concepts.filter((concept) => concept.type === 'validation_failure')
        .length,
      executionFailures: concepts.filter((concept) => concept.type === 'execution_failure').length,
      oversizedUnits: concepts.filter((concept) => concept.type === 'oversized_unit').length,
    },
    concepts,
  };
}

function writeAtomicArtifact(targetPath: string, rootDir: string, content: string) {
  const registry = buildArtifactRegistry(rootDir);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.mkdirSync(registry.tempDir, { recursive: true });
  const tempPath = path.join(
    registry.tempDir,
    `${path.basename(targetPath)}.${Date.now().toString(36)}.tmp`,
  );
  fs.writeFileSync(tempPath, content);
  fs.renameSync(tempPath, targetPath);
}

function directiveDigest(directive: PulseAutonomousDirective): string {
  return crypto
    .createHash('sha1')
    .update(
      JSON.stringify({
        currentCheckpoint: directive.currentCheckpoint || null,
        currentState: directive.currentState || null,
        visionGap: directive.visionGap || null,
        nextExecutableUnits: directive.nextExecutableUnits || [],
        blockedUnits: directive.blockedUnits || [],
      }),
    )
    .digest('hex');
}

function getDirectiveSnapshot(directive: PulseAutonomousDirective): PulseAutonomySummarySnapshot {
  return {
    certificationStatus: directive.currentState?.certificationStatus || null,
    blockingTier:
      typeof directive.currentState?.blockingTier === 'number'
        ? directive.currentState.blockingTier
        : null,
    score: typeof directive.currentState?.score === 'number' ? directive.currentState.score : null,
    visionGap: directive.visionGap || null,
  };
}

function toUnitSnapshot(
  unit: PulseAutonomousDirectiveUnit | null,
): PulseAutonomyUnitSnapshot | null {
  if (!unit) {
    return null;
  }

  return {
    id: unit.id,
    kind: unit.kind,
    priority: unit.priority,
    executionMode: unit.executionMode,
    title: unit.title,
    summary: unit.summary,
    affectedCapabilities: unit.affectedCapabilities || [],
    affectedFlows: unit.affectedFlows || [],
    validationTargets: unique([
      ...(unit.validationTargets || []),
      ...(unit.validationArtifacts || []),
      ...(unit.exitCriteria || []),
    ]),
  };
}

function getAiSafeUnits(directive: PulseAutonomousDirective): PulseAutonomousDirectiveUnit[] {
  return (directive.nextExecutableUnits || []).filter((unit) => unit.executionMode === 'ai_safe');
}

function getPriorityRank(priority: string): number {
  if (priority === 'P0') {
    return 0;
  }
  if (priority === 'P1') {
    return 1;
  }
  if (priority === 'P2') {
    return 2;
  }
  return 3;
}

function getRiskRank(riskLevel: string): number {
  const normalized = String(riskLevel || '')
    .trim()
    .toLowerCase();
  if (normalized === 'critical') {
    return 3;
  }
  if (normalized === 'high') {
    return 2;
  }
  if (normalized === 'medium') {
    return 1;
  }
  return 0;
}

function getEvidenceRank(evidenceMode: string): number {
  if (evidenceMode === 'observed') {
    return 0;
  }
  if (evidenceMode === 'inferred') {
    return 1;
  }
  return 2;
}

function getConfidenceRank(confidence: string): number {
  const normalized = String(confidence || '')
    .trim()
    .toLowerCase();
  if (normalized === 'high') {
    return 3;
  }
  if (normalized === 'medium') {
    return 2;
  }
  if (normalized === 'low') {
    return 1;
  }

  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) ? numeric : 0;
}

function getKindExecutionPenalty(unit: PulseAutonomousDirectiveUnit): number {
  if (unit.kind === 'capability') {
    return 0;
  }
  if (unit.kind === 'flow') {
    return 4;
  }
  if (unit.kind === 'scope' || unit.kind === 'gate' || unit.kind === 'static') {
    return 7;
  }
  if (unit.kind === 'runtime' || unit.kind === 'change' || unit.kind === 'dependency') {
    return 9;
  }
  if (unit.kind === 'scenario') {
    return 12;
  }
  return 6;
}

function getAutomationExecutionCost(unit: PulseAutonomousDirectiveUnit): number {
  const capabilityCount = (unit.affectedCapabilities || []).length;
  const flowCount = (unit.affectedFlows || []).length;
  const validationCount = unique([
    ...(unit.validationTargets || []),
    ...(unit.validationArtifacts || []),
    ...(unit.exitCriteria || []),
  ]).length;
  const routePenalty = unit.kind === 'scenario' ? Math.max(0, capabilityCount - 2) * 3 : 0;

  return (
    getKindExecutionPenalty(unit) +
    capabilityCount * 3 +
    flowCount * 4 +
    validationCount +
    routePenalty +
    getRiskRank(unit.riskLevel) * 2 +
    getEvidenceRank(unit.evidenceMode)
  );
}

function getStalledUnitIds(previousState?: PulseAutonomyState | null): Set<string> {
  const stalled = new Set<string>();
  const attempts = new Map<string, { attempts: number; stalled: number }>();

  for (const record of (previousState?.history || []).slice(-8)) {
    const unitId = record.unit?.id;
    if (!unitId) {
      continue;
    }

    const current = attempts.get(unitId) || { attempts: 0, stalled: 0 };
    current.attempts += 1;
    const didImprove =
      record.improved === true ||
      (record.directiveDigestBefore !== null &&
        record.directiveDigestAfter !== null &&
        record.directiveDigestBefore !== record.directiveDigestAfter) ||
      (typeof record.directiveBefore?.score === 'number' &&
        typeof record.directiveAfter?.score === 'number' &&
        record.directiveAfter.score > record.directiveBefore.score) ||
      (record.directiveBefore?.blockingTier !== null &&
        record.directiveAfter?.blockingTier !== null &&
        record.directiveAfter.blockingTier < record.directiveBefore.blockingTier);

    if (!didImprove) {
      current.stalled += 1;
    }

    attempts.set(unitId, current);
  }

  for (const [unitId, summary] of attempts.entries()) {
    if (summary.attempts >= 2 && summary.stalled >= 2) {
      stalled.add(unitId);
    }
  }

  return stalled;
}

function getUnitHistory(
  previousState: PulseAutonomyState | null | undefined,
  unitId: string,
): PulseAutonomyIterationRecord[] {
  return (previousState?.history || []).filter((record) => record.unit?.id === unitId);
}

function hasAdaptiveRetryBeenExhausted(
  previousState: PulseAutonomyState | null | undefined,
  unitId: string,
): boolean {
  const history = getUnitHistory(previousState, unitId);
  const last = history[history.length - 1];
  return Boolean(last && last.strategyMode === 'adaptive_narrow_scope' && last.improved === false);
}

function extractMissingStructuralRoles(summary: string): string[] {
  const match = summary.match(/Missing structural roles:\s*([^.;]+)/i);
  if (!match) {
    return [];
  }

  return match[1]
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function buildAdaptivePrompt(
  directive: PulseAutonomousDirective,
  unit: PulseAutonomousDirectiveUnit,
  customPrompt?: string,
): string {
  const missingRoles = extractMissingStructuralRoles(unit.summary);
  const primaryRole = missingRoles[0];
  const narrowedInstructions: string[] = [
    'Adaptive retry is active because this unit stalled in previous iterations.',
    'Do not attempt to fully complete the entire unit in one pass.',
  ];

  if (customPrompt && customPrompt.trim().length > 0) {
    narrowedInstructions.push(customPrompt.trim());
  }

  if (primaryRole) {
    narrowedInstructions.push(
      `Focus only on materializing the missing structural role "${primaryRole}" for this unit.`,
    );
  } else if (unit.kind === 'scenario') {
    narrowedInstructions.push(
      'Focus only on the first missing executable step in the scenario chain and leave other gaps untouched.',
    );
  } else {
    narrowedInstructions.push(
      'Focus only on the smallest real code change that reduces the structural gap for this unit.',
    );
  }

  narrowedInstructions.push(
    'Prefer one narrow, validated improvement over a wide incomplete refactor.',
    'If the smallest useful change is impossible without broader work, stop and explain the exact blocker rather than widening scope.',
  );

  return buildCodexPrompt(directive, unit, narrowedInstructions.join(' '));
}

function buildAdaptiveDecision(
  directive: PulseAutonomousDirective,
  validationCommands: string[],
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): PulseAutonomyDecision {
  const stalledCandidates = getAutomationSafeUnits(directive, riskProfile);
  const candidate = stalledCandidates.find(
    (unit) => !hasAdaptiveRetryBeenExhausted(previousState, unit.id),
  );

  if (!candidate) {
    return {
      shouldContinue: false,
      selectedUnitId: '',
      rationale:
        'Only previously stalled automation-safe units remain, and adaptive narrow-scope retries are already exhausted.',
      codexPrompt: '',
      validationCommands,
      stopReason:
        'Only previously stalled automation-safe units remain and the adaptive retry path is exhausted.',
      strategyMode: 'adaptive_narrow_scope',
    };
  }

  return {
    shouldContinue: true,
    selectedUnitId: candidate.id,
    rationale:
      'Only stalled automation-safe work remains, so the loop is retrying with a narrower adaptive scope.',
    codexPrompt: buildAdaptivePrompt(directive, candidate),
    validationCommands: buildUnitValidationCommands(directive, candidate, validationCommands),
    stopReason: '',
    strategyMode: 'adaptive_narrow_scope',
  };
}

function compareAutomationUnits(
  left: PulseAutonomousDirectiveUnit,
  right: PulseAutonomousDirectiveUnit,
): number {
  const costDelta = getAutomationExecutionCost(left) - getAutomationExecutionCost(right);
  if (costDelta !== 0) {
    return costDelta;
  }

  const priorityDelta = getPriorityRank(left.priority) - getPriorityRank(right.priority);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const confidenceDelta = getConfidenceRank(right.confidence) - getConfidenceRank(left.confidence);
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }

  return left.title.localeCompare(right.title);
}

function isRiskSafeForAutomation(
  unit: PulseAutonomousDirectiveUnit,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
): boolean {
  if (riskProfile === 'dangerous') {
    return true;
  }

  const risk = String(unit.riskLevel || '')
    .trim()
    .toLowerCase();
  if (risk === 'critical' || (riskProfile === 'safe' && risk === 'high')) {
    return false;
  }

  const capabilityCount = (unit.affectedCapabilities || []).length;
  const flowCount = (unit.affectedFlows || []).length;
  return riskProfile === 'safe'
    ? capabilityCount <= 8 && flowCount <= 2
    : capabilityCount <= 12 && flowCount <= 4;
}

function getAutomationSafeUnits(
  directive: PulseAutonomousDirective,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
): PulseAutonomousDirectiveUnit[] {
  return getAiSafeUnits(directive)
    .filter((unit) => isRiskSafeForAutomation(unit, riskProfile))
    .sort(compareAutomationUnits);
}

function getFreshAutomationSafeUnits(
  directive: PulseAutonomousDirective,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): PulseAutonomousDirectiveUnit[] {
  const ranked = getAutomationSafeUnits(directive, riskProfile);
  const stalledUnitIds = getStalledUnitIds(previousState);
  return ranked.filter((unit) => !stalledUnitIds.has(unit.id));
}

function getPreferredAutomationSafeUnits(
  directive: PulseAutonomousDirective,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): PulseAutonomousDirectiveUnit[] {
  const fresh = getFreshAutomationSafeUnits(directive, riskProfile, previousState);
  return fresh.length > 0 ? fresh : getAutomationSafeUnits(directive, riskProfile);
}

function buildSeedHistory(
  previousState?: PulseAutonomyState | null,
): PulseAutonomyIterationRecord[] {
  return previousState?.history?.slice(-20) || [];
}

export function buildPulseAutonomyStateSeed(
  input: PulseAutonomyArtifactSeedInput,
): PulseAutonomyState {
  const { directive, previousState } = input;
  const aiSafeUnits = getAiSafeUnits(directive);
  const blockedUnits = directive.blockedUnits || [];
  const history = buildSeedHistory(previousState);

  return {
    generatedAt: new Date().toISOString(),
    status: previousState?.status || 'idle',
    orchestrationMode: input.orchestrationMode || previousState?.orchestrationMode || 'single',
    riskProfile: input.riskProfile || previousState?.riskProfile || 'balanced',
    plannerMode: input.plannerMode || previousState?.plannerMode || 'deterministic',
    continuous: previousState?.continuous || false,
    maxIterations: previousState?.maxIterations || DEFAULT_MAX_ITERATIONS,
    completedIterations: previousState?.completedIterations || history.length,
    parallelAgents:
      input.parallelAgents || previousState?.parallelAgents || DEFAULT_PARALLEL_AGENTS,
    maxWorkerRetries:
      input.maxWorkerRetries || previousState?.maxWorkerRetries || DEFAULT_MAX_WORKER_RETRIES,
    plannerModel: input.plannerModel ?? previousState?.plannerModel ?? null,
    codexModel: input.codexModel ?? previousState?.codexModel ?? null,
    guidanceGeneratedAt: directive.generatedAt || previousState?.guidanceGeneratedAt || null,
    currentCheckpoint: directive.currentCheckpoint || previousState?.currentCheckpoint || null,
    targetCheckpoint: directive.targetCheckpoint || previousState?.targetCheckpoint || null,
    visionGap: directive.visionGap || previousState?.visionGap || null,
    stopReason: previousState?.stopReason || null,
    nextActionableUnit:
      toUnitSnapshot(
        getPreferredAutomationSafeUnits(
          directive,
          input.riskProfile || previousState?.riskProfile || 'balanced',
          previousState,
        )[0] ||
          aiSafeUnits[0] ||
          null,
      ) ||
      previousState?.nextActionableUnit ||
      null,
    humanRequiredUnits: blockedUnits.filter((unit) => unit.executionMode === 'human_required')
      .length,
    observationOnlyUnits: blockedUnits.filter((unit) => unit.executionMode !== 'human_required')
      .length,
    runner: {
      agentsSdkAvailable: previousState?.runner?.agentsSdkAvailable ?? true,
      agentsSdkVersion: previousState?.runner?.agentsSdkVersion ?? null,
      openAiApiKeyConfigured:
        previousState?.runner?.openAiApiKeyConfigured ?? Boolean(process.env.OPENAI_API_KEY),
      codexCliAvailable: previousState?.runner?.codexCliAvailable ?? false,
    },
    history,
  };
}

function buildAgentOrchestrationSeedHistory(
  previousState?: PulseAgentOrchestrationState | null,
): PulseAgentOrchestrationBatchRecord[] {
  return previousState?.history?.slice(-20) || [];
}

export function buildPulseAgentOrchestrationStateSeed(
  input: PulseAgentOrchestrationArtifactSeedInput,
): PulseAgentOrchestrationState {
  const { directive, previousState } = input;
  const history = buildAgentOrchestrationSeedHistory(previousState);

  return {
    generatedAt: new Date().toISOString(),
    status: previousState?.status || 'idle',
    strategy: 'capability_flow_locking',
    riskProfile: input.riskProfile || previousState?.riskProfile || 'balanced',
    plannerMode: input.plannerMode || previousState?.plannerMode || 'deterministic',
    continuous: previousState?.continuous || false,
    maxIterations: previousState?.maxIterations || DEFAULT_MAX_ITERATIONS,
    completedIterations: previousState?.completedIterations || history.length,
    parallelAgents:
      input.parallelAgents || previousState?.parallelAgents || DEFAULT_PARALLEL_AGENTS,
    maxWorkerRetries:
      input.maxWorkerRetries || previousState?.maxWorkerRetries || DEFAULT_MAX_WORKER_RETRIES,
    guidanceGeneratedAt: directive.generatedAt || previousState?.guidanceGeneratedAt || null,
    currentCheckpoint: directive.currentCheckpoint || previousState?.currentCheckpoint || null,
    targetCheckpoint: directive.targetCheckpoint || previousState?.targetCheckpoint || null,
    visionGap: directive.visionGap || previousState?.visionGap || null,
    stopReason: previousState?.stopReason || null,
    nextBatchUnits: (getPreferredAutomationSafeUnits(
      directive,
      input.riskProfile || previousState?.riskProfile || 'balanced',
    ).length > 0
      ? getPreferredAutomationSafeUnits(
          directive,
          input.riskProfile || previousState?.riskProfile || 'balanced',
        )
      : getAiSafeUnits(directive)
    )
      .slice(0, input.parallelAgents || previousState?.parallelAgents || DEFAULT_PARALLEL_AGENTS)
      .map((unit) => toUnitSnapshot(unit))
      .filter((unit): unit is PulseAutonomyUnitSnapshot => Boolean(unit)),
    runner: {
      agentsSdkAvailable: previousState?.runner?.agentsSdkAvailable ?? true,
      agentsSdkVersion: previousState?.runner?.agentsSdkVersion ?? null,
      openAiApiKeyConfigured:
        previousState?.runner?.openAiApiKeyConfigured ?? Boolean(process.env.OPENAI_API_KEY),
      codexCliAvailable: previousState?.runner?.codexCliAvailable ?? false,
    },
    history,
  };
}

function writePulseAutonomyState(rootDir: string, state: PulseAutonomyState) {
  writeAtomicArtifact(getAutonomyArtifactPath(rootDir), rootDir, JSON.stringify(state, null, 2));
  const memoryState = buildPulseAutonomyMemoryState({
    autonomyState: state,
    orchestrationState: loadPulseAgentOrchestrationState(rootDir),
  });
  writeAtomicArtifact(
    getAutonomyMemoryArtifactPath(rootDir),
    rootDir,
    JSON.stringify(memoryState, null, 2),
  );
}

function loadPulseAutonomyState(rootDir: string): PulseAutonomyState | null {
  return readOptionalArtifact<PulseAutonomyState>(getAutonomyArtifactPath(rootDir));
}

function getAgentOrchestrationArtifactPath(rootDir: string): string {
  return path.join(rootDir, '.pulse', 'current', AGENT_ORCHESTRATION_ARTIFACT);
}

function writePulseAgentOrchestrationState(rootDir: string, state: PulseAgentOrchestrationState) {
  writeAtomicArtifact(
    getAgentOrchestrationArtifactPath(rootDir),
    rootDir,
    JSON.stringify(state, null, 2),
  );
  const memoryState = buildPulseAutonomyMemoryState({
    autonomyState: loadPulseAutonomyState(rootDir),
    orchestrationState: state,
  });
  writeAtomicArtifact(
    getAutonomyMemoryArtifactPath(rootDir),
    rootDir,
    JSON.stringify(memoryState, null, 2),
  );
}

function loadPulseAgentOrchestrationState(rootDir: string): PulseAgentOrchestrationState | null {
  return readOptionalArtifact<PulseAgentOrchestrationState>(
    getAgentOrchestrationArtifactPath(rootDir),
  );
}

function readCanonicalArtifact(
  rootDir: string,
  relativePath: string,
): Record<string, unknown> | null {
  const canonicalPath = path.join(rootDir, '.pulse', 'current', relativePath);
  return readOptionalArtifact<Record<string, unknown>>(canonicalPath);
}

function readDirectiveArtifact(rootDir: string): PulseAutonomousDirective | null {
  const canonicalPath = path.join(rootDir, '.pulse', 'current', 'PULSE_CLI_DIRECTIVE.json');
  const mirrorPath = path.join(rootDir, 'PULSE_CLI_DIRECTIVE.json');
  return (
    readOptionalArtifact<PulseAutonomousDirective>(canonicalPath) ||
    readOptionalArtifact<PulseAutonomousDirective>(mirrorPath)
  );
}

function buildPlannerAgent(
  rootDir: string,
  plannerModel: string,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
) {
  const readPulseArtifact = tool({
    name: 'read_pulse_artifact',
    description:
      'Read a canonical PULSE artifact when the prompt summary is not enough to choose the next ai_safe autonomous unit.',
    parameters: READ_PULSE_ARTIFACT_TOOL_SCHEMA,
    strict: true,
    execute: async ({ artifact }) => {
      const relativePath =
        artifact === 'directive'
          ? 'PULSE_CLI_DIRECTIVE.json'
          : artifact === 'convergence'
            ? 'PULSE_CONVERGENCE_PLAN.json'
            : artifact === 'vision'
              ? 'PULSE_PRODUCT_VISION.json'
              : artifact === 'external_signals'
                ? 'PULSE_EXTERNAL_SIGNAL_STATE.json'
                : AUTONOMY_ARTIFACT;
      const value = readCanonicalArtifact(rootDir, relativePath);
      if (!value) {
        return JSON.stringify(
          {
            artifact,
            available: false,
            summary: 'Artifact not found yet.',
          },
          null,
          2,
        );
      }
      return JSON.stringify(
        {
          artifact,
          available: true,
          payload: value,
        },
        null,
        2,
      );
    },
  });

  return new Agent({
    name: 'pulse_autonomy_planner',
    handoffDescription: 'Chooses the next safe autonomous coding step from live PULSE artifacts.',
    instructions: [
      'You are the PULSE autonomy planner.',
      'Choose the single best ai_safe convergence unit for Codex to execute next.',
      'Never choose human_required or observation_only work.',
      riskProfile === 'dangerous'
        ? 'Dangerous profile is enabled: you may choose any ai_safe unit, including high-risk ones, but never cross governance boundaries.'
        : 'Never choose units marked with high/critical riskLevel or units with a very wide blast radius.',
      'Prefer units with transformational or material product impact over diagnostic-only work.',
      'Prefer the earliest ai_safe unit when two options are otherwise equivalent.',
      'If the directive already reports CERTIFIED, or if no ai_safe unit remains, set shouldContinue=false.',
      'The codexPrompt must instruct Codex to obey AGENTS.md, stay within repo boundaries, make real changes, run validation, and stop only after materially improving the repo state or hitting a real blocker.',
      'Do not claim success that has not been validated.',
      'Return strict JSON that matches the schema.',
    ].join(' '),
    model: plannerModel,
    tools: [readPulseArtifact],
    outputType: PLANNER_OUTPUT_SCHEMA,
  });
}

function buildPlannerPrompt(
  directive: PulseAutonomousDirective,
  previousState: PulseAutonomyState | null,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
): string {
  const aiSafeUnits = getPreferredAutomationSafeUnits(directive, riskProfile, previousState)
    .slice(0, 8)
    .map((unit) => ({
      id: unit.id,
      kind: unit.kind,
      priority: unit.priority,
      productImpact: unit.productImpact,
      ownerLane: unit.ownerLane,
      title: unit.title,
      summary: unit.summary,
      whyNow: unit.whyNow || unit.visionDelta || '',
      affectedCapabilities: unit.affectedCapabilities || [],
      affectedFlows: unit.affectedFlows || [],
      validationTargets: unique([
        ...(unit.validationTargets || []),
        ...(unit.validationArtifacts || []),
      ]).slice(0, 6),
    }));

  return JSON.stringify(
    {
      currentCheckpoint: directive.currentCheckpoint || null,
      currentState: directive.currentState || null,
      visionGap: directive.visionGap || null,
      topBlockers: (directive.topBlockers || []).slice(0, 8),
      topProblems: (directive.topProblems || []).slice(0, 8),
      stopCondition: directive.stopCondition || [],
      doNotTouchSurfaces: directive.doNotTouchSurfaces || [],
      antiGoals: directive.antiGoals || [],
      suggestedValidation: directive.suggestedValidation?.commands || [],
      candidateUnits: aiSafeUnits,
      previousAutonomyState: previousState
        ? {
            status: previousState.status,
            completedIterations: previousState.completedIterations,
            stopReason: previousState.stopReason,
            nextActionableUnit: previousState.nextActionableUnit,
            recentHistory: previousState.history.slice(-3).map((iteration) => ({
              iteration: iteration.iteration,
              status: iteration.status,
              summary: iteration.summary,
              unit: iteration.unit,
              directiveAfter: iteration.directiveAfter,
            })),
          }
        : null,
    },
    null,
    2,
  );
}

function normalizeValidationCommands(
  commands: string[],
  directive: PulseAutonomousDirective,
): string[] {
  if (commands.length > 0) {
    return unique(commands.filter(Boolean));
  }
  const suggested = directive.suggestedValidation?.commands || [];
  if (suggested.length > 0) {
    return unique(suggested.filter(Boolean));
  }
  return DEFAULT_VALIDATION_COMMANDS;
}

function buildUnitValidationCommands(
  directive: PulseAutonomousDirective,
  unit: PulseAutonomousDirectiveUnit,
  fallbackCommands: string[],
): string[] {
  return buildBatchValidationCommands(directive, [unit], fallbackCommands);
}

function buildCodexPrompt(
  directive: PulseAutonomousDirective,
  unit: PulseAutonomousDirectiveUnit,
  customPrompt?: string,
): string {
  const unitValidationTargets = unique([
    ...(unit.validationTargets || []),
    ...(unit.validationArtifacts || []),
    ...(unit.exitCriteria || []),
  ]);
  const instructionLines = [
    `Primary convergence unit: ${unit.title}`,
    `Unit id: ${unit.id}`,
    `Kind: ${unit.kind}`,
    `Priority: ${unit.priority}`,
    `Product impact: ${unit.productImpact}`,
    `Owner lane: ${unit.ownerLane}`,
    `Why now: ${compact(unit.whyNow || unit.visionDelta || unit.summary, 500)}`,
    `Summary: ${compact(unit.summary, 500)}`,
    `Affected capabilities: ${(unit.affectedCapabilities || []).join(', ') || 'none'}`,
    `Affected flows: ${(unit.affectedFlows || []).join(', ') || 'none'}`,
    `Validation targets: ${unitValidationTargets.join(' | ') || 'follow PULSE suggested validation'}`,
    `Current vision gap: ${compact(directive.visionGap || 'unknown', 400)}`,
    `Top blockers: ${(directive.topBlockers || []).slice(0, 5).join(' | ') || 'none'}`,
    `Do not touch surfaces: ${(directive.doNotTouchSurfaces || []).join(', ') || 'none'}`,
    `Anti-goals: ${(directive.antiGoals || []).join(' | ') || 'none'}`,
  ];

  const enforcedHeader = [
    'Work autonomously inside the current repository until this convergence unit is materially improved or you hit a real blocker.',
    'Obey AGENTS.md and every governance boundary. Never weaken governance or fake completion.',
    'Focus on this unit only. Make real code changes, run the validation needed for the touched surfaces, and leave the repo in a better state.',
    'Do not touch human_required or observation_only surfaces.',
    'At the end, return a concise summary of edits, validation, and remaining blockers.',
  ].join(' ');

  if (customPrompt && customPrompt.trim().length > 0) {
    return [enforcedHeader, '', customPrompt.trim(), '', ...instructionLines].join('\n');
  }

  return [enforcedHeader, '', ...instructionLines].join('\n');
}

function buildDeterministicDecision(
  directive: PulseAutonomousDirective,
  validationCommands: string[],
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): PulseAutonomyDecision {
  const unit = getFreshAutomationSafeUnits(directive, riskProfile, previousState)[0];
  if (!unit) {
    return buildAdaptiveDecision(directive, validationCommands, riskProfile, previousState);
  }

  return {
    shouldContinue: true,
    selectedUnitId: unit.id,
    rationale:
      'Selected the highest-ranked ai_safe unit from the PULSE decision queue as a deterministic fallback.',
    codexPrompt: buildCodexPrompt(directive, unit),
    validationCommands: buildUnitValidationCommands(directive, unit, validationCommands),
    stopReason: '',
    strategyMode: 'normal',
  };
}

function coercePlannerDecision(
  value: unknown,
  directive: PulseAutonomousDirective,
  validationCommands: string[],
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): PulseAutonomyDecision {
  const candidate = (value || {}) as Record<string, unknown>;
  const shouldContinue = candidate.shouldContinue === true;
  const selectedUnitId =
    typeof candidate.selectedUnitId === 'string' ? candidate.selectedUnitId : '';
  const rationale = typeof candidate.rationale === 'string' ? candidate.rationale : '';
  const codexPrompt = typeof candidate.codexPrompt === 'string' ? candidate.codexPrompt : '';
  const stopReason = typeof candidate.stopReason === 'string' ? candidate.stopReason : '';
  const commandList = Array.isArray(candidate.validationCommands)
    ? unique(
        candidate.validationCommands.filter((entry): entry is string => typeof entry === 'string'),
      )
    : validationCommands;

  const freshUnit =
    getFreshAutomationSafeUnits(directive, riskProfile, previousState).find(
      (unit) => unit.id === selectedUnitId,
    ) || null;
  const chosenUnit =
    getPreferredAutomationSafeUnits(directive, riskProfile, previousState).find(
      (unit) => unit.id === selectedUnitId,
    ) || null;
  const strategyMode = freshUnit || !chosenUnit ? 'normal' : ('adaptive_narrow_scope' as const);
  if (!shouldContinue || !chosenUnit) {
    return {
      shouldContinue: false,
      selectedUnitId: '',
      rationale:
        rationale ||
        'Planner did not return a valid automation-safe ai_safe unit, so the loop will stop safely.',
      codexPrompt: '',
      validationCommands: commandList,
      stopReason: stopReason || 'Planner did not return a valid automation-safe ai_safe unit.',
      strategyMode: 'normal',
    };
  }

  return {
    shouldContinue: true,
    selectedUnitId: chosenUnit.id,
    rationale: rationale || 'Planner selected the next ai_safe unit from the live PULSE directive.',
    codexPrompt:
      strategyMode === 'adaptive_narrow_scope'
        ? buildAdaptivePrompt(directive, chosenUnit, codexPrompt)
        : buildCodexPrompt(directive, chosenUnit, codexPrompt),
    validationCommands: buildUnitValidationCommands(directive, chosenUnit, commandList),
    stopReason: '',
    strategyMode,
  };
}

async function planWithAgent(
  rootDir: string,
  directive: PulseAutonomousDirective,
  previousState: PulseAutonomyState | null,
  plannerModel: string,
  validationCommands: string[],
  riskProfile: 'safe' | 'balanced' | 'dangerous',
): Promise<PulseAutonomyDecision> {
  const agent = buildPlannerAgent(rootDir, plannerModel, riskProfile);
  const session = new MemorySession({ sessionId: 'pulse-autonomy-planner' });
  const result = await run(agent, buildPlannerPrompt(directive, previousState, riskProfile), {
    maxTurns: 8,
    session,
  });
  return coercePlannerDecision(
    result.finalOutput,
    directive,
    validationCommands,
    riskProfile,
    previousState,
  );
}

function runPulseGuidance(rootDir: string): PulseAutonomousDirective {
  const result = spawnSync('node', ['scripts/pulse/run.js', '--guidance'], {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    throw new Error(compact(result.stderr || result.stdout || 'PULSE guidance failed.', 800));
  }

  const directive = readDirectiveArtifact(rootDir);
  if (!directive) {
    throw new Error('PULSE guidance finished but did not leave a canonical directive artifact.');
  }

  return directive;
}

function buildCodexCommand(args: string[]): string {
  return ['codex', ...args.map((arg) => JSON.stringify(arg))].join(' ');
}

function runCodexExec(
  rootDir: string,
  prompt: string,
  codexModel: string | null,
): { command: string; exitCode: number | null; finalMessage: string | null } {
  const registry = buildArtifactRegistry(rootDir);
  fs.mkdirSync(registry.tempDir, { recursive: true });
  const outputPath = path.join(registry.tempDir, `pulse-autonomy-codex-${Date.now()}.txt`);
  const args = ['exec', '--full-auto', '-C', rootDir, '--output-last-message', outputPath];

  if (codexModel) {
    args.push('-m', codexModel);
  }

  args.push('-');

  const result = spawnSync('codex', args, {
    cwd: rootDir,
    input: prompt,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  });

  const finalMessage = fs.existsSync(outputPath)
    ? fs.readFileSync(outputPath, 'utf8').trim()
    : null;

  return {
    command: buildCodexCommand(args),
    exitCode: result.status,
    finalMessage: finalMessage || null,
  };
}

function buildWorkerPrompt(
  directive: PulseAutonomousDirective,
  unit: PulseAutonomousDirectiveUnit,
  workerOrdinal: number,
  totalWorkers: number,
): string {
  const coordinationHeader = [
    `You are worker ${workerOrdinal} of ${totalWorkers} in a coordinated Codex batch.`,
    'You are running inside an isolated worker workspace that will be reconciled back into the main repository only if your patch applies cleanly.',
    'Stay inside the surfaces assigned to this unit.',
    'Do not expand scope into other queued units, even if you notice adjacent work.',
    'Assume other workers are operating in parallel; do not revert edits made by others.',
    'If the repo state changes under you, adapt safely and keep the convergence unit isolated.',
  ].join(' ');

  return buildCodexPrompt(directive, unit, coordinationHeader);
}

function hasUnitConflict(
  unit: PulseAutonomousDirectiveUnit,
  selectedUnits: PulseAutonomousDirectiveUnit[],
): boolean {
  const capabilitySet = new Set(unit.affectedCapabilities || []);
  const flowSet = new Set(unit.affectedFlows || []);
  return selectedUnits.some((selected) => {
    const selectedCapabilities = selected.affectedCapabilities || [];
    const selectedFlows = selected.affectedFlows || [];
    const capabilityConflict = selectedCapabilities.some((value) => capabilitySet.has(value));
    const flowConflict = selectedFlows.some((value) => flowSet.has(value));
    return capabilityConflict || flowConflict;
  });
}

function selectParallelUnits(
  directive: PulseAutonomousDirective,
  parallelAgents: number,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): PulseAutonomousDirectiveUnit[] {
  const aiSafeUnits = getPreferredAutomationSafeUnits(directive, riskProfile, previousState);
  if (parallelAgents <= 1 || aiSafeUnits.length <= 1) {
    return aiSafeUnits.slice(0, 1);
  }

  const selected: PulseAutonomousDirectiveUnit[] = [];
  for (const unit of aiSafeUnits) {
    if (selected.length >= parallelAgents) {
      break;
    }
    if (selected.length === 0 || !hasUnitConflict(unit, selected)) {
      selected.push(unit);
    }
  }

  if (selected.length === 0 && aiSafeUnits[0]) {
    return [aiSafeUnits[0]];
  }

  return selected;
}

function runCodexExecAsync(
  workingDir: string,
  prompt: string,
  codexModel: string | null,
  workerId: string,
): Promise<{
  command: string;
  exitCode: number | null;
  finalMessage: string | null;
  logPath: string;
}> {
  return new Promise((resolve, reject) => {
    const registry = buildArtifactRegistry(workingDir);
    fs.mkdirSync(registry.tempDir, { recursive: true });
    const timestamp = `${Date.now()}-${workerId}`;
    const outputPath = path.join(registry.tempDir, `pulse-autonomy-${timestamp}.txt`);
    const logPath = path.join(registry.tempDir, `pulse-autonomy-${timestamp}.log`);
    const args = ['exec', '--full-auto', '-C', workingDir, '--output-last-message', outputPath];

    if (codexModel) {
      args.push('-m', codexModel);
    }

    args.push('-');

    const child = spawn('codex', args, {
      cwd: workingDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const logStream = fs.createWriteStream(logPath, { flags: 'a' });
    child.stdout.on('data', (chunk) => {
      logStream.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      logStream.write(chunk);
    });
    child.on('error', (error) => {
      logStream.end();
      reject(error);
    });
    child.on('close', (code) => {
      logStream.end();
      const finalMessage = fs.existsSync(outputPath)
        ? fs.readFileSync(outputPath, 'utf8').trim()
        : null;
      resolve({
        command: buildCodexCommand(args),
        exitCode: code,
        finalMessage: finalMessage || null,
        logPath,
      });
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function shouldExcludeWorkspaceRelativePath(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join('/');
  if (
    ISOLATED_WORKSPACE_EXCLUDED_PREFIXES.some(
      (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }

  const segments = normalized.split('/').filter(Boolean);
  return segments.some((segment) => ISOLATED_WORKSPACE_EXCLUDED_SEGMENTS.includes(segment));
}

function copyWorkspaceFallback(rootDir: string, workspacePath: string) {
  fs.cpSync(rootDir, workspacePath, {
    recursive: true,
    preserveTimestamps: true,
    filter: (sourcePath) => {
      const relativePath = path.relative(rootDir, sourcePath);
      if (!relativePath) {
        return true;
      }
      return !shouldExcludeWorkspaceRelativePath(relativePath);
    },
  });
}

function linkWorkspaceDependencyDirectories(rootDir: string, workspacePath: string) {
  for (const relativePath of ISOLATED_WORKSPACE_DEPENDENCY_DIRS) {
    const sourcePath = path.join(rootDir, relativePath);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }

    const targetPath = path.join(workspacePath, relativePath);
    if (fs.existsSync(targetPath)) {
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.symlinkSync(sourcePath, targetPath, 'dir');
  }
}

function runWorkspaceCommand(
  workingDir: string,
  command: string,
  args: string[],
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(command, args, {
    cwd: workingDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return {
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function ensureWorkspaceGitBaseline(workspacePath: string): string | null {
  const steps: Array<[string, string[]]> = [
    ['git', ['init', '-q']],
    ['git', ['config', 'user.name', 'PULSE Worker']],
    ['git', ['config', 'user.email', 'pulse@local']],
    ['git', ['add', '-A']],
    ['git', ['-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'pulse worker baseline']],
  ];

  for (const [command, args] of steps) {
    const result = runWorkspaceCommand(workspacePath, command, args);
    if (result.status !== 0) {
      return compact(
        result.stderr || result.stdout || `Failed to run ${command} ${args.join(' ')}.`,
        400,
      );
    }
  }

  return null;
}

export function prepareIsolatedWorkerWorkspace(
  rootDir: string,
  workerId: string,
): PulseWorkerWorkspace {
  const registry = buildArtifactRegistry(rootDir);
  const workspaceRoot = path.join(
    registry.tempDir,
    'agent-workspaces',
    `${Date.now().toString(36)}-${workerId}`,
  );
  const workspacePath = path.join(workspaceRoot, 'repo');
  fs.mkdirSync(workspaceRoot, { recursive: true });

  if (commandExists('rsync', rootDir)) {
    const rsync = spawnSync(
      'rsync',
      [
        '-a',
        '--delete',
        '--exclude=.git',
        '--exclude=.pulse/tmp',
        '--exclude=coverage',
        '--exclude=.turbo',
        '--exclude=node_modules',
        '--exclude=.next',
        `${rootDir}/`,
        `${workspacePath}/`,
      ],
      {
        cwd: rootDir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    if (rsync.status !== 0) {
      throw new Error(
        compact(rsync.stderr || rsync.stdout || 'rsync workspace clone failed.', 400),
      );
    }
  } else {
    copyWorkspaceFallback(rootDir, workspacePath);
  }

  linkWorkspaceDependencyDirectories(rootDir, workspacePath);
  const baselineError = ensureWorkspaceGitBaseline(workspacePath);
  if (baselineError) {
    throw new Error(`Unable to initialize isolated workspace for ${workerId}: ${baselineError}`);
  }

  return {
    workspaceMode: 'isolated_copy',
    workspacePath,
    patchPath: path.join(workspaceRoot, `${workerId}.patch`),
  };
}

export function collectWorkspacePatch(
  workspacePath: string,
  patchPath: string,
): {
  patchPath: string | null;
  changedFiles: string[];
  summary: string;
} {
  const diffResult = runWorkspaceCommand(workspacePath, 'git', ['diff', '--binary', 'HEAD', '--']);
  if (diffResult.status !== 0) {
    throw new Error(
      compact(diffResult.stderr || diffResult.stdout || 'Unable to generate worker patch.', 400),
    );
  }

  const changedFilesResult = runWorkspaceCommand(workspacePath, 'git', [
    'diff',
    '--name-only',
    'HEAD',
    '--',
  ]);
  if (changedFilesResult.status !== 0) {
    throw new Error(
      compact(
        changedFilesResult.stderr || changedFilesResult.stdout || 'Unable to list worker changes.',
        400,
      ),
    );
  }

  const changedFiles = changedFilesResult.stdout
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);

  if (diffResult.stdout.trim().length === 0) {
    return {
      patchPath: null,
      changedFiles,
      summary: 'Worker completed without file changes inside the isolated workspace.',
    };
  }

  fs.writeFileSync(patchPath, diffResult.stdout);
  return {
    patchPath,
    changedFiles,
    summary: `Worker produced ${changedFiles.length} changed file(s) in isolated workspace.`,
  };
}

export function applyWorkerPatchToRoot(
  rootDir: string,
  patchPath: string,
  workerId: string,
): { status: 'applied' | 'failed'; summary: string } {
  const checkResult = runWorkspaceCommand(rootDir, 'git', [
    'apply',
    '--check',
    '--whitespace=nowarn',
    patchPath,
  ]);
  if (checkResult.status !== 0) {
    return {
      status: 'failed',
      summary: `Worker ${workerId} patch could not be applied cleanly to the main workspace: ${compact(checkResult.stderr || checkResult.stdout || 'git apply --check failed.', 300)}`,
    };
  }

  const applyResult = runWorkspaceCommand(rootDir, 'git', [
    'apply',
    '--whitespace=nowarn',
    patchPath,
  ]);
  if (applyResult.status !== 0) {
    return {
      status: 'failed',
      summary: `Worker ${workerId} patch failed during application to the main workspace: ${compact(applyResult.stderr || applyResult.stdout || 'git apply failed.', 300)}`,
    };
  }

  return {
    status: 'applied',
    summary: `Worker ${workerId} patch applied cleanly to the main workspace.`,
  };
}

async function runParallelWorkerAssignment(
  rootDir: string,
  directive: PulseAutonomousDirective,
  unit: PulseAutonomousDirectiveUnit,
  workerOrdinal: number,
  totalWorkers: number,
  codexModel: string | null,
  maxWorkerRetries: number,
): Promise<PulseAgentOrchestrationWorkerResult> {
  const workerId = `worker-${workerOrdinal}`;
  const startedAt = new Date().toISOString();
  let workspace: PulseWorkerWorkspace | null = null;
  let attemptCount = 0;
  let logPath: string | null = null;
  let finalCommand: string | null = null;
  let finalExitCode: number | null = null;
  let finalMessage: string | null = null;
  let patchPath: string | null = null;
  let changedFiles: string[] = [];
  let applyStatus: PulseAgentOrchestrationWorkerResult['applyStatus'] = 'not_applicable';
  let applySummary: string | null = null;

  try {
    workspace = prepareIsolatedWorkerWorkspace(rootDir, workerId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown workspace preparation failure.';
    return {
      workerId,
      attemptCount: 0,
      status: 'failed',
      summary: `Worker ${workerId} failed before execution: ${compact(message, 300)}`,
      unit: toUnitSnapshot(unit),
      startedAt,
      finishedAt: new Date().toISOString(),
      lockedCapabilities: unit.affectedCapabilities || [],
      lockedFlows: unit.affectedFlows || [],
      workspaceMode: 'isolated_copy',
      workspacePath: null,
      patchPath: null,
      changedFiles: [],
      applyStatus: 'failed',
      applySummary: compact(message, 300),
      logPath: null,
      codex: {
        executed: false,
        command: null,
        exitCode: 1,
        finalMessage: null,
      },
    };
  }

  while (attemptCount < Math.max(1, maxWorkerRetries + 1)) {
    attemptCount += 1;
    const result = await runCodexExecAsync(
      workspace.workspacePath,
      buildWorkerPrompt(directive, unit, workerOrdinal, totalWorkers),
      codexModel,
      `${workerId}-attempt-${attemptCount}`,
    );
    logPath = result.logPath;
    finalCommand = result.command;
    finalExitCode = result.exitCode;
    finalMessage = result.finalMessage;
    if (result.exitCode === 0) {
      break;
    }
  }

  if (finalExitCode === 0) {
    try {
      const patch = collectWorkspacePatch(workspace.workspacePath, workspace.patchPath);
      patchPath = patch.patchPath;
      changedFiles = patch.changedFiles;
      applyStatus = patch.patchPath ? 'planned' : 'skipped';
      applySummary = patch.summary;
    } catch (error) {
      finalExitCode = 1;
      applyStatus = 'failed';
      applySummary =
        error instanceof Error ? compact(error.message, 300) : 'Unknown patch collection failure.';
    }
  }

  const status = finalExitCode === 0 ? 'completed' : 'failed';
  const finishedAt = new Date().toISOString();
  return {
    workerId,
    attemptCount,
    status,
    summary:
      status === 'completed'
        ? `Worker ${workerId} completed ${unit.title} in ${attemptCount} attempt(s).`
        : `Worker ${workerId} failed ${unit.title} after ${attemptCount} attempt(s).`,
    unit: toUnitSnapshot(unit),
    startedAt,
    finishedAt,
    lockedCapabilities: unit.affectedCapabilities || [],
    lockedFlows: unit.affectedFlows || [],
    workspaceMode: workspace.workspaceMode,
    workspacePath: workspace.workspacePath,
    patchPath,
    changedFiles,
    applyStatus,
    applySummary,
    logPath,
    codex: {
      executed: true,
      command: finalCommand,
      exitCode: finalExitCode,
      finalMessage,
    },
  };
}

function runValidationCommands(
  rootDir: string,
  commands: string[],
): PulseAutonomyValidationCommandResult[] {
  return commands.map((command) => {
    const startedAt = Date.now();
    const result = spawnSync('zsh', ['-lc', command], {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: 'inherit',
    });
    const durationMs = Date.now() - startedAt;
    return {
      command,
      exitCode: result.status,
      durationMs,
      summary:
        result.status === 0
          ? `Command succeeded in ${durationMs}ms.`
          : `Command failed with exit code ${result.status ?? 'unknown'} after ${durationMs}ms.`,
    };
  });
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function coercePositiveInt(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function determinePlannerMode(
  disableAgentPlanner: boolean,
  rootDir: string,
): 'agents_sdk' | 'deterministic' {
  if (disableAgentPlanner) {
    return 'deterministic';
  }
  return Boolean(process.env.OPENAI_API_KEY) && readAgentsSdkVersion(rootDir)
    ? 'agents_sdk'
    : 'deterministic';
}

function appendHistory(
  state: PulseAutonomyState,
  iteration: PulseAutonomyIterationRecord,
): PulseAutonomyState {
  return {
    ...state,
    history: [...state.history, iteration].slice(-20),
    completedIterations: state.completedIterations + 1,
  };
}

function shouldStopForDirective(
  directive: PulseAutonomousDirective,
  riskProfile: 'safe' | 'balanced' | 'dangerous',
  previousState?: PulseAutonomyState | null,
): string | null {
  if (directive.currentState?.certificationStatus === 'CERTIFIED') {
    return 'PULSE is already certified for the current checkpoint.';
  }
  const automationSafeUnits = getAutomationSafeUnits(directive, riskProfile);
  if (automationSafeUnits.length === 0) {
    return 'No automation-safe ai_safe convergence units remain in the current directive.';
  }
  if (getFreshAutomationSafeUnits(directive, riskProfile, previousState).length === 0) {
    const adaptiveCandidateExists = automationSafeUnits.some(
      (unit) => !hasAdaptiveRetryBeenExhausted(previousState, unit.id),
    );
    if (!adaptiveCandidateExists) {
      return 'Only previously stalled automation-safe units remain in the current directive and the adaptive retry path is exhausted.';
    }
  }
  return null;
}

function buildRunOptions(
  rootDir: string,
  flags: {
    dryRun?: boolean;
    continuous?: boolean;
    maxIterations?: number | null;
    intervalMs?: number | null;
    parallelAgents?: number | null;
    maxWorkerRetries?: number | null;
    riskProfile?: 'safe' | 'balanced' | 'dangerous' | null;
    plannerModel?: string | null;
    codexModel?: string | null;
    disableAgentPlanner?: boolean;
  },
): PulseAutonomyRunOptions {
  const validateCommands = process.env.PULSE_AUTONOMY_VALIDATE
    ? process.env.PULSE_AUTONOMY_VALIDATE.split(';;')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

  return {
    rootDir,
    dryRun: Boolean(flags.dryRun),
    continuous: Boolean(flags.continuous),
    maxIterations:
      flags.maxIterations ||
      coercePositiveInt(process.env.PULSE_AUTONOMY_MAX_ITERATIONS, DEFAULT_MAX_ITERATIONS),
    intervalMs:
      flags.intervalMs ||
      coercePositiveInt(process.env.PULSE_AUTONOMY_INTERVAL_MS, DEFAULT_INTERVAL_MS),
    parallelAgents:
      flags.parallelAgents ||
      coercePositiveInt(process.env.PULSE_AUTONOMY_PARALLEL_AGENTS, DEFAULT_PARALLEL_AGENTS),
    maxWorkerRetries:
      flags.maxWorkerRetries ||
      coercePositiveInt(process.env.PULSE_AUTONOMY_MAX_WORKER_RETRIES, DEFAULT_MAX_WORKER_RETRIES),
    riskProfile:
      flags.riskProfile ||
      (process.env.PULSE_AUTONOMY_RISK_PROFILE === 'safe' ||
      process.env.PULSE_AUTONOMY_RISK_PROFILE === 'dangerous'
        ? process.env.PULSE_AUTONOMY_RISK_PROFILE
        : 'balanced'),
    plannerModel: flags.plannerModel || process.env.PULSE_AUTONOMY_MODEL || DEFAULT_PLANNER_MODEL,
    codexModel: flags.codexModel || process.env.PULSE_AUTONOMY_CODEX_MODEL || null,
    disableAgentPlanner:
      Boolean(flags.disableAgentPlanner) ||
      process.env.PULSE_AUTONOMY_DISABLE_AGENT_PLANNER === '1',
    validateCommands,
  };
}

function buildBatchValidationCommands(
  directive: PulseAutonomousDirective,
  units: PulseAutonomousDirectiveUnit[],
  fallbackCommands: string[],
): string[] {
  const commands = normalizeValidationCommands(fallbackCommands, directive);
  const allTargets = units.flatMap((unit) => [
    ...(unit.validationTargets || []),
    ...(unit.validationArtifacts || []),
    ...(unit.exitCriteria || []),
  ]);
  const gateNames = units.flatMap((unit) => unit.gateNames || []);
  const scenarioIds = units.flatMap((unit) => unit.scenarioIds || []);
  const actorFlags = new Set<string>();

  for (const scenarioId of scenarioIds) {
    if (scenarioId.startsWith('customer-')) {
      actorFlags.add('--customer');
      continue;
    }
    if (scenarioId.startsWith('operator-')) {
      actorFlags.add('--operator');
      continue;
    }
    if (scenarioId.startsWith('admin-')) {
      actorFlags.add('--admin');
    }
  }

  if (gateNames.includes('customerPass')) {
    actorFlags.add('--customer');
  }
  if (gateNames.includes('operatorPass')) {
    actorFlags.add('--operator');
  }
  if (gateNames.includes('adminPass')) {
    actorFlags.add('--admin');
  }

  const needsScenarioValidation =
    units.some((unit) => unit.kind === 'scenario') ||
    gateNames.includes('browserPass') ||
    gateNames.includes('customerPass') ||
    gateNames.includes('operatorPass') ||
    gateNames.includes('adminPass') ||
    allTargets.some((target) => target.includes('PULSE_SCENARIO_COVERAGE'));
  const needsRuntimeValidation = allTargets.some(
    (target) =>
      target.includes('PULSE_RUNTIME_EVIDENCE') ||
      target.includes('PULSE_WORLD_STATE') ||
      target.includes('PULSE_FLOW_EVIDENCE') ||
      target.includes('PULSE_CUSTOMER_EVIDENCE') ||
      target.includes('PULSE_RUNTIME_PROBES'),
  );
  const needsBrowserValidation = allTargets.some(
    (target) =>
      target.includes('PULSE_BROWSER_EVIDENCE') || target.includes('Browser-required routes'),
  );

  if (needsScenarioValidation && actorFlags.size > 0) {
    commands.push(`node scripts/pulse/run.js ${Array.from(actorFlags).join(' ')} --fast --json`);
  } else if (needsScenarioValidation) {
    commands.push('node scripts/pulse/run.js --customer --operator --admin --fast --json');
  } else if (needsRuntimeValidation || needsBrowserValidation) {
    commands.push('node scripts/pulse/run.js --deep --fast --json');
  }

  commands.push('node scripts/pulse/run.js --guidance');
  return unique(commands);
}

function summarizeBatchUnits(units: PulseAutonomousDirectiveUnit[]): string {
  return units.map((unit) => unit.title).join(' | ');
}

function appendOrchestrationHistory(
  state: PulseAgentOrchestrationState,
  batch: PulseAgentOrchestrationBatchRecord,
): PulseAgentOrchestrationState {
  return {
    ...state,
    history: [...state.history, batch].slice(-20),
    completedIterations: state.completedIterations + 1,
  };
}

async function runParallelAutonomousLoop(
  rootDir: string,
  options: PulseAutonomyRunOptions,
  plannerMode: 'agents_sdk' | 'deterministic',
  codexCliAvailable: boolean,
  agentsSdkVersion: string | null,
): Promise<PulseAutonomyState> {
  const rollbackGuard = detectRollbackGuard(rootDir);
  const previousState = loadPulseAutonomyState(rootDir);
  const previousOrchestrationState = loadPulseAgentOrchestrationState(rootDir);
  const initialDirective = runPulseGuidance(rootDir);
  let state = buildPulseAutonomyStateSeed({
    directive: initialDirective,
    previousState,
    codexCliAvailable,
    orchestrationMode: 'parallel',
    parallelAgents: options.parallelAgents,
    maxWorkerRetries: options.maxWorkerRetries,
    riskProfile: options.riskProfile,
    plannerMode,
    plannerModel: options.plannerModel,
    codexModel: options.codexModel,
  });
  let orchestrationState = buildPulseAgentOrchestrationStateSeed({
    directive: initialDirective,
    previousState: previousOrchestrationState,
    codexCliAvailable,
    parallelAgents: options.parallelAgents,
    maxWorkerRetries: options.maxWorkerRetries,
    riskProfile: options.riskProfile,
    plannerMode,
  });

  state = {
    ...state,
    status: 'running',
    continuous: options.continuous,
    maxIterations: options.maxIterations,
    parallelAgents: options.parallelAgents,
    maxWorkerRetries: options.maxWorkerRetries,
    orchestrationMode: 'parallel',
    riskProfile: options.riskProfile,
    plannerMode,
    plannerModel: options.plannerModel,
    codexModel: options.codexModel,
    runner: {
      agentsSdkAvailable: Boolean(agentsSdkVersion),
      agentsSdkVersion,
      openAiApiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
      codexCliAvailable,
    },
    stopReason: null,
  };
  orchestrationState = {
    ...orchestrationState,
    status: 'running',
    continuous: options.continuous,
    maxIterations: options.maxIterations,
    parallelAgents: options.parallelAgents,
    maxWorkerRetries: options.maxWorkerRetries,
    riskProfile: options.riskProfile,
    plannerMode,
    runner: {
      agentsSdkAvailable: Boolean(agentsSdkVersion),
      agentsSdkVersion,
      openAiApiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
      codexCliAvailable,
    },
    stopReason: null,
  };
  writePulseAutonomyState(rootDir, state);
  writePulseAgentOrchestrationState(rootDir, orchestrationState);

  let consecutiveNoImprovement = 0;
  let iterations = 0;

  while (iterations < options.maxIterations) {
    iterations += 1;

    const directiveBefore = runPulseGuidance(rootDir);
    const stopReason = shouldStopForDirective(directiveBefore, options.riskProfile, state);
    if (stopReason) {
      state = {
        ...state,
        generatedAt: new Date().toISOString(),
        guidanceGeneratedAt: directiveBefore.generatedAt || state.guidanceGeneratedAt,
        currentCheckpoint: directiveBefore.currentCheckpoint || state.currentCheckpoint,
        targetCheckpoint: directiveBefore.targetCheckpoint || state.targetCheckpoint,
        visionGap: directiveBefore.visionGap || state.visionGap,
        nextActionableUnit: toUnitSnapshot(
          selectParallelUnits(directiveBefore, 1, options.riskProfile, state)[0] || null,
        ),
        status:
          directiveBefore.currentState?.certificationStatus === 'CERTIFIED'
            ? 'completed'
            : 'blocked',
        stopReason,
      };
      orchestrationState = {
        ...orchestrationState,
        generatedAt: new Date().toISOString(),
        guidanceGeneratedAt: directiveBefore.generatedAt || orchestrationState.guidanceGeneratedAt,
        currentCheckpoint:
          directiveBefore.currentCheckpoint || orchestrationState.currentCheckpoint,
        targetCheckpoint: directiveBefore.targetCheckpoint || orchestrationState.targetCheckpoint,
        visionGap: directiveBefore.visionGap || orchestrationState.visionGap,
        nextBatchUnits: selectParallelUnits(
          directiveBefore,
          options.parallelAgents,
          options.riskProfile,
          state,
        )
          .map((unit) => toUnitSnapshot(unit))
          .filter((unit): unit is PulseAutonomyUnitSnapshot => Boolean(unit)),
        status: state.status,
        stopReason,
      };
      writePulseAutonomyState(rootDir, state);
      writePulseAgentOrchestrationState(rootDir, orchestrationState);
      return state;
    }

    const batchUnits = selectParallelUnits(
      directiveBefore,
      options.parallelAgents,
      options.riskProfile,
      state,
    );
    if (batchUnits.length === 0) {
      state = {
        ...state,
        generatedAt: new Date().toISOString(),
        status: 'blocked',
        stopReason: 'No conflict-free automation-safe batch could be formed from the directive.',
      };
      orchestrationState = {
        ...orchestrationState,
        generatedAt: new Date().toISOString(),
        status: 'blocked',
        stopReason: state.stopReason,
      };
      writePulseAutonomyState(rootDir, state);
      writePulseAgentOrchestrationState(rootDir, orchestrationState);
      return state;
    }

    const iterationStartedAt = new Date().toISOString();
    const validationCommands = buildBatchValidationCommands(
      directiveBefore,
      batchUnits,
      options.validateCommands,
    );
    let workerResults: PulseAgentOrchestrationWorkerResult[] = [];
    let validationResults: PulseAutonomyValidationCommandResult[] = [];

    if (!options.dryRun) {
      if (!codexCliAvailable) {
        state = {
          ...state,
          generatedAt: new Date().toISOString(),
          status: 'failed',
          stopReason: 'codex CLI is not available on PATH for parallel autonomous execution.',
        };
        orchestrationState = {
          ...orchestrationState,
          generatedAt: new Date().toISOString(),
          status: 'failed',
          stopReason: state.stopReason,
        };
        writePulseAutonomyState(rootDir, state);
        writePulseAgentOrchestrationState(rootDir, orchestrationState);
        return state;
      }

      workerResults = await Promise.all(
        batchUnits.map((unit, index) =>
          runParallelWorkerAssignment(
            rootDir,
            directiveBefore,
            unit,
            index + 1,
            batchUnits.length,
            options.codexModel,
            options.maxWorkerRetries,
          ),
        ),
      );
      validationResults = runValidationCommands(rootDir, validationCommands);
    } else {
      workerResults = batchUnits.map((unit, index) => ({
        workerId: `worker-${index + 1}`,
        attemptCount: 0,
        status: 'planned',
        summary: `Planned ${unit.title} without executing Codex because dry-run is enabled.`,
        unit: toUnitSnapshot(unit),
        startedAt: iterationStartedAt,
        finishedAt: new Date().toISOString(),
        lockedCapabilities: unit.affectedCapabilities || [],
        lockedFlows: unit.affectedFlows || [],
        workspaceMode: 'isolated_copy',
        workspacePath: null,
        patchPath: null,
        changedFiles: [],
        applyStatus: 'planned',
        applySummary:
          'Worker execution planned in isolated mode but skipped because dry-run is enabled.',
        logPath: null,
        codex: {
          executed: false,
          command: null,
          exitCode: null,
          finalMessage: null,
        },
      }));
    }

    if (!options.dryRun) {
      workerResults = workerResults.map((worker) => {
        if (worker.status !== 'completed' || !worker.patchPath) {
          return worker;
        }

        const applyResult = applyWorkerPatchToRoot(rootDir, worker.patchPath, worker.workerId);
        return {
          ...worker,
          status: applyResult.status === 'applied' ? worker.status : 'failed',
          applyStatus: applyResult.status,
          applySummary:
            worker.applySummary && worker.applySummary.length > 0
              ? `${worker.applySummary} ${applyResult.summary}`
              : applyResult.summary,
          summary:
            applyResult.status === 'applied'
              ? `${worker.summary} ${applyResult.summary}`
              : `Worker ${worker.workerId} failed during integration: ${applyResult.summary}`,
        };
      });
    }

    const directiveAfter = runPulseGuidance(rootDir);
    const beforeSnapshot = getDirectiveSnapshot(directiveBefore);
    const afterSnapshot = getDirectiveSnapshot(directiveAfter);
    const improved =
      directiveDigest(directiveBefore) !== directiveDigest(directiveAfter) ||
      afterSnapshot.score !== beforeSnapshot.score ||
      afterSnapshot.blockingTier !== beforeSnapshot.blockingTier ||
      batchUnits.some(
        (unit) =>
          !getPreferredAutomationSafeUnits(directiveAfter, options.riskProfile, state).some(
            (candidate) => candidate.id === unit.id,
          ),
      );

    consecutiveNoImprovement = improved ? 0 : consecutiveNoImprovement + 1;

    const workerFailure = workerResults.some(
      (worker) =>
        worker.status === 'failed' || (worker.codex.executed && worker.codex.exitCode !== 0),
    );
    const validationFailure = validationResults.some((result) => result.exitCode !== 0);
    const rollbackSummary =
      !options.dryRun && (workerFailure || validationFailure)
        ? rollbackGuard.enabled
          ? rollbackWorkspaceToHead(rootDir)
          : `Automatic rollback skipped: ${rollbackGuard.reason}`
        : null;
    const batchRecord: PulseAgentOrchestrationBatchRecord = {
      batch: orchestrationState.completedIterations + 1,
      strategy: 'capability_flow_locking',
      riskProfile: options.riskProfile,
      plannerMode,
      startedAt: iterationStartedAt,
      finishedAt: new Date().toISOString(),
      summary: options.dryRun
        ? `Planned parallel batch: ${summarizeBatchUnits(batchUnits)}.`
        : improved
          ? `Executed parallel batch with ${workerResults.length} worker(s) and Pulse changed after validation.`
          : `Executed parallel batch with ${workerResults.length} worker(s) but Pulse did not materially change after validation.${rollbackSummary ? ` ${rollbackSummary}` : ''}`,
      directiveDigestBefore: directiveDigest(directiveBefore),
      directiveDigestAfter: directiveDigest(directiveAfter),
      improved,
      workers: workerResults,
      validation: {
        executed: !options.dryRun,
        commands: validationResults,
      },
    };
    orchestrationState = appendOrchestrationHistory(orchestrationState, batchRecord);
    orchestrationState = {
      ...orchestrationState,
      generatedAt: new Date().toISOString(),
      guidanceGeneratedAt: directiveAfter.generatedAt || orchestrationState.guidanceGeneratedAt,
      currentCheckpoint: directiveAfter.currentCheckpoint || orchestrationState.currentCheckpoint,
      targetCheckpoint: directiveAfter.targetCheckpoint || orchestrationState.targetCheckpoint,
      visionGap: directiveAfter.visionGap || orchestrationState.visionGap,
      nextBatchUnits: selectParallelUnits(
        directiveAfter,
        options.parallelAgents,
        options.riskProfile,
        state,
      )
        .map((unit) => toUnitSnapshot(unit))
        .filter((unit): unit is PulseAutonomyUnitSnapshot => Boolean(unit)),
      status:
        directiveAfter.currentState?.certificationStatus === 'CERTIFIED'
          ? 'completed'
          : workerFailure || validationFailure
            ? 'failed'
            : 'running',
      stopReason: null,
    };
    writePulseAgentOrchestrationState(rootDir, orchestrationState);

    const iterationStatus =
      directiveAfter.currentState?.certificationStatus === 'CERTIFIED'
        ? 'completed'
        : workerFailure || validationFailure
          ? 'failed'
          : options.dryRun
            ? 'planned'
            : 'validated';

    const iterationRecord: PulseAutonomyIterationRecord = {
      iteration: state.completedIterations + 1,
      plannerMode,
      status: iterationStatus,
      startedAt: iterationStartedAt,
      finishedAt: new Date().toISOString(),
      summary: options.dryRun
        ? `Planned parallel batch without executing Codex because dry-run is enabled: ${summarizeBatchUnits(batchUnits)}.`
        : improved
          ? `Executed parallel batch and Pulse changed after validation: ${summarizeBatchUnits(batchUnits)}.`
          : `Executed parallel batch without material Pulse change: ${summarizeBatchUnits(batchUnits)}.${rollbackSummary ? ` ${rollbackSummary}` : ''}`,
      improved,
      unit: toUnitSnapshot(batchUnits[0] || null),
      directiveDigestBefore: directiveDigest(directiveBefore),
      directiveDigestAfter: directiveDigest(directiveAfter),
      directiveBefore: beforeSnapshot,
      directiveAfter: afterSnapshot,
      codex: {
        executed: !options.dryRun,
        command:
          workerResults
            .map((worker) => worker.codex.command)
            .filter((value): value is string => Boolean(value))
            .join(' && ') || null,
        exitCode: workerFailure ? 1 : 0,
        finalMessage:
          workerResults
            .map((worker) => worker.codex.finalMessage)
            .filter((value): value is string => Boolean(value))
            .join('\n---\n') || null,
      },
      validation: {
        executed: !options.dryRun,
        commands: validationResults,
      },
    };
    state = appendHistory(state, iterationRecord);
    state = {
      ...state,
      generatedAt: new Date().toISOString(),
      guidanceGeneratedAt: directiveAfter.generatedAt || state.guidanceGeneratedAt,
      currentCheckpoint: directiveAfter.currentCheckpoint || state.currentCheckpoint,
      targetCheckpoint: directiveAfter.targetCheckpoint || state.targetCheckpoint,
      visionGap: directiveAfter.visionGap || state.visionGap,
      nextActionableUnit: toUnitSnapshot(
        selectParallelUnits(directiveAfter, 1, options.riskProfile, state)[0] || null,
      ),
      status: orchestrationState.status,
      stopReason: rollbackSummary,
    };
    writePulseAutonomyState(rootDir, state);

    if (state.status === 'completed' || state.status === 'failed') {
      return state;
    }

    if (consecutiveNoImprovement >= 2) {
      state = {
        ...state,
        generatedAt: new Date().toISOString(),
        status: 'blocked',
        stopReason:
          'Autonomy loop stopped after repeated parallel batches without material Pulse convergence.',
      };
      orchestrationState = {
        ...orchestrationState,
        generatedAt: new Date().toISOString(),
        status: 'blocked',
        stopReason: state.stopReason,
      };
      writePulseAutonomyState(rootDir, state);
      writePulseAgentOrchestrationState(rootDir, orchestrationState);
      return state;
    }

    if (!options.continuous) {
      if (iterations >= options.maxIterations) {
        state = {
          ...state,
          generatedAt: new Date().toISOString(),
          status: 'blocked',
          stopReason: `Reached max iterations (${options.maxIterations}) before certification.`,
        };
        orchestrationState = {
          ...orchestrationState,
          generatedAt: new Date().toISOString(),
          status: 'blocked',
          stopReason: state.stopReason,
        };
        writePulseAutonomyState(rootDir, state);
        writePulseAgentOrchestrationState(rootDir, orchestrationState);
        return state;
      }
      continue;
    }

    await sleep(options.intervalMs);
  }

  state = {
    ...state,
    generatedAt: new Date().toISOString(),
    status: 'blocked',
    stopReason: `Reached max iterations (${options.maxIterations}) before certification.`,
  };
  orchestrationState = {
    ...orchestrationState,
    generatedAt: new Date().toISOString(),
    status: 'blocked',
    stopReason: state.stopReason,
  };
  writePulseAutonomyState(rootDir, state);
  writePulseAgentOrchestrationState(rootDir, orchestrationState);
  return state;
}

/** Run the autonomous Pulse loop. */
export async function runPulseAutonomousLoop(
  rootDir: string,
  flags: {
    dryRun?: boolean;
    continuous?: boolean;
    maxIterations?: number | null;
    intervalMs?: number | null;
    parallelAgents?: number | null;
    maxWorkerRetries?: number | null;
    riskProfile?: 'safe' | 'balanced' | 'dangerous' | null;
    plannerModel?: string | null;
    codexModel?: string | null;
    disableAgentPlanner?: boolean;
  } = {},
): Promise<PulseAutonomyState> {
  const options = buildRunOptions(rootDir, flags);
  const codexCliAvailable = commandExists('codex', rootDir);
  const agentsSdkVersion = readAgentsSdkVersion(rootDir);
  const plannerMode = determinePlannerMode(options.disableAgentPlanner, rootDir);
  if (options.parallelAgents > 1) {
    return runParallelAutonomousLoop(
      rootDir,
      options,
      plannerMode,
      codexCliAvailable,
      agentsSdkVersion,
    );
  }
  const rollbackGuard = detectRollbackGuard(rootDir);
  const previousState = loadPulseAutonomyState(rootDir);
  const previousOrchestrationState = loadPulseAgentOrchestrationState(rootDir);
  const initialDirective = runPulseGuidance(rootDir);
  let state = buildPulseAutonomyStateSeed({
    directive: initialDirective,
    previousState,
    codexCliAvailable,
    orchestrationMode: 'single',
    parallelAgents: options.parallelAgents,
    maxWorkerRetries: options.maxWorkerRetries,
    riskProfile: options.riskProfile,
    plannerMode,
    plannerModel: options.plannerModel,
    codexModel: options.codexModel,
  });
  let orchestrationState = buildPulseAgentOrchestrationStateSeed({
    directive: initialDirective,
    previousState: previousOrchestrationState,
    codexCliAvailable,
    parallelAgents: options.parallelAgents,
    maxWorkerRetries: options.maxWorkerRetries,
    riskProfile: options.riskProfile,
    plannerMode,
  });

  state = {
    ...state,
    status: 'running',
    continuous: options.continuous,
    maxIterations: options.maxIterations,
    parallelAgents: options.parallelAgents,
    maxWorkerRetries: options.maxWorkerRetries,
    orchestrationMode: 'single',
    riskProfile: options.riskProfile,
    plannerMode,
    plannerModel: options.plannerModel,
    codexModel: options.codexModel,
    runner: {
      agentsSdkAvailable: Boolean(agentsSdkVersion),
      agentsSdkVersion,
      openAiApiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
      codexCliAvailable,
    },
    stopReason: null,
  };
  orchestrationState = {
    ...orchestrationState,
    status: 'idle',
    continuous: options.continuous,
    maxIterations: options.maxIterations,
    parallelAgents: options.parallelAgents,
    maxWorkerRetries: options.maxWorkerRetries,
    riskProfile: options.riskProfile,
    runner: {
      agentsSdkAvailable: Boolean(agentsSdkVersion),
      agentsSdkVersion,
      openAiApiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
      codexCliAvailable,
    },
  };
  writePulseAutonomyState(rootDir, state);
  writePulseAgentOrchestrationState(rootDir, orchestrationState);

  let consecutiveNoImprovement = 0;
  let iterations = 0;

  while (iterations < options.maxIterations) {
    iterations += 1;

    const directiveBefore = runPulseGuidance(rootDir);
    const stopReason = shouldStopForDirective(directiveBefore, options.riskProfile, state);
    if (stopReason) {
      state = {
        ...state,
        generatedAt: new Date().toISOString(),
        guidanceGeneratedAt: directiveBefore.generatedAt || state.guidanceGeneratedAt,
        currentCheckpoint: directiveBefore.currentCheckpoint || state.currentCheckpoint,
        targetCheckpoint: directiveBefore.targetCheckpoint || state.targetCheckpoint,
        visionGap: directiveBefore.visionGap || state.visionGap,
        nextActionableUnit: toUnitSnapshot(
          getPreferredAutomationSafeUnits(directiveBefore, options.riskProfile, state)[0] || null,
        ),
        status:
          directiveBefore.currentState?.certificationStatus === 'CERTIFIED'
            ? 'completed'
            : 'blocked',
        stopReason,
      };
      writePulseAutonomyState(rootDir, state);
      return state;
    }

    const validationCommands = normalizeValidationCommands(
      options.validateCommands,
      directiveBefore,
    );
    const decision =
      plannerMode === 'agents_sdk'
        ? await planWithAgent(
            rootDir,
            directiveBefore,
            state,
            options.plannerModel || DEFAULT_PLANNER_MODEL,
            validationCommands,
            options.riskProfile,
          )
        : buildDeterministicDecision(
            directiveBefore,
            validationCommands,
            options.riskProfile,
            state,
          );

    if (!decision.shouldContinue) {
      state = {
        ...state,
        generatedAt: new Date().toISOString(),
        guidanceGeneratedAt: directiveBefore.generatedAt || state.guidanceGeneratedAt,
        currentCheckpoint: directiveBefore.currentCheckpoint || state.currentCheckpoint,
        targetCheckpoint: directiveBefore.targetCheckpoint || state.targetCheckpoint,
        visionGap: directiveBefore.visionGap || state.visionGap,
        nextActionableUnit: toUnitSnapshot(
          getPreferredAutomationSafeUnits(directiveBefore, options.riskProfile, state)[0] || null,
        ),
        status: 'blocked',
        stopReason: decision.stopReason || 'Planner stopped the autonomous loop.',
      };
      writePulseAutonomyState(rootDir, state);
      return state;
    }

    const selectedUnit =
      getPreferredAutomationSafeUnits(directiveBefore, options.riskProfile, state).find(
        (unit) => unit.id === decision.selectedUnitId,
      ) || null;
    if (!selectedUnit) {
      state = {
        ...state,
        generatedAt: new Date().toISOString(),
        status: 'failed',
        stopReason: `Planner selected unknown or non-ai_safe unit: ${decision.selectedUnitId}`,
      };
      writePulseAutonomyState(rootDir, state);
      return state;
    }

    const executionValidationCommands = buildUnitValidationCommands(
      directiveBefore,
      selectedUnit,
      decision.validationCommands,
    );
    const iterationStartedAt = new Date().toISOString();
    let codexResult = {
      executed: false,
      command: null as string | null,
      exitCode: null as number | null,
      finalMessage: null as string | null,
    };
    let validationResults: PulseAutonomyValidationCommandResult[] = [];

    if (!options.dryRun) {
      if (!codexCliAvailable) {
        state = {
          ...state,
          generatedAt: new Date().toISOString(),
          status: 'failed',
          stopReason: 'codex CLI is not available on PATH for autonomous execution.',
        };
        writePulseAutonomyState(rootDir, state);
        return state;
      }

      const executed = runCodexExec(rootDir, decision.codexPrompt, options.codexModel);
      codexResult = {
        executed: true,
        command: executed.command,
        exitCode: executed.exitCode,
        finalMessage: executed.finalMessage,
      };
      validationResults = runValidationCommands(rootDir, executionValidationCommands);
    }

    const directiveAfter = runPulseGuidance(rootDir);
    const beforeSnapshot = getDirectiveSnapshot(directiveBefore);
    const afterSnapshot = getDirectiveSnapshot(directiveAfter);
    const iterationStatus =
      directiveAfter.currentState?.certificationStatus === 'CERTIFIED'
        ? 'completed'
        : codexResult.executed && codexResult.exitCode !== 0
          ? 'failed'
          : validationResults.some((result) => result.exitCode !== 0)
            ? 'failed'
            : options.dryRun
              ? 'planned'
              : 'validated';

    const improved =
      directiveDigest(directiveBefore) !== directiveDigest(directiveAfter) ||
      afterSnapshot.score !== beforeSnapshot.score ||
      afterSnapshot.blockingTier !== beforeSnapshot.blockingTier ||
      !getPreferredAutomationSafeUnits(directiveAfter, options.riskProfile, state).some(
        (unit) => unit.id === selectedUnit.id,
      );

    const rollbackSummary =
      !options.dryRun && iterationStatus === 'failed'
        ? rollbackGuard.enabled
          ? rollbackWorkspaceToHead(rootDir)
          : `Automatic rollback skipped: ${rollbackGuard.reason}`
        : null;

    consecutiveNoImprovement = improved ? 0 : consecutiveNoImprovement + 1;

    const iterationRecord: PulseAutonomyIterationRecord = {
      iteration: state.completedIterations + 1,
      plannerMode,
      strategyMode: decision.strategyMode,
      status: iterationStatus,
      startedAt: iterationStartedAt,
      finishedAt: new Date().toISOString(),
      summary: options.dryRun
        ? `Planned ${selectedUnit.title} without executing Codex because dry-run is enabled.`
        : improved
          ? `Executed ${selectedUnit.title} and Pulse changed after validation.`
          : `Executed ${selectedUnit.title} but Pulse did not materially change after validation.${rollbackSummary ? ` ${rollbackSummary}` : ''}`,
      improved,
      unit: toUnitSnapshot(selectedUnit),
      directiveDigestBefore: directiveDigest(directiveBefore),
      directiveDigestAfter: directiveDigest(directiveAfter),
      directiveBefore: beforeSnapshot,
      directiveAfter: afterSnapshot,
      codex: codexResult,
      validation: {
        executed: !options.dryRun,
        commands: validationResults,
      },
    };

    state = appendHistory(state, iterationRecord);
    state = {
      ...state,
      generatedAt: new Date().toISOString(),
      guidanceGeneratedAt: directiveAfter.generatedAt || state.guidanceGeneratedAt,
      currentCheckpoint: directiveAfter.currentCheckpoint || state.currentCheckpoint,
      targetCheckpoint: directiveAfter.targetCheckpoint || state.targetCheckpoint,
      visionGap: directiveAfter.visionGap || state.visionGap,
      nextActionableUnit: toUnitSnapshot(
        getPreferredAutomationSafeUnits(directiveAfter, options.riskProfile, state)[0] || null,
      ),
      status:
        directiveAfter.currentState?.certificationStatus === 'CERTIFIED'
          ? 'completed'
          : iterationStatus === 'failed'
            ? 'failed'
            : 'running',
      stopReason: rollbackSummary,
    };
    writePulseAutonomyState(rootDir, state);

    if (state.status === 'completed' || state.status === 'failed') {
      return state;
    }

    if (consecutiveNoImprovement >= 2) {
      state = {
        ...state,
        generatedAt: new Date().toISOString(),
        status: 'blocked',
        stopReason:
          'Autonomy loop stopped after repeated iterations without material Pulse convergence.',
      };
      writePulseAutonomyState(rootDir, state);
      return state;
    }

    if (!options.continuous) {
      if (iterations >= options.maxIterations) {
        state = {
          ...state,
          generatedAt: new Date().toISOString(),
          status: 'blocked',
          stopReason: `Reached max iterations (${options.maxIterations}) before certification.`,
        };
        writePulseAutonomyState(rootDir, state);
        return state;
      }
      continue;
    }

    await sleep(options.intervalMs);
  }

  state = {
    ...state,
    generatedAt: new Date().toISOString(),
    status: 'blocked',
    stopReason: `Reached max iterations (${options.maxIterations}) before certification.`,
  };
  writePulseAutonomyState(rootDir, state);
  return state;
}
