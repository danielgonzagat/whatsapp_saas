import { Injectable } from '@nestjs/common';
import type { AbiAggregatedMood, AbiValenceTrace } from '../abi/abi-schema';
import { SpineEventRef } from './mind.types';

/**
 * UTP-MIND-VALENCE-002 — Mood aggregator.
 *
 * Implements PCI.2 §3.10. Aggregates valence trace into operational mood
 * over a time window. Description, NOT emotion (B13).
 */
@Injectable()
export class ValenceAggregatorService {
  public aggregate(
    events: readonly SpineEventRef[],
    windowHours: number,
    nowMs: number = Date.now(),
  ): AbiAggregatedMood {
    const cutoff = nowMs - windowHours * 60 * 60 * 1000;
    const inWindow = events.filter((e) => {
      if (!e.valence) {return false;}
      const ts = Date.parse(e.occurredAt);
      return Number.isFinite(ts) && ts >= cutoff;
    });
    const total = inWindow.length;
    if (total === 0) {
      return {
        positive: 0,
        negative: 0,
        neutral: 1,
        ambiguous: 0,
        windowHours,
      };
    }
    let pos = 0;
    let neg = 0;
    let neu = 0;
    let amb = 0;
    for (const e of inWindow) {
      switch (e.valence) {
        case 'positive':
          pos += 1;
          break;
        case 'negative':
          neg += 1;
          break;
        case 'ambiguous':
          amb += 1;
          break;
        default:
          neu += 1;
      }
    }
    return {
      positive: pos / total,
      negative: neg / total,
      neutral: neu / total,
      ambiguous: amb / total,
      windowHours,
    };
  }

  public toRecentTrace(
    events: readonly SpineEventRef[],
    cap = 20,
  ): readonly AbiValenceTrace[] {
    const sorted = [...events]
      .filter((e): e is SpineEventRef & { valence: NonNullable<SpineEventRef['valence']> } =>
        Boolean(e.valence),
      )
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
      .slice(0, cap);
    return sorted.map((e) => ({
      eventId: e.eventId,
      valence: e.valence,
      weight: 1,
      occurredAt: e.occurredAt,
    }));
  }
}
