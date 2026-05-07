import { Logger } from '@nestjs/common';
import { getTraceHeaders } from '../../common/trace-headers';
import { validateNoInternalAccess } from '../../common/utils/url-validator';
import type { SessionHealth } from '../whatsapp-watchdog-session.service';

export async function alertOpsHelper(
  logger: Logger,
  workspaceId: string,
  workspaceName: string | undefined,
  health: SessionHealth,
): Promise<void> {
  const webhook = process.env.OPS_WEBHOOK_URL || process.env.DLQ_WEBHOOK_URL;
  if (!webhook) {
    return;
  }

  try {
    validateNoInternalAccess(webhook);
    await fetch(webhook, {
      method: 'POST',
      headers: { ...getTraceHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'whatsapp_session_alert',
        severity: 'high',
        workspaceId,
        workspaceName,
        consecutiveFailures: health.consecutiveFailures,
        lastCheck: health.lastCheck.toISOString(),
        message:
          `WhatsApp session disconnected for ${workspaceName || workspaceId}. ` +
          `${health.consecutiveFailures} consecutive failures.`,
        at: new Date().toISOString(),
        env: process.env.NODE_ENV || 'development',
      }),
      signal: AbortSignal.timeout(10000),
    });
    logger.warn(`Alert sent for workspace ${workspaceName || workspaceId}`);
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown error';
    logger.error(`Failed to send ops alert: ${msg}`);
  }
}
