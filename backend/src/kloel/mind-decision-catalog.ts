import type { MindDecisionSpec } from './mind-code-native.types';

export const MIND_DECISION_CATALOG: MindDecisionSpec[] = [
  {
    decisionType: 'followup_timing',
    options: ['5m', '30m', '2h', '8h', 'next_morning', 'stop'],
    predicate: 'P(reply|followup_delay,concept,channel,hour)',
    contextKeys: ['channel', 'hour', 'concept', 'fatigue'],
    baseline: '30m',
    outcomeEvent: 'message.received',
    fallbackBehavior:
      'resolves open outcomes as unanswered after 48h; reverts to baseline when MIND lift is negative with >=30 samples',
  },
  {
    decisionType: 'message_format',
    options: ['text', 'audio', 'image', 'video', 'template', 'html_rich'],
    predicate: 'P(reply|message_type,hour,channel,concept)',
    contextKeys: ['channel', 'hour', 'concept', 'supports'],
    baseline: 'text',
    outcomeEvent: 'message.received',
    fallbackBehavior:
      'reverts to text when channel capabilities are unknown or MIND lift is negative with >=30 samples',
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
    fallbackBehavior:
      'reverts to value_focus when insufficient samples or MIND lift is negative; escalates to human on repeated objections',
  },
  {
    decisionType: 'coupon_offer',
    options: ['no_coupon', 'coupon_5', 'coupon_10', 'coupon_15', 'coupon_20', 'human_negotiate'],
    predicate: 'P(conversion|discount_offered,segment,price_band)',
    contextKeys: ['segment', 'price_band', 'margin', 'coupon_history'],
    baseline: 'no_coupon',
    outcomeEvent: 'checkout.paid',
    fallbackBehavior:
      'reverts to no_coupon when margin is thin or MIND lift is negative; blocked by max_discount guard above configured threshold',
  },
  {
    decisionType: 'human_transfer',
    options: ['continue_ai', 'transfer_now', 'transfer_after_next_reply', 'pause_wait'],
    predicate: 'P(conversion|handoff_policy,concept,channel,ticket)',
    contextKeys: ['channel', 'concept', 'ticket', 'risk'],
    baseline: 'continue_ai',
    outcomeEvent: 'lead.qualified',
    fallbackBehavior:
      'transfers now when risk or ticket urgency is high; otherwise continues with AI; reverts to baseline on negative MIND lift',
  },
  {
    decisionType: 'channel_choice',
    options: ['whatsapp', 'instagram', 'messenger', 'tiktok', 'email', 'sms'],
    predicate: 'P(reply|preferred_channel,segment,hour,concept)',
    contextKeys: ['available_channels', 'segment', 'hour', 'concept'],
    baseline: 'first_available',
    outcomeEvent: 'message.received',
    fallbackBehavior:
      'uses first available channel from the workspace active channel set; default re-evaluated per workspace onboarding state',
  },
  {
    decisionType: 'product_offer',
    options: ['top_seller', 'highest_margin', 'entry_product', 'premium_product', 'upsell'],
    predicate: 'P(conversion|product_offer,segment,concept,price_band)',
    contextKeys: ['segment', 'concept', 'price_band', 'last_purchase'],
    baseline: 'top_seller',
    outcomeEvent: 'sale.completed',
    fallbackBehavior:
      'reverts to top_seller when MIND lift is negative or product catalog is incomplete; never recommends out-of-stock items',
  },
  {
    decisionType: 'broadcast_window',
    options: ['now', 'tonight_20h', 'tomorrow_9h', 'friday_21h', 'pause'],
    predicate: 'P(conversion|broadcast_window,channel,segment)',
    contextKeys: ['channel', 'segment', 'weekday', 'fatigue'],
    baseline: 'tomorrow_9h',
    outcomeEvent: 'campaign.converted',
    fallbackBehavior:
      'reverts to tomorrow_9h when fatigue is high or MIND lift is negative; pauses when workspace-wide broadcast limit is exceeded',
  },
  {
    decisionType: 'cart_recovery',
    options: ['proof', 'urgency', 'help', 'faq', 'discount', 'pause'],
    predicate: 'P(payment|cart_recovery_action,channel,price_band)',
    contextKeys: ['channel', 'price_band', 'age_minutes', 'product'],
    baseline: 'help',
    outcomeEvent: 'checkout.paid',
    fallbackBehavior:
      'reverts to help when cart age is fresh (<30m) or MIND lift is negative; pauses when max recovery attempts per cart are exhausted',
  },
  {
    decisionType: 'ad_alert_action',
    options: ['alert_only', 'suggest_pause', 'suggest_budget_down', 'suggest_creative', 'ignore'],
    predicate: 'P(success|ad_alert_action,metric,window)',
    contextKeys: ['metric', 'window', 'threshold', 'campaign'],
    baseline: 'alert_only',
    outcomeEvent: 'campaign.converted',
    fallbackBehavior:
      'reverts to alert_only when confidence is low or ad platform reports stale metrics; never auto-executes budget or creative changes without operator confirmation',
  },
  {
    decisionType: 'autopilot_action',
    options: [
      'send_offer',
      'send_offer_soft',
      'send_price',
      'send_calendar',
      'handover_human',
      'handle_objection',
      'qualify',
      'try_upsell',
      'send_cta',
      'soft_close_night',
      'auto_reply_night',
      'ai_chat',
    ],
    predicate: 'P(success|autopilot_action,intent,stage,channel,hour)',
    contextKeys: ['channel', 'intent', 'stage', 'hour', 'isOptimalTime'],
    baseline: 'legacy_autopilot_action',
    outcomeEvent: 'autopilot.*',
    fallbackBehavior:
      'reverts to the legacy autopilot action baseline when MIND lift is negative with enough samples',
  },
];

export const MIND_DECISION_TYPES = MIND_DECISION_CATALOG.map((spec) => spec.decisionType);

export function findMindDecisionSpec(decisionType: string): MindDecisionSpec | null {
  return MIND_DECISION_CATALOG.find((spec) => spec.decisionType === decisionType) ?? null;
}
