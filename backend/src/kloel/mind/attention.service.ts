import { Injectable } from '@nestjs/common';
import type { AbiAttention, AbiAttentionCandidate } from '../abi/abi-schema';
import { SpineEventRef } from './mind.types';

/**
 * UTP-MIND-ATT-001 + UTP-MIND-ATT-002 — Dynamic attention allocation.
 *
 * Combines:
 *   - candidates extraction from recent salient spine events (ATT-002)
 *   - dynamic allocation by recency × valence-magnitude × event-class
 *     priority (ATT-001)
 */

const EVENT_CLASS_PRIORITY: ReadonlyMap<string, number> = new Map([
  // Hot signals — focus first
  ['commerce.lead.replied', 0.85],
  ['commerce.lead.objection_raised', 0.8],
  ['commerce.cart.abandoned', 0.75],
  ['commerce.payment.declined', 0.9],
  ['commerce.payment.charged_back', 0.95],
  ['commerce.crm.deal_lost', 0.7],
  ['commerce.whatsapp.handoff_to_human', 0.85],
  ['commerce.post_sale.churn_risk_detected', 0.85],
  // Strong positive
  ['commerce.payment.approved', 0.7],
  ['commerce.crm.deal_won', 0.65],
  ['commerce.post_sale.first_value_obtained', 0.7],
  // Mid signals
  ['commerce.lead.contacted', 0.45],
  ['commerce.lead.went_silent', 0.55],
  ['commerce.cart.created', 0.4],
  ['commerce.crm.stage_changed', 0.5],
  // Background
  ['commerce.whatsapp.message_received', 0.35],
  ['commerce.whatsapp.message_replied', 0.25],
]);

const FALLBACK_WEIGHT = 0.2;

@Injectable()
export class AttentionService {
  public computeCandidates(
    events: readonly SpineEventRef[],
    nowMs: number = Date.now(),
    halfLifeMinutes = 30,
    cap = 10,
  ): readonly AbiAttentionCandidate[] {
    const halfLifeMs = halfLifeMinutes * 60 * 1000;
    const scored = new Map<
      string,
      { weight: number; targetType: string; targetId: string }
    >();
    for (const e of events) {
      if (!e.entityRef) {continue;}
      const key = `${e.entityRef.entityType}:${e.entityRef.entityId}`;
      const ts = Date.parse(e.occurredAt);
      if (!Number.isFinite(ts)) {continue;}
      const ageMs = Math.max(0, nowMs - ts);
      const recencyDecay = Math.pow(0.5, ageMs / halfLifeMs);
      const classWeight = EVENT_CLASS_PRIORITY.get(e.eventName) ?? FALLBACK_WEIGHT;
      const valenceBoost =
        e.valence === 'negative' ? 1.2 : e.valence === 'positive' ? 1.05 : 1.0;
      const w = classWeight * recencyDecay * valenceBoost;
      const cur = scored.get(key);
      if (!cur) {
        scored.set(key, {
          weight: w,
          targetType: e.entityRef.entityType,
          targetId: e.entityRef.entityId,
        });
      } else {
        cur.weight += w;
      }
    }
    const ranked = [...scored.values()]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, cap);
    if (ranked.length === 0) {return [];}
    const max = ranked[0]!.weight;
    return ranked.map((r) => ({
      targetType: r.targetType,
      targetId: r.targetId,
      weight: max > 0 ? Math.min(1, r.weight / max) : 0,
    }));
  }

  public allocate(
    events: readonly SpineEventRef[],
    options: {
      readonly nowMs?: number;
      readonly halfLifeMinutes?: number;
      readonly focalThreshold?: number;
    } = {},
  ): AbiAttention {
    const candidates = this.computeCandidates(
      events,
      options.nowMs,
      options.halfLifeMinutes,
    );
    const top = candidates[0];
    const focalThreshold = options.focalThreshold ?? 0.6;
    if (!top || top.weight < focalThreshold) {
      return { candidates };
    }
    const supporting = events
      .filter((e) => e.entityRef?.entityId === top.targetId)
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
    const reason =
      supporting.length > 0 && supporting[0]
        ? `top entity by recent salience: ${supporting[0].eventName}`
        : 'top entity by aggregate weight';
    const sinceMs =
      supporting.length > 0 && supporting[0]
        ? Math.max(0, (options.nowMs ?? Date.now()) - Date.parse(supporting[0].occurredAt))
        : 0;
    return {
      focal: {
        targetType: top.targetType,
        targetId: top.targetId,
        reason,
        sinceMs,
      },
      candidates,
    };
  }
}
