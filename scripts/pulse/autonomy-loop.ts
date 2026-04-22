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
}

interface PulseAutonomyRunOptions {
  rootDir: string;
  dryRun: boolean;
  continuous: boolean;
  maxIterations: number;
  intervalMs: number;
  parallelAgents: number;
  maxWorkerRetries: number;
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
const DEFAULT_MAX_ITERATIONS = 5;
const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_PARALLEL_AGENTS = 1;
const DEFAULT_MAX_WORKER_RETRIES = 1;
const DEFAULT_PLANNER_MODEL = 'gpt-4.1';
const DEFAULT_VALIDATION_COMMANDS = ['npm run typecheck', 'node scripts/pulse/run.js --guidance'];

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
        generatedAt: directive.generatedAt || null,
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

function isRiskSafeForAutomation(unit: PulseAutonomousDirectiveUnit): boolean {
  const risk = String(unit.riskLevel || '')
    .trim()
    .toLowerCase();
  if (risk === 'critical' || risk === 'high') {
    return false;
  }

  const capabilityCount = (unit.affectedCapabilities || []).length;
  const flowCount = (unit.affectedFlows || []).length;
  return capabilityCount <= 12 && flowCount <= 4;
}

function getAutomationSafeUnits(
  directive: PulseAutonomousDirective,
): PulseAutonomousDirectiveUnit[] {
  return getAiSafeUnits(directive).filter(isRiskSafeForAutomation);
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
      toUnitSnapshot(getAutomationSafeUnits(directive)[0] || aiSafeUnits[0] || null) ||
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
    nextBatchUnits: (getAutomationSafeUnits(directive).length > 0
      ? getAutomationSafeUnits(directive)
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

function buildPlannerAgent(rootDir: string, plannerModel: string) {
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
      'Never choose units marked with high/critical riskLevel or units with a very wide blast radius.',
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
): string {
  const aiSafeUnits = getAiSafeUnits(directive)
    .filter(isRiskSafeForAutomation)
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
): PulseAutonomyDecision {
  const unit = getAutomationSafeUnits(directive)[0];
  if (!unit) {
    return {
      shouldContinue: false,
      selectedUnitId: '',
      rationale: 'No automation-safe ai_safe convergence units remain in the directive.',
      codexPrompt: '',
      validationCommands,
      stopReason: 'No automation-safe ai_safe convergence units remain.',
    };
  }

  return {
    shouldContinue: true,
    selectedUnitId: unit.id,
    rationale:
      'Selected the highest-ranked ai_safe unit from the PULSE decision queue as a deterministic fallback.',
    codexPrompt: buildCodexPrompt(directive, unit),
    validationCommands,
    stopReason: '',
  };
}

function coercePlannerDecision(
  value: unknown,
  directive: PulseAutonomousDirective,
  validationCommands: string[],
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

  const chosenUnit =
    getAutomationSafeUnits(directive).find((unit) => unit.id === selectedUnitId) || null;
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
    };
  }

  return {
    shouldContinue: true,
    selectedUnitId: chosenUnit.id,
    rationale: rationale || 'Planner selected the next ai_safe unit from the live PULSE directive.',
    codexPrompt: buildCodexPrompt(directive, chosenUnit, codexPrompt),
    validationCommands: commandList,
    stopReason: '',
  };
}

async function planWithAgent(
  rootDir: string,
  directive: PulseAutonomousDirective,
  previousState: PulseAutonomyState | null,
  plannerModel: string,
  validationCommands: string[],
): Promise<PulseAutonomyDecision> {
  const agent = buildPlannerAgent(rootDir, plannerModel);
  const session = new MemorySession({ sessionId: 'pulse-autonomy-planner' });
  const result = await run(agent, buildPlannerPrompt(directive, previousState), {
    maxTurns: 8,
    session,
  });
  return coercePlannerDecision(result.finalOutput, directive, validationCommands);
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
): PulseAutonomousDirectiveUnit[] {
  const aiSafeUnits = getAutomationSafeUnits(directive);
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
  rootDir: string,
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
    const registry = buildArtifactRegistry(rootDir);
    fs.mkdirSync(registry.tempDir, { recursive: true });
    const timestamp = `${Date.now()}-${workerId}`;
    const outputPath = path.join(registry.tempDir, `pulse-autonomy-${timestamp}.txt`);
    const logPath = path.join(registry.tempDir, `pulse-autonomy-${timestamp}.log`);
    const args = ['exec', '--full-auto', '-C', rootDir, '--output-last-message', outputPath];

    if (codexModel) {
      args.push('-m', codexModel);
    }

    args.push('-');

    const child = spawn('codex', args, {
      cwd: rootDir,
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
  let attemptCount = 0;
  let logPath: string | null = null;
  let finalCommand: string | null = null;
  let finalExitCode: number | null = null;
  let finalMessage: string | null = null;

  while (attemptCount < Math.max(1, maxWorkerRetries + 1)) {
    attemptCount += 1;
    const result = await runCodexExecAsync(
      rootDir,
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

function shouldStopForDirective(directive: PulseAutonomousDirective): string | null {
  if (directive.currentState?.certificationStatus === 'CERTIFIED') {
    return 'PULSE is already certified for the current checkpoint.';
  }
  if (getAutomationSafeUnits(directive).length === 0) {
    return 'No automation-safe ai_safe convergence units remain in the current directive.';
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
  const needsScenarioValidation =
    units.some((unit) => unit.kind === 'scenario') ||
    allTargets.some((target) => target.includes('PULSE_SCENARIO_COVERAGE'));
  const needsRuntimeValidation = allTargets.some(
    (target) =>
      target.includes('PULSE_RUNTIME_EVIDENCE') ||
      target.includes('PULSE_WORLD_STATE') ||
      target.includes('PULSE_FLOW_EVIDENCE') ||
      target.includes('PULSE_CUSTOMER_EVIDENCE'),
  );
  const needsBrowserValidation = allTargets.some(
    (target) =>
      target.includes('PULSE_BROWSER_EVIDENCE') || target.includes('Browser-required routes'),
  );

  if (needsScenarioValidation) {
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
    const stopReason = shouldStopForDirective(directiveBefore);
    if (stopReason) {
      state = {
        ...state,
        generatedAt: new Date().toISOString(),
        guidanceGeneratedAt: directiveBefore.generatedAt || state.guidanceGeneratedAt,
        currentCheckpoint: directiveBefore.currentCheckpoint || state.currentCheckpoint,
        targetCheckpoint: directiveBefore.targetCheckpoint || state.targetCheckpoint,
        visionGap: directiveBefore.visionGap || state.visionGap,
        nextActionableUnit: toUnitSnapshot(selectParallelUnits(directiveBefore, 1)[0] || null),
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
        nextBatchUnits: selectParallelUnits(directiveBefore, options.parallelAgents)
          .map((unit) => toUnitSnapshot(unit))
          .filter((unit): unit is PulseAutonomyUnitSnapshot => Boolean(unit)),
        status: state.status,
        stopReason,
      };
      writePulseAutonomyState(rootDir, state);
      writePulseAgentOrchestrationState(rootDir, orchestrationState);
      return state;
    }

    const batchUnits = selectParallelUnits(directiveBefore, options.parallelAgents);
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
        logPath: null,
        codex: {
          executed: false,
          command: null,
          exitCode: null,
          finalMessage: null,
        },
      }));
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
          !getAutomationSafeUnits(directiveAfter).some((candidate) => candidate.id === unit.id),
      );

    consecutiveNoImprovement = improved ? 0 : consecutiveNoImprovement + 1;

    const workerFailure = workerResults.some(
      (worker) => worker.codex.executed && worker.codex.exitCode !== 0,
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
      nextBatchUnits: selectParallelUnits(directiveAfter, options.parallelAgents)
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
      nextActionableUnit: toUnitSnapshot(selectParallelUnits(directiveAfter, 1)[0] || null),
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
    const stopReason = shouldStopForDirective(directiveBefore);
    if (stopReason) {
      state = {
        ...state,
        generatedAt: new Date().toISOString(),
        guidanceGeneratedAt: directiveBefore.generatedAt || state.guidanceGeneratedAt,
        currentCheckpoint: directiveBefore.currentCheckpoint || state.currentCheckpoint,
        targetCheckpoint: directiveBefore.targetCheckpoint || state.targetCheckpoint,
        visionGap: directiveBefore.visionGap || state.visionGap,
        nextActionableUnit: toUnitSnapshot(getAutomationSafeUnits(directiveBefore)[0] || null),
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
          )
        : buildDeterministicDecision(directiveBefore, validationCommands);

    if (!decision.shouldContinue) {
      state = {
        ...state,
        generatedAt: new Date().toISOString(),
        guidanceGeneratedAt: directiveBefore.generatedAt || state.guidanceGeneratedAt,
        currentCheckpoint: directiveBefore.currentCheckpoint || state.currentCheckpoint,
        targetCheckpoint: directiveBefore.targetCheckpoint || state.targetCheckpoint,
        visionGap: directiveBefore.visionGap || state.visionGap,
        nextActionableUnit: toUnitSnapshot(getAutomationSafeUnits(directiveBefore)[0] || null),
        status: 'blocked',
        stopReason: decision.stopReason || 'Planner stopped the autonomous loop.',
      };
      writePulseAutonomyState(rootDir, state);
      return state;
    }

    const selectedUnit =
      getAutomationSafeUnits(directiveBefore).find((unit) => unit.id === decision.selectedUnitId) ||
      null;
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
      validationResults = runValidationCommands(rootDir, decision.validationCommands);
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
      !getAutomationSafeUnits(directiveAfter).some((unit) => unit.id === selectedUnit.id);

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
      status: iterationStatus,
      startedAt: iterationStartedAt,
      finishedAt: new Date().toISOString(),
      summary: options.dryRun
        ? `Planned ${selectedUnit.title} without executing Codex because dry-run is enabled.`
        : improved
          ? `Executed ${selectedUnit.title} and Pulse changed after validation.`
          : `Executed ${selectedUnit.title} but Pulse did not materially change after validation.${rollbackSummary ? ` ${rollbackSummary}` : ''}`,
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
      nextActionableUnit: toUnitSnapshot(getAutomationSafeUnits(directiveAfter)[0] || null),
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
