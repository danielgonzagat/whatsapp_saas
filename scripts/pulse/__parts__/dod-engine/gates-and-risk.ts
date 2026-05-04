import type { PulseCapability } from '../../types';
import type { DoDRiskLevel } from '../../types.dod-engine';
import {
  isElevatedLevel,
  allowsBlockingOutcome,
  containsObservedItems,
  containsReportedIssue,
} from './helpers';

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

export function deriveGateStrictness(
  def: { required: boolean; blocking: boolean },
  riskLevel: DoDRiskLevel,
): { required: boolean; blocking: boolean } {
  const elevatedRisk = isElevatedLevel(riskLevel);
  const required = def.required || elevatedRisk;
  const blocking = def.blocking && allowsBlockingOutcome(riskLevel);

  return { required, blocking };
}
