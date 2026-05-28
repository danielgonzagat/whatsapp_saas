import type { SpineEventRef } from '../mind/mind.types';
import type {
  DerivedCustomer,
  DerivedDecisionPatterns,
  DerivedLanguage,
  DerivedOperational,
  DerivedProduct,
  DerivedTemporal,
  ProductEntry,
  ValenceBucket,
} from './local-identity.types';
import {
  extractMessageTokens,
  hourFromTimestamp,
  median,
  OPERATOR_FEEDBACK_DECISION_SLOT_COUNT,
  OPERATOR_FEEDBACK_NEXT_STEP_PREFIX,
  OPERATOR_FEEDBACK_REPETITION_THRESHOLD,
  parseTimestamp,
  PEAK_HOURS_COUNT,
  TOP_N,
  toneFromValenceMix,
} from './local-identity.service.helpers.tokens';

export function deriveOperational(events: readonly SpineEventRef[]): DerivedOperational {
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

export function deriveLanguage(events: readonly SpineEventRef[]): DerivedLanguage {
  const repliedEvents = events.filter((e) => e.eventName === 'commerce.whatsapp.message_replied');

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
    (e) =>
      e.eventName === 'commerce.whatsapp.message_received' ||
      e.eventName === 'commerce.whatsapp.message_replied',
  );

  const topTokens = extractMessageTokens(messageEvents);

  return { tone, vocabulary: topTokens.map((t) => t.token) };
}

export function deriveProduct(events: readonly SpineEventRef[]): DerivedProduct {
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

  const catalog: ProductEntry[] = Array.from(productIds.entries()).map(([productId, { role }]) => ({
    productId,
    role,
  }));

  return { catalog };
}

export function deriveCustomer(events: readonly SpineEventRef[]): DerivedCustomer {
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

export function deriveTemporal(events: readonly SpineEventRef[]): DerivedTemporal {
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

export function deriveDecisionPatterns(events: readonly SpineEventRef[]): DerivedDecisionPatterns {
  const nextStepCounts = new Map<string, number>();
  const escalationCounts = new Map<string, number>();
  const operatorNoteCounts = new Map<string, number>();

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
    } else if (event.eventName === 'cognition.valence_assigned') {
      const isOperatorRef = event.entityRef?.entityType === 'operator';
      if (!isOperatorRef || !event.payload) {
        continue;
      }
      const p = event.payload as Record<string, unknown>;
      const accepted = p['accepted'];
      const operatorNote = p['operatorNote'];
      const learningFraming = p['learningFraming'];
      const trimmedNote = typeof operatorNote === 'string' ? operatorNote.trim() : '';
      if (
        accepted === false &&
        trimmedNote.length > 0 &&
        typeof learningFraming === 'string' &&
        learningFraming.includes('not human performance scoring')
      ) {
        operatorNoteCounts.set(trimmedNote, (operatorNoteCounts.get(trimmedNote) ?? 0) + 1);
      }
    }
  }

  const typicalNextSteps = Array.from(nextStepCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([step]) => step);

  const repeatedOperatorNotes = Array.from(operatorNoteCounts.entries())
    .filter(([, count]) => count >= OPERATOR_FEEDBACK_REPETITION_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .slice(0, OPERATOR_FEEDBACK_DECISION_SLOT_COUNT)
    .map(([note]) => `${OPERATOR_FEEDBACK_NEXT_STEP_PREFIX}: ${note}`);

  const retainedNextSteps = typicalNextSteps.slice(
    0,
    Math.max(0, TOP_N - repeatedOperatorNotes.length),
  );
  const allNextSteps = [...retainedNextSteps, ...repeatedOperatorNotes];

  const typicalEscalations = Array.from(escalationCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_N)
    .map(([reason]) => reason);

  return { typicalNextSteps: allNextSteps, typicalEscalations };
}
