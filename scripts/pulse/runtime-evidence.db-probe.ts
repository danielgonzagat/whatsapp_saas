/**
 * Database readback fallback probe for runtime evidence collection.
 * Companion to runtime-evidence.probes.ts.
 * Defines RuntimeProbeContext and PulseRuntimeProbeResult interfaces.
 */
import { obtainAuthToken } from './browser-stress-tester/auth';
import { httpGet } from './parsers/runtime-utils';

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

const RUNTIME_EVIDENCE_PATH = 'PULSE_RUNTIME_EVIDENCE.json';
const RUNTIME_PROBES_PATH = 'PULSE_RUNTIME_PROBES.json';
const PROBE_ARTIFACT_PATHS = [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH];

export function shouldTreatAsMissingEvidence(source: string): boolean {
  return source === 'fallback';
}

export function compactReason(text: string, max: number = 220): string {
  const compacted = text.replace(/\s+/g, ' ').trim();
  return compacted.length <= max ? compacted : `${compacted.slice(0, max - 3)}...`;
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
  const networkErrors = [
    'timed out',
    'fetch failed',
    'request failed',
    'enotfound',
    'econnrefused',
    'econnreset',
    'aborted',
  ];
  return networkErrors.some((s) => lowered.includes(s)) ? 'missing_evidence' : 'product_failure';
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
    const meRes = await httpGet('/workspace/me', { jwt: creds.token, timeout: 8000 });
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
