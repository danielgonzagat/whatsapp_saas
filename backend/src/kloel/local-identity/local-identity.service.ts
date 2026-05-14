import { Injectable } from '@nestjs/common';
import type { AbiWorkspaceLocalProfile } from '../abi/abi-schema';
import type { SpineEventRef } from '../mind/mind.types';
import {
  VOLUME_THRESHOLD,
  type DerivedCustomer,
  type DerivedDecisionPatterns,
  type DerivedLanguage,
  type DerivedOperational,
  type DerivedProduct,
  type DerivedTemporal,
  type ProductEntry,
  type TokenBucket,
  type ValenceBucket,
} from './local-identity.types';

const TOP_N = 5;
const PEAK_HOURS_COUNT = 3;
const VOCABULARY_TOP_N = 10;

const VOCABULARY_STOP_WORDS: ReadonlySet<string> = new Set([
  'o', 'a', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'em', 'no', 'na',
  'nos', 'nas', 'por', 'para', 'com', 'sem', 'se', 'que', 'e', 'ou', 'um',
  'uma', 'uns', 'umas', 'é', 'foi', 'não', 'sim', 'mais', 'menos', 'muito',
  'seu', 'sua', 'seus', 'suas', 'está', 'estão', 'você', 'vocês',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'above', 'below', 'between', 'and', 'but', 'or',
  'nor', 'not', 'so', 'yet', 'both', 'either', 'neither', 'each', 'every',
  'all', 'any', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'only', 'own', 'same', 'than', 'too', 'very', 'just', 'because',
  'about', 'up', 'out', 'if', 'then', 'now', 'here', 'there',
  'when', 'where', 'why', 'how', 'which', 'who', 'whom', 'what',
  'this', 'that', 'these', 'those', 'it', 'its',
]);

function parseTimestamp(iso: string): number {
  const d = new Date(iso);
  return d.getTime();
}

function hourFromTimestamp(iso: string): number {
  return new Date(iso).getUTCHours();
}

function toneFromValenceMix(buckets: readonly ValenceBucket[]): string {
  if (buckets.length === 0) return 'neutral';

  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  if (total === 0) return 'neutral';

  const posBucket = buckets.find(b => b.valence === 'positive');
  const negBucket = buckets.find(b => b.valence === 'negative');
  const positive = (posBucket !== undefined ? posBucket.count : 0) / total;
  const negative = (negBucket !== undefined ? negBucket.count : 0) / total;

  if (positive >= 0.6) return 'positive';
  if (negative >= 0.6) return 'negative';
  if (positive >= 0.4 && negative < 0.3) return 'mostly-positive';
  if (negative >= 0.4 && positive < 0.3) return 'mostly-negative';
  return 'balanced';
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-záàâãéèêíïóôõöúüçñ0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && !VOCABULARY_STOP_WORDS.has(t));
}

function extractMessageTokens(events: readonly SpineEventRef[]): TokenBucket[] {
  const tokenCounts = new Map<string, number>();

  for (const event of events) {
    const payload = event.payload;
    if (!payload) continue;

    const content =
      (payload as Record<string, unknown>)['body'] ??
      (payload as Record<string, unknown>)['text'] ??
      (payload as Record<string, unknown>)['content'] ??
      (payload as Record<string, unknown>)['message'];

    if (typeof content === 'string') {
      for (const token of tokenize(content)) {
        tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
      }
    }

    const messageRef = (payload as Record<string, unknown>)['messageRef'];
    if (typeof messageRef === 'string') {
      for (const token of tokenize(messageRef)) {
        tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1);
      }
    }
  }

  return Array.from(tokenCounts.entries())
    .map(([token, count]) => ({ token, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, VOCABULARY_TOP_N);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    const odd = sorted[mid];
    return odd !== undefined ? odd : 0;
  }
  const left = sorted[mid - 1];
  const right = sorted[mid];
  if (left === undefined || right === undefined) return 0;
  return (left + right) / 2;
}

