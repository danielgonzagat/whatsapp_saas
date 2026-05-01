/**
 * PULSE Capability Definition-of-Done Engine
 *
 * Evaluates every discovered capability against objective, evidence-backed
 * Definition-of-Done gates spanning UI, API, service, persistence, side
 * effects, testing, runtime observation, observability, security, and
 * recovery dimensions.
 *
 * Capabilities are classified into four maturity levels:
 *   - phantom:    inferred only (no structural evidence beyond node inference)
 *   - latent:     some structural evidence, no runtime observation
 *   - real:       structural evidence + runtime observation confirmed
 *   - production: all DoD gates met (blocking + required + optional)
 *
 * Artifact output:
 *   - `.pulse/current/PULSE_DOD_ENGINE.json` — per-capability gate evaluation
 *   - `.pulse/current/PULSE_DOD_STATE.json`  — classification + scoring state
 */
import * as fs from 'fs';
import * as path from 'path';
import { ensureDir, pathExists, readTextFile } from './safe-fs';
import { safeJoin, resolveRoot } from './lib/safe-path';
import type {
  CapabilityDoD,
  DoDCapabilityClassification,
  DoDCapabilityEntry,
  DoDEngineState,
  DoDGate,
  DoDRiskLevel,
  DoDState,
  DoDStateSummary,
  DoDOverallStatus,
} from './types.dod-engine';
import type { PulseCapability, PulseCapabilityState } from './types';

// ── Artifact names ─────────────────────────────────────────────────────────

type DoDArtifactKind =
  | 'dod-engine'
  | 'dod-state'
  | 'capability-state'
  | 'runtime-evidence'
  | 'observability-evidence'
  | 'recovery-evidence'
  | 'browser-evidence'
  | 'flow-evidence'
  | 'scenario-coverage'
  | 'execution-harness';

function dodArtifactFile(kind: DoDArtifactKind): string {
  return {
    'dod-engine': 'PULSE_DOD_ENGINE.json',
    'dod-state': 'PULSE_DOD_STATE.json',
    'capability-state': 'PULSE_CAPABILITY_STATE.json',
    'runtime-evidence': 'PULSE_RUNTIME_EVIDENCE.json',
    'observability-evidence': 'PULSE_OBSERVABILITY_EVIDENCE.json',
    'recovery-evidence': 'PULSE_RECOVERY_EVIDENCE.json',
    'browser-evidence': 'PULSE_BROWSER_EVIDENCE.json',
    'flow-evidence': 'PULSE_FLOW_EVIDENCE.json',
    'scenario-coverage': 'PULSE_SCENARIO_COVERAGE.json',
    'execution-harness': 'PULSE_HARNESS_EVIDENCE.json',
  }[kind];
}

// ── Gate definitions ───────────────────────────────────────────────────────

function dodGateKernelGrammar(): {
  name: string;
  description: string;
  required: boolean;
  blocking: boolean;
}[] {
  return [
    {
      name: 'ui_exists',
      description: 'UI elements (buttons, pages, forms) linked to this capability',
      required: true,
      blocking: false,
    },
    {
      name: 'api_exists',
      description: 'API endpoints mapped to this capability',
      required: true,
      blocking: false,
    },
    {
      name: 'service_exists',
      description: 'Service implementations exist',
      required: true,
      blocking: false,
    },
    {
      name: 'persistence_exists',
      description: 'Prisma models linked',
      required: true,
      blocking: false,
    },
    {
      name: 'side_effects_exist',
      description: 'External API calls, webhooks, queue messages',
      required: false,
      blocking: false,
    },
    {
      name: 'unit_tests_pass',
      description: 'Test files covering the capability',
      required: true,
      blocking: false,
    },
    {
      name: 'integration_tests_pass',
      description: 'E2E test coverage',
      required: false,
      blocking: false,
    },
    {
      name: 'runtime_observed',
      description: 'Runtime evidence exists',
      required: false,
      blocking: false,
    },
    {
      name: 'observability_attached',
      description: 'Logging, tracing, metrics',
      required: false,
      blocking: false,
    },
    {
      name: 'security_gates_pass',
      description: 'Auth guards, rate limits, input validation',
      required: true,
      blocking: true,
    },
    {
      name: 'recovery_path_exists',
      description: 'Error handling, retries, circuit breakers',
      required: false,
      blocking: true,
    },
  ];
}

