import { Injectable } from '@nestjs/common';
import type { OwnedAudience } from './types';
import { clamp } from './types';

/**
 * DEFENS-003 — OwnedAudienceBuilder.
 *
 * Builds and scores owned audience assets per channel. Evaluates
 * audience size, engagement, growth, ownership level, and platform
 * dependency risk. Higher ownership = lower platform risk = more
 * defensible.
 *
 * Ownership level: 0 = fully rented (platform-dependent), 1 = fully owned (email list, SMS list).
 */

@Injectable()
export class OwnedAudienceBuilder {
  owned(workspaceId: string, channel: string, estimatedSize: number, channelEngagementRate: number, audienceGrowthRate: number, platformRisk: number, nowMs?: number): OwnedAudience {
    const ownershipLevel = this.computeOwnership(channel);
    const engagementRate = clamp(channelEngagementRate, 0, 1);
    const growthRate = clamp(audienceGrowthRate, -1, 5);
    const risk = clamp(platformRisk, 0, 1);
    const nowIso = new Date(nowMs ?? Date.now()).toISOString();

    return {
      workspaceId,
      channel,
      estimatedSize: Math.max(0, estimatedSize),
      engagementRate: Math.round(engagementRate * 1000) / 1000,
      growthRate: Math.round(growthRate * 1000) / 1000,
      ownershipLevel: Math.round(ownershipLevel * 1000) / 1000,
      platformRisk: Math.round(risk * 1000) / 1000,
      assessedAt: nowIso,
    };
  }

  defScore(audiences: readonly OwnedAudience[]): number {
    if (audiences.length === 0) return 0;

    let totalOwnershipScore = 0;
    let totalSize = 0;

    for (const a of audiences) {
      const weight = Math.log10(a.estimatedSize + 1);
      const ownedScore = a.ownershipLevel * (1 - a.platformRisk) * a.engagementRate;
      totalOwnershipScore += ownedScore * weight;
      totalSize += weight;
    }

    if (totalSize === 0) return 0;
    return clamp(totalOwnershipScore / totalSize, 0, 1);
  }

  topChannel(audiences: readonly OwnedAudience[]): OwnedAudience | undefined {
    if (audiences.length === 0) return undefined;
    return [...audiences].sort((a, b) => {
      const scoreA = a.ownershipLevel * (1 - a.platformRisk) * a.estimatedSize;
      const scoreB = b.ownershipLevel * (1 - b.platformRisk) * b.estimatedSize;
      return scoreB - scoreA;
    })[0];
  }

  private computeOwnership(channel: string): number {
    const ownedMap: Readonly<Record<string, number>> = {
      email: 0.95,
      sms: 0.95,
      push: 0.8,
      whatsapp_list: 0.6,
      telegram: 0.55,
      discord: 0.4,
      instagram: 0.15,
      tiktok: 0.1,
      youtube: 0.2,
      facebook: 0.1,
      x_twitter: 0.1,
      linkedin: 0.15,
      blog: 0.85,
      podcast: 0.7,
      own_site: 0.9,
    };

    const key = channel.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    return ownedMap[key] ?? 0.3;
  }
}