function deriveOperational(events: readonly SpineEventRef[]): DerivedOperational {
  const hourCounts = new Map<number, number>();
  const entityTypeCounts = new Map<string, number>();

  for (const event of events) {
    const hour = hourFromTimestamp(event.occurredAt);
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);

    if (event.entityRef) {
      entityTypeCounts.set(
        event.entityRef.entityType,
        (entityTypeCounts.get(event.entityRef.entityType) ?? 0) + 1,
      );
    }
  }

  const peakHours = Array.from(hourCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, PEAK_HOURS_COUNT)
    .map(([h]) => h)
    .sort((a, b) => a - b);

  const typicalEntityTypes = Array.from(entityTypeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([type]) => type);

  return { typicalHours: peakHours, typicalEntityTypes, eventCount: events.length };
}

function deriveLanguage(events: readonly SpineEventRef[]): DerivedLanguage {
  const repliedEvents = events.filter(e => e.eventName === 'commerce.whatsapp.message_replied');

  const valenceCounts = new Map<string, number>();
  for (const event of repliedEvents) {
    const v = event.valence ?? 'neutral';
    valenceCounts.set(v, (valenceCounts.get(v) ?? 0) + 1);
  }

  const valenceBuckets: ValenceBucket[] = Array.from(valenceCounts.entries()).map(
    ([valence, count]) => ({ valence: valence as ValenceBucket['valence'], count }),
  );

  const tone = toneFromValenceMix(valenceBuckets);

  const messageEvents = events.filter(
    e =>
      e.eventName === 'commerce.whatsapp.message_received' ||
      e.eventName === 'commerce.whatsapp.message_replied',
  );

  const topTokens = extractMessageTokens(messageEvents);

  return { tone, vocabulary: topTokens.map(t => t.token) };
}

function deriveProduct(events: readonly SpineEventRef[]): DerivedProduct {
  const productIds = new Map<string, { role: string }>();

  for (const event of events) {
    if (event.eventName === 'commerce.payment.approved') {
      const payload = event.payload as Record<string, unknown> | undefined;
      const pid = payload?.['productId'];
      if (typeof pid === 'string' && !productIds.has(pid)) {
        productIds.set(pid, { role: 'purchased' });
      }
    }
  }

  const catalog: ProductEntry[] = Array.from(productIds.entries()).map(
    ([productId, { role }]) => ({ productId, role }),
  );

  return { catalog };
}

function deriveCustomer(events: readonly SpineEventRef[]): DerivedCustomer {
  let leadCount = 0;
  let conversionCount = 0;
  const stageCounts = new Map<string, number>();

  for (const event of events) {
    if (event.eventName === 'commerce.lead.created') {
      leadCount++;
    } else if (event.eventName === 'commerce.lead.converted') {
      conversionCount++;
    } else if (event.eventName === 'commerce.crm.stage_changed') {
      const payload = event.payload as Record<string, unknown> | undefined;
      const stage = payload?.['toStage'] ?? payload?.['stage'];
      if (typeof stage === 'string') {
        stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
      }
    }
  }

  const conversionRatio = leadCount > 0 ? conversionCount / leadCount : 0;

  const commonStages = Array.from(stageCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([stage]) => stage);

  return { leadCount, conversionCount, conversionRatio, commonStages };
}

