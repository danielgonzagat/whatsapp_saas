import { Injectable } from '@nestjs/common';
import { AttentionService } from '../mind/attention.service';
import { GoalFieldService } from '../goal-field/goal-field.service';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import { ValenceAggregatorService } from '../mind/valence-aggregator.service';
import type { SpineEventRef } from '../mind/mind.types';
import type { GoalCandidate } from '../goal-field/goal-field.types';
import type {
  DailyDashboard,
  NoRegretHighlight,
  NowFocus,
  SuggestedAction,
  TopOpportunity,
} from './daily-dashboard.types';

@Injectable()
export class DailyDashboardService {

  public constructor(
    private readonly spine: SpineEmitterService,
    private readonly goalField: GoalFieldService,
    private readonly valenceAggregator: ValenceAggregatorService,
    private readonly attention: AttentionService,
  ) {}

  public async generate(workspaceId: string): Promise<DailyDashboard> {
    const nowMs = Date.now();
    const cutoffMs = nowMs - 24 * 60 * 60 * 1000;

    const allEvents = this.spine.recentEventsAsRef();
    const events = allEvents.filter(
      (e) =>
        e.workspaceId === workspaceId &&
        Date.parse(e.occurredAt) >= cutoffMs,
    );

    const hotLeadsWithoutResponse = this.countHotLeadsWithoutResponse(events, nowMs);
    const abandonedCarts = this.countAbandonedCarts(events);
    const leadsAwaitingFollowup = this.countLeadsAwaitingFollowup(events);
    const dealsAtRisk = this.countDealsAtRisk(events);
    const silentLeads = this.countSilentLeads(events);

    const goalResult = this.goalField.runCycle({
      events: [...allEvents],
      nowMs,
      mode: 'shadow',
      emergenceThreshold: 0.5,
      promotionTopK: 3,
    });

    const topThree: TopOpportunity[] = goalResult.candidates
      .slice(0, 3)
      .map((g: GoalCandidate) => ({
        goalId: g.goalId,
        summary: g.summary,
        impact: g.impact,
        viability: g.viability,
        risk: g.risk,
        score: g.score,
      }));

    const mood = this.valenceAggregator.aggregate(events, 24, nowMs);

    const attentionResult = this.attention.allocate(events, {
      nowMs,
      halfLifeMinutes: 30,
      focalThreshold: 0.5,
    });

    const suggestedActions = this.buildSuggestedActions(
      goalResult.candidates,
      attentionResult.candidates,
      events,
    );
    const nowFocus = buildNowFocus(suggestedActions, {
      hotLeadsWithoutResponse,
      abandonedCarts,
      leadsAwaitingFollowup,
      dealsAtRisk,
      silentLeads,
    }, buildNoRegretHighlight(events));

    return {
      workspaceId,
      generatedAt: new Date(nowMs).toISOString(),
      hotLeadsWithoutResponse,
      abandonedCarts,
      leadsAwaitingFollowup,
      dealsAtRisk,
      silentLeads,
      topThreeOpportunities: topThree,
      suggestedActions,
      nowFocus,
      commercialMood: {
        positive: mood.positive,
        negative: mood.negative,
        neutral: mood.neutral,
        ambiguous: mood.ambiguous,
        windowHours: mood.windowHours,
      },
    };
  }

  private countHotLeadsWithoutResponse(
    events: readonly SpineEventRef[],
    _nowMs: number,
  ): number {
    const repliedSet = new Set<string>();
    const repliedAfterSet = new Set<string>();

    for (const e of events) {
      if (e.eventName === 'commerce.lead.replied' && e.entityRef) {
        const key = `${e.entityRef.entityType}:${e.entityRef.entityId}`;
        repliedSet.add(key);
      }
      if (e.eventName === 'commerce.whatsapp.message_replied' && e.entityRef) {
        const key = `${e.entityRef.entityType}:${e.entityRef.entityId}`;
        const repliedTs = Date.parse(e.occurredAt);
        const leadRepliedEvents = events.filter(
          (r) =>
            r.eventName === 'commerce.lead.replied' &&
            r.entityRef?.entityId === e.entityRef?.entityId,
        );
        for (const l of leadRepliedEvents) {
          if (repliedTs > Date.parse(l.occurredAt)) {
            repliedAfterSet.add(key);
          }
        }
      }
    }

    let count = 0;
    for (const key of repliedSet) {
      if (!repliedAfterSet.has(key)) count += 1;
    }
    return count;
  }

