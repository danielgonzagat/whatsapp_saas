import { obtainAuthToken } from '../../browser-stress-tester/auth';
import { dbQuery, httpGet } from '../../parsers/runtime-utils';
import {
  runDbReadbackFallback,
  shouldTreatAsMissingEvidence,
  compactReason,
} from '../../runtime-evidence.db-probe';
import type { RuntimeProbeContext, PulseRuntimeProbeResult } from '../../runtime-evidence.db-probe';
import { selectHealthProbePaths, selectAuthenticatedReadPaths } from './route-discovery';

const RUNTIME_EVIDENCE_PATH = 'PULSE_RUNTIME_EVIDENCE.json';
const RUNTIME_PROBES_PATH = 'PULSE_RUNTIME_PROBES.json';
const PROBE_ARTIFACT_PATHS = [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH];

export async function runBackendHealthProbe(
  context: RuntimeProbeContext,
): Promise<PulseRuntimeProbeResult> {
  const healthProbePaths = selectHealthProbePaths();
  const targetPath = healthProbePaths[0] ?? '';
  if (shouldTreatAsMissingEvidence(context.backendSource)) {
    return {
      probeId: 'backend-health',
      target: targetPath ? `${context.backendUrl}${targetPath}` : context.backendUrl,
      required: true,
      executed: false,
      status: 'missing_evidence',
      failureClass: 'missing_evidence',
      summary: `Backend runtime resolution is still fallback-only (${context.backendUrl}); refusing to certify a fake target.`,
      artifactPaths: PROBE_ARTIFACT_PATHS,
    };
  }
  if (healthProbePaths.length === 0) {
    return {
      probeId: 'backend-health',
      target: context.backendUrl,
      required: true,
      executed: false,
      status: 'missing_evidence',
      failureClass: 'missing_evidence',
      summary: 'No backend health capability route was discovered from controller entrypoints.',
      artifactPaths: PROBE_ARTIFACT_PATHS,
    };
  }
  const start = Date.now();
  for (const probePath of healthProbePaths) {
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
        metrics: { status: res.status, traceHeaderDetected: Boolean(traceHeader) },
      };
    }
  }
  const fallbackFailureClass = shouldTreatAsMissingEvidence(context.backendSource)
    ? 'missing_evidence'
    : 'product_failure';
  const failingRes = await httpGet(targetPath, { timeout: 4000 });
  return {
    probeId: 'backend-health',
    target: `${context.backendUrl}${targetPath}`,
    required: true,
    executed: failingRes.status > 0,
    status: fallbackFailureClass === 'missing_evidence' ? 'missing_evidence' : 'failed',
    failureClass: fallbackFailureClass,
    summary: compactReason(
      failingRes.status === 0
        ? `Backend health probe could not reach ${context.backendUrl}. ${failingRes.body?.error || 'Connection failed'}.`
        : `Backend health probe returned HTTP ${failingRes.status} from ${context.backendUrl}${targetPath}.`,
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
    const authReadPaths = selectAuthenticatedReadPaths();
    if (authReadPaths.length === 0) {
      return {
        probeId: 'auth-session',
        target: `${context.backendUrl}/auth/login`,
        required: true,
        executed: false,
        status: 'missing_evidence',
        failureClass: 'missing_evidence',
        summary:
          'Auth probe obtained credentials but found no guarded GET route from backend entrypoints.',
        latencyMs: Date.now() - start,
        artifactPaths: PROBE_ARTIFACT_PATHS,
      };
    }
    let me = null as Awaited<ReturnType<typeof httpGet>> | null;
    let reachedPath = authReadPaths[0];
    for (const protectedPath of authReadPaths) {
      const firstAttempt = await httpGet(protectedPath, { jwt: creds.token, timeout: 8000 });
      me = firstAttempt;
      if (firstAttempt.ok) {
        reachedPath = protectedPath;
        break;
      }
      if (firstAttempt.status >= 500 && firstAttempt.status < 600) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        const retryAttempt = await httpGet(protectedPath, { jwt: creds.token, timeout: 8000 });
        me = retryAttempt;
        if (retryAttempt.ok) {
          reachedPath = protectedPath;
          break;
        }
      }
    }
    if (!me || !me.ok) {
      return {
        probeId: 'auth-session',
        target: `${context.backendUrl}/auth/login -> ${reachedPath}`,
        required: true,
        executed: true,
        status: 'failed',
        failureClass: 'product_failure',
        summary: `Auth probe obtained a token but the protected workspace endpoint returned HTTP ${me?.status || 0}.`,
        latencyMs: Date.now() - start,
        artifactPaths: PROBE_ARTIFACT_PATHS,
        metrics: { authStatus: me?.status || 0, workspaceIdDetected: Boolean(creds.workspaceId) },
      };
    }
    return {
      probeId: 'auth-session',
      target: `${context.backendUrl}/auth/login -> ${reachedPath}`,
      required: true,
      executed: true,
      status: 'passed',
      summary: `Auth probe obtained a token and reached ${reachedPath} successfully.`,
      latencyMs: Date.now() - start,
      artifactPaths: PROBE_ARTIFACT_PATHS,
      metrics: { authStatus: me.status, workspaceIdDetected: Boolean(creds.workspaceId) },
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

export async function runAdRulesProbe(
  context: RuntimeProbeContext,
): Promise<PulseRuntimeProbeResult> {
  const start = Date.now();
  const target = `${context.backendUrl}/ad-rules`;
  if (shouldTreatAsMissingEvidence(context.backendSource)) {
    return {
      probeId: 'ad-rules',
      target,
      required: false,
      executed: false,
      status: 'missing_evidence',
      failureClass: 'missing_evidence',
      summary: `Backend runtime resolution is still fallback-only (${context.backendUrl}); ad rules proof cannot run honestly.`,
      latencyMs: Date.now() - start,
      artifactPaths: PROBE_ARTIFACT_PATHS,
    };
  }
  try {
    const creds = await obtainAuthToken(context.backendUrl);
    const response = await httpGet('/ad-rules', { jwt: creds.token, timeout: 8000 });
    if (!response.ok) {
      return {
        probeId: 'ad-rules',
        target,
        required: false,
        executed: true,
        status: 'failed',
        failureClass: 'product_failure',
        summary: `Ad rules runtime probe reached /ad-rules but received HTTP ${response.status}.`,
        latencyMs: Date.now() - start,
        artifactPaths: PROBE_ARTIFACT_PATHS,
        metrics: { status: response.status, workspaceIdDetected: Boolean(creds.workspaceId) },
      };
    }
    return {
      probeId: 'ad-rules',
      target,
      required: false,
      executed: true,
      status: 'passed',
      summary: 'Ad rules runtime probe authenticated and reached /ad-rules successfully.',
      latencyMs: Date.now() - start,
      artifactPaths: PROBE_ARTIFACT_PATHS,
      metrics: { status: response.status, workspaceIdDetected: Boolean(creds.workspaceId) },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown ad rules failure';
    const failureClass = shouldTreatAsMissingEvidence(context.backendSource)
      ? 'missing_evidence'
      : 'product_failure';
    return {
      probeId: 'ad-rules',
      target,
      required: false,
      executed: false,
      status: failureClass === 'missing_evidence' ? 'missing_evidence' : 'failed',
      failureClass,
      summary: compactReason(`Ad rules runtime probe failed: ${message}`),
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
      metrics: { status: res.status },
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
      metrics: { rows: rows.length },
    };
  } catch (error: unknown) {
    const message = String(error instanceof Error ? error.message : 'query failed');
    const directProbeFailure = compactReason(`Direct SQL probe failed: ${message}`);
    const fallbackProbe = await runDbReadbackFallback(context, required, directProbeFailure);
    if (fallbackProbe.status === 'passed')
      return { ...fallbackProbe, latencyMs: Date.now() - start };
    return {
      ...fallbackProbe,
      target: fallbackProbe.target || context.dbSource,
      latencyMs: Date.now() - start,
    };
  }
}
