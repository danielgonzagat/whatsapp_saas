import type { PulseManifestFlowSpec, PulseFlowResult } from '../../../types';
import type { AuthCredentials } from '../../../browser-stress-tester/types';
import { obtainAuthToken } from '../../../browser-stress-tester/auth';
import { httpGet, httpPost, httpPut } from '../../../parsers/runtime-utils';
import type { FlowRuntimeContext, FlowExecutionOverrides } from './types-and-config';
import {
  replayEnabled,
  smokeEnabled,
  getArtifactPaths,
  compactSummary,
  isProvisioningGap,
  isTransportGap,
} from './mode-helpers';

export function buildHttpBackedResult(
  spec: PulseManifestFlowSpec,
  summary: string,
  status: number,
  metrics?: Record<string, string | number | boolean>,
  overrides: FlowExecutionOverrides = {},
): PulseFlowResult {
  if (isTransportGap(status, summary) || isProvisioningGap(summary)) {
    return buildMissingEvidenceResult(spec, summary, metrics, {
      ...overrides,
      executed: overrides.executed ?? status > 0,
    });
  }

  return buildFailureResult(spec, summary, metrics, {
    ...overrides,
    executed: overrides.executed ?? status > 0,
  });
}

export function getResponseSummary(status: number, body: unknown): string {
  return compactSummary(body) || `HTTP ${status}`;
}

export function extractWorkspaceId(payload: any, fallback: string): string {
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

export async function ensureAuth(context: FlowRuntimeContext): Promise<AuthCredentials> {
  if (!context.authPromise) {
    context.authPromise = obtainAuthToken(context.runtimeResolution.backendUrl);
  }
  return context.authPromise;
}

export function buildMissingEvidenceResult(
  spec: PulseManifestFlowSpec,
  summary: string,
  metrics?: Record<string, string | number | boolean>,
  overrides: FlowExecutionOverrides = {},
): PulseFlowResult {
  return {
    flowId: spec.id,
    status: 'missing_evidence',
    executed: overrides.executed ?? false,
    accepted: false,
    providerModeUsed: overrides.providerModeUsed ?? spec.providerMode,
    smokeExecuted: overrides.smokeExecuted ?? false,
    replayExecuted: overrides.replayExecuted ?? replayEnabled(spec),
    failureClass: overrides.failureClass ?? 'missing_evidence',
    summary,
    artifactPaths: getArtifactPaths(spec.id),
    metrics,
  };
}

export function buildFailureResult(
  spec: PulseManifestFlowSpec,
  summary: string,
  metrics?: Record<string, string | number | boolean>,
  overrides: FlowExecutionOverrides = {},
): PulseFlowResult {
  return {
    flowId: spec.id,
    status: 'failed',
    executed: overrides.executed ?? true,
    accepted: false,
    providerModeUsed: overrides.providerModeUsed ?? spec.providerMode,
    smokeExecuted: overrides.smokeExecuted ?? smokeEnabled(spec),
    replayExecuted: overrides.replayExecuted ?? replayEnabled(spec),
    failureClass: overrides.failureClass ?? 'product_failure',
    summary,
    artifactPaths: getArtifactPaths(spec.id),
    metrics,
  };
}

export function buildPassedResult(
  spec: PulseManifestFlowSpec,
  summary: string,
  metrics?: Record<string, string | number | boolean>,
  overrides: FlowExecutionOverrides = {},
): PulseFlowResult {
  return {
    flowId: spec.id,
    status: 'passed',
    executed: overrides.executed ?? true,
    accepted: false,
    providerModeUsed: overrides.providerModeUsed ?? spec.providerMode,
    smokeExecuted: overrides.smokeExecuted ?? smokeEnabled(spec),
    replayExecuted: overrides.replayExecuted ?? replayEnabled(spec),
    summary,
    artifactPaths: getArtifactPaths(spec.id),
    metrics,
  };
}

export async function fetchJsonWithAuth(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  jwt: string,
  body?: Record<string, unknown>,
) {
  if (method === 'GET') {
    return httpGet(path, { jwt, timeout: 15000 });
  }
  if (method === 'PUT') {
    return httpPut(path, body, { jwt, timeout: 15000 });
  }
  return httpPost(path, body, { jwt, timeout: 15000 });
}
