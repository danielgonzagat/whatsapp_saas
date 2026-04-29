import { safeJoin, safeResolve } from './safe-path';
import { pathExists, readJsonFile, readTextFile } from './safe-fs';
import type {
  PulseEnvironment,
  PulseObservabilityEvidence,
  PulseRecoveryEvidence,
  PulseRuntimeEvidence,
  PulseRuntimeProbe,
} from './types';
import { getRuntimeResolution } from './parsers/runtime-utils';
import {
  runBackendHealthProbe,
  runAuthProbe,
  runAdRulesProbe,
  runFrontendProbe,
  runDbProbe,
  type RuntimeProbeContext,
} from './runtime-evidence.probes';

const RUNTIME_EVIDENCE_PATH = 'PULSE_RUNTIME_EVIDENCE.json';
const RUNTIME_PROBES_PATH = 'PULSE_RUNTIME_PROBES.json';
const OBSERVABILITY_EVIDENCE_PATH = 'PULSE_OBSERVABILITY_EVIDENCE.json';
const PERFORMANCE_EVIDENCE_PATH = 'PULSE_PERFORMANCE_EVIDENCE.json';
const RECOVERY_EVIDENCE_PATH = 'PULSE_RECOVERY_EVIDENCE.json';

interface CollectRuntimeEvidenceOptions {
  probeIds?: string[];
  requireDbConnectivity?: boolean;
}

/** Pulse runtime probe id type. */
export type PulseRuntimeProbeId =
  | 'backend-health'
  | 'auth-session'
  | 'ad-rules'
  | 'frontend-reachability'
  | 'db-connectivity';

const DEFAULT_RUNTIME_PROBE_IDS: PulseRuntimeProbeId[] = [
  'backend-health',
  'auth-session',
  'ad-rules',
  'frontend-reachability',
  'db-connectivity',
];

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function summarizeProbeStatus(probe: PulseRuntimeProbe): string {
  if (probe.status === 'passed') {
    return `${probe.probeId} passed`;
  }
  if (probe.status === 'failed') {
    return `${probe.probeId} failed`;
  }
  if (probe.status === 'missing_evidence') {
    return `${probe.probeId} missing evidence`;
  }
  return `${probe.probeId} skipped`;
}

function buildRuntimeContext(env: PulseEnvironment): RuntimeProbeContext {
  const resolution = getRuntimeResolution();
  return {
    env,
    backendUrl: resolution.backendUrl,
    frontendUrl: resolution.frontendUrl,
    backendSource: resolution.backendSource,
    frontendSource: resolution.frontendSource,
    dbConfigured: resolution.dbConfigured,
    dbSource: resolution.dbSource,
  };
}

function getRequestedProbeIds(probeIds?: string[]): PulseRuntimeProbeId[] {
  if (!probeIds || probeIds.length === 0) {
    return [...DEFAULT_RUNTIME_PROBE_IDS];
  }
  return DEFAULT_RUNTIME_PROBE_IDS.filter((probeId) => probeIds.includes(probeId));
}

