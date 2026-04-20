import * as fs from 'fs';
import * as path from 'path';
import { obtainAuthToken } from './browser-stress-tester/auth';
import type {
  PulseEnvironment,
  PulseObservabilityEvidence,
  PulseRecoveryEvidence,
  PulseRuntimeEvidence,
  PulseRuntimeProbe,
} from './types';
import { dbQuery, getRuntimeResolution, httpGet } from './parsers/runtime-utils';

const RUNTIME_EVIDENCE_PATH = 'PULSE_RUNTIME_EVIDENCE.json';
const RUNTIME_PROBES_PATH = 'PULSE_RUNTIME_PROBES.json';
const OBSERVABILITY_EVIDENCE_PATH = 'PULSE_OBSERVABILITY_EVIDENCE.json';
const RECOVERY_EVIDENCE_PATH = 'PULSE_RECOVERY_EVIDENCE.json';

interface RuntimeProbeContext {
  env: PulseEnvironment;
  backendUrl: string;
  frontendUrl: string;
  backendSource: string;
  frontendSource: string;
  dbConfigured: boolean;
  dbSource: string;
}

interface CollectRuntimeEvidenceOptions {
  probeIds?: string[];
  requireDbConnectivity?: boolean;
}

/** Pulse runtime probe id type. */
export type PulseRuntimeProbeId =
  | 'backend-health'
  | 'auth-session'
  | 'frontend-reachability'
  | 'db-connectivity';

const DEFAULT_RUNTIME_PROBE_IDS: PulseRuntimeProbeId[] = [
  'backend-health',
  'auth-session',
  'frontend-reachability',
  'db-connectivity',
];

function shouldTreatAsMissingEvidence(source: string): boolean {
  return source === 'fallback';
}

