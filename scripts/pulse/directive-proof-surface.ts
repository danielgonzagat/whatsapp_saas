import type { PathProofPlan, PathProofTask, PathProofTaskMode } from './path-proof-runner';
import type { PulseMachineReadiness } from './artifacts.types';
import type { PathCoverageState } from './types.path-coverage-engine';

export type DirectiveProofSurfaceExecutionMode =
  | 'ai_safe'
  | 'governed_sandbox'
  | 'observation_only'
  | 'human_required';

export interface DirectiveProofSurfaceFreshness {
  generatedAt: string | null;
  ageMinutes: number | null;
  stale: boolean;
  source: 'path_proof_plan' | 'path_coverage' | 'machine_readiness' | 'missing';
  staleThresholdMinutes: number;
}

export interface DirectiveProofSurfaceTask {
  taskId: string;
  pathId: string;
  mode: PathProofTaskMode;
  risk: PathProofTask['risk'];
  sourceStatus: PathProofTask['sourceStatus'];
  title: string;
  reason: string;
  validationCommand: string;
  expectedEvidenceKinds: string[];
  artifactPaths: string[];
}

export interface DirectiveProofSurfaceCounts {
  plannedTasks: number;
  unprovedTasks: number;
  executableUnprovedTasks: number;
  humanRequiredTasks: number;
  notExecutableTasks: number;
  readinessBlockers: number;
  criticalUnobservedPaths: number | null;
  criticalBlueprintReady: number | null;
  coveragePercent: number | null;
}

export interface DirectiveProofSurface {
  summary: string;
  counts: DirectiveProofSurfaceCounts;
  executionMode: DirectiveProofSurfaceExecutionMode;
  topExecutableUnprovedTasks: DirectiveProofSurfaceTask[];
  evidenceFreshness: DirectiveProofSurfaceFreshness;
  validationCommandHints: string[];
  readiness: {
    status: PulseMachineReadiness['status'] | 'UNKNOWN';
    canRunBoundedAutonomousCycle: boolean | null;
    canDeclareProductCertified: boolean | null;
    blockers: string[];
  };
}

export interface BuildDirectiveProofSurfaceInput {
  pathProofPlan?: PathProofPlan | null;
  pathCoverage?: PathCoverageState | null;
  machineReadiness?: PulseMachineReadiness | null;
  now?: string | Date;
  maxTopTasks?: number;
  maxCommandHints?: number;
  staleThresholdMinutes?: number;
}

const DEFAULT_MAX_TOP_TASKS = 5;
const DEFAULT_MAX_COMMAND_HINTS = 5;
const DEFAULT_STALE_THRESHOLD_MINUTES = 60 * 24;

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function minutesBetween(left: Date, right: Date): number {
  return Math.max(0, Math.floor((left.getTime() - right.getTime()) / 60000));
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      return false;
    }
    seen.add(trimmed);
    return true;
  });
}

function riskRank(risk: PathProofTask['risk']): number {
  const ranks: Record<PathProofTask['risk'], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };
  return ranks[risk] ?? 4;
}

function modeRank(mode: PathProofTaskMode): number {
  const ranks: Record<PathProofTaskMode, number> = {
    endpoint: 0,
    webhook: 1,
    worker: 2,
    ui: 3,
    function: 4,
    human_required: 5,
    not_executable: 6,
  };
  return ranks[mode] ?? 7;
}

function isUnproved(task: PathProofTask): boolean {
  return task.executed === false && task.coverageCountsAsObserved === false;
}

function isExecutableUnproved(task: PathProofTask): boolean {
  return task.autonomousExecutionAllowed && isUnproved(task);
}

function taskTitle(task: PathProofTask): string {
  const description = task.entrypoint.description.trim();
  return description || task.entrypoint.routePattern || task.entrypoint.filePath || task.pathId;
}

function summarizeTask(task: PathProofTask): DirectiveProofSurfaceTask {
  return {
    taskId: task.taskId,
    pathId: task.pathId,
    mode: task.mode,
    risk: task.risk,
    sourceStatus: task.sourceStatus,
    title: taskTitle(task),
    reason: task.reason,
    validationCommand: task.command,
    expectedEvidenceKinds: unique(
      task.expectedEvidence.filter((entry) => entry.required).map((entry) => entry.kind),
    ),
    artifactPaths: unique(task.artifactLinks.map((link) => link.artifactPath)),
  };
}

