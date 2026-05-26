import { Injectable } from '@nestjs/common';
import { AttentionService } from '../mind/attention.service';
import { GoalFieldService } from '../goal-field/goal-field.service';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import { ValenceAggregatorService } from '../mind/valence-aggregator.service';
import type { SpineEventRef } from '../mind/mind.types';
import type { GoalCandidate } from '../goal-field/goal-field.types';
import { buildNoRegretHighlight, buildNowFocus, detectActionKind, isHealthyPostSaleOnly, isUnqualifiedSilentLead, postSaleRiskActions, silentLeadActions } from './daily-dashboard.helpers';
import type { DailyDashboard, SuggestedAction, TopOpportunity } from './daily-dashboard.types';
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
      (e) => e.workspaceId === workspaceId && Date.parse(e.occurredAt) >= cutoffMs,
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
    const nowFocus = buildNowFocus(
      suggestedActions,
      {
        hotLeadsWithoutResponse,
        abandonedCarts,
        leadsAwaitingFollowup,
        dealsAtRisk,
        silentLeads,
      },
      buildNoRegretHighlight(events),
    );
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
  private countHotLeadsWithoutResponse(events: readonly SpineEventRef[], _nowMs: number): number {
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
      if (!repliedAfterSet.has(key)) {count += 1;}
    }
    return count;
  }
  private countAbandonedCarts(events: readonly SpineEventRef[]): number {
    const carts = new Set<string>();
    for (const e of events) {
      if (e.eventName === 'commerce.cart.abandoned' && e.entityRef) {
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
      if (!replied.has(id)) {count += 1;}
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
          (a) => a.targetType === g.entityRef?.entityType && a.targetId === g.entityRef?.entityId,
        );
        if (alreadySuggested) {continue;}
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
      if (isUnqualifiedSilentLead(events, c.targetType, c.targetId)) {continue;}
      if (isHealthyPostSaleOnly(events, c.targetType, c.targetId)) {continue;}
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
