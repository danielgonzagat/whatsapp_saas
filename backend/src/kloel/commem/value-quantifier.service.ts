import { Injectable } from '@nestjs/common';
import type { ComMemExport } from './commem-exporter.service';
import {
  eventDomain,
  clamp,
  workspaceFilter,
} from './commem.types';
import type { SpineEventRef } from '../mind/mind.types';

export interface ValueBreakdown {
  readonly inferredLtvCents: number;
  readonly confirmedInsightsCents: number;
  readonly discoveriesCents: number;
  readonly baseCapitalCents: number;
  readonly totalCents: number;
}

export interface CommercialCapitalEstimate {
  readonly workspaceId: string;
  readonly quantifiedAtMs: number;
  readonly sourceEventCount: number;
  readonly distinctDomains: number;
  readonly breakdown: ValueBreakdown;
  readonly knowledgeMaturityMultiplier: number;
  readonly totalEstimatedCents: number;
}

interface LtvSignal {
  readonly eventName: string;
  readonly baseCents: number;
}

const LTV_SIGNALS: readonly LtvSignal[] = [
  { eventName: 'commerce.payment.approved', baseCents: 5000 },
  { eventName: 'commerce.crm.deal_won', baseCents: 10000 },
  { eventName: 'commerce.lead.converted', baseCents: 3000 },
  { eventName: 'commerce.post_sale.first_value_obtained', baseCents: 7500 },
  { eventName: 'commerce.post_sale.satisfaction_signal_observed', baseCents: 2000 },
  { eventName: 'commerce.post_sale.repurchase_window_opened', baseCents: 4000 },
  { eventName: 'commerce.post_sale.win_back_window_opened', baseCents: 2500 },
];

const LTV_SIGNAL_NAMES: ReadonlySet<string> = new Set(
  LTV_SIGNALS.map((s) => s.eventName),
);

function ltvBaseCents(eventName: string): number {
  const signal = LTV_SIGNALS.find((s) => s.eventName === eventName);
  return signal?.baseCents ?? 0;
}

const INSIGHT_EVENT_PREFIXES: readonly string[] = [
  'cognition.belief_updated',
  'cognition.prediction_made',
  'cognition.surprise_observed',
];

const DISCOVERY_EVENT_PREFIXES: readonly string[] = [
  'cognition.surprise_observed',
  'cognition.attention_shifted',
];

const VALENCE_POSITIVE_MULTIPLIER = 1.2;
const VALENCE_NEGATIVE_PENALTY = 0.7;

function isInsightEvent(eventName: string): boolean {
  return INSIGHT_EVENT_PREFIXES.some((p) => eventName.startsWith(p));
}

function isDiscoveryEvent(eventName: string): boolean {
  return DISCOVERY_EVENT_PREFIXES.some((p) => eventName.startsWith(p));
}

function isLtvEvent(eventName: string): boolean {
  return LTV_SIGNAL_NAMES.has(eventName);
}

function computeKnowledgeMultiplier(
  events: readonly SpineEventRef[],
  domainCount: number,
): number {
  if (events.length === 0) {return 0;}

  const observedRatio =
    events.filter((e) => e.truthMode === 'observed').length / events.length;
  const inferredRatio =
    events.filter((e) => e.truthMode === 'inferred').length / events.length;

  const dimensionBonus = Math.min(1, domainCount / 10);
  return clamp(
    observedRatio * 0.5 + inferredRatio * 0.3 + dimensionBonus * 0.2,
    0,
    1,
  );
}

function valenceMultiplier(event: SpineEventRef): number {
  if (event.valence === 'positive') {return VALENCE_POSITIVE_MULTIPLIER;}
  if (event.valence === 'negative') {return VALENCE_NEGATIVE_PENALTY;}
  return 1.0;
}

@Injectable()
export class ValueQuantifierService {
  public quantifyFromMemory(
    workspaceId: string,
    exportedMemory: ComMemExport,
  ): CommercialCapitalEstimate {
    const allEvents: SpineEventRef[] = [];

    for (const entry of exportedMemory.ledger) {
      for (const ev of entry.events) {
        allEvents.push({
          eventId: ev.eventId,
          eventName: ev.eventName,
          workspaceId: ev.workspaceId,
          occurredAt: ev.occurredAt,
          truthMode: ev.truthMode,
          ...(ev.valence !== undefined ? { valence: ev.valence } : {}),
          ...(ev.entityRef !== undefined ? { entityRef: ev.entityRef } : {}),
          ...(ev.correlationId !== undefined ? { correlationId: ev.correlationId } : {}),
          ...(ev.payload !== undefined ? { payload: ev.payload } : {}),
        });
      }
    }

    return this.quantifyFromEvents(workspaceId, allEvents);
  }

  public quantifyFromEvents(
    workspaceId: string,
    events: readonly SpineEventRef[],
  ): CommercialCapitalEstimate {
    const scoped = workspaceFilter(events, workspaceId);

    let inferredLtvCents = 0;
    let confirmedInsightsCents = 0;
    let discoveriesCents = 0;
    let rawEventCount = 0;
    const domains = new Set<string>();

    for (const ev of scoped) {
      const domain = eventDomain(ev.eventName);
      domains.add(domain);
      rawEventCount++;
      const valMult = valenceMultiplier(ev);

      if (isLtvEvent(ev.eventName)) {
        inferredLtvCents += Math.round(ltvBaseCents(ev.eventName) * valMult);
      }

      if (isInsightEvent(ev.eventName)) {
        const base = 1000;
        confirmedInsightsCents += Math.round(base * valMult);
      }

      if (isDiscoveryEvent(ev.eventName)) {
        const base = 2000;
        discoveriesCents += Math.round(base * valMult);
      }
    }

    const baseCapitalCents = rawEventCount * 100;
    const knowledgeMultiplier = computeKnowledgeMultiplier(scoped, domains.size);

    const totalCents =
      inferredLtvCents + confirmedInsightsCents + discoveriesCents + baseCapitalCents;

    return {
      workspaceId,
      quantifiedAtMs: Date.now(),
      sourceEventCount: scoped.length,
      distinctDomains: domains.size,
      breakdown: {
        inferredLtvCents,
        confirmedInsightsCents,
        discoveriesCents,
        baseCapitalCents,
        totalCents,
      },
      knowledgeMaturityMultiplier: knowledgeMultiplier,
      totalEstimatedCents: totalCents,
    };
  }

  public valueDelta(
    before: CommercialCapitalEstimate,
    after: CommercialCapitalEstimate,
  ): CapitalDelta {
    return {
      workspaceId: before.workspaceId,
      eventCountDelta: after.sourceEventCount - before.sourceEventCount,
      domainDelta: after.distinctDomains - before.distinctDomains,
      ltvDelta: after.breakdown.inferredLtvCents - before.breakdown.inferredLtvCents,
      insightsDelta: after.breakdown.confirmedInsightsCents - before.breakdown.confirmedInsightsCents,
      discoveriesDelta: after.breakdown.discoveriesCents - before.breakdown.discoveriesCents,
      totalDelta: after.totalEstimatedCents - before.totalEstimatedCents,
    };
  }
}

export interface CapitalDelta {
  readonly workspaceId: string;
  readonly eventCountDelta: number;
  readonly domainDelta: number;
  readonly ltvDelta: number;
  readonly insightsDelta: number;
  readonly discoveriesDelta: number;
  readonly totalDelta: number;
}