  private countAbandonedCarts(events: readonly SpineEventRef[]): number {
    const carts = new Set<string>();
    for (const e of events) {
      if (
        e.eventName === 'commerce.cart.abandoned' &&
        e.entityRef
      ) {
        carts.add(e.entityRef.entityId);
      }
    }
    return carts.size;
  }

  private countLeadsAwaitingFollowup(events: readonly SpineEventRef[]): number {
    const contacted = new Set<string>();
    const replied = new Set<string>();
    for (const e of events) {
      if (e.eventName === 'commerce.lead.contacted' && e.entityRef) {
        contacted.add(e.entityRef.entityId);
      }
      if (e.eventName === 'commerce.lead.replied' && e.entityRef) {
        replied.add(e.entityRef.entityId);
      }
    }
    let count = 0;
    for (const id of contacted) {
      if (!replied.has(id)) count += 1;
    }
    return count;
  }

  private countDealsAtRisk(events: readonly SpineEventRef[]): number {
    const atRisk = new Set<string>();
    for (const e of events) {
      if (
        (e.eventName === 'commerce.lead.objection_raised' ||
          e.eventName === 'commerce.post_sale.churn_risk_detected') &&
        e.entityRef
      ) {
        atRisk.add(e.entityRef.entityId);
      }
    }
    return atRisk.size;
  }

  private countSilentLeads(events: readonly SpineEventRef[]): number {
    const silent = new Set<string>();
    for (const e of events) {
      if (e.eventName === 'commerce.lead.went_silent' && e.entityRef) {
        silent.add(e.entityRef.entityId);
      }
    }
    return silent.size;
  }

  private buildSuggestedActions(
    goals: readonly GoalCandidate[],
    attentionCandidates: readonly { targetType: string; targetId: string; weight: number }[],
    events: readonly SpineEventRef[],
  ): readonly SuggestedAction[] {
    const actions: SuggestedAction[] = [];

    for (const sa of silentLeadActions(events)) {
      if (sa.priority > 0.4) {
        actions.push(sa);
      }
    }

    for (const sa of postSaleRiskActions(events)) {
      const alreadySuggested = actions.some(
        (a) => a.targetType === sa.targetType && a.targetId === sa.targetId,
      );
      if (!alreadySuggested) {
        actions.push(sa);
      }
    }

    for (const g of goals.slice(0, 3)) {
      if (g.entityRef) {
        const alreadySuggested = actions.some(
          (a) =>
            a.targetType === g.entityRef?.entityType &&
            a.targetId === g.entityRef?.entityId,
        );
        if (alreadySuggested) continue;
        const kind = detectActionKind(g, events);
        actions.push({
          kind,
          targetType: g.entityRef.entityType,
          targetId: g.entityRef.entityId,
          reason: g.summary,
          priority: g.score,
          riskClass: 'R1',
          delegationMode: 'allowed_alone',
          rollback: 'dismiss_suggestion',
        });
      }
    }

    for (const c of attentionCandidates.slice(0, 3)) {
      const alreadySuggested = actions.some(
        (a) => a.targetType === c.targetType && a.targetId === c.targetId,
      );
      if (isUnqualifiedSilentLead(events, c.targetType, c.targetId)) continue;
      if (isHealthyPostSaleOnly(events, c.targetType, c.targetId)) continue;
      if (!alreadySuggested && c.weight > 0.4) {
        actions.push({
          kind: 'investigate',
          targetType: c.targetType,
          targetId: c.targetId,
          reason: `top attention entity (salience ${c.weight.toFixed(2)})`,
          priority: c.weight,
          riskClass: 'R1',
          delegationMode: 'allowed_alone',
          rollback: 'dismiss_suggestion',
        });
      }
    }

    return actions.sort((a, b) => b.priority - a.priority).slice(0, 5);
  }
}

interface DashboardCounts {
  readonly hotLeadsWithoutResponse: number;
  readonly abandonedCarts: number;
  readonly leadsAwaitingFollowup: number;
  readonly dealsAtRisk: number;
  readonly silentLeads: number;
}

