import { Injectable } from '@nestjs/common';
import type {
  ChannelConcentration,
  ChannelKind,
  ChannelRevenueShare,
  ConcentrationLevel,
  DetectionInput,
} from './types';
import { clamp, filterByWorkspace } from './types';

const CRITICAL_CONCENTRATION_PCT = 70;
const HIGH_CONCENTRATION_PCT = 50;
const MODERATE_CONCENTRATION_PCT = 30;

@Injectable()
export class ConcentrationDetector {
  public detect(input: DetectionInput): ChannelConcentration {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);

    const channelRevenue = new Map<ChannelKind, number>();
    for (const e of wsEvents) {
      if (e.eventName !== 'commerce.payment.approved') {
        continue;
      }
      const channel = this.extractChannel(e);
      if (!channel) {
        continue;
      }
      const amount = this.extractAmount(e);
      const prev = channelRevenue.get(channel) ?? 0;
      channelRevenue.set(channel, prev + amount);
    }

    const totalRevenue = Array.from(channelRevenue.values()).reduce((s, v) => s + v, 0);
    const channels: ChannelRevenueShare[] = [];
    for (const [channel, revenueCents] of channelRevenue) {
      channels.push({
        channel,
        revenueCents,
        sharePercent: totalRevenue > 0 ? Math.round((revenueCents / totalRevenue) * 10000) / 100 : 0,
      });
    }
    channels.sort((a, b) => b.sharePercent - a.sharePercent);

    const primary = channels.length > 0 ? channels[0] : undefined;
    const primaryChannel = primary?.channel;
    const primarySharePercent = primary?.sharePercent ?? 0;

    const concentrationLevel: ConcentrationLevel =
      primarySharePercent >= CRITICAL_CONCENTRATION_PCT
        ? 'critical'
        : primarySharePercent >= HIGH_CONCENTRATION_PCT
          ? 'high'
          : primarySharePercent >= MODERATE_CONCENTRATION_PCT
            ? 'moderate'
            : 'low';

    const herfindahlIndex = channels.reduce((h, ch) => h + (ch.sharePercent / 100) ** 2, 0);

    return {
      workspaceId: input.workspaceId,
      channels,
      primaryChannel,
      primarySharePercent,
      concentrationLevel,
      herfindahlIndex: Math.round(herfindahlIndex * 1000) / 1000,
      assessedAt: new Date(nowMs).toISOString(),
    };
  }

  private extractChannel(
    e: { payload?: Readonly<Record<string, unknown>> },
  ): ChannelKind | undefined {
    const val = e.payload?.['channel'];
    if (typeof val === 'string') {
      return val as ChannelKind;
    }
    return undefined;
  }

  private extractAmount(e: { payload?: Readonly<Record<string, unknown>> }): number {
    const val = e.payload?.['amountCents'];
    if (typeof val === 'number' && Number.isFinite(val)) {
      return clamp(Math.round(val), 0, Number.MAX_SAFE_INTEGER);
    }
    return 0;
  }
}