function buildFreshness(input: BuildDirectiveProofSurfaceInput): DirectiveProofSurfaceFreshness {
  const now = toDate(input.now) ?? new Date();
  const staleThresholdMinutes = input.staleThresholdMinutes ?? DEFAULT_STALE_THRESHOLD_MINUTES;
  const candidates: Array<{
    generatedAt: string | null | undefined;
    source: DirectiveProofSurfaceFreshness['source'];
  }> = [
    { generatedAt: input.pathProofPlan?.generatedAt, source: 'path_proof_plan' },
    { generatedAt: input.pathCoverage?.generatedAt, source: 'path_coverage' },
    { generatedAt: input.machineReadiness?.generatedAt, source: 'machine_readiness' },
  ];

  for (const candidate of candidates) {
    const generatedAt = toDate(candidate.generatedAt);
    if (!generatedAt) {
      continue;
    }
    const ageMinutes = minutesBetween(now, generatedAt);
    return {
      generatedAt: generatedAt.toISOString(),
      ageMinutes,
      stale: ageMinutes > staleThresholdMinutes,
      source: candidate.source,
      staleThresholdMinutes,
    };
  }

  return {
    generatedAt: null,
    ageMinutes: null,
    stale: true,
    source: 'missing',
    staleThresholdMinutes,
  };
}

function deriveExecutionMode(
  tasks: PathProofTask[],
  readiness: PulseMachineReadiness | null | undefined,
): DirectiveProofSurfaceExecutionMode {
  const executable = tasks.filter(isExecutableUnproved);
  if (executable.some((task) => task.risk === 'critical')) {
    return 'governed_sandbox';
  }
  if (executable.length > 0) {
    return 'ai_safe';
  }
  if (tasks.some((task) => isUnproved(task) && task.mode === 'human_required')) {
    return 'human_required';
  }
  if (readiness && readiness.status !== 'READY' && readiness.blockers.length > 0) {
    return 'ai_safe';
  }
  return 'observation_only';
}

function buildSummary(
  counts: DirectiveProofSurfaceCounts,
  mode: DirectiveProofSurfaceExecutionMode,
): string {
  if (counts.executableUnprovedTasks > 0) {
    return `${counts.executableUnprovedTasks} executable unproved path proof task(s) remain; next execution mode is ${mode}.`;
  }
  if (counts.humanRequiredTasks > 0) {
    return `${counts.humanRequiredTasks} unproved path proof task(s) require human or observation-only handling.`;
  }
  if (counts.readinessBlockers > 0) {
    return `${counts.readinessBlockers} machine-readiness blocker(s) remain without executable path proof tasks.`;
  }
  return 'No executable unproved path proof tasks remain in the provided proof surface.';
}

export function buildDirectiveProofSurface(
  input: BuildDirectiveProofSurfaceInput,
): DirectiveProofSurface {
  const tasks = input.pathProofPlan?.tasks ?? [];
  const maxTopTasks = input.maxTopTasks ?? DEFAULT_MAX_TOP_TASKS;
  const maxCommandHints = input.maxCommandHints ?? DEFAULT_MAX_COMMAND_HINTS;
  const topExecutableUnprovedTasks = tasks
    .filter(isExecutableUnproved)
    .sort(
      (left, right) =>
        riskRank(left.risk) - riskRank(right.risk) ||
        modeRank(left.mode) - modeRank(right.mode) ||
        left.pathId.localeCompare(right.pathId),
    )
    .slice(0, maxTopTasks)
    .map(summarizeTask);
  const readinessBlockers = input.machineReadiness?.blockers ?? [];
  const counts: DirectiveProofSurfaceCounts = {
    plannedTasks: input.pathProofPlan?.summary.plannedTasks ?? tasks.length,
    unprovedTasks: tasks.filter(isUnproved).length,
    executableUnprovedTasks: tasks.filter(isExecutableUnproved).length,
    humanRequiredTasks: tasks.filter((task) => task.mode === 'human_required').length,
    notExecutableTasks: tasks.filter((task) => task.mode === 'not_executable').length,
    readinessBlockers: readinessBlockers.length,
    criticalUnobservedPaths: input.pathCoverage?.summary.criticalUnobserved ?? null,
    criticalBlueprintReady: input.pathCoverage?.summary.criticalBlueprintReady ?? null,
    coveragePercent: input.pathCoverage?.summary.coveragePercent ?? null,
  };
  const executionMode = deriveExecutionMode(tasks, input.machineReadiness);
  const validationCommandHints = unique([
    ...topExecutableUnprovedTasks.map((task) => task.validationCommand),
    ...(input.machineReadiness?.criteria ?? [])
      .filter((criterion) => criterion.status !== 'pass')
      .map((criterion) => `node scripts/pulse/run.js --guidance # refresh ${criterion.id}`),
  ]).slice(0, maxCommandHints);

  return {
    summary: buildSummary(counts, executionMode),
    counts,
    executionMode,
    topExecutableUnprovedTasks,
    evidenceFreshness: buildFreshness(input),
    validationCommandHints,
    readiness: {
      status: input.machineReadiness?.status ?? 'UNKNOWN',
      canRunBoundedAutonomousCycle: input.machineReadiness?.canRunBoundedAutonomousCycle ?? null,
      canDeclareProductCertified: input.machineReadiness?.canDeclareKloelProductCertified ?? null,
      blockers: readinessBlockers.slice(0, 8),
    },
  };
}
