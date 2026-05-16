import type { GoalCandidate } from '../goal-field/goal-field.types';
import type { SpineEventRef } from '../mind/mind.types';
import type { NoRegretHighlight, NowFocus, SuggestedAction } from './daily-dashboard.types';
export interface DashboardCounts {
  readonly hotLeadsWithoutResponse: number;
  readonly abandonedCarts: number;
  readonly leadsAwaitingFollowup: number;
  readonly dealsAtRisk: number;
  readonly silentLeads: number;
}
export function buildNowFocus(
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
      reason:
        'there are commercial signals, but none qualify for an action without adding pressure or review burden',
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
export function buildNoRegretHighlight(events: readonly SpineEventRef[]): NoRegretHighlight | undefined {
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
export function isHealthyPostSaleOnly(
  events: readonly SpineEventRef[],
  targetType: string,
  targetId: string,
): boolean {
  const entityEvents = events.filter(
    (event) => event.entityRef?.entityType === targetType && event.entityRef?.entityId === targetId,
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
    return 'Review and approve before every outbound action';
  }
  if (action.kind === 'follow_up' || action.kind === 'recover_cart') {
    return 'Decide the silence reason before drafting each outbound message';
  }
  if (action.kind === 'contact_lead') {
    return 'Check context before contacting the lead';
  }
  return 'Open the context and decide whether action is justified';
}
export function detectActionKind(
  goal: GoalCandidate,
  events: readonly SpineEventRef[],
): SuggestedAction['kind'] {
  if (goal.entityRef) {
    const entityId = goal.entityRef.entityId;
    const entityType = goal.entityRef.entityType;
    const entityEvents = events.filter(
      (e) => e.entityRef?.entityId === entityId && e.entityRef?.entityType === entityType,
    );
    const wentSilent = entityEvents.some((e) => e.eventName === 'commerce.lead.went_silent');
    const hadObjection = entityEvents.some((e) => e.eventName === 'commerce.lead.objection_raised');
    const hadAbandonedCart = entityEvents.some((e) => e.eventName === 'commerce.cart.abandoned');
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
export function silentLeadActions(events: readonly SpineEventRef[]): readonly SuggestedAction[] {
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
        e.entityRef?.entityId === entry.entityId && e.entityRef?.entityType === entry.entityType,
    );
    const hadObjection = allEntityEvents.some(
      (e) => e.eventName === 'commerce.lead.objection_raised',
    );
    const hadAbandonedCart = allEntityEvents.some((e) => e.eventName === 'commerce.cart.abandoned');
    const latestSilent = entry.events.reduce((latest, e) => {
      if (!latest) return e;
      return Date.parse(e.occurredAt) > Date.parse(latest.occurredAt) ? e : latest;
    });
    const recencyBoost =
      1 +
      Math.max(0, 1 - (Date.now() - Date.parse(latestSilent.occurredAt)) / (6 * 60 * 60 * 1000));
    if (hadObjection) {
      const priority = Math.min(1, 0.75 * recencyBoost);
      if (priority > 0.4) {
        actions.push({
          kind: 'follow_up',
          targetType: entry.entityType,
          targetId: entry.entityId,
          reason: 'went silent after objection - diagnose silence before every outbound action',
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
          reason:
            'went silent after abandoned cart - diagnose checkout friction before every outbound action',
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
export function postSaleRiskActions(events: readonly SpineEventRef[]): readonly SuggestedAction[] {
  const actions: SuggestedAction[] = [];
  const repeatedNotes = findRepeatedOperatorNotes(events);
  const learnedOwnerSuffix =
    repeatedNotes.length > 0 ? ` [learned owner criterion: ${repeatedNotes[0]}]` : '';
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
      reason:
        (hasMissingFirstValue
          ? 'post-sale risk: customer has not reached first value - review help path before retention'
          : 'post-sale churn risk detected - review recovery path before outbound action') +
        learnedOwnerSuffix,
      priority: Math.min(1, Math.max(0.55, riskProbability)),
      riskClass: 'R2',
      delegationMode: 'requires_approval',
      rollback: 'dismiss_suggestion',
    });
  }
  return actions.sort((a, b) => b.priority - a.priority).slice(0, 2);
}
export function isUnqualifiedSilentLead(
  events: readonly SpineEventRef[],
  targetType: string,
  targetId: string,
): boolean {
  const entityEvents = events.filter(
    (e) => e.entityRef?.entityType === targetType && e.entityRef?.entityId === targetId,
  );
  const wentSilent = entityEvents.some((e) => e.eventName === 'commerce.lead.went_silent');
  if (!wentSilent) return false;
  const hasCommercialReason = entityEvents.some(
    (e) =>
      e.eventName === 'commerce.lead.objection_raised' || e.eventName === 'commerce.cart.abandoned',
  );
  return !hasCommercialReason;
}