function readPreservedRuntimeEvidence(): PulseRuntimeEvidence | null {
  const artifactPath = safeResolve(process.cwd(), '.pulse', 'current', RUNTIME_EVIDENCE_PATH);
  if (!pathExists(artifactPath)) {
    return null;
  }
  try {
    const parsed = readJsonFile<PulseRuntimeEvidence>(artifactPath);
    if (!parsed.executed || !Array.isArray(parsed.probes) || parsed.probes.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Get runtime probe ids. */
export function getRuntimeProbeIds(probeIds?: string[]): PulseRuntimeProbeId[] {
  return getRequestedProbeIds(probeIds);
}

/** Collect runtime probe. */
export async function collectRuntimeProbe(
  env: PulseEnvironment,
  probeId: PulseRuntimeProbeId,
  options: Pick<CollectRuntimeEvidenceOptions, 'requireDbConnectivity'> = {},
): Promise<PulseRuntimeProbe> {
  const context = buildRuntimeContext(env);
  if (env === 'scan') {
    return {
      probeId,
      target:
        probeId === 'backend-health'
          ? `${context.backendUrl}/health/system`
          : probeId === 'auth-session'
            ? `${context.backendUrl}/auth/login`
            : probeId === 'ad-rules'
              ? `${context.backendUrl}/ad-rules`
              : probeId === 'frontend-reachability'
                ? context.frontendUrl
                : context.dbSource || 'database',
      required: false,
      executed: false,
      status: 'skipped',
      summary: `Runtime probe ${probeId} is not executed in scan mode.`,
      artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
    };
  }
  if (probeId === 'backend-health') {
    return runBackendHealthProbe(context) as Promise<PulseRuntimeProbe>;
  }
  if (probeId === 'auth-session') {
    return runAuthProbe(context) as Promise<PulseRuntimeProbe>;
  }
  if (probeId === 'ad-rules') {
    return runAdRulesProbe(context) as Promise<PulseRuntimeProbe>;
  }
  if (probeId === 'frontend-reachability') {
    return runFrontendProbe(context) as Promise<PulseRuntimeProbe>;
  }
  return runDbProbe(
    context,
    options.requireDbConnectivity || env === 'total',
  ) as Promise<PulseRuntimeProbe>;
}

/** Summarize runtime evidence. */
export function summarizeRuntimeEvidence(
  env: PulseEnvironment,
  probes: PulseRuntimeProbe[],
): PulseRuntimeEvidence {
  const resolution = getRuntimeResolution();
  if (env === 'scan') {
    const preserved = readPreservedRuntimeEvidence();
    if (preserved) {
      return {
        ...preserved,
        artifactPaths: unique([
          ...(preserved.artifactPaths || []),
          RUNTIME_EVIDENCE_PATH,
          RUNTIME_PROBES_PATH,
        ]),
        summary: `Scan mode reused preserved live runtime evidence. ${preserved.summary.replace(/^(Scan mode reused preserved live runtime evidence\. )+/, '')}`,
      };
    }
    return {
      executed: false,
      executedChecks: [],
      blockingBreakTypes: [],
      artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
      summary: 'Runtime probes were not executed in scan mode.',
      backendUrl: resolution.backendUrl,
      frontendUrl: resolution.frontendUrl,
      resolutionSource: resolution.summary,
      probes: [],
    };
  }
  const requiredMissing = probes.filter(
    (probe) => probe.required && probe.status === 'missing_evidence',
  );
  const requiredFailed = probes.filter((probe) => probe.required && probe.status === 'failed');
  const executedChecks = probes.filter((probe) => probe.executed).map((probe) => probe.probeId);
  let summary = 'Runtime probes executed successfully.';
  if (requiredMissing.length > 0) {
    summary = `Runtime evidence is incomplete: ${requiredMissing.map(summarizeProbeStatus).join(', ')}.`;
  } else if (requiredFailed.length > 0) {
    summary = `Runtime probes failed: ${requiredFailed.map(summarizeProbeStatus).join(', ')}.`;
  } else if (probes.some((probe) => probe.status === 'failed')) {
    summary = `Optional runtime probes failed: ${probes
      .filter((probe) => probe.status === 'failed')
      .map(summarizeProbeStatus)
      .join(', ')}.`;
  }
  return {
    executed: probes.some((probe) => probe.executed),
    executedChecks,
    blockingBreakTypes: [],
    artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
    summary,
    backendUrl: resolution.backendUrl,
    frontendUrl: resolution.frontendUrl,
    resolutionSource: resolution.summary,
    probes,
  };
}

/** Collect runtime evidence. */
export async function collectRuntimeEvidence(
  env: PulseEnvironment,
  options: CollectRuntimeEvidenceOptions = {},
): Promise<PulseRuntimeEvidence> {
  const probes: PulseRuntimeProbe[] = [];
  for (const probeId of getRequestedProbeIds(options.probeIds)) {
    probes.push(
      await collectRuntimeProbe(env, probeId, {
        requireDbConnectivity: options.requireDbConnectivity,
      }),
    );
  }
  return summarizeRuntimeEvidence(env, probes);
}

function scanTextIfExists(filePath: string): string {
  if (!pathExists(filePath)) {
    return '';
  }
  return readTextFile(filePath);
}

/** Collect observability evidence. */
export function collectObservabilityEvidence(
  rootDir: string,
  runtimeEvidence: PulseRuntimeEvidence,
): PulseObservabilityEvidence {
  const backendMain = scanTextIfExists(safeJoin(rootDir, 'backend', 'src', 'main.ts'));
  const backendSentry = scanTextIfExists(safeJoin(rootDir, 'backend', 'src', 'sentry.ts'));
  const workerBootstrap = scanTextIfExists(safeJoin(rootDir, 'worker', 'bootstrap.ts'));
  const requestIdInterceptor = scanTextIfExists(
    safeJoin(rootDir, 'backend', 'src', 'common', 'request-id.interceptor.ts'),
  );
  const requestLogger = scanTextIfExists(
    safeJoin(rootDir, 'backend', 'src', 'common', 'request-logger.interceptor.ts'),
  );
  const envSchema = scanTextIfExists(safeJoin(rootDir, 'backend', 'src', 'lib', 'env.ts'));
  const auditMiddleware = scanTextIfExists(
    safeJoin(rootDir, 'backend', 'src', 'kloel', 'middleware', 'audit-log.middleware.ts'),
  );
  const systemHealth = scanTextIfExists(
    safeJoin(rootDir, 'backend', 'src', 'health', 'system-health.controller.ts'),
  );
  const appHealth = scanTextIfExists(safeJoin(rootDir, 'backend', 'src', 'app.controller.ts'));
  const backendHealthProbe = runtimeEvidence.probes.find(
    (probe) => probe.probeId === 'backend-health',
  );
  const tracingHeadersDetected = Boolean(backendHealthProbe?.metrics?.traceHeaderDetected);
  const requestIdMiddlewareDetected = /x-request-id|x-correlation-id|requestId|correlationId/i.test(
    requestIdInterceptor + requestLogger + backendMain,
  );
  const structuredLoggingDetected = /logger\.|requestId|context|metadata|structured/i.test(
    requestLogger + backendMain,
  );
  const sentryDetected = /@sentry\/node|Sentry\./i.test(
    backendSentry + workerBootstrap + backendMain,
  );
  const alertingIntegrationDetected =
    /OPS_WEBHOOK_URL|AUTOPILOT_ALERT_WEBHOOK_URL|DLQ_WEBHOOK_URL|Sentry|alert/i.test(
      envSchema + backendSentry + workerBootstrap,
    );
  const healthEndpointsDetected = /Controller\('health'\)|@Get\('health'\)|@Get\('system'\)/i.test(
    systemHealth + appHealth,
  );
  const auditTrailDetected = /audit/i.test(auditMiddleware);
  const missingSignals: string[] = [];
  if (!tracingHeadersDetected && !requestIdMiddlewareDetected) {
    missingSignals.push('tracing');
  }
  if (!sentryDetected && !alertingIntegrationDetected) {
    missingSignals.push('alerting');
  }
  if (!healthEndpointsDetected) {
    missingSignals.push('health-endpoints');
  }
  if (!auditTrailDetected) {
    missingSignals.push('audit-trail');
  }
  return {
    executed: true,
    artifactPaths: [OBSERVABILITY_EVIDENCE_PATH],
    summary:
      missingSignals.length === 0
        ? 'Observability evidence found tracing, alerting, health endpoints, and audit hooks.'
        : `Observability evidence is missing: ${missingSignals.join(', ')}.`,
    signals: {
      tracingHeadersDetected,
      requestIdMiddlewareDetected,
      structuredLoggingDetected,
      sentryDetected,
      alertingIntegrationDetected,
      healthEndpointsDetected,
      auditTrailDetected,
    },
  };
}

/** Collect recovery evidence. */
export function collectRecoveryEvidence(rootDir: string): PulseRecoveryEvidence {
  const backupManifestPresent = pathExists(safeJoin(rootDir, '.backup-manifest.json'));
  const backupPolicyPresent = pathExists(safeJoin(rootDir, '.backup-policy.json'));
  const backupValidationPresent =
    pathExists(safeJoin(rootDir, '.backup-validation.log')) ||
    pathExists(safeJoin(rootDir, 'scripts', 'backup-validation.log'));
  const restoreRunbookPresent =
    pathExists(safeJoin(rootDir, 'docs', 'RESTORE.md')) ||
    pathExists(safeJoin(rootDir, 'RESTORE.md')) ||
    pathExists(safeJoin(rootDir, 'scripts', 'restore.sh')) ||
    pathExists(safeJoin(rootDir, 'scripts', 'db-restore.ts'));
  const disasterRecoveryRunbookPresent =
    pathExists(safeJoin(rootDir, 'docs', 'DISASTER_RECOVERY.md')) ||
    pathExists(safeJoin(rootDir, 'DISASTER_RECOVERY.md'));
  const disasterRecoveryTestPresent =
    pathExists(safeJoin(rootDir, '.dr-test.log')) ||
    pathExists(safeJoin(rootDir, 'docs', 'dr-test.log'));
  const seedScriptPresent =
    pathExists(safeJoin(rootDir, 'backend', 'prisma', 'seed.ts')) ||
    pathExists(safeJoin(rootDir, 'backend', 'prisma', 'seed.js'));
  const missingSignals: string[] = [];
  if (!backupManifestPresent) {
    missingSignals.push('backup-manifest');
  }
  if (!backupPolicyPresent) {
    missingSignals.push('backup-policy');
  }
  if (!backupValidationPresent) {
    missingSignals.push('backup-validation');
  }
  if (!restoreRunbookPresent) {
    missingSignals.push('restore-runbook');
  }
  if (!disasterRecoveryRunbookPresent) {
    missingSignals.push('dr-runbook');
  }
  if (!disasterRecoveryTestPresent) {
    missingSignals.push('dr-test');
  }
  if (!seedScriptPresent) {
    missingSignals.push('seed-script');
  }
  return {
    executed: true,
    artifactPaths: [RECOVERY_EVIDENCE_PATH],
    summary:
      missingSignals.length === 0
        ? 'Recovery evidence found backup metadata, restore runbooks, DR drill evidence, and a seed script.'
        : `Recovery evidence is missing: ${missingSignals.join(', ')}.`,
    signals: {
      backupManifestPresent,
      backupPolicyPresent,
      backupValidationPresent,
      restoreRunbookPresent,
      disasterRecoveryRunbookPresent,
      disasterRecoveryTestPresent,
      seedScriptPresent,
    },
  };
}
