import { WorkerLogger } from '../logger';

const TRAILING_SLASHES_RE = /\/+$/;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

const log = new WorkerLogger('mind-client');

function resolveBackendUrl(): string | null {
  const configured =
    process.env.BACKEND_URL || process.env.API_URL || process.env.SERVICE_BASE_URL || '';
  const normalized = configured.trim().replace(TRAILING_SLASHES_RE, '');
  return normalized || null;
}

export interface MindVariantDecisionResult {
  variant: string;
  confidence: number;
  fallback: boolean;
}

export async function resolveBestVariantViaHttp(params: {
  workspaceId: string;
  flow: string;
  variantIds: string[];
  context?: Record<string, unknown>;
}): Promise<MindVariantDecisionResult | null> {
  const { workspaceId, flow, variantIds, context } = params;
  const backendUrl = resolveBackendUrl();

  if (!backendUrl) {
    log.warn('mind_client_backend_url_missing', { workspaceId, flow });
    return null;
  }

  try {
    const url = `${backendUrl}/mind/${workspaceId}/variant-decision`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(INTERNAL_API_KEY ? { 'X-Internal-Key': INTERNAL_API_KEY } : {}),
      },
      body: JSON.stringify({
        flow,
        variantIds,
        ...(context ? { context } : {}),
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      log.warn('mind_client_variant_decision_failed', {
        workspaceId,
        flow,
        status: response.status,
        body: errorBody.slice(0, 300),
      });
      return null;
    }

    const data = (await response.json()) as MindVariantDecisionResult;

    log.info('mind_client_variant_decision', {
      workspaceId,
      flow,
      chosen: data.variant,
      confidence: data.confidence,
      fallback: data.fallback,
    });

    return data;
  } catch (err: unknown) {
    log.warn('mind_client_variant_decision_error', {
      workspaceId,
      flow,
      error: err instanceof Error ? err.message : 'unknown_error',
    });
    return null;
  }
}