function deriveTemporal(events: readonly SpineEventRef[]): DerivedTemporal {
  const hourCounts = new Map<number, number>();
  for (const event of events) {
    const hour = hourFromTimestamp(event.occurredAt);
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }

  const peakHours = Array.from(hourCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, PEAK_HOURS_COUNT)
    .map(([h]) => h)
    .sort((a, b) => a - b);

  const contactedTimestamps = new Map<string, number>();
  const cycleHoursList: number[] = [];

  for (const event of events) {
    if (event.eventName === 'commerce.lead.contacted') {
      const ref = event.entityRef?.entityId;
      if (ref) {
        contactedTimestamps.set(ref, parseTimestamp(event.occurredAt));
      }
    } else if (event.eventName === 'commerce.payment.approved') {
      const payload = event.payload as Record<string, unknown> | undefined;
      const leadRef = payload?.['leadId'] ?? payload?.['leadRef'];
      if (typeof leadRef === 'string') {
        const contactedAt = contactedTimestamps.get(leadRef);
        if (contactedAt !== undefined) {
          const cycleMs = parseTimestamp(event.occurredAt) - contactedAt;
          if (cycleMs > 0) {
            cycleHoursList.push(cycleMs / (1000 * 60 * 60));
          }
        }
      }
    }
  }

  const typicalCycleHours =
    cycleHoursList.length > 0 ? Math.round(median(cycleHoursList) * 10) / 10 : 0;

  return { peakHours, typicalCycleHours };
}

function deriveDecisionPatterns(events: readonly SpineEventRef[]): DerivedDecisionPatterns {
  const nextStepCounts = new Map<string, number>();
  const escalationCounts = new Map<string, number>();

  for (const event of events) {
    if (event.eventName === 'commerce.crm.next_step_defined') {
      const payload = event.payload as Record<string, unknown> | undefined;
      const step = payload?.['step'] ?? payload?.['nextStep'] ?? payload?.['action'];
      if (typeof step === 'string') {
        nextStepCounts.set(step, (nextStepCounts.get(step) ?? 0) + 1);
      }
    } else if (event.eventName === 'commerce.whatsapp.handoff_to_human') {
      const payload = event.payload as Record<string, unknown> | undefined;
      const reason = payload?.['reason'] ?? payload?.['cause'];
      if (typeof reason === 'string') {
        escalationCounts.set(reason, (escalationCounts.get(reason) ?? 0) + 1);
      }
    }
  }

  const typicalNextSteps = Array.from(nextStepCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([step]) => step);

  const typicalEscalations = Array.from(escalationCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([reason]) => reason);

  return { typicalNextSteps, typicalEscalations };
}

@Injectable()
export class LocalIdentityService {
  private deriveStableAt(events: readonly SpineEventRef[]): string {
    let maxMs = 0;
    for (const e of events) {
      const t = Date.parse(e.occurredAt);
      if (Number.isFinite(t) && t > maxMs) maxMs = t;
    }
    if (maxMs === 0) return new Date().toISOString();
    return new Date(maxMs).toISOString();
  }

  public deriveProfile(
    workspaceId: string,
    allEvents: readonly SpineEventRef[],
    opts: { readonly nowIso?: string } = {},
  ): AbiWorkspaceLocalProfile | undefined {
    const events = allEvents.filter(e => e.workspaceId === workspaceId);

    if (events.length < VOLUME_THRESHOLD) return undefined;

    const operational = deriveOperational(events);
    const language = deriveLanguage(events);
    const product = deriveProduct(events);
    const customer = deriveCustomer(events);
    const temporal = deriveTemporal(events);
    const decisionPatterns = deriveDecisionPatterns(events);

    return {
      workspaceId,
      operational: {
        typicalHours: operational.typicalHours,
        typicalEntityTypes: operational.typicalEntityTypes,
        eventCount: operational.eventCount,
      },
      language: {
        tone: language.tone,
        vocabulary: language.vocabulary,
      },
      product: {
        catalog: product.catalog,
      },
      customer: {
        typicalProfile: {
          leadCount: customer.leadCount,
          conversionCount: customer.conversionCount,
          conversionRatio: customer.conversionRatio,
          commonStages: customer.commonStages,
        },
      },
      temporal: {
        peakHours: temporal.peakHours,
        typicalCycleHours: temporal.typicalCycleHours,
      },
      decisionPatterns: {
        typicalNextSteps: decisionPatterns.typicalNextSteps,
        typicalEscalations: decisionPatterns.typicalEscalations,
      },
      derivedFromEventsCount: events.length,
      derivedAt: opts.nowIso ?? this.deriveStableAt(events),
    };
  }
}
