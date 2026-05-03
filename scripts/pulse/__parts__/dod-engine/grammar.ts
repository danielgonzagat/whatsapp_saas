import { discoverAllObservedArtifactFilenames } from '../../dynamic-reality-kernel';

// ── Artifact names ─────────────────────────────────────────────────────────

export type DoDArtifactKind =
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

export function dodArtifactFile(kind: DoDArtifactKind): string {
  const kernelCatalog = discoverAllObservedArtifactFilenames();
  const dodToKernel: Record<DoDArtifactKind, string> = {
    'dod-engine': kernelCatalog.dodEngine,
    'dod-state': kernelCatalog.dodState,
    'capability-state': kernelCatalog.capabilityState,
    'runtime-evidence': kernelCatalog.runtimeEvidence,
    'observability-evidence': kernelCatalog.observabilityEvidence,
    'recovery-evidence': kernelCatalog.recoveryEvidence,
    'browser-evidence': kernelCatalog.browserEvidence,
    'flow-evidence': kernelCatalog.flowEvidence,
    'scenario-coverage': kernelCatalog.scenarioCoverage,
    'execution-harness': kernelCatalog.harnessEvidence,
  };
  return dodToKernel[kind];
}

// ── Gate definitions ───────────────────────────────────────────────────────

export function dodGateKernelGrammar(): {
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
export type CheckRequirement = 'required' | 'optional' | 'not_required';

export function dodStructuralEvidenceKernelGrammar(): {
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
