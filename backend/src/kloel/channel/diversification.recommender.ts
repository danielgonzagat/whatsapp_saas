import { Injectable } from '@nestjs/common';
import type {
  ChannelKind,
  ConcentrationLevel,
  DetectionInput,
  DiversificationRecommendation,
  DiversificationUrgency,
} from './types';
import { filterByWorkspace } from './types';

const CRITICAL_CONCENTRATION_PCT = 70;
const HIGH_CONCENTRATION_PCT = 50;
const MODERATE_CONCENTRATION_PCT = 30;

const CHANNEL_PORTFOLIO: ChannelKind[] = [
  'email',
  'whatsapp',
  'sms',
  'push',
  'instagram',
  'messenger',
  'tiktok',
  'owned_site',
];

@Injectable()
export class DiversificationRecommender {
  public recommend(input: DetectionInput): DiversificationRecommendation {
    const nowMs = input.nowMs ?? Date.now();
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);

    const channelActivity = new Map<ChannelKind, number>();
    for (const e of wsEvents) {
      const ch = e.payload?.['channel'] as string | undefined;
      if (!ch) {
        continue;
      }
      const prev = channelActivity.get(ch as ChannelKind) ?? 0;
      channelActivity.set(ch as ChannelKind, prev + 1);
    }

    const totalEvents = Array.from(channelActivity.values()).reduce((s, v) => s + v, 0);
    let primaryShare = 0;
    let primaryChannel: ChannelKind | undefined;
    for (const [ch, count] of channelActivity) {
      const share = totalEvents > 0 ? count / totalEvents : 0;
      if (share > primaryShare) {
        primaryShare = share;
        primaryChannel = ch;
      }
    }

    const concentrationLevel: ConcentrationLevel =
      primaryShare * 100 >= CRITICAL_CONCENTRATION_PCT
        ? 'critical'
        : primaryShare * 100 >= HIGH_CONCENTRATION_PCT
          ? 'high'
          : primaryShare * 100 >= MODERATE_CONCENTRATION_PCT
            ? 'moderate'
            : 'low';

    const activeChannels = new Set(channelActivity.keys());
    const recommendedChannels: ChannelKind[] = [];
    const reasons: string[] = [];

    for (const ch of CHANNEL_PORTFOLIO) {
      if (activeChannels.has(ch)) {
        continue;
      }
      recommendedChannels.push(ch);
      reasons.push(`${ch}_not_yet_active`);
    }

    if (concentrationLevel === 'critical' || concentrationLevel === 'high') {
      reasons.push('over_reliance_on_single_channel');
      if (primaryChannel) {
        reasons.push(`${primaryChannel}_concentration_risk`);
      }
    }

    let urgency: DiversificationUrgency = 'none';
    if (concentrationLevel === 'critical') {
      urgency = 'critical';
    } else if (concentrationLevel === 'high') {
      urgency = 'high';
    } else if (concentrationLevel === 'moderate' && recommendedChannels.length > 0) {
      urgency = 'medium';
    } else if (recommendedChannels.length > 2) {
      urgency = 'low';
    }

    const estimatedDays = recommendedChannels.length * 7;

    return {
      workspaceId: input.workspaceId,
      currentConcentration: concentrationLevel,
      urgency,
      recommendedChannels: recommendedChannels.slice(0, 4),
      reasons: reasons.slice(0, 6),
      estimatedTimeToDiversifyDays: Math.max(1, estimatedDays),
      assessedAt: new Date(nowMs).toISOString(),
    };
  }
}
