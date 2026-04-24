/**
 * Pulse runtime probe runners.
 * Individual probe implementations used by collectRuntimeEvidence.
 */
import { obtainAuthToken } from './browser-stress-tester/auth';
import { dbQuery, httpGet } from './parsers/runtime-utils';

const RUNTIME_EVIDENCE_PATH = 'PULSE_RUNTIME_EVIDENCE.json';
const RUNTIME_PROBES_PATH = 'PULSE_RUNTIME_PROBES.json';
const PROBE_ARTIFACT_PATHS = [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH];

export interface RuntimeProbeContext {
  env: string;
  backendUrl: string;
  frontendUrl: string;
  backendSource: string;
  frontendSource: string;
  dbConfigured: boolean;
  dbSource: string;
}

export interface PulseRuntimeProbeResult {
  probeId: string;
  target: string;
  required: boolean;
  executed: boolean;
  status: 'passed' | 'failed' | 'missing_evidence' | 'skipped';
  failureClass?: 'missing_evidence' | 'product_failure';
  summary: string;
  latencyMs?: number;
  artifactPaths: string[];
  metrics?: Record<string, unknown>;
}

export function shouldTreatAsMissingEvidence(source: string): boolean {
  return source === 'fallback';
}

function compactReason(text: string, max: number = 220): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length <= max ? compact : `${compact.slice(0, max - 3)}...`;
}
function extractWorkspaceId(payload: Record<string, unknown> | null, fallback: string): string {
  const candidates = [
    payload?.id,
    payload?.workspaceId,
    (payload?.workspace as Record<string, unknown> | undefined)?.id,
    (payload?.workspace as Record<string, unknown> | undefined)?.workspaceId,
    fallback,
  ];
  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (normalized) return normalized;
  }
  return '';
}
function inferReadbackFailureClass(
  status: number,
  summary: string,
): 'missing_evidence' | 'product_failure' {
  if (status === 0) return 'missing_evidence';
  const lowered = summary.toLowerCase();
  const networkError = [
    'timed out',
    'fetch failed',
    'request failed',
    'enotfound',
    'econnrefused',
    'econnreset',
    'aborted',
  ];
  return networkError.some((s) => lowered.includes(s)) ? 'missing_evidence' : 'product_failure';
}

