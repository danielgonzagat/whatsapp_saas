import type { MindDecisionSpec } from './mind-code-native.types';

export const MIND_DECISION_CATALOG: MindDecisionSpec[] = [
  {
    decisionType: 'followup_timing',
    options: ['5m', '30m', '2h', '8h', 'next_morning', 'stop'],
    predicate: 'P(reply|followup_delay,concept,channel,hour)',
    contextKeys: ['channel', 'hour', 'concept', 'fatigue'],
    baseline: '30m',
    outcomeEvent: 'message.received',
  },
  {
    decisionType: 'message_format',
    options: ['text', 'audio', 'image', 'video', 'template', 'html_rich'],
    predicate: 'P(reply|message_type,hour,channel,concept)',
    contextKeys: ['channel', 'hour', 'concept', 'supports'],
    baseline: 'text',
    outcomeEvent: 'message.received',
  },
  {
    decisionType: 'objection_response',
    options: [
      'value_focus',
      'social_proof',
      'guarantee',
      'direct_comparison',
      'diagnostic_question',
      'human_transfer',
    ],
    predicate: 'P(conversion|objection_strategy,concept,channel,price_band)',
    contextKeys: ['channel', 'concept', 'price_band', 'product'],
    baseline: 'value_focus',
    outcomeEvent: 'checkout.paid',
  },
  {
    decisionType: 'coupon_offer',
    options: ['no_coupon', 'coupon_5', 'coupon_10', 'coupon_15', 'coupon_20', 'human_negotiate'],
    predicate: 'P(conversion|discount_offered,segment,price_band)',
    contextKeys: ['segment', 'price_band', 'margin', 'coupon_history'],
    baseline: 'no_coupon',
    outcomeEvent: 'checkout.paid',
  },
  {
    decisionType: 'human_transfer',
    options: ['continue_ai', 'transfer_now', 'transfer_after_next_reply', 'pause_wait'],
    predicate: 'P(conversion|handoff_policy,concept,channel,ticket)',
    contextKeys: ['channel', 'concept', 'ticket', 'risk'],
    baseline: 'continue_ai',
    outcomeEvent: 'lead.qualified',
  },
  {
    decisionType: 'channel_choice',
    options: ['whatsapp', 'instagram', 'messenger', 'tiktok', 'email', 'sms'],
    predicate: 'P(reply|preferred_channel,segment,hour,concept)',
    contextKeys: ['available_channels', 'segment', 'hour', 'concept'],
    baseline: 'whatsapp',
    outcomeEvent: 'message.received',
  },
  {
    decisionType: 'product_offer',
    options: ['top_seller', 'highest_margin', 'entry_product', 'premium_product', 'upsell'],
    predicate: 'P(conversion|product_offer,segment,concept,price_band)',
    contextKeys: ['segment', 'concept', 'price_band', 'last_purchase'],
    baseline: 'top_seller',
    outcomeEvent: 'sale.completed',
  },
  {
    decisionType: 'broadcast_window',
    options: ['now', 'tonight_20h', 'tomorrow_9h', 'friday_21h', 'pause'],
    predicate: 'P(conversion|broadcast_window,channel,segment)',
    contextKeys: ['channel', 'segment', 'weekday', 'fatigue'],
    baseline: 'tomorrow_9h',
    outcomeEvent: 'campaign.converted',
  },
  {
    decisionType: 'cart_recovery',
    options: ['proof', 'urgency', 'help', 'faq', 'discount', 'pause'],
    predicate: 'P(payment|cart_recovery_action,channel,price_band)',
    contextKeys: ['channel', 'price_band', 'age_minutes', 'product'],
    baseline: 'help',
    outcomeEvent: 'checkout.paid',
  },
  {
    decisionType: 'ad_alert_action',
    options: ['alert_only', 'suggest_pause', 'suggest_budget_down', 'suggest_creative', 'ignore'],
    predicate: 'P(success|ad_alert_action,metric,window)',
    contextKeys: ['metric', 'window', 'threshold', 'campaign'],
    baseline: 'alert_only',
    outcomeEvent: 'campaign.converted',
  },
];

export const MIND_DECISION_TYPES = MIND_DECISION_CATALOG.map((spec) => spec.decisionType);

export function findMindDecisionSpec(decisionType: string): MindDecisionSpec | null {
  return MIND_DECISION_CATALOG.find((spec) => spec.decisionType === decisionType) ?? null;
}