function buildNowFocus(
  suggestedActions: readonly SuggestedAction[],
  counts: DashboardCounts,
  noRegretHighlight?: NoRegretHighlight,
): NowFocus {
  const [topAction] = suggestedActions;

  if (topAction) {
    return {
      urgency: topAction.priority >= 0.75 || topAction.riskClass === 'R2' ? 'now' : 'this_week',
      headline: headlineForAction(topAction),
      safeNextStep: safeNextStepForAction(topAction),
      reason: topAction.reason,
      targetType: topAction.targetType,
      targetId: topAction.targetId,
      riskClass: topAction.riskClass ?? 'R1',
      delegationMode: topAction.delegationMode ?? 'allowed_alone',
      rollback: topAction.rollback === 'dismiss_suggestion' ? 'dismiss_suggestion' : 'keep_silent',
      timeToValueMinutes: 1,
      ...(noRegretHighlight ? { noRegretHighlight } : {}),
    };
  }

  const hasCommercialSignal =
    counts.hotLeadsWithoutResponse > 0 ||
    counts.abandonedCarts > 0 ||
    counts.leadsAwaitingFollowup > 0 ||
    counts.dealsAtRisk > 0 ||
    counts.silentLeads > 0;

  if (hasCommercialSignal) {
    return {
      urgency: 'for_awareness',
      headline: 'No safe action yet',
      safeNextStep: 'Keep silent until a stronger commercial signal appears',
      reason: 'there are commercial signals, but none qualify for an action without adding pressure or review burden',
      riskClass: 'R1',
      delegationMode: 'allowed_alone',
      rollback: 'keep_silent',
      timeToValueMinutes: 1,
      ...(noRegretHighlight ? { noRegretHighlight } : {}),
    };
  }

  return {
    urgency: 'archive',
    headline: 'Nothing needs attention now',
    safeNextStep: 'Stay silent and keep monitoring',
    reason: 'no current lead, cart, follow-up, risk, or silence signal in the 24h window',
    riskClass: 'R1',
    delegationMode: 'allowed_alone',
    rollback: 'keep_silent',
    timeToValueMinutes: 1,
    ...(noRegretHighlight ? { noRegretHighlight } : {}),
  };
}

function buildNoRegretHighlight(events: readonly SpineEventRef[]): NoRegretHighlight | undefined {
  const firstValueByEntity = new Map<string, SpineEventRef>();
  const riskyEntities = new Set<string>();

  for (const event of events) {
    if (!event.entityRef) continue;
    const key = `${event.entityRef.entityType}:${event.entityRef.entityId}`;

    if (event.eventName === 'commerce.post_sale.first_value_obtained') {
      firstValueByEntity.set(key, event);
      continue;
    }

    if (
      event.eventName === 'commerce.post_sale.churn_risk_detected' ||
      event.eventName === 'commerce.payment.refunded' ||
      event.eventName === 'commerce.whatsapp.handoff_to_human' ||
      isNegativeSatisfaction(event)
    ) {
      riskyEntities.add(key);
    }
  }

  const evidence = Array.from(firstValueByEntity.entries())
    .filter(([key]) => !riskyEntities.has(key))
    .map(([, event]) => event.eventId);

  if (evidence.length === 0) {
    return undefined;
  }

  return {
    count: evidence.length,
    headline: `${evidence.length} customer${evidence.length === 1 ? '' : 's'} reached first value`,
    reason:
      'informational post-sale health signal only; do not create outreach, referral, testimonial, or expansion work from this alone',
    evidenceEventIds: evidence,
    riskClass: 'R1',
    delegationMode: 'allowed_alone',
  };
}

function isNegativeSatisfaction(event: SpineEventRef): boolean {
  return (
    event.eventName === 'commerce.post_sale.satisfaction_signal_observed' &&
    event.payload?.sentimentLabel === 'negative'
  );
}

