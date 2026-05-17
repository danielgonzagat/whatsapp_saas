import type { SpineEventRef } from '../../mind/mind.types';
import { Detector, makeTensionId, Tension } from '../goal-field.types';

/**
 * UTP-GOAL-COMM-001..010 — commercial-dimension tension detectors.
 *
 * Each detector receives recent spine events + nowMs and returns 0+
 * tensions. Pure functions. The goal-field orchestrator runs all of them
 * per cycle.
 */

const HOT_LEAD_REPLY_RESPONSE_BUDGET_MS = 30 * 60 * 1000; // 30 min
const ABANDONED_CART_WINDOW_MS = 30 * 60 * 1000;
const SILENCE_FOLLOWUP_BUDGET_MS = 48 * 60 * 60 * 1000;
const DORMANT_CUSTOMER_DAYS = 60;
const CHANNEL_CLICK_TO_CONVERSION_BUDGET_MS = 7 * 24 * 60 * 60 * 1000;

interface EventIndex {
  readonly byEntity: Map<string, SpineEventRef[]>;
  readonly all: readonly SpineEventRef[];
}

function indexEvents(events: readonly SpineEventRef[]): EventIndex {
  const byEntity = new Map<string, SpineEventRef[]>();
  for (const e of events) {
    if (!e.entityRef) continue;
    const k = `${e.entityRef.entityType}:${e.entityRef.entityId}`;
    const cur = byEntity.get(k) ?? [];
    cur.push(e);
    byEntity.set(k, cur);
  }
  return { byEntity, all: events };
}

function lastEventBefore(
  events: readonly SpineEventRef[],
  beforeMs: number,
  predicate: (e: SpineEventRef) => boolean,
): SpineEventRef | undefined {
  const filtered = events
    .filter((e) => predicate(e) && Date.parse(e.occurredAt) < beforeMs)
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt));
  return filtered[0];
}

function makeTension(
  detectorName: string,
  description: string,
  severity: number,
  e: SpineEventRef,
  evidenceEventIds: readonly string[],
  detectedAtMs: number,
): Tension {
  const t: Tension = {
    tensionId: makeTensionId(),
    detectorName,
    dimension: 'commercial',
    ...(e.workspaceId !== undefined ? { workspaceId: e.workspaceId } : {}),
    ...(e.entityRef !== undefined ? { entityRef: e.entityRef } : {}),
    severity,
    description,
    detectedAt: new Date(detectedAtMs).toISOString(),
    evidenceEventIds,
  };
  return t;
}

