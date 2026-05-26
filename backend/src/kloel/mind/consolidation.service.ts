import { Injectable, Logger } from '@nestjs/common';
import { SpineEventRef } from './mind.types';

/**
 * UTP-MIND-CONS-001 + UTP-MIND-CONS-002 — Memory consolidation worker.
 *
 * Implements B8 + PCI.2 §3.8. Promotes items along the gradient
 * working → episodic → consolidated.
 *
 * Initial mode: `dry-run` — emits proposals without mutating durable
 * stores. Promotion to real mode happens in CONS-002 once PULSE
 * confirms healthy DB metrics.
 */

export type ConsolidationMode = 'dry_run' | 'real';

export interface WorkingMemoryItem {
  readonly itemId: string;
  readonly kind: 'fact' | 'intent' | 'constraint' | 'open_question';
  readonly content: string;
  readonly addedAt: string;
  readonly relatedEventIds: readonly string[];
}

export interface EpisodicProposal {
  readonly episodeId: string;
  readonly summary: string;
  readonly occurredAt: string;
  readonly relatedEventIds: readonly string[];
  readonly valenceMix: { positive: number; negative: number; neutral: number; ambiguous: number };
}

export interface ConsolidatedProposal {
  readonly skillId: string;
  readonly summary: string;
  readonly consolidatedAt: string;
  readonly fromEpisodeIds: readonly string[];
}

export interface ConsolidationCycle {
  readonly mode: ConsolidationMode;
  readonly cycleAt: string;
  readonly workingItemsConsidered: number;
  readonly episodicProposals: readonly EpisodicProposal[];
  readonly consolidatedProposals: readonly ConsolidatedProposal[];
}

@Injectable()
export class ConsolidationService {
  private readonly logger = new Logger(ConsolidationService.name);

  /**
   * Run a single consolidation cycle. In `dry_run` mode (default), the
   * service returns proposals without mutating any external store; the
   * orchestrator can review and accept.
   */
  public runCycle(input: {
    readonly workingMemory: readonly WorkingMemoryItem[];
    readonly recentEvents: readonly SpineEventRef[];
    readonly mode?: ConsolidationMode;
    readonly nowIso?: string;
  }): ConsolidationCycle {
    const mode = input.mode ?? 'dry_run';
    const cycleAt = input.nowIso ?? new Date().toISOString();
    const episodic = this.proposeEpisodes(input.workingMemory, input.recentEvents, cycleAt);
    const consolidated = this.proposeConsolidated(episodic, cycleAt);
    if (mode === 'real') {
      // Promotion to real mode is gated by CONS-002; here we just log when
      // the mode is set so that operators see the transition is happening.
      this.logger.log(
        `consolidation cycle (real) — episodes=${episodic.length} consolidated=${consolidated.length}`,
      );
    } else {
      this.logger.debug(
        `consolidation cycle (dry_run) — episodes=${episodic.length} consolidated=${consolidated.length}`,
      );
    }
    return {
      mode,
      cycleAt,
      workingItemsConsidered: input.workingMemory.length,
      episodicProposals: episodic,
      consolidatedProposals: consolidated,
    };
  }

  private proposeEpisodes(
    working: readonly WorkingMemoryItem[],
    events: readonly SpineEventRef[],
    cycleAt: string,
  ): readonly EpisodicProposal[] {
    const eventById = new Map(events.map((e) => [e.eventId, e]));
    const out: EpisodicProposal[] = [];
    for (const item of working) {
      if (item.relatedEventIds.length < 2) {
        continue;
      }
      const relatedEvents = item.relatedEventIds
        .map((id) => eventById.get(id))
        .filter((e): e is SpineEventRef => Boolean(e));
      if (relatedEvents.length === 0) {
        continue;
      }
      const valenceMix = relatedEvents.reduce(
        (acc, e) => {
          const v = e.valence ?? 'neutral';
          acc[v] += 1;
          return acc;
        },
        { positive: 0, negative: 0, neutral: 0, ambiguous: 0 },
      );
      out.push({
        episodeId: `ep_${item.itemId}_${cycleAt}`,
        summary: item.content,
        occurredAt: relatedEvents[0]!.occurredAt,
        relatedEventIds: item.relatedEventIds,
        valenceMix,
      });
    }
    return out;
  }

  private proposeConsolidated(
    episodes: readonly EpisodicProposal[],
    cycleAt: string,
  ): readonly ConsolidatedProposal[] {
    const byPattern = new Map<string, EpisodicProposal[]>();
    for (const ep of episodes) {
      const pattern = this.extractPattern(ep.summary);
      const cur = byPattern.get(pattern) ?? [];
      cur.push(ep);
      byPattern.set(pattern, cur);
    }
    const out: ConsolidatedProposal[] = [];
    for (const [pattern, eps] of byPattern.entries()) {
      if (eps.length < 3) {
        continue;
      }
      out.push({
        skillId: `skill_${pattern}_${cycleAt}`,
        summary: `consolidated pattern "${pattern}" from ${eps.length} episode(s)`,
        consolidatedAt: cycleAt,
        fromEpisodeIds: eps.map((e) => e.episodeId),
      });
    }
    return out;
  }

  private extractPattern(summary: string): string {
    return summary
      .toLowerCase()
      .replace(/[^\p{Letter}\p{Number} ]+/gu, '')
      .split(/\s+/)
      .slice(0, 3)
      .join('_');
  }
}