function isHealthyPostSaleOnly(
  events: readonly SpineEventRef[],
  targetType: string,
  targetId: string,
): boolean {
  const entityEvents = events.filter(
    (event) =>
      event.entityRef?.entityType === targetType &&
      event.entityRef?.entityId === targetId,
  );

  const hasFirstValue = entityEvents.some(
    (event) => event.eventName === 'commerce.post_sale.first_value_obtained',
  );
  if (!hasFirstValue) {
    return false;
  }

  return entityEvents.every(
    (event) =>
      event.eventName === 'commerce.post_sale.first_value_obtained' ||
      event.eventName === 'commerce.post_sale.satisfaction_signal_observed',
  );
}

function headlineForAction(action: SuggestedAction): string {
  switch (action.kind) {
    case 'follow_up':
      return 'Resume the right conversation';
    case 'recover_cart':
      return 'Review the cart recovery';
    case 'review_deal':
      return 'Review risk before acting';
    case 'contact_lead':
      return 'Contact the highest-signal lead';
    case 'investigate':
      return 'Inspect the strongest signal';
  }
}

function safeNextStepForAction(action: SuggestedAction): string {
  if (action.delegationMode === 'requires_approval') {
    return 'Review and approve before any outbound action';
  }
  if (action.kind === 'follow_up' || action.kind === 'recover_cart') {
    return 'Prepare an honest, low-pressure next message';
  }
  if (action.kind === 'contact_lead') {
    return 'Check context before contacting the lead';
  }
  return 'Open the context and decide whether action is justified';
}

function detectActionKind(
  goal: GoalCandidate,
  events: readonly SpineEventRef[],
): SuggestedAction['kind'] {
  if (goal.entityRef) {
    const entityId = goal.entityRef.entityId;
    const entityType = goal.entityRef.entityType;
    const entityEvents = events.filter(
      (e) =>
        e.entityRef?.entityId === entityId &&
        e.entityRef?.entityType === entityType,
    );
    const wentSilent = entityEvents.some(
      (e) => e.eventName === 'commerce.lead.went_silent',
    );
    const hadObjection = entityEvents.some(
      (e) => e.eventName === 'commerce.lead.objection_raised',
    );
    const hadAbandonedCart = entityEvents.some(
      (e) => e.eventName === 'commerce.cart.abandoned',
    );
    if (wentSilent && hadObjection) return 'follow_up';
    if (wentSilent && hadAbandonedCart) return 'recover_cart';
  }

  const dim = goal.contributingTensions[0]?.dimension;
  switch (dim) {
    case 'commercial':
      return 'contact_lead';
    case 'financial':
      return 'review_deal';
    case 'operational':
      return 'follow_up';
    default:
      return 'investigate';
  }
}

function silentLeadActions(
  events: readonly SpineEventRef[],
): readonly SuggestedAction[] {
  const silentEntities = new Map<
    string,
    { entityType: string; entityId: string; events: SpineEventRef[] }
  >();

  for (const e of events) {
    if (e.eventName !== 'commerce.lead.went_silent' || !e.entityRef) continue;
    const key = `${e.entityRef.entityType}:${e.entityRef.entityId}`;
    if (!silentEntities.has(key)) {
      silentEntities.set(key, {
        entityType: e.entityRef.entityType,
        entityId: e.entityRef.entityId,
        events: [],
      });
    }
    const entity = silentEntities.get(key);
    if (entity) {
      entity.events.push(e);
    }
  }

  const actions: SuggestedAction[] = [];

  for (const [, entry] of silentEntities) {
    const allEntityEvents = events.filter(
      (e) =>
        e.entityRef?.entityId === entry.entityId &&
        e.entityRef?.entityType === entry.entityType,
    );

    const hadObjection = allEntityEvents.some(
      (e) => e.eventName === 'commerce.lead.objection_raised',
    );
    const hadAbandonedCart = allEntityEvents.some(
      (e) => e.eventName === 'commerce.cart.abandoned',
    );

    const latestSilent = entry.events.reduce((latest, e) => {
      if (!latest) return e;
      return Date.parse(e.occurredAt) > Date.parse(latest.occurredAt) ? e : latest;
    });

    const recencyBoost =
      1 +
      Math.max(
        0,
        1 -
          (Date.now() - Date.parse(latestSilent.occurredAt)) /
            (6 * 60 * 60 * 1000),
      );

    if (hadObjection) {
      const priority = Math.min(1, 0.75 * recencyBoost);
      if (priority > 0.4) {
        actions.push({
          kind: 'follow_up',
          targetType: entry.entityType,
          targetId: entry.entityId,
          reason: 'went silent after objection - resume conversation or review deal',
          priority,
          riskClass: 'R1',
          delegationMode: 'allowed_alone',
          rollback: 'dismiss_suggestion',
        });
      }
    } else if (hadAbandonedCart) {
      const priority = Math.min(1, 0.65 * recencyBoost);
      if (priority > 0.4) {
        actions.push({
          kind: 'recover_cart',
          targetType: entry.entityType,
          targetId: entry.entityId,
          reason: 'went silent after abandoned cart - recover with honest retomada',
          priority,
          riskClass: 'R1',
          delegationMode: 'allowed_alone',
          rollback: 'dismiss_suggestion',
        });
      }
    }
  }

  return actions.sort((a, b) => b.priority - a.priority).slice(0, 2);
}

