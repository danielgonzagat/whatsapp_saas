import type {
  Break,
  PulseEnvironment,
  PulseHealth,
  PulseInvariantEvidence,
  PulseInvariantResult,
  PulseManifest,
  PulseManifestInvariantSpec,
  PulseParserInventory,
} from '../types';

interface RunDeclaredInvariantsInput {
  environment: PulseEnvironment;
  manifest: PulseManifest | null;
  health: PulseHealth;
  parserInventory: PulseParserInventory;
  invariantIds?: string[];
  enforceDiagnosticDependencies?: boolean;
}

const INVARIANT_ARTIFACT = 'PULSE_INVARIANT_EVIDENCE.json';

const INVARIANT_BREAK_PATTERNS: Record<string, RegExp[]> = {
  'workspace-isolation': [/^WORKSPACE_ISOLATION_BROKEN$/, /^MISSING_WORKSPACE_FILTER$/, /^TENANT_/],
  'financial-audit-trail': [
    /^AUDIT_FINANCIAL_NO_TRAIL$/,
    /^AUDIT_DELETION_NO_LOG$/,
    /^AUDIT_ADMIN_NO_LOG$/,
  ],
  'payment-idempotency': [/^IDEMPOTENCY_/, /^ORDERING_WEBHOOK_OOO$/],
  'wallet-balance-consistency': [
    /^E2E_RACE_CONDITION_WITHDRAWAL$/,
    /^RACE_CONDITION_FINANCIAL$/,
    /^STATE_PAYMENT_INVALID$/,
  ],
};

function isBlockingBreak(item: Break): boolean {
  return item.severity === 'critical' || item.severity === 'high';
}

function getApplicableSpecs(
  environment: PulseEnvironment,
  manifest: PulseManifest | null,
): PulseManifestInvariantSpec[] {
  if (!manifest) {
    return [];
  }
  return manifest.invariantSpecs.filter((spec) => spec.environments.includes(environment));
}

function getLoadedCheckNames(parserInventory: PulseParserInventory): Set<string> {
  return new Set(parserInventory.loadedChecks.map((check) => check.name));
}

function getActiveInvariantAcceptance(manifest: PulseManifest | null, invariantId: string) {
  if (!manifest) {
    return null;
  }
  const now = Date.now();
  return (
    manifest.temporaryAcceptances.find((entry) => {
      if (entry.targetType !== 'invariant' || entry.target !== invariantId) {
        return false;
      }
      const expiresAt = Date.parse(entry.expiresAt);
      return Number.isFinite(expiresAt) && expiresAt >= now;
    }) || null
  );
}

function collectMatchingBreaks(health: PulseHealth, patterns: RegExp[]): Break[] {
  return health.breaks.filter(
    (item) => isBlockingBreak(item) && patterns.some((pattern) => pattern.test(item.type)),
  );
}

function evaluateInvariantSpec(
  spec: PulseManifestInvariantSpec,
  input: RunDeclaredInvariantsInput,
  loadedChecks: Set<string>,
): PulseInvariantResult {
  const acceptance = getActiveInvariantAcceptance(input.manifest, spec.id);
  if (acceptance) {
    return {
      invariantId: spec.id,
      status: 'accepted',
      evaluated: false,
      accepted: true,
      summary: `Temporarily accepted until ${acceptance.expiresAt}: ${acceptance.reason}`,
      artifactPaths: [INVARIANT_ARTIFACT],
      metrics: {
        expiresAt: acceptance.expiresAt,
      },
    };
  }

  const missingChecks = spec.dependsOn.filter((name) => !loadedChecks.has(name));
  const enforceDiagnosticDependencies = input.enforceDiagnosticDependencies !== false;
  if (missingChecks.length > 0 && enforceDiagnosticDependencies) {
    return {
      invariantId: spec.id,
      status: 'failed',
      evaluated: false,
      accepted: false,
      failureClass: 'checker_gap',
      summary: `Required invariant dependencies are not loaded: ${missingChecks.join(', ')}.`,
      artifactPaths: [INVARIANT_ARTIFACT],
      metrics: {
        missingChecks: missingChecks.join(', '),
      },
    };
  }

  const patterns = INVARIANT_BREAK_PATTERNS[spec.id];
  if (!patterns) {
    return {
      invariantId: spec.id,
      status: 'missing_evidence',
      evaluated: false,
      accepted: false,
      failureClass: 'missing_evidence',
      summary: `No invariant evaluator is wired for ${spec.id}.`,
      artifactPaths: [INVARIANT_ARTIFACT],
    };
  }

  const matchingBreaks = collectMatchingBreaks(input.health, patterns);
  if (matchingBreaks.length > 0) {
    return {
      invariantId: spec.id,
      status: 'failed',
      evaluated: true,
      accepted: false,
      failureClass: 'product_failure',
      summary: `Blocking findings for ${spec.id}: ${[...new Set(matchingBreaks.map((item) => item.type))].join(', ')}.`,
      artifactPaths: [INVARIANT_ARTIFACT],
      metrics: {
        breakCount: matchingBreaks.length,
        evaluator: spec.evaluator,
        ...(missingChecks.length > 0
          ? {
              ignoredMissingChecks: missingChecks.join(', '),
            }
          : {}),
      },
    };
  }

  return {
    invariantId: spec.id,
    status: 'passed',
    evaluated: true,
    accepted: false,
    summary: `${spec.id} passed via evaluator ${spec.evaluator}.`,
    artifactPaths: [INVARIANT_ARTIFACT],
    metrics: {
      evaluator: spec.evaluator,
      source: spec.source,
      ...(missingChecks.length > 0
        ? {
            ignoredMissingChecks: missingChecks.join(', '),
          }
        : {}),
    },
  };
}

function buildSummary(results: PulseInvariantResult[]): string {
  if (results.length === 0) {
    return 'No invariant specs are required in the current environment.';
  }

  const passed = results.filter((item) => item.status === 'passed').length;
  const failed = results.filter((item) => item.status === 'failed').length;
  const accepted = results.filter((item) => item.status === 'accepted').length;
  const missing = results.filter((item) => item.status === 'missing_evidence').length;

  return `Invariant evidence summary: ${passed} passed, ${failed} failed, ${accepted} accepted, ${missing} missing evidence.`;
}

export function runDeclaredInvariants(input: RunDeclaredInvariantsInput): PulseInvariantEvidence {
  const allowedInvariantIds = new Set(input.invariantIds || []);
  const specs = getApplicableSpecs(input.environment, input.manifest).filter(
    (spec) => allowedInvariantIds.size === 0 || allowedInvariantIds.has(spec.id),
  );
  const loadedChecks = getLoadedCheckNames(input.parserInventory);
  const results = specs.map((spec) => evaluateInvariantSpec(spec, input, loadedChecks));

  return {
    declared: specs.map((spec) => spec.id),
    evaluated: results.filter((item) => item.evaluated).map((item) => item.invariantId),
    missing: results
      .filter((item) => item.status === 'missing_evidence')
      .map((item) => item.invariantId),
    passed: results.filter((item) => item.status === 'passed').map((item) => item.invariantId),
    failed: results.filter((item) => item.status === 'failed').map((item) => item.invariantId),
    accepted: results.filter((item) => item.accepted).map((item) => item.invariantId),
    artifactPaths: specs.length > 0 ? [INVARIANT_ARTIFACT] : [],
    summary: buildSummary(results),
    results,
  };
}
