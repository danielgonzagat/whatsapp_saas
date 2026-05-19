import { Injectable } from '@nestjs/common';
import type {
  ChannelHealth,
  ChannelHealthStatus,
  ChannelKind,
  DetectionInput,
} from './types';
import { clamp, daysSince, filterByWorkspace } from './types';

const RECENT_WINDOW_DAYS = 14;
const DEGRADED_DELIVERY_THRESHOLD = 0.7;
const UNSTABLE_ERROR_THRESHOLD = 0.15;
const DOWN_INACTIVITY_DAYS = 7;

@Injectable()
export class HealthMonitor {
  public assess(input: DetectionInput, channel: ChannelKind): ChannelHealth {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);
    const channelEvents = wsEvents.filter((e) => this.isChannelEvent(e, channel));

    let deliveryTotal = 0;
    let deliverySuccess = 0;
    let engagementSignals = 0;
    let errorCount = 0;
    let daysSinceLastActivity = Infinity;
    const signals: string[] = [];

    for (const e of channelEvents) {
      const d = daysSince(e.occurredAt, nowMs);
      if (d < RECENT_WINDOW_DAYS) {
        if (this.isDeliveryEvent(e)) {
          deliveryTotal++;
          if (this.isDeliverySuccess(e)) {
            deliverySuccess++;
          }
        }
        if (this.isEngagementEvent(e)) {
          engagementSignals++;
        }
        if (this.isErrorEvent(e)) {
          errorCount++;
          const msg = e.payload?.['error'] as string | undefined;
          if (msg) {
            signals.push(msg.slice(0, 120));
          }
        }
      }
      if (d < daysSinceLastActivity) {
        daysSinceLastActivity = d;
      }
    }

    if (!Number.isFinite(daysSinceLastActivity)) {
      daysSinceLastActivity = 0;
    }

    const deliveryRate = deliveryTotal > 0 ? deliverySuccess / deliveryTotal : 1;
    const engagementRate = channelEvents.length > 0
      ? engagementSignals / Math.max(channelEvents.length, 1)
      : 0;
    const errorRate = channelEvents.length > 0
      ? errorCount / channelEvents.length
      : 0;

    let degradationScore = 0;
    if (deliveryRate < DEGRADED_DELIVERY_THRESHOLD) {
      degradationScore += 0.35;
      signals.push(`delivery_rate_low_${Math.round(deliveryRate * 100)}pct`);
    }
    if (errorRate > UNSTABLE_ERROR_THRESHOLD) {
      degradationScore += 0.35;
      signals.push(`error_rate_high_${Math.round(errorRate * 100)}pct`);
    }
    if (daysSinceLastActivity > DOWN_INACTIVITY_DAYS) {
      degradationScore += 0.3;
      signals.push(`inactive_${Math.round(daysSinceLastActivity)}days`);
    }
    degradationScore = clamp(degradationScore, 0, 1);

    const status: ChannelHealthStatus =
      degradationScore >= 0.7
        ? 'down'
        : degradationScore >= 0.5
          ? 'unstable'
          : degradationScore >= 0.25
            ? 'degraded'
            : 'healthy';

    return {
      workspaceId: input.workspaceId,
      channel,
      status,
      deliveryRate: Math.round(deliveryRate * 1000) / 1000,
      engagementRate: Math.round(engagementRate * 1000) / 1000,
      errorRate: Math.round(errorRate * 1000) / 1000,
      daysSinceLastActivity: Math.round(daysSinceLastActivity),
      degradationScore: Math.round(degradationScore * 1000) / 1000,
      signals,
      assessedAt: new Date(nowMs).toISOString(),
    };
  }

  private isChannelEvent(
    e: { eventName: string; payload?: Readonly<Record<string, unknown>> },
    channel: ChannelKind,
  ): boolean {
    const ch = e.payload?.['channel'] as string | undefined;
    if (ch && ch !== channel) {
      return false;
    }
    const evt = e.eventName;
    return evt.startsWith('commerce.whatsapp.') ||
      evt.startsWith('commerce.campaign.') ||
      evt.startsWith('commerce.crm.');
  }

  private isDeliveryEvent(e: { eventName: string }): boolean {
    return e.eventName.includes('sent') ||
      e.eventName.includes('delivered') ||
      e.eventName.includes('dispatched');
  }

  private isDeliverySuccess(e: { eventName: string; payload?: Readonly<Record<string, unknown>> }): boolean {
    if (e.eventName.includes('delivered')) {
      return true;
    }
    const status = e.payload?.['status'] as string | undefined;
    return status === 'success' || status === 'sent' || status === 'ok';
  }

  private isEngagementEvent(e: { eventName: string }): boolean {
    return e.eventName.includes('opened') ||
      e.eventName.includes('clicked') ||
      e.eventName.includes('replied') ||
      e.eventName.includes('engaged');
  }

  private isErrorEvent(e: { eventName: string }): boolean {
    return e.eventName.includes('error') ||
      e.eventName.includes('failed') ||
      e.eventName.includes('bounced') ||
      e.eventName.includes('rejected');
  }
}