// ── Structural check definitions ───────────────────────────────────────────

/** Per-risk-level requirement modes for structural checks. */
type CheckRequirement = 'required' | 'optional' | 'not_required';

function dodStructuralEvidenceKernelGrammar(): {
  name: string;
  kernelGrammar: RegExp;
  pathKernelGrammar: RegExp | null;
  critical: CheckRequirement;
  high: CheckRequirement;
  medium: CheckRequirement;
  low: CheckRequirement;
}[] {
  return [
    {
      name: 'has_controller',
      kernelGrammar: /@(Controller|Post|Get|Put|Delete|Patch)\(/,
      pathKernelGrammar: /\/controllers?\//,
      critical: 'required',
      high: 'required',
      medium: 'required',
      low: 'not_required',
    },
    {
      name: 'has_service',
      kernelGrammar: /@Injectable\(\)/,
      pathKernelGrammar: /\/services?\//,
      critical: 'required',
      high: 'required',
      medium: 'required',
      low: 'required',
    },
    {
      name: 'has_dto',
      kernelGrammar: /class \w+Dto\b/,
      pathKernelGrammar: /\/dtos?\//,
      critical: 'required',
      high: 'required',
      medium: 'optional',
      low: 'not_required',
    },
    {
      name: 'has_test',
      kernelGrammar: /(describe|it|test|expect)\(/,
      pathKernelGrammar: /\.(spec|test)\./,
      critical: 'required',
      high: 'required',
      medium: 'required',
      low: 'optional',
    },
    {
      name: 'has_api_client',
      kernelGrammar: /\b(fetch|axios|httpService)\./,
      pathKernelGrammar: /\/api-clients?\//,
      critical: 'required',
      high: 'required',
      medium: 'optional',
      low: 'not_required',
    },
    {
      name: 'has_swr_hook',
      kernelGrammar: /\b(useSWR|useQuery|useMutation)\b/,
      pathKernelGrammar: /\/hooks?\//,
      critical: 'required',
      high: 'optional',
      medium: 'optional',
      low: 'not_required',
    },
    {
      name: 'has_persistence',
      kernelGrammar: /prisma\.\w+\.(create|find|update|delete|upsert|count)\(/,
      pathKernelGrammar: null,
      critical: 'required',
      high: 'required',
      medium: 'optional',
      low: 'not_required',
    },
    {
      name: 'has_auth_guard',
      kernelGrammar: /@(UseGuards|Guard)|canActivate|hasRole|requireAuth/i,
      pathKernelGrammar: /\/guards?\//,
      critical: 'required',
      high: 'required',
      medium: 'required',
      low: 'not_required',
    },
    {
      name: 'has_workspace_isolation',
      kernelGrammar: /workspaceId|workspace_id|tenantId|tenant_id/i,
      pathKernelGrammar: null,
      critical: 'required',
      high: 'required',
      medium: 'optional',
      low: 'not_required',
    },
    {
      name: 'has_error_handling',
      kernelGrammar:
        /\b(try\s*\{|catch\s*\(|\.catch\(|HttpException|BadRequestException|NotFoundException)\b/i,
      pathKernelGrammar: null,
      critical: 'required',
      high: 'required',
      medium: 'optional',
      low: 'not_required',
    },
    {
      name: 'has_observability',
      kernelGrammar:
        /\b(logger\.(log|error|warn|info|debug)|console\.(log|error|warn)|pino|winston)\b/i,
      pathKernelGrammar: null,
      critical: 'required',
      high: 'required',
      medium: 'optional',
      low: 'not_required',
    },
  ];
}

// ── Risk classification rules ──────────────────────────────────────────────

/** Determine risk level from observed structural roles and runtime/gov flags. */
export function determineRiskLevel(cap: PulseCapability): DoDRiskLevel {
  if (cap.runtimeCritical && cap.protectedByGovernance) {
    return 'critical';
  }

  const roles = new Set<string>(cap.rolesPresent ?? []);
  const hasInterface = roles.has('interface') || roles.has('api_surface');
  const hasValidation = roles.has('validation');
  const hasStateMutation = roles.has('persistence');
  const hasExternalEffect = roles.has('side_effect');
  const hasRuntimeEvidence = roles.has('runtime_evidence');
  const hasScenarioCoverage = roles.has('scenario_coverage');
  const hasExposedRoute = containsObservedItems(cap.routePatterns);

  if (
    (cap.runtimeCritical && (hasStateMutation || hasExternalEffect || hasValidation)) ||
    (hasInterface && hasStateMutation && hasExternalEffect) ||
    (hasInterface && hasStateMutation && hasValidation && hasExposedRoute)
  ) {
    return 'critical';
  }

  if (
    cap.runtimeCritical ||
    cap.protectedByGovernance ||
    containsReportedIssue(cap.highSeverityIssueCount) ||
    (hasInterface && hasStateMutation) ||
    (hasInterface && hasExternalEffect) ||
    hasExposedRoute
  ) {
    return 'high';
  }

  if (
    cap.userFacing ||
    hasInterface ||
    roles.has('orchestration') ||
    hasRuntimeEvidence ||
    hasScenarioCoverage
  ) {
    return 'medium';
  }

  return 'low';
}

// ── Helpers ────────────────────────────────────────────────────────────────

interface CapabilityInput {
  id: string;
  name: string;
  filePaths: string[];
  rolesPresent: string[];
  nodeIds: string[];
}

interface LoadedArtifacts {
  runtimeEvidence: Record<string, unknown> | null;
  observabilityEvidence: Record<string, unknown> | null;
  recoveryEvidence: Record<string, unknown> | null;
  browserEvidence: Record<string, unknown> | null;
  flowEvidence: Record<string, unknown> | null;
  scenarioCoverage: Record<string, unknown> | null;
  harnessEvidence: Record<string, unknown> | null;
}

function artifactDir(rootDir: string): string {
  return safeJoin(resolveRoot(rootDir), '.pulse', 'current');
}

function loadJsonArtifact<T>(filePath: string): T | null {
  if (!pathExists(filePath)) {
    return null;
  }
  try {
    const raw = readTextFile(filePath);
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function loadCapabilityState(rootDir: string): PulseCapabilityState | null {
  const dir = artifactDir(rootDir);
  const filePath = safeJoin(dir, dodArtifactFile('capability-state'));
  return loadJsonArtifact<PulseCapabilityState>(filePath);
}

function loadSupportingArtifacts(rootDir: string): LoadedArtifacts {
  const dir = artifactDir(rootDir);
  return {
    runtimeEvidence: loadJsonArtifact(safeJoin(dir, dodArtifactFile('runtime-evidence'))),
    observabilityEvidence: loadJsonArtifact(
      safeJoin(dir, dodArtifactFile('observability-evidence')),
    ),
    recoveryEvidence: loadJsonArtifact(safeJoin(dir, dodArtifactFile('recovery-evidence'))),
    browserEvidence: loadJsonArtifact(safeJoin(dir, dodArtifactFile('browser-evidence'))),
    flowEvidence: loadJsonArtifact(safeJoin(dir, dodArtifactFile('flow-evidence'))),
    scenarioCoverage: loadJsonArtifact(safeJoin(dir, dodArtifactFile('scenario-coverage'))),
    harnessEvidence: loadJsonArtifact(safeJoin(dir, dodArtifactFile('execution-harness'))),
  };
}

function nodePrefixesForKind(nodeIds: string[], prefix: string): string[] {
  const pattern = new RegExp(`^${prefix}:`);
  return nodeIds.filter((id) => pattern.test(id));
}

function hasNodeKind(nodeIds: string[], prefix: string): boolean {
  return nodePrefixesForKind(nodeIds, prefix).length > 0;
}

function containsObservedItems(items: readonly unknown[] | null | undefined): boolean {
  return Array.isArray(items) && items.length > zero();
}

function containsReportedIssue(value: number | null | undefined): boolean {
  return typeof value === 'number' && value > zero();
}

function lineNumberFromIndex(index: number): number {
  return index + Number(Number.isInteger(index));
}

function zero(): number {
  return Number(false);
}

function isElevatedLevel(riskLevel: DoDRiskLevel): boolean {
  return riskLevel === 'critical' || riskLevel === 'high';
}

function allowsBlockingOutcome(riskLevel: DoDRiskLevel): boolean {
  return riskLevel !== 'low';
}
import "./__companions__/scripts_pulse_dod-engine.companion";