export async function runDbReadbackFallback(
  context: RuntimeProbeContext,
  required: boolean,
  directProbeFailure?: string,
): Promise<PulseRuntimeProbeResult> {
  const start = Date.now();
  const dbBase = { probeId: 'db-connectivity', required, artifactPaths: PROBE_ARTIFACT_PATHS };
  if (shouldTreatAsMissingEvidence(context.backendSource)) {
    return {
      ...dbBase,
      target: `${context.backendUrl}/workspace/me`,
      executed: false,
      status: 'missing_evidence',
      failureClass: 'missing_evidence',
      summary: compactReason(
        directProbeFailure
          ? `Database probe fell back to backend readback, but backend runtime resolution is still fallback-only. Direct probe failure: ${directProbeFailure}`
          : `Database probe can only use backend readback, but backend runtime resolution is still fallback-only (${context.backendUrl}).`,
      ),
      latencyMs: Date.now() - start,
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
        ...dbBase,
        target: `${context.backendUrl}/workspace/me`,
        executed: meRes.status > 0,
        status: failureClass === 'missing_evidence' ? 'missing_evidence' : 'failed',
        failureClass,
        summary: directProbeFailure
          ? compactReason(`${summary} Direct SQL probe failure: ${directProbeFailure}`)
          : summary,
        latencyMs: Date.now() - start,
      };
    }
    const workspaceId = extractWorkspaceId(
      meRes.body as Record<string, unknown> | null,
      creds.workspaceId,
    );
    if (!workspaceId) {
      return {
        ...dbBase,
        target: `${context.backendUrl}/workspace/me`,
        executed: true,
        status: 'missing_evidence',
        failureClass: 'missing_evidence',
        summary: directProbeFailure
          ? compactReason(
              `Backend readback returned no workspace identifier. Direct SQL probe failure: ${directProbeFailure}`,
            )
          : 'Backend readback returned no workspace identifier.',
        latencyMs: Date.now() - start,
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
        ...dbBase,
        target: `${context.backendUrl}/workspace/${workspaceId}/settings`,
        executed: settingsRes.status > 0,
        status: failureClass === 'missing_evidence' ? 'missing_evidence' : 'failed',
        failureClass,
        summary: directProbeFailure
          ? compactReason(`${summary} Direct SQL probe failure: ${directProbeFailure}`)
          : summary,
        latencyMs: Date.now() - start,
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
      ...dbBase,
      target: `${context.backendUrl}/workspace/${workspaceId}/settings`,
      executed: true,
      status: 'passed',
      summary: directProbeFailure
        ? compactReason(
            `Database connectivity passed via authenticated backend readback on workspace settings. Direct SQL probe failure: ${directProbeFailure}`,
          )
        : 'Database connectivity passed via authenticated backend readback on workspace settings.',
      latencyMs: Date.now() - start,
      metrics: {
        proofMode: 'backend_readback',
        workspaceIdDetected: Boolean(workspaceId),
        providerSettingsDetected,
        authStatus: meRes.status,
        settingsStatus: settingsRes.status,
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown failure';
    return {
      ...dbBase,
      target: `${context.backendUrl}/workspace/me`,
      executed: false,
      status: 'missing_evidence',
      failureClass: 'missing_evidence',
      summary: directProbeFailure
        ? compactReason(
            `Database probe fallback could not authenticate or perform backend readback: ${message}. Direct SQL probe failure: ${directProbeFailure}`,
          )
        : compactReason(
            `Database probe fallback could not authenticate or perform backend readback: ${message}`,
          ),
      latencyMs: Date.now() - start,
    };
  }
}

export async function runBackendHealthProbe(
  context: RuntimeProbeContext,
): Promise<PulseRuntimeProbeResult> {
  if (shouldTreatAsMissingEvidence(context.backendSource)) {
    return {
      probeId: 'backend-health',
      target: `${context.backendUrl}/health/system`,
      required: true,
      executed: false,
      status: 'missing_evidence',
      failureClass: 'missing_evidence',
      summary: `Backend runtime resolution is still fallback-only (${context.backendUrl}); refusing to certify a fake target.`,
      artifactPaths: PROBE_ARTIFACT_PATHS,
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
        artifactPaths: PROBE_ARTIFACT_PATHS,
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

export async function runAuthProbe(context: RuntimeProbeContext): Promise<PulseRuntimeProbeResult> {
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
      artifactPaths: PROBE_ARTIFACT_PATHS,
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
        artifactPaths: PROBE_ARTIFACT_PATHS,
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
      artifactPaths: PROBE_ARTIFACT_PATHS,
      metrics: {
        authStatus: me.status,
        workspaceIdDetected: Boolean(creds.workspaceId),
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown auth failure';
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
      summary: compactReason(`Auth probe failed: ${message}`),
      latencyMs: Date.now() - start,
      artifactPaths: PROBE_ARTIFACT_PATHS,
    };
  }
}

export async function runFrontendProbe(
  context: RuntimeProbeContext,
): Promise<PulseRuntimeProbeResult> {
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
      artifactPaths: PROBE_ARTIFACT_PATHS,
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
      artifactPaths: PROBE_ARTIFACT_PATHS,
      metrics: {
        status: res.status,
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'connection failed';
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
      summary: compactReason(`Frontend probe failed: ${message}`),
      latencyMs: Date.now() - start,
      artifactPaths: PROBE_ARTIFACT_PATHS,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function runDbProbe(
  context: RuntimeProbeContext,
  required: boolean,
): Promise<PulseRuntimeProbeResult> {
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
      artifactPaths: PROBE_ARTIFACT_PATHS,
      metrics: {
        rows: rows.length,
      },
    };
  } catch (error: unknown) {
    const message = String(error instanceof Error ? error.message : 'query failed');
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