const OPERATOR_FEEDBACK_REPETITION_THRESHOLD = 2;
const OPERATOR_FEEDBACK_DECISION_SLOT_COUNT = 1;

function findRepeatedOperatorNotes(events: readonly SpineEventRef[]): string[] {
  const noteCounts = new Map<string, number>();

  for (const event of events) {
    if (event.eventName !== 'cognition.valence_assigned') continue;
    if (!event.entityRef || event.entityRef.entityType !== 'operator') continue;

    if (event.payload?.accepted !== false) continue;

    const operatorNote = event.payload?.operatorNote;
    const normalizedNote = typeof operatorNote === 'string' ? operatorNote.trim() : '';
    if (normalizedNote.length === 0) continue;

    const learningFraming = event.payload?.learningFraming;
    if (
      typeof learningFraming !== 'string' ||
      !learningFraming.includes('not human performance scoring')
    ) {
      continue;
    }

    noteCounts.set(normalizedNote, (noteCounts.get(normalizedNote) ?? 0) + 1);
  }

  return Array.from(noteCounts.entries())
    .filter(([, count]) => count >= OPERATOR_FEEDBACK_REPETITION_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .slice(0, OPERATOR_FEEDBACK_DECISION_SLOT_COUNT)
    .map(([note]) => note);
}

function postSaleRiskActions(
  events: readonly SpineEventRef[],
): readonly SuggestedAction[] {
  const actions: SuggestedAction[] = [];

  const repeatedNotes = findRepeatedOperatorNotes(events);
  const learnedOwnerSuffix = repeatedNotes.length > 0
    ? ` [learned owner criterion: ${repeatedNotes[0]}]`
    : '';

  for (const event of events) {
    if (event.eventName !== 'commerce.post_sale.churn_risk_detected' || !event.entityRef) {
      continue;
    }

    const signals = Array.isArray(event.payload?.signals) ? event.payload.signals : [];
    const hasMissingFirstValue = signals.includes('first_value_missing');
    const riskProbability =
      typeof event.payload?.riskProbability === 'number' ? event.payload.riskProbability : 0.5;

    actions.push({
      kind: 'review_deal',
      targetType: event.entityRef.entityType,
      targetId: event.entityRef.entityId,
      reason: (hasMissingFirstValue
        ? 'post-sale risk: customer has not reached first value - review help path before retention'
        : 'post-sale churn risk detected - review recovery path before outbound action') + learnedOwnerSuffix,
      priority: Math.min(1, Math.max(0.55, riskProbability)),
      riskClass: 'R2',
      delegationMode: 'requires_approval',
      rollback: 'dismiss_suggestion',
    });
  }

  return actions.sort((a, b) => b.priority - a.priority).slice(0, 2);
}

function isUnqualifiedSilentLead(
  events: readonly SpineEventRef[],
  targetType: string,
  targetId: string,
): boolean {
  const entityEvents = events.filter(
    (e) =>
      e.entityRef?.entityType === targetType &&
      e.entityRef?.entityId === targetId,
  );
  const wentSilent = entityEvents.some(
    (e) => e.eventName === 'commerce.lead.went_silent',
  );
  if (!wentSilent) return false;
  const hasCommercialReason = entityEvents.some(
    (e) =>
      e.eventName === 'commerce.lead.objection_raised' ||
      e.eventName === 'commerce.cart.abandoned',
  );
  return !hasCommercialReason;
}
