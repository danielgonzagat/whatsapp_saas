/**
 * Unified Agent Integrator para o Worker
 *
 * Permite que o worker use o UnifiedAgentService do backend
 * para decisões avançadas com tool calling.
 */

/**
 * ARCHITECTURAL COHESION: Unified Agent Integrator — bridges the CIA agent system with
 * external platforms (WhatsApp, email, webhooks) through a single dispatch interface.
 * Handles multi-channel message dispatch, channel-specific formatting, activity log
 * synchronization, and platform capability detection. Every channel shares the same
 * dispatch contract and formatting pipeline; separating channels would duplicate the
 * HTTP transport, auth, and retry logic across files.
 *
 * Pure helpers (heuristics, autopilot setting parsers, Unified→legacy action mappers)
 * were moved to the sibling `unified-agent-integrator.helpers.ts` so they can be
 * unit-tested without touching `fetch`. The HTTP entrypoint `processWithUnifiedAgent`
 * intentionally remains here.
 */

import { WorkerLogger } from '../logger';
import { resolveBackendUrl } from '../utils/backend-url.helpers';
import type { UnifiedAgentResult } from './unified-agent-integrator.helpers';

export {
  mapUnifiedActionsToAutopilot,
  shouldUseUnifiedAgent,
  extractTextResponse,
} from './unified-agent-integrator.helpers';

export type {
  UnifiedAgentResult,
  AutopilotLegacyDecision,
  AutopilotSettings,
} from './unified-agent-integrator.helpers';

const log = new WorkerLogger('unified-agent-integrator');

const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY || '';

/**
 * Chama o UnifiedAgentService do backend para processar mensagem.
 * Usado para decisões complexas que requerem tool calling.
 */
export async function processWithUnifiedAgent(params: {
  workspaceId: string;
  contactId?: string;
  phone: string;
  message: string;
  context?: Record<string, unknown>;
}): Promise<UnifiedAgentResult | null> {
  const { workspaceId, contactId, phone, message, context } = params;
  const backendUrl = resolveBackendUrl();

  if (!backendUrl) {
    log.error('unified_agent_backend_url_missing', {
      workspaceId,
    });
    return null;
  }

  try {
    const url = `${backendUrl}/kloel/agent/${workspaceId}/process`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(INTERNAL_API_KEY ? { 'X-Internal-Key': INTERNAL_API_KEY } : {}),
      },
      body: JSON.stringify({
        contactId,
        phone,
        message,
        context,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      log.warn('unified_agent_request_failed', {
        status: response.status,
        workspaceId,
        body: errorBody.slice(0, 300),
      });
      return null;
    }

    const data = (await response.json()) as {
      response?: string;
      actions?: Array<{ tool: string; args: Record<string, unknown>; result?: unknown }>;
      model?: string;
    };

    log.info('unified_agent_response', {
      workspaceId,
      actionsCount: data.actions?.length || 0,
      model: data.model,
    });

    return {
      response: data.response,
      actions: data.actions || [],
      model: data.model,
    };
  } catch (err: unknown) {
    log.error('unified_agent_error', {
      error: err instanceof Error ? err.message : 'unknown_error',
      workspaceId,
    });
    return null;
  }
}