export const hotLeadWithoutResponseDetector: Detector = {
  name: 'commerce.hot_lead_without_response',
  dimension: 'commercial',
  detect: (events, nowMs) => {
    const out: Tension[] = [];
    const { byEntity } = indexEvents(events);
    for (const [, list] of byEntity) {
      const lastReply = lastEventBefore(list, nowMs + 1, (e) => e.eventName === 'commerce.lead.replied');
      if (!lastReply) continue;
      const replyMs = Date.parse(lastReply.occurredAt);
      if (nowMs - replyMs < HOT_LEAD_REPLY_RESPONSE_BUDGET_MS) continue;
      const ourReplyAfter = list.find(
        (e) =>
          e.eventName === 'commerce.whatsapp.message_replied' &&
          Date.parse(e.occurredAt) > replyMs,
      );
      if (ourReplyAfter) continue;
      out.push(
        makeTension(
          'commerce.hot_lead_without_response',
          `lead respondeu há ${Math.round((nowMs - replyMs) / 60000)}min sem resposta nossa`,
          0.85,
          lastReply,
          [lastReply.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

export const abandonedCartDetector: Detector = {
  name: 'commerce.abandoned_cart',
  dimension: 'commercial',
  detect: (events, nowMs) => {
    const out: Tension[] = [];
    const { byEntity } = indexEvents(events);
    for (const [, list] of byEntity) {
      const lastCart = lastEventBefore(
        list,
        nowMs + 1,
        (e) => e.eventName === 'commerce.cart.created',
      );
      if (!lastCart) continue;
      const cartMs = Date.parse(lastCart.occurredAt);
      if (nowMs - cartMs < ABANDONED_CART_WINDOW_MS) continue;
      const checkoutOrAbandoned = list.find(
        (e) =>
          (e.eventName === 'commerce.cart.checkout_initiated' ||
            e.eventName === 'commerce.cart.abandoned' ||
            e.eventName === 'commerce.payment.approved') &&
          Date.parse(e.occurredAt) > cartMs,
      );
      if (checkoutOrAbandoned) continue;
      out.push(
        makeTension(
          'commerce.abandoned_cart',
          'carrinho criado sem progressão para checkout',
          0.7,
          lastCart,
          [lastCart.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

const clickedWithoutConversionDetector: Detector = {
  name: 'commerce.clicked_without_conversion',
  dimension: 'commercial',
  detect: (events, nowMs) => {
    const out: Tension[] = [];
    const { byEntity } = indexEvents(events);
    for (const [, list] of byEntity) {
      const lastClick = lastEventBefore(
        list,
        nowMs + 1,
        (e) => e.eventName === 'commerce.campaign.clicked',
      );
      if (!lastClick) continue;
      const clickMs = Date.parse(lastClick.occurredAt);
      if (nowMs - clickMs < CHANNEL_CLICK_TO_CONVERSION_BUDGET_MS) continue;
      const conv = list.find(
        (e) =>
          e.eventName === 'commerce.campaign.conversion_associated' &&
          Date.parse(e.occurredAt) > clickMs,
      );
      if (conv) continue;
      out.push(
        makeTension(
          'commerce.clicked_without_conversion',
          'click sem conversão associada na janela',
          0.55,
          lastClick,
          [lastClick.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

export const repeatedObjectionDetector: Detector = {
  name: 'commerce.repeated_objection',
  dimension: 'commercial',
  detect: (events, nowMs) => {
    const { byEntity } = indexEvents(events);
    const out: Tension[] = [];
    for (const [, list] of byEntity) {
      const objections = list.filter((e) => e.eventName === 'commerce.lead.objection_raised');
      if (objections.length < 2) continue;
      const last = objections[objections.length - 1]!;
      out.push(
        makeTension(
          'commerce.repeated_objection',
          `${objections.length} objeções para o mesmo lead — padrão`,
          Math.min(0.9, 0.5 + objections.length * 0.1),
          last,
          objections.map((o) => o.eventId),
          nowMs,
        ),
      );
    }
    return out;
  },
};

const dormantCustomerDetector: Detector = {
  name: 'commerce.dormant_customer',
  dimension: 'commercial',
  detect: (events, nowMs) => {
    const { byEntity } = indexEvents(events);
    const out: Tension[] = [];
    for (const [, list] of byEntity) {
      const lastConverted = lastEventBefore(
        list,
        nowMs + 1,
        (e) =>
          e.eventName === 'commerce.lead.converted' || e.eventName === 'commerce.payment.approved',
      );
      if (!lastConverted) continue;
      const lastTouchMs = Math.max(
        ...list.map((e) => Date.parse(e.occurredAt)).filter(Number.isFinite),
      );
      const dormancyDays = (nowMs - lastTouchMs) / (1000 * 60 * 60 * 24);
      if (dormancyDays < DORMANT_CUSTOMER_DAYS) continue;
      out.push(
        makeTension(
          'commerce.dormant_customer',
          `cliente dormente há ${Math.round(dormancyDays)} dias`,
          0.6,
          lastConverted,
          [lastConverted.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

const checkoutStartedWithoutPaymentDetector: Detector = {
  name: 'commerce.checkout_started_without_payment',
  dimension: 'commercial',
  detect: (events, nowMs) => {
    const { byEntity } = indexEvents(events);
    const out: Tension[] = [];
    for (const [, list] of byEntity) {
      const lastCheckout = lastEventBefore(
        list,
        nowMs + 1,
        (e) => e.eventName === 'commerce.cart.checkout_initiated',
      );
      if (!lastCheckout) continue;
      const checkoutMs = Date.parse(lastCheckout.occurredAt);
      if (nowMs - checkoutMs < 60 * 60 * 1000) continue; // wait 1h
      const pay = list.find(
        (e) =>
          (e.eventName === 'commerce.payment.approved' ||
            e.eventName === 'commerce.payment.declined') &&
          Date.parse(e.occurredAt) > checkoutMs,
      );
      if (pay) continue;
      out.push(
        makeTension(
          'commerce.checkout_started_without_payment',
          'checkout iniciado sem confirmação de pagamento',
          0.75,
          lastCheckout,
          [lastCheckout.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

const leadWithoutFollowupDetector: Detector = {
  name: 'commerce.lead_without_followup',
  dimension: 'commercial',
  detect: (events, nowMs) => {
    const { byEntity } = indexEvents(events);
    const out: Tension[] = [];
    for (const [, list] of byEntity) {
      const lastSilence = lastEventBefore(
        list,
        nowMs + 1,
        (e) => e.eventName === 'commerce.lead.went_silent',
      );
      if (!lastSilence) continue;
      const silenceMs = Date.parse(lastSilence.occurredAt);
      if (nowMs - silenceMs < SILENCE_FOLLOWUP_BUDGET_MS) continue;
      const followup = list.find(
        (e) =>
          e.eventName === 'commerce.whatsapp.message_replied' &&
          Date.parse(e.occurredAt) > silenceMs,
      );
      if (followup) continue;
      out.push(
        makeTension(
          'commerce.lead_without_followup',
          'lead silenciou e ficou sem follow-up dentro do budget',
          0.7,
          lastSilence,
          [lastSilence.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

const performingAffiliateDetector: Detector = {
  name: 'commerce.performing_affiliate',
  dimension: 'commercial',
  detect: (events, nowMs) => {
    const out: Tension[] = [];
    const perf = events.filter((e) => e.eventName === 'commerce.affiliate.performance_measured');
    for (const e of perf) {
      const mag = Number((e.payload?.['conversionRate'] ?? 0));
      if (!Number.isFinite(mag) || mag < 0.1) continue;
      out.push(
        makeTension(
          'commerce.performing_affiliate',
          `afiliado com performance acima do threshold (${mag.toFixed(2)})`,
          Math.min(0.85, 0.5 + mag),
          e,
          [e.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

const channelWithoutConversionDetector: Detector = {
  name: 'commerce.channel_without_conversion',
  dimension: 'commercial',
  detect: (events, nowMs) => {
    const out: Tension[] = [];
    const drops = events.filter(
      (e) => e.eventName === 'commerce.campaign.performance_drop_detected',
    );
    for (const e of drops) {
      out.push(
        makeTension(
          'commerce.channel_without_conversion',
          'queda de performance do canal detectada',
          0.65,
          e,
          [e.eventId],
          nowMs,
        ),
      );
    }
    return out;
  },
};

const viewedWithoutPurchaseDetector: Detector = {
  name: 'commerce.viewed_without_purchase',
  dimension: 'commercial',
  detect: (events, nowMs) => {
    const out: Tension[] = [];
    const { byEntity } = indexEvents(events);
    for (const [, list] of byEntity) {
      const reads = list.filter((e) => e.eventName === 'commerce.whatsapp.message_read');
      if (reads.length < 3) continue;
      const purchase = list.find((e) => e.eventName === 'commerce.payment.approved');
      if (purchase) continue;
      const last = reads[reads.length - 1]!;
      out.push(
        makeTension(
          'commerce.viewed_without_purchase',
          `${reads.length} leituras sem compra`,
          0.45,
          last,
          reads.map((r) => r.eventId),
          nowMs,
        ),
      );
    }
    return out;
  },
};

export const COMMERCIAL_DETECTORS: readonly Detector[] = [
  hotLeadWithoutResponseDetector,
  abandonedCartDetector,
  clickedWithoutConversionDetector,
  repeatedObjectionDetector,
  dormantCustomerDetector,
  checkoutStartedWithoutPaymentDetector,
  leadWithoutFollowupDetector,
  performingAffiliateDetector,
  channelWithoutConversionDetector,
  viewedWithoutPurchaseDetector,
];