function compactReason(text: string, max: number = 220): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max - 3)}...`;
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

function extractWorkspaceId(payload: any, fallback: string): string {
  const candidates = [
    payload?.id,
    payload?.workspaceId,
    payload?.workspace?.id,
    payload?.workspace?.workspaceId,
    fallback,
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

function inferReadbackFailureClass(
  status: number,
  summary: string,
): 'missing_evidence' | 'product_failure' {
  if (status === 0) {
    return 'missing_evidence';
  }
  const lowered = summary.toLowerCase();
  if (
    lowered.includes('timed out') ||
    lowered.includes('fetch failed') ||
    lowered.includes('request failed') ||
    lowered.includes('enotfound') ||
    lowered.includes('econnrefused') ||
    lowered.includes('econnreset') ||
    lowered.includes('aborted')
  ) {
    return 'missing_evidence';
  }
  return 'product_failure';
}

async function runDbReadbackFallback(
  context: RuntimeProbeContext,
  required: boolean,
  directProbeFailure?: string,
): Promise<PulseRuntimeProbe> {
  const start = Date.now();

  if (shouldTreatAsMissingEvidence(context.backendSource)) {
    return {
      probeId: 'db-connectivity',
      target: `${context.backendUrl}/workspace/me`,
      required,
      executed: false,
      status: 'missing_evidence',
      failureClass: 'missing_evidence',
      summary: compactReason(
        directProbeFailure
          ? `Database probe fell back to backend readback, but backend runtime resolution is still fallback-only. Direct probe failure: ${directProbeFailure}`
          : `Database probe can only use backend readback, but backend runtime resolution is still fallback-only (${context.backendUrl}).`,
      ),
      latencyMs: Date.now() - start,
      artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
    };
  }

  try {
    const creds = await obtainAuthToken(context.backendUrl);
    const meRes = await httpGet('/workspace/me', {
      jwt: creds.token,
      timeout: 8000,
    });

    if (!meRes.ok) {
      const summary = compactReason(
        `Backend readback probe could not load /workspace/me: ${compactReason(meRes.body?.error || meRes.body?.message || `HTTP ${meRes.status}`)}.`,
      );
      const failureClass = inferReadbackFailureClass(meRes.status, summary);
      return {
        probeId: 'db-connectivity',
        target: `${context.backendUrl}/workspace/me`,
        required,
        executed: meRes.status > 0,
        status: failureClass === 'missing_evidence' ? 'missing_evidence' : 'failed',
        failureClass,
        summary: directProbeFailure
          ? compactReason(`${summary} Direct SQL probe failure: ${directProbeFailure}`)
          : summary,
        latencyMs: Date.now() - start,
        artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
      };
    }

    const workspaceId = extractWorkspaceId(meRes.body, creds.workspaceId);
    if (!workspaceId) {
      return {
        probeId: 'db-connectivity',
        target: `${context.backendUrl}/workspace/me`,
        required,
        executed: true,
        status: 'missing_evidence',
        failureClass: 'missing_evidence',
        summary: directProbeFailure
          ? compactReason(
              `Backend readback returned no workspace identifier. Direct SQL probe failure: ${directProbeFailure}`,
            )
          : 'Backend readback returned no workspace identifier.',
        latencyMs: Date.now() - start,
        artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
      };
    }

    const settingsRes = await httpGet(`/workspace/${workspaceId}/settings`, {
      jwt: creds.token,
      timeout: 8000,
    });

    if (!settingsRes.ok) {
      const summary = compactReason(
        `Backend readback probe could not load /workspace/${workspaceId}/settings: ${compactReason(settingsRes.body?.error || settingsRes.body?.message || `HTTP ${settingsRes.status}`)}.`,
      );
      const failureClass = inferReadbackFailureClass(settingsRes.status, summary);
      return {
        probeId: 'db-connectivity',
        target: `${context.backendUrl}/workspace/${workspaceId}/settings`,
        required,
        executed: settingsRes.status > 0,
        status: failureClass === 'missing_evidence' ? 'missing_evidence' : 'failed',
        failureClass,
        summary: directProbeFailure
          ? compactReason(`${summary} Direct SQL probe failure: ${directProbeFailure}`)
          : summary,
        latencyMs: Date.now() - start,
        artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
      };
    }

    const providerSettingsDetected = Boolean(
      settingsRes.body &&
      typeof settingsRes.body === 'object' &&
      ((settingsRes.body as Record<string, unknown>).providerSettings ||
        (settingsRes.body as Record<string, unknown>).branding ||
        Object.prototype.hasOwnProperty.call(settingsRes.body, 'jitterMin')),
    );

    return {
      probeId: 'db-connectivity',
      target: `${context.backendUrl}/workspace/${workspaceId}/settings`,
      required,
      executed: true,
      status: 'passed',
      summary: directProbeFailure
        ? compactReason(
            `Database connectivity passed via authenticated backend readback on workspace settings. Direct SQL probe failure: ${directProbeFailure}`,
          )
        : 'Database connectivity passed via authenticated backend readback on workspace settings.',
      latencyMs: Date.now() - start,
      artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
      metrics: {
        proofMode: 'backend_readback',
        workspaceIdDetected: Boolean(workspaceId),
        providerSettingsDetected,
        authStatus: meRes.status,
        settingsStatus: settingsRes.status,
      },
    };
  } catch (error: any) {
    return {
      probeId: 'db-connectivity',
      target: `${context.backendUrl}/workspace/me`,
      required,
      executed: false,
      status: 'missing_evidence',
      failureClass: 'missing_evidence',
      summary: directProbeFailure
        ? compactReason(
            `Database probe fallback could not authenticate or perform backend readback: ${error?.message || 'unknown failure'}. Direct SQL probe failure: ${directProbeFailure}`,
          )
        : compactReason(
            `Database probe fallback could not authenticate or perform backend readback: ${error?.message || 'unknown failure'}`,
          ),
      latencyMs: Date.now() - start,
      artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
    };
  }
}

async function runBackendHealthProbe(context: RuntimeProbeContext): Promise<PulseRuntimeProbe> {
  if (shouldTreatAsMissingEvidence(context.backendSource)) {
    return {
      probeId: 'backend-health',
      target: `${context.backendUrl}/health/system`,
      required: true,
      executed: false,
      status: 'missing_evidence',
      failureClass: 'missing_evidence',
      summary: `Backend runtime resolution is still fallback-only (${context.backendUrl}); refusing to certify a fake target.`,
      artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
    };
  }

  const candidatePaths = ['/health/system', '/health'];
  const start = Date.now();

  for (const probePath of candidatePaths) {
    const res = await httpGet(probePath, { timeout: 8000 });
    const latencyMs = Date.now() - start;
    const traceHeader = res.headers['x-request-id'] || res.headers['x-correlation-id'] || '';

    if (res.ok) {
      return {
        probeId: 'backend-health',
        target: `${context.backendUrl}${probePath}`,
        required: true,
        executed: true,
        status: 'passed',
        summary: `Backend health probe passed on ${probePath} (${res.status}).`,
        latencyMs,
        artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
        metrics: {
          status: res.status,
          traceHeaderDetected: Boolean(traceHeader),
        },
      };
    }
  }

  const fallbackFailureClass = shouldTreatAsMissingEvidence(context.backendSource)
    ? 'missing_evidence'
    : 'product_failure';
  const failingRes = await httpGet('/health/system', { timeout: 4000 });

  return {
    probeId: 'backend-health',
    target: `${context.backendUrl}/health/system`,
    required: true,
    executed: failingRes.status > 0,
    status: fallbackFailureClass === 'missing_evidence' ? 'missing_evidence' : 'failed',
    failureClass: fallbackFailureClass,
    summary: compactReason(
      failingRes.status === 0
        ? `Backend health probe could not reach ${context.backendUrl}. ${failingRes.body?.error || 'Connection failed'}.`
        : `Backend health probe returned HTTP ${failingRes.status} from ${context.backendUrl}/health/system.`,
    ),
    latencyMs: failingRes.timeMs,
    artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
  };
}

async function runAuthProbe(context: RuntimeProbeContext): Promise<PulseRuntimeProbe> {
  const start = Date.now();
  if (shouldTreatAsMissingEvidence(context.backendSource)) {
    return {
      probeId: 'auth-session',
      target: `${context.backendUrl}/auth/login`,
      required: true,
      executed: false,
      status: 'missing_evidence',
      failureClass: 'missing_evidence',
      summary: `Backend runtime resolution is still fallback-only (${context.backendUrl}); auth proof cannot run honestly.`,
      latencyMs: Date.now() - start,
      artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
    };
  }

  try {
    const creds = await obtainAuthToken(context.backendUrl);
    const protectedPaths = ['/workspace/me', '/auth/me'];
    let me = null as Awaited<ReturnType<typeof httpGet>> | null;

    for (const protectedPath of protectedPaths) {
      const firstAttempt = await httpGet(protectedPath, {
        jwt: creds.token,
        timeout: 8000,
      });
      me = firstAttempt;

      if (firstAttempt.ok) {
        break;
      }
      if (firstAttempt.status >= 500 && firstAttempt.status < 600) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        const retryAttempt = await httpGet(protectedPath, {
          jwt: creds.token,
          timeout: 8000,
        });
        me = retryAttempt;
        if (retryAttempt.ok) {
          break;
        }
      }
    }

    if (!me || !me.ok) {
      return {
        probeId: 'auth-session',
        target: `${context.backendUrl}/auth/login -> /workspace/me`,
        required: true,
        executed: true,
        status: 'failed',
        failureClass: 'product_failure',
        summary: `Auth probe obtained a token but the protected workspace endpoint returned HTTP ${me?.status || 0}.`,
        latencyMs: Date.now() - start,
        artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
        metrics: {
          authStatus: me?.status || 0,
          workspaceIdDetected: Boolean(creds.workspaceId),
        },
      };
    }

    return {
      probeId: 'auth-session',
      target: `${context.backendUrl}/auth/login -> /workspace/me`,
      required: true,
      executed: true,
      status: 'passed',
      summary: 'Auth probe obtained a token and reached /workspace/me successfully.',
      latencyMs: Date.now() - start,
      artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
      metrics: {
        authStatus: me.status,
        workspaceIdDetected: Boolean(creds.workspaceId),
      },
    };
  } catch (error: any) {
    const failureClass = shouldTreatAsMissingEvidence(context.backendSource)
      ? 'missing_evidence'
      : 'product_failure';
    return {
      probeId: 'auth-session',
      target: `${context.backendUrl}/auth/login`,
      required: true,
      executed: false,
      status: failureClass === 'missing_evidence' ? 'missing_evidence' : 'failed',
      failureClass,
      summary: compactReason(`Auth probe failed: ${error?.message || 'unknown auth failure'}`),
      latencyMs: Date.now() - start,
      artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
    };
  }
}

async function runFrontendProbe(context: RuntimeProbeContext): Promise<PulseRuntimeProbe> {
  const start = Date.now();
  if (context.env === 'total' && shouldTreatAsMissingEvidence(context.frontendSource)) {
    return {
      probeId: 'frontend-reachability',
      target: context.frontendUrl,
      required: true,
      executed: false,
      status: 'missing_evidence',
      failureClass: 'missing_evidence',
      summary: `Frontend runtime resolution is still fallback-only (${context.frontendUrl}); refusing localhost fallback during total certification.`,
      latencyMs: Date.now() - start,
      artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(context.frontendUrl, { method: 'GET', signal: controller.signal });
    return {
      probeId: 'frontend-reachability',
      target: context.frontendUrl,
      required: context.env === 'total',
      executed: true,
      status: res.status < 500 ? 'passed' : 'failed',
      failureClass: res.status < 500 ? undefined : 'product_failure',
      summary:
        res.status < 500
          ? `Frontend responded with HTTP ${res.status}.`
          : `Frontend returned HTTP ${res.status}.`,
      latencyMs: Date.now() - start,
      artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
      metrics: {
        status: res.status,
      },
    };
  } catch (error: any) {
    const failureClass = shouldTreatAsMissingEvidence(context.frontendSource)
      ? 'missing_evidence'
      : 'product_failure';
    return {
      probeId: 'frontend-reachability',
      target: context.frontendUrl,
      required: context.env === 'total',
      executed: false,
      status: failureClass === 'missing_evidence' ? 'missing_evidence' : 'failed',
      failureClass,
      summary: compactReason(`Frontend probe failed: ${error?.message || 'connection failed'}`),
      latencyMs: Date.now() - start,
      artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
    };
  } finally {
    clearTimeout(timer);
  }
}

async function runDbProbe(
  context: RuntimeProbeContext,
  required: boolean,
): Promise<PulseRuntimeProbe> {
  if (!context.dbConfigured) {
    return runDbReadbackFallback(
      context,
      required,
      'No direct DATABASE_URL was resolved for this environment.',
    );
  }

  const start = Date.now();
  try {
    const rows = await dbQuery('SELECT 1 AS pulse_runtime_probe');
    return {
      probeId: 'db-connectivity',
      target: context.dbSource,
      required,
      executed: true,
      status: 'passed',
      summary: 'Database connectivity probe succeeded.',
      latencyMs: Date.now() - start,
      artifactPaths: [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH],
      metrics: {
        rows: rows.length,
      },
    };
  } catch (error: any) {
    const message = String(error?.message || 'query failed');
    const directProbeFailure = compactReason(`Direct SQL probe failed: ${message}`);
    const fallbackProbe = await runDbReadbackFallback(context, required, directProbeFailure);
    if (fallbackProbe.status === 'passed') {
      return {
        ...fallbackProbe,
        latencyMs: Date.now() - start,
      };
    }

    return {
      ...fallbackProbe,
      target: fallbackProbe.target || context.dbSource,
      latencyMs: Date.now() - start,
    };
  }
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
    return runBackendHealthProbe(context);
  }
  if (probeId === 'auth-session') {
    return runAuthProbe(context);
  }
  if (probeId === 'frontend-reachability') {
    return runFrontendProbe(context);
  }
  return runDbProbe(context, options.requireDbConnectivity || env === 'total');
}

/** Summarize runtime evidence. */
export function summarizeRuntimeEvidence(
  env: PulseEnvironment,
  probes: PulseRuntimeProbe[],
): PulseRuntimeEvidence {
  const resolution = getRuntimeResolution();

  if (env === 'scan') {
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
  if (!fs.existsSync(filePath)) {
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

/** Collect observability evidence. */
export function collectObservabilityEvidence(
  rootDir: string,
  runtimeEvidence: PulseRuntimeEvidence,
): PulseObservabilityEvidence {
  const backendMain = scanTextIfExists(path.join(rootDir, 'backend', 'src', 'main.ts'));
  const backendSentry = scanTextIfExists(path.join(rootDir, 'backend', 'src', 'sentry.ts'));
  const workerBootstrap = scanTextIfExists(path.join(rootDir, 'worker', 'bootstrap.ts'));
  const requestIdInterceptor = scanTextIfExists(
    path.join(rootDir, 'backend', 'src', 'common', 'request-id.interceptor.ts'),
  );
  const requestLogger = scanTextIfExists(
    path.join(rootDir, 'backend', 'src', 'common', 'request-logger.interceptor.ts'),
  );
  const envSchema = scanTextIfExists(path.join(rootDir, 'backend', 'src', 'lib', 'env.ts'));
  const auditMiddleware = scanTextIfExists(
    path.join(rootDir, 'backend', 'src', 'kloel', 'middleware', 'audit-log.middleware.ts'),
  );
  const systemHealth = scanTextIfExists(
    path.join(rootDir, 'backend', 'src', 'health', 'system-health.controller.ts'),
  );
  const appHealth = scanTextIfExists(path.join(rootDir, 'backend', 'src', 'app.controller.ts'));

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
  const backupManifestPresent = fs.existsSync(path.join(rootDir, '.backup-manifest.json'));
  const backupPolicyPresent = fs.existsSync(path.join(rootDir, '.backup-policy.json'));
  const backupValidationPresent =
    fs.existsSync(path.join(rootDir, '.backup-validation.log')) ||
    fs.existsSync(path.join(rootDir, 'scripts', 'backup-validation.log'));
  const restoreRunbookPresent =
    fs.existsSync(path.join(rootDir, 'docs', 'RESTORE.md')) ||
    fs.existsSync(path.join(rootDir, 'RESTORE.md')) ||
    fs.existsSync(path.join(rootDir, 'scripts', 'restore.sh')) ||
    fs.existsSync(path.join(rootDir, 'scripts', 'db-restore.ts'));
  const disasterRecoveryRunbookPresent =
    fs.existsSync(path.join(rootDir, 'docs', 'DISASTER_RECOVERY.md')) ||
    fs.existsSync(path.join(rootDir, 'DISASTER_RECOVERY.md'));
  const disasterRecoveryTestPresent =
    fs.existsSync(path.join(rootDir, '.dr-test.log')) ||
    fs.existsSync(path.join(rootDir, 'docs', 'dr-test.log'));
  const seedScriptPresent =
    fs.existsSync(path.join(rootDir, 'backend', 'prisma', 'seed.ts')) ||
    fs.existsSync(path.join(rootDir, 'backend', 'prisma', 'seed.js'));

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
