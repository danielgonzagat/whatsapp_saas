import type { ConfigService } from '@nestjs/config';
import { validateNoInternalAccess } from '../../common/utils/url-validator';
import type { Logger } from '@nestjs/common';

export function getAlertWebhookUrl(config: ConfigService): string {
  return (
    config.get<string>('PULSE_ALERT_WEBHOOK_URL') ||
    config.get<string>('OPS_WEBHOOK_URL') ||
    config.get<string>('AUTOPILOT_ALERT_WEBHOOK_URL') ||
    config.get<string>('DLQ_WEBHOOK_URL') ||
    ''
  );
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
const DEFAULT_STALE_SWEEP_MS = 60_000;
const DEFAULT_FRONTEND_PRUNE_SWEEP_MS = 900_000;

export function getBackendHeartbeatEveryMs(envMs?: string): number {
  const raw = Number.parseInt(envMs ?? process.env.PULSE_BACKEND_HEARTBEAT_MS ?? '', 10);
  if (Number.isFinite(raw) && raw >= 5_000) {
    return raw;
  }
  return DEFAULT_HEARTBEAT_INTERVAL_MS;
}

export function getStaleSweepEveryMs(envMs?: string): number {
  const raw = Number.parseInt(envMs ?? process.env.PULSE_STALE_SWEEP_MS ?? '', 10);
  if (Number.isFinite(raw) && raw >= 15_000) {
    return raw;
  }
  return DEFAULT_STALE_SWEEP_MS;
}

export function getFrontendPruneSweepEveryMs(envMs?: string): number {
  const raw = Number.parseInt(envMs ?? process.env.PULSE_FRONTEND_PRUNE_MS ?? '', 10);
  if (Number.isFinite(raw) && raw >= 60_000) {
    return raw;
  }
  return DEFAULT_FRONTEND_PRUNE_SWEEP_MS;
}

export function getLiveKey(nodeId: string): string {
  return `pulse:organism:live:${nodeId}`;
}

export function getStaleAlertKey(nodeId: string): string {
  return `pulse:organism:stale-alert:${nodeId}`;
}

interface PulseIncident {
  incidentId: string;
  nodeId: string;
  role: string;
  status: string;
  summary: string;
  observedAt: string;
  source: string;
  critical: boolean;
  workspaceId?: string;
  surface?: string;
}

export async function sendAlertWebhook(
  config: ConfigService,
  logger: Logger,
  incident: PulseIncident,
): Promise<void> {
  const webhookUrl = getAlertWebhookUrl(config);
  if (!webhookUrl) {
    return;
  }
  try {
    validateNoInternalAccess(webhookUrl);
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-ID': incident.incidentId,
      },
      body: JSON.stringify({
        type: 'pulse_incident',
        incident,
        at: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      logger.warn?.(`Pulse alert webhook returned HTTP ${response.status}`);
    }
  } catch (error: unknown) {
    logger.warn?.(`Pulse alert webhook failed: ${(error as Error)?.message || 'unknown error'}`);
  }
}
