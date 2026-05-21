import { Injectable } from '@nestjs/common';
import type { AuthorityBuilding, AuthorityPlatform, EvidenceInput } from './types';
import { clamp, filterByWorkspace } from './types';

/**
 * DEFENS-007 — AuthorityBuilder.
 *
 * Builds authority signals from content production and distribution
 * activity. Tracks consistency, reach, and depth across platforms
 * like blog, podcast, YouTube, social media, conferences, books,
 * courses, and newsletters.
 *
 * Authority is the compound effect of consistent, high-depth content
 * with measurable reach. Each content event contributes to the
 * compound score per platform.
 */

const CONTENT_EVENT_WEIGHTS: Readonly<Record<string, { readonly platform: AuthorityPlatform; readonly weight: number }>> = {
  'commerce.campaign.creative_swapped': { platform: 'social_media', weight: 0.1 },
  'commerce.campaign.audience_reached': { platform: 'social_media', weight: 0.15 },
  'commerce.member_area.enrolled': { platform: 'course', weight: 0.2 },
  'commerce.member_area.progressed': { platform: 'course', weight: 0.15 },
};

@Injectable()
export class AuthorityBuilder {
  private readonly platformState = new Map<string, Map<AuthorityPlatform, { readonly contentCount: number; readonly consistency: number; readonly reach: number; readonly depth: number; readonly eventIds: string[] }>>();

  build(input: EvidenceInput): readonly AuthorityBuilding[] {
    const wsEvents = filterByWorkspace(input.events, input.workspaceId);
    const nowMs = input.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();

    let state = this.platformState.get(input.workspaceId);
    if (!state) {
      state = new Map();
      this.platformState.set(input.workspaceId, state);
    }

    for (const event of wsEvents) {
      const weight = CONTENT_EVENT_WEIGHTS[event.eventName];
      if (!weight) continue;

      const existing = state.get(weight.platform) ?? { contentCount: 0, consistency: 0, reach: 0, depth: 0, eventIds: [] };
      if (existing.eventIds.includes(event.eventId)) continue;

      const contentCount = existing.contentCount + 1;
      const consistency = clamp(existing.consistency + 0.05, 0, 1);
      const reach = clamp(existing.reach + weight.weight, 0, 1);
      const depth = clamp(existing.depth + 0.03, 0, 1);

      state.set(weight.platform, {
        contentCount,
        consistency,
        reach,
        depth,
        eventIds: [...existing.eventIds, event.eventId].slice(-100),
      });
    }

    const allPlatforms: AuthorityPlatform[] = [
      'blog', 'podcast', 'youtube', 'social_media', 'conference',
      'book', 'course', 'newsletter',
    ];

    return allPlatforms.map((platform) => {
      const data = state?.get(platform) ?? { contentCount: 0, consistency: 0, reach: 0, depth: 0, eventIds: [] };
      return {
        workspaceId: input.workspaceId,
        platform,
        contentCount: data.contentCount,
        consistencyScore: Math.round(data.consistency * 1000) / 1000,
        reachScore: Math.round(data.reach * 1000) / 1000,
        depthScore: Math.round(data.depth * 1000) / 1000,
        assessedAt: nowIso,
      };
    });
  }

  overallAuthority(authorities: readonly AuthorityBuilding[]): number {
    if (authorities.length === 0) return 0;
    const total = authorities.reduce((s, a) => s + (a.consistencyScore + a.reachScore + a.depthScore) / 3, 0);
    return Math.round(clamp(total / authorities.length, 0, 1) * 1000) / 1000;
  }
}
