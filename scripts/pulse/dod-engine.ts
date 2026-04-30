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

// ── Artifact constants ─────────────────────────────────────────────────────

const ARTIFACT_DOD_ENGINE = 'PULSE_DOD_ENGINE.json';
const ARTIFACT_DOD_STATE = 'PULSE_DOD_STATE.json';
const CAPABILITY_STATE_FILE = 'PULSE_CAPABILITY_STATE.json';
const RUNTIME_EVIDENCE_FILE = 'PULSE_RUNTIME_EVIDENCE.json';
const OBSERVABILITY_FILE = 'PULSE_OBSERVABILITY_EVIDENCE.json';
const RECOVERY_FILE = 'PULSE_RECOVERY_EVIDENCE.json';
const BROWSER_FILE = 'PULSE_BROWSER_EVIDENCE.json';
const FLOW_EVIDENCE_FILE = 'PULSE_FLOW_EVIDENCE.json';
const SCENARIO_COVERAGE_FILE = 'PULSE_SCENARIO_COVERAGE.json';
const EXECUTION_HARNESS_FILE = 'PULSE_HARNESS_EVIDENCE.json';

// ── Gate definitions ───────────────────────────────────────────────────────

const GATE_DEFINITIONS: {
  name: string;
  description: string;
  required: boolean;
  blocking: boolean;
}[] = [
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

// ── Risk-level gate requirements ───────────────────────────────────────────

/** Gate strictness tuned by capability risk level. */
const RISK_GATE_MAP: Record<
  string,
  Record<DoDRiskLevel, { required: boolean; blocking: boolean }>
> = {
  ui_exists: {
    critical: { required: true, blocking: false },
    high: { required: true, blocking: false },
    medium: { required: true, blocking: false },
    low: { required: false, blocking: false },
  },
  api_exists: {
    critical: { required: true, blocking: true },
    high: { required: true, blocking: false },
    medium: { required: true, blocking: false },
    low: { required: false, blocking: false },
  },
  service_exists: {
    critical: { required: true, blocking: true },
    high: { required: true, blocking: true },
    medium: { required: true, blocking: false },
    low: { required: true, blocking: false },
  },
  persistence_exists: {
    critical: { required: true, blocking: true },
    high: { required: true, blocking: false },
    medium: { required: true, blocking: false },
    low: { required: false, blocking: false },
  },
  side_effects_exist: {
    critical: { required: true, blocking: false },
    high: { required: true, blocking: false },
    medium: { required: false, blocking: false },
    low: { required: false, blocking: false },
  },
  unit_tests_pass: {
    critical: { required: true, blocking: true },
    high: { required: true, blocking: true },
    medium: { required: true, blocking: false },
    low: { required: true, blocking: false },
  },
  integration_tests_pass: {
    critical: { required: true, blocking: true },
    high: { required: true, blocking: false },
    medium: { required: false, blocking: false },
    low: { required: false, blocking: false },
  },
  runtime_observed: {
    critical: { required: true, blocking: true },
    high: { required: true, blocking: false },
    medium: { required: false, blocking: false },
    low: { required: false, blocking: false },
  },
  observability_attached: {
    critical: { required: true, blocking: true },
    high: { required: true, blocking: false },
    medium: { required: false, blocking: false },
    low: { required: false, blocking: false },
  },
  security_gates_pass: {
    critical: { required: true, blocking: true },
    high: { required: true, blocking: true },
    medium: { required: true, blocking: false },
    low: { required: false, blocking: false },
  },
  recovery_path_exists: {
    critical: { required: true, blocking: true },
    high: { required: true, blocking: false },
    medium: { required: false, blocking: false },
    low: { required: false, blocking: false },
  },
};

// ── Structural check definitions ───────────────────────────────────────────

/** Per-risk-level requirement modes for structural checks. */
type CheckRequirement = 'required' | 'optional' | 'not_required';

const STRUCTURAL_CHECKS: {
  name: string;
  pattern: RegExp;
  pathPattern: RegExp | null;
  critical: CheckRequirement;
  high: CheckRequirement;
  medium: CheckRequirement;
  low: CheckRequirement;
}[] = [
  {
    name: 'has_controller',
    pattern: /@(Controller|Post|Get|Put|Delete|Patch)\(/,
    pathPattern: /\/controllers?\//,
    critical: 'required',
    high: 'required',
    medium: 'required',
    low: 'not_required',
  },
  {
    name: 'has_service',
    pattern: /@Injectable\(\)/,
    pathPattern: /\/services?\//,
    critical: 'required',
    high: 'required',
    medium: 'required',
    low: 'required',
  },
  {
    name: 'has_dto',
    pattern: /class \w+Dto\b/,
    pathPattern: /\/dtos?\//,
    critical: 'required',
    high: 'required',
    medium: 'optional',
    low: 'not_required',
  },
  {
    name: 'has_test',
    pattern: /(describe|it|test|expect)\(/,
    pathPattern: /\.(spec|test)\./,
    critical: 'required',
    high: 'required',
    medium: 'required',
    low: 'optional',
  },
  {
    name: 'has_api_client',
    pattern: /\b(fetch|axios|httpService)\./,
    pathPattern: /\/api-clients?\//,
    critical: 'required',
    high: 'required',
    medium: 'optional',
    low: 'not_required',
  },
  {
    name: 'has_swr_hook',
    pattern: /\b(useSWR|useQuery|useMutation)\b/,
    pathPattern: /\/hooks?\//,
    critical: 'required',
    high: 'optional',
    medium: 'optional',
    low: 'not_required',
  },
  {
    name: 'has_persistence',
    pattern: /prisma\.\w+\.(create|find|update|delete|upsert|count)\(/,
    pathPattern: null,
    critical: 'required',
    high: 'required',
    medium: 'optional',
    low: 'not_required',
  },
  {
    name: 'has_auth_guard',
    pattern: /@(UseGuards|Guard)|canActivate|hasRole|requireAuth/i,
    pathPattern: /\/guards?\//,
    critical: 'required',
    high: 'required',
    medium: 'required',
    low: 'not_required',
  },
  {
    name: 'has_workspace_isolation',
    pattern: /workspaceId|workspace_id|tenantId|tenant_id/i,
    pathPattern: null,
    critical: 'required',
    high: 'required',
    medium: 'optional',
    low: 'not_required',
  },
  {
    name: 'has_error_handling',
    pattern:
      /\b(try\s*\{|catch\s*\(|\.catch\(|HttpException|BadRequestException|NotFoundException)\b/i,
    pathPattern: null,
    critical: 'required',
    high: 'required',
    medium: 'optional',
    low: 'not_required',
  },
  {
    name: 'has_observability',
    pattern: /\b(logger\.(log|error|warn|info|debug)|console\.(log|error|warn)|pino|winston)\b/i,
    pathPattern: null,
    critical: 'required',
    high: 'required',
    medium: 'optional',
    low: 'not_required',
  },
];

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
  const mutatingRouteCount = (cap.routePatterns ?? []).filter(
    (route) => /^(post|put|patch|delete)-/i.test(route) || /\/:(?:id|uuid|slug)\b/i.test(route),
  ).length;

  if (
    (cap.runtimeCritical && (hasStateMutation || hasExternalEffect || hasValidation)) ||
    (hasInterface && hasStateMutation && hasExternalEffect) ||
    (hasInterface && hasStateMutation && hasValidation && mutatingRouteCount > 0)
  ) {
    return 'critical';
  }

  if (
    cap.runtimeCritical ||
    cap.protectedByGovernance ||
    cap.highSeverityIssueCount > 0 ||
    (hasInterface && hasStateMutation) ||
    (hasInterface && hasExternalEffect) ||
    mutatingRouteCount > 0
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
  const filePath = safeJoin(dir, CAPABILITY_STATE_FILE);
  return loadJsonArtifact<PulseCapabilityState>(filePath);
}

function loadSupportingArtifacts(rootDir: string): LoadedArtifacts {
  const dir = artifactDir(rootDir);
  return {
    runtimeEvidence: loadJsonArtifact(safeJoin(dir, RUNTIME_EVIDENCE_FILE)),
    observabilityEvidence: loadJsonArtifact(safeJoin(dir, OBSERVABILITY_FILE)),
    recoveryEvidence: loadJsonArtifact(safeJoin(dir, RECOVERY_FILE)),
    browserEvidence: loadJsonArtifact(safeJoin(dir, BROWSER_FILE)),
    flowEvidence: loadJsonArtifact(safeJoin(dir, FLOW_EVIDENCE_FILE)),
    scenarioCoverage: loadJsonArtifact(safeJoin(dir, SCENARIO_COVERAGE_FILE)),
    harnessEvidence: loadJsonArtifact(safeJoin(dir, EXECUTION_HARNESS_FILE)),
  };
}

function nodePrefixesForKind(nodeIds: string[], prefix: string): string[] {
  const pattern = new RegExp(`^${prefix}:`);
  return nodeIds.filter((id) => pattern.test(id));
}

function hasNodeKind(nodeIds: string[], prefix: string): boolean {
  return nodePrefixesForKind(nodeIds, prefix).length > 0;
}

function scanFilesForPattern(
  filePaths: string[],
  rootDir: string,
  pattern: RegExp,
): { found: boolean; matches: string[] } {
  const matches: string[] = [];
  for (const relPath of filePaths) {
    const absPath = safeJoin(resolveRoot(rootDir), relPath);
    if (!pathExists(absPath)) {
      continue;
    }
    try {
      const content = readTextFile(absPath);
      const lines = content.split('\n');
      const sampleSize = Math.min(lines.length, 500);
      for (let i = 0; i < sampleSize; i++) {
        if (pattern.test(lines[i])) {
          matches.push(`${relPath}:${i + 1}`);
        }
      }
    } catch {
      continue;
    }
  }
  return { found: matches.length > 0, matches };
}

function testFilesExist(filePaths: string[], rootDir: string): { found: boolean; files: string[] } {
  const testPatterns = [/\.spec\.tsx?$/, /\.spec\.jsx?$/, /\.test\.tsx?$/, /\.test\.jsx?$/];
  const dirPatterns = ['__tests__', 'tests', 'test'];
  const sourceDirs = new Set<string>();
  const found: string[] = [];

  for (const relPath of filePaths) {
    const dir = path.dirname(relPath);
    sourceDirs.add(dir);
  }

  for (const dir of sourceDirs) {
    const absPath = safeJoin(resolveRoot(rootDir), dir);
    if (!pathExists(absPath)) {
      continue;
    }
    try {
      const entries = fs.readdirSync(absPath);
      for (const entry of entries) {
        if (testPatterns.some((p) => p.test(entry))) {
          found.push(`${dir}/${entry}`);
        }
      }
    } catch {
      continue;
    }
  }

  for (const sourceDir of sourceDirs) {
    for (const dp of dirPatterns) {
      const testDir = safeJoin(resolveRoot(rootDir), sourceDir, dp);
      if (pathExists(testDir)) {
        try {
          const entries = fs.readdirSync(testDir);
          for (const entry of entries) {
            if (testPatterns.some((p) => p.test(entry))) {
              found.push(`${sourceDir}/${dp}/${entry}`);
            }
          }
        } catch {
          continue;
        }
      }
    }
  }

  return { found: found.length > 0, files: [...new Set(found)].sort() };
}

// ── Risk-tuned checkGate ───────────────────────────────────────────────────

function checkGate(
  gateName: string,
  capability: CapabilityInput,
  rootDir: string,
  artifacts: LoadedArtifacts,
  riskLevel: DoDRiskLevel,
): DoDGate {
  const def = GATE_DEFINITIONS.find((g) => g.name === gateName);
  if (!def) {
    return {
      name: gateName,
      description: 'Unknown gate',
      status: 'not_tested',
      evidence: [],
      required: false,
      blocking: false,
    };
  }

  const riskTuning = RISK_GATE_MAP[gateName]?.[riskLevel] ?? {
    required: def.required,
    blocking: def.blocking,
  };

  try {
    switch (gateName) {
      case 'ui_exists': {
        const uiNodes = nodePrefixesForKind(capability.nodeIds, 'ui');
        if (hasNodeKind(capability.nodeIds, 'ui')) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: uiNodes.slice(0, 6),
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_applicable',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'api_exists': {
        const apiNodes = [
          ...nodePrefixesForKind(capability.nodeIds, 'api'),
          ...nodePrefixesForKind(capability.nodeIds, 'route'),
        ];
        if (apiNodes.length > 0) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: apiNodes.slice(0, 6),
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_applicable',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'service_exists': {
        const svcNodes = nodePrefixesForKind(capability.nodeIds, 'service');
        if (svcNodes.length > 0) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: svcNodes.slice(0, 6),
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_applicable',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'persistence_exists': {
        const persistNodes = nodePrefixesForKind(capability.nodeIds, 'persistence');
        const prismaPattern = /\.prisma\b/i;
        const prismaFiles = capability.filePaths.filter((fp) => prismaPattern.test(fp));
        if (persistNodes.length > 0 || prismaFiles.length > 0) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: [...persistNodes.slice(0, 5), ...prismaFiles.slice(0, 5)],
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_applicable',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'side_effects_exist': {
        const sideNodes = nodePrefixesForKind(capability.nodeIds, 'side-effect');
        const externalCallPattern =
          /\b(fetch\b|axios|\.post\(|\.get\(|webhook|publish|sendMessage|enqueue|emit\b)/i;
        const scanResult = scanFilesForPattern(capability.filePaths, rootDir, externalCallPattern);
        if (sideNodes.length > 0 || scanResult.found) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: [...sideNodes.slice(0, 4), ...scanResult.matches.slice(0, 4)],
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: 'not_applicable',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'unit_tests_pass': {
        const testResult = testFilesExist(capability.filePaths, rootDir);
        if (testResult.found) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: testResult.files.slice(0, 8),
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_tested',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'integration_tests_pass': {
        if (artifacts.scenarioCoverage) {
          const capId = capability.id;
          const scenarios = artifacts.scenarioCoverage as Record<string, unknown>;
          const scenarioEntries = Object.entries(scenarios)
            .filter(([, v]) => {
              if (typeof v === 'object' && v !== null) {
                const obj = v as Record<string, unknown>;
                const relatedCaps = obj.relatedCapabilities || obj.capabilityIds || [];
                return Array.isArray(relatedCaps) && relatedCaps.includes(capId);
              }
              return false;
            })
            .map(([k]) => k);
          if (scenarioEntries.length > 0) {
            return {
              name: gateName,
              description: def.description,
              status: 'pass',
              evidence: scenarioEntries.slice(0, 6),
              required: riskTuning.required,
              blocking: riskTuning.blocking,
            };
          }
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_tested',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'runtime_observed': {
        if (artifacts.runtimeEvidence) {
          const runtime = artifacts.runtimeEvidence as Record<string, unknown>;
          const probes = runtime.probes || runtime.checks || [];
          const evidence =
            Array.isArray(probes) && probes.length > 0 ? ['Runtime probe(s) recorded'] : [];
          return {
            name: gateName,
            description: def.description,
            status: evidence.length > 0 ? 'pass' : 'not_tested',
            evidence,
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_tested',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'observability_attached': {
        const logPattern =
          /\b(logger|log|console\.(log|error|warn|info)|tracing|metric|counter|histogram|span)\b/i;
        const scanResult = scanFilesForPattern(capability.filePaths, rootDir, logPattern);
        const obsFileNames = capability.filePaths.filter((fp) =>
          /\b(log|logging|logger|metrics|tracing|telemetry)\b/i.test(fp),
        );
        if (scanResult.found || obsFileNames.length > 0) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: [...obsFileNames.slice(0, 4), ...scanResult.matches.slice(0, 4)],
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_tested',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'security_gates_pass': {
        const authPattern =
          /\b(auth|authorize|authorise|authenticate|guard|canActivate|hasRole|hasPermission|requireAuth|isAuthenticated|validate|class-validator|@IsString|@IsNumber|@Length|@Min|@Max|rate.?limit|throttle)\b/i;
        const scanResult = scanFilesForPattern(capability.filePaths, rootDir, authPattern);
        const securityFiles = capability.filePaths.filter((fp) =>
          /\b(auth|guard|security|validate|permission|role)\b/i.test(fp),
        );
        if (scanResult.found || securityFiles.length > 0) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: [...securityFiles.slice(0, 4), ...scanResult.matches.slice(0, 4)],
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_applicable',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      case 'recovery_path_exists': {
        const recoveryPattern =
          /\b(try\s*\{|catch\s*\(|\.catch\(|retry|circuit.?breaker|fallback|onError|errorHandler|resilience|dead.letter|nack|requeue|reject)\b/i;
        const scanResult = scanFilesForPattern(capability.filePaths, rootDir, recoveryPattern);
        if (scanResult.found) {
          return {
            name: gateName,
            description: def.description,
            status: 'pass',
            evidence: scanResult.matches.slice(0, 6),
            required: riskTuning.required,
            blocking: riskTuning.blocking,
          };
        }
        return {
          name: gateName,
          description: def.description,
          status: riskTuning.required ? 'fail' : 'not_tested',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
      }

      default:
        return {
          name: gateName,
          description: def.description,
          status: 'not_tested',
          evidence: [],
          required: riskTuning.required,
          blocking: riskTuning.blocking,
        };
    }
  } catch (err) {
    return {
      name: gateName,
      description: def.description,
      status: 'not_tested',
      evidence: [`Error evaluating gate: ${err instanceof Error ? err.message : String(err)}`],
      required: riskTuning.required,
      blocking: riskTuning.blocking,
    };
  }
}

// ── Structural checks ──────────────────────────────────────────────────────

/**
 * Run all 11 structural checks against a capability's files, weighted by
 * risk level. Returns a map of check name → boolean (true = evidence found).
 */
function evaluateStructuralChecks(
  capability: CapabilityInput,
  rootDir: string,
  riskLevel: DoDRiskLevel,
): Record<string, boolean> {
  const results: Record<string, boolean> = {};

  for (const check of STRUCTURAL_CHECKS) {
    const reqMode = check[riskLevel] as CheckRequirement;
    if (reqMode === 'not_required') {
      results[check.name] = true; // waived
      continue;
    }

    let found = false;

    if (check.pathPattern) {
      const hasPathMatch = capability.filePaths.some((fp) => check.pathPattern!.test(fp));
      if (hasPathMatch) {
        found = true;
      }
    }

    if (!found) {
      const scanResult = scanFilesForPattern(capability.filePaths, rootDir, check.pattern);
      if (scanResult.found) {
        found = true;
      }
    }

    results[check.name] = found;
  }

  return results;
}

// ── Classification ─────────────────────────────────────────────────────────

/** Count structural checks that are both required and met. */
function countRequiredStructuralChecks(
  checks: Record<string, boolean>,
  riskLevel: DoDRiskLevel,
): number {
  let count = 0;
  for (const check of STRUCTURAL_CHECKS) {
    const reqMode = check[riskLevel] as CheckRequirement;
    if (reqMode !== 'not_required' && checks[check.name]) {
      count++;
    }
  }
  return count;
}

function maxStructuralChecks(riskLevel: DoDRiskLevel): number {
  return STRUCTURAL_CHECKS.filter((c) => c[riskLevel] !== 'not_required').length;
}

/**
 * Classify a capability based on structural evidence, gate status, and
 * runtime observation.
 *
 *   phantom    — truthMode is inferred; no structural evidence beyond
 *                what the graph inference produced.
 *   latent     — some structural evidence, but no runtime observation.
 *   real       — structural evidence + runtime observation confirmed.
 *   production — all required DoD gates pass.
 */
function classifyCapability(
  structuralChecks: Record<string, boolean>,
  gates: DoDGate[],
  riskLevel: DoDRiskLevel,
  truthMode: string,
  requiredBeforeReal: string[],
): DoDCapabilityClassification {
  const allRequiredPass = gates.filter((g) => g.required).every((g) => g.status === 'pass');

  const runtimeObserved = gates.find((g) => g.name === 'runtime_observed')?.status === 'pass';
  const blockingPass = gates.every((g) => !g.blocking || g.status !== 'fail');

  const structuralCount = countRequiredStructuralChecks(structuralChecks, riskLevel);
  const maxStruct = maxStructuralChecks(riskLevel);
  const structuralRatio = maxStruct > 0 ? structuralCount / maxStruct : 1;

  // phantom: truth mode is inferred with no structural backing
  if (truthMode === 'inferred' && structuralRatio < 0.2) {
    return 'phantom';
  }

  // production: all blocking + required gates pass AND structural checks complete
  if (
    allRequiredPass &&
    blockingPass &&
    structuralRatio >= 0.8 &&
    runtimeObserved &&
    requiredBeforeReal.length === 0
  ) {
    return 'production';
  }

  // real: enough structural evidence AND runtime observed
  if (structuralRatio >= 0.5 && runtimeObserved && requiredBeforeReal.length === 0) {
    return 'real';
  }

  // latent: some structural evidence (but not enough for real)
  if (structuralRatio >= 0.2) {
    return 'latent';
  }

  // phantom: minimal structural evidence
  return 'phantom';
}

// ── Scoring ────────────────────────────────────────────────────────────────

const GATE_WEIGHTS: Record<string, number> = {
  ui_exists: 8,
  api_exists: 10,
  service_exists: 12,
  persistence_exists: 10,
  side_effects_exist: 6,
  unit_tests_pass: 14,
  integration_tests_pass: 10,
  runtime_observed: 12,
  observability_attached: 8,
  security_gates_pass: 14,
  recovery_path_exists: 6,
};

const MAX_GATE_SCORE = Object.values(GATE_WEIGHTS).reduce((a, b) => a + b, 0); // 110
const MAX_STRUCT_SCORE = STRUCTURAL_CHECKS.length * 6; // 66
const MAX_TOTAL_SCORE = MAX_GATE_SCORE + MAX_STRUCT_SCORE; // 176

function computeScore(
  gates: DoDGate[],
  structuralChecks: Record<string, boolean>,
): { score: number; maxScore: number } {
  let score = 0;
  let maxScore = 0;

  for (const gate of gates) {
    const weight = GATE_WEIGHTS[gate.name] ?? 6;
    if (gate.required) {
      maxScore += weight;
      if (gate.status === 'pass') {
        score += weight;
      }
    }
  }

  for (const check of STRUCTURAL_CHECKS) {
    maxScore += 6;
    if (structuralChecks[check.name]) {
      score += 6;
    }
  }

  return { score, maxScore };
}

// ── Required-before-real ───────────────────────────────────────────────────

function findGateStatus(gates: DoDGate[], gateName: string): DoDGate['status'] | null {
  return gates.find((gate) => gate.name === gateName)?.status ?? null;
}

function determineRequiredBeforeReal(capability: CapabilityInput, gates: DoDGate[]): string[] {
  const required: string[] = [];
  const hasApi = hasNodeKind(capability.nodeIds, 'api') || hasNodeKind(capability.nodeIds, 'route');
  const hasPersistence = hasNodeKind(capability.nodeIds, 'persistence');
  const hasSideEffect = hasNodeKind(capability.nodeIds, 'side-effect');
  const hasUi = hasNodeKind(capability.nodeIds, 'ui');
  const integrationStatus = findGateStatus(gates, 'integration_tests_pass');
  const runtimeStatus = findGateStatus(gates, 'runtime_observed');
  const persistenceStatus = findGateStatus(gates, 'persistence_exists');
  const sideEffectStatus = findGateStatus(gates, 'side_effects_exist');

  if (runtimeStatus !== 'pass') {
    required.push(`Observed runtime proof for ${capability.name}`);
  }
  if (hasUi && integrationStatus !== 'pass') {
    required.push(`End-to-end browser scenario for ${capability.name} through Playwright`);
  }
  if (hasApi && integrationStatus !== 'pass') {
    required.push(`API integration test covering ${capability.name} endpoints`);
  }
  if (hasPersistence && persistenceStatus !== 'pass') {
    required.push(`Database persistence verified for ${capability.name}`);
  }
  if (hasSideEffect && sideEffectStatus !== 'pass') {
    required.push(
      `Side-effect replay verified for ${capability.name} (webhook/queue/external API)`,
    );
  }
  if (hasPersistence && hasSideEffect && integrationStatus !== 'pass') {
    required.push(`Idempotency guarantee for ${capability.name} side effects`);
  }

  return required.length > 0 ? required : [];
}

// ── Overall status from gates ──────────────────────────────────────────────

function computeOverallStatus(gates: DoDGate[]): DoDOverallStatus {
  if (gates.length === 0) {
    return 'not_started';
  }

  const allNotTested = gates.every((g) => g.status === 'not_tested');
  if (allNotTested) {
    return 'not_started';
  }

  const blockingFailed = gates.some((g) => g.blocking && g.status === 'fail');
  if (blockingFailed) {
    return 'blocked';
  }

  const requiredFailed = gates.some((g) => g.required && g.status === 'fail');
  if (requiredFailed) {
    return 'partial';
  }

  const allRequiredPass = gates.filter((g) => g.required).every((g) => g.status === 'pass');
  if (allRequiredPass) {
    return 'done';
  }

  return 'partial';
}

// ── Evaluate one capability ────────────────────────────────────────────────

function evaluateCapability(
  cap: PulseCapability,
  rootDir: string,
  artifacts: LoadedArtifacts,
  riskLevel: DoDRiskLevel,
): { dod: CapabilityDoD; entry: DoDCapabilityEntry } {
  const input: CapabilityInput = {
    id: cap.id,
    name: cap.name,
    filePaths: cap.filePaths ?? [],
    rolesPresent: cap.rolesPresent ?? [],
    nodeIds: cap.nodeIds ?? [],
  };

  const gates = GATE_DEFINITIONS.map((def) =>
    checkGate(def.name, input, rootDir, artifacts, riskLevel),
  );

  const structuralChecks = evaluateStructuralChecks(input, rootDir, riskLevel);
  const requiredBeforeProduction = determineRequiredBeforeReal(input, gates);
  const classification = classifyCapability(
    structuralChecks,
    gates,
    riskLevel,
    cap.truthMode ?? 'inferred',
    requiredBeforeProduction,
  );

  const blockingGates = gates.filter((g) => g.blocking && g.status === 'fail').map((g) => g.name);

  const missingEvidence = gates.filter((g) => g.required && g.status === 'fail').map((g) => g.name);

  const overallStatus = computeOverallStatus(gates);
  const { score, maxScore } = computeScore(gates, structuralChecks);

  const confidence =
    overallStatus === 'done'
      ? 1.0
      : overallStatus === 'partial'
        ? 0.7
        : overallStatus === 'blocked'
          ? 0.3
          : 0.0;

  const dod: CapabilityDoD = {
    capabilityId: cap.id,
    capabilityName: cap.name,
    overallStatus,
    gates,
    blockingGates,
    missingEvidence,
    requiredBeforeReal: requiredBeforeProduction,
    lastEvaluated: new Date().toISOString(),
    confidence,
  };

  const passedGates = gates.filter((g) => g.status === 'pass').length;

  const entry: DoDCapabilityEntry = {
    capabilityId: cap.id,
    capabilityName: cap.name,
    riskLevel,
    classification,
    score,
    maxScore,
    passedGates,
    totalGates: gates.length,
    gates,
    structuralChecks,
    requiredBeforeProduction,
    lastEvaluated: new Date().toISOString(),
  };

  return { dod, entry };
}

// ── Main engine exports ────────────────────────────────────────────────────

/**
 * Build the full DoDEngineState and DoDState for every capability
 * discovered in the current PULSE capability state artifact.
 *
 * Reads `PULSE_CAPABILITY_STATE.json` (and supporting artifacts) from
 * `.pulse/current/`, evaluates every capability against risk-tuned DoD
 * gates, classifies each capability, and writes two artifacts:
 *   - `.pulse/current/PULSE_DOD_ENGINE.json` — gate-level evaluation
 *   - `.pulse/current/PULSE_DOD_STATE.json`  — classification + scoring
 *
 * @param rootDir  Absolute path to the repo root.
 * @returns The complete DoDEngineState written to disk.
 */
export function buildDoDEngineState(rootDir: string): DoDEngineState {
  const resolvedRoot = resolveRoot(rootDir);
  const pulseDir = safeJoin(resolvedRoot, '.pulse', 'current');

  const state = loadCapabilityState(resolvedRoot);
  const artifacts = loadSupportingArtifacts(resolvedRoot);

  const capabilities: PulseCapability[] = state?.capabilities ?? [];

  const results = capabilities.map((cap) => {
    const riskLevel = determineRiskLevel(cap);
    return evaluateCapability(cap, resolvedRoot, artifacts, riskLevel);
  });

  const evaluations = results.map((r) => r.dod);
  const entries = results.map((r) => r.entry);

  // ── DoDEngineState (PULSE_DOD_ENGINE.json) ───────────────────────────

  const criticalCapabilities = capabilities.filter(
    (c) => c.runtimeCritical || c.protectedByGovernance,
  );
  const criticalEvals = evaluations.filter((ev) => {
    const cap = capabilities.find((c) => c.id === ev.capabilityId);
    return cap && (cap.runtimeCritical || cap.protectedByGovernance);
  });

  const doneEvals = evaluations.filter((ev) => ev.overallStatus === 'done');
  const partialEvals = evaluations.filter((ev) => ev.overallStatus === 'partial');
  const blockedEvals = evaluations.filter((ev) => ev.overallStatus === 'blocked');
  const notStartedEvals = evaluations.filter((ev) => ev.overallStatus === 'not_started');

  const dodEngineResult: DoDEngineState = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalCapabilities: evaluations.length,
      doneCapabilities: doneEvals.length,
      partialCapabilities: partialEvals.length,
      blockedCapabilities: blockedEvals.length,
      notStartedCapabilities: notStartedEvals.length,
      criticalCapabilities: criticalCapabilities.length,
      criticalCapabilitiesDone: criticalEvals.filter((ev) => ev.overallStatus === 'done').length,
    },
    evaluations,
  };

  ensureDir(pulseDir, { recursive: true });
  fs.writeFileSync(
    safeJoin(pulseDir, ARTIFACT_DOD_ENGINE),
    JSON.stringify(dodEngineResult, null, 2),
    'utf8',
  );

  // ── DoDState (PULSE_DOD_STATE.json) ──────────────────────────────────

  const phantomEntries = entries.filter((e) => e.classification === 'phantom');
  const latentEntries = entries.filter((e) => e.classification === 'latent');
  const realEntries = entries.filter((e) => e.classification === 'real');
  const productionEntries = entries.filter((e) => e.classification === 'production');

  const byRiskLevel: Record<DoDRiskLevel, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const e of entries) {
    byRiskLevel[e.riskLevel] = (byRiskLevel[e.riskLevel] ?? 0) + 1;
  }

  const overallScore = entries.reduce((sum, e) => sum + e.score, 0);
  const overallMaxScore = entries.reduce((sum, e) => sum + e.maxScore, 0);

  const dodStateSummary: DoDStateSummary = {
    totalCapabilities: entries.length,
    phantom: phantomEntries.length,
    latent: latentEntries.length,
    real: realEntries.length,
    production: productionEntries.length,
    byRiskLevel,
    overallScore,
    overallMaxScore,
  };

  const dodState: DoDState = {
    generatedAt: new Date().toISOString(),
    summary: dodStateSummary,
    capabilities: entries,
  };

  fs.writeFileSync(
    safeJoin(pulseDir, ARTIFACT_DOD_STATE),
    JSON.stringify(dodState, null, 2),
    'utf8',
  );

  return dodEngineResult;
}
