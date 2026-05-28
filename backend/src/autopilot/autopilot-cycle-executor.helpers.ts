/**
 * @cluster whatsapp_saas/backend/autopilot
 * Pure helpers extracted from {@link AutopilotCycleExecutorService}.
 *
 * These helpers are deliberately dependency-free (no DI, no Prisma, no
 * OpenAI). Every extraction here was a direct cut/paste of a pure block:
 * - no business-logic tweaks
 * - no rounding changes
 * - no key renames
 *
 * Behavior is preserved 1:1 with the inline implementation. The service
 * delegates to these helpers and keeps its public surface unchanged.
 */
import type { MindJson, MindPolicyOption } from '../kloel/mind.types';

/** Mind policy decisionType used by autopilot. */
export const AUTOPILOT_MIND_DECISION_TYPE = 'autopilot_action';

/** Ordered list of actions the autopilot policy can pick. */
export const AUTOPILOT_ACTIONS = [
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
] as const;

export type AutopilotAction = (typeof AUTOPILOT_ACTIONS)[number];

/** Subset of analysis fields the helpers care about. */
export interface AnalysisShape {
  intent?: string;
  sentiment?: string;
  buyingSignal?: boolean;
  stage?: string;
}

/** Minimal conversation shape the helpers consume — kept narrow on purpose. */
export interface ConversationShape {
  id: string;
  workspaceId: string;
  contact?: { id?: string | null } | null;
  contactId?: string | null;
  messages: Array<{ direction: string; createdAt: Date | null }>;
}

/**
 * Safe coercion of `unknown` into a plain record. Mirrors the inline
 * `readRecord` in the service so the helpers stay drop-in identical.
 */
export function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

/** Returns the night-only action if it applies, else null. */
export function decideNightAction(
  isNight: boolean,
  buyingSignal?: boolean,
): string | null {
  if (!isNight) {
    return null;
  }
  return buyingSignal ? 'soft_close_night' : 'auto_reply_night';
}

/** Returns the offer action if the user shows a buying signal, else null. */
export function decideBuyingAction(
  buyingSignal?: boolean,
  isOptimalTime?: boolean,
): string | null {
  if (!buyingSignal) {
    return null;
  }
  return isOptimalTime ? 'send_offer' : 'send_offer_soft';
}

/** Returns the intent-mapped action, or null when intent is unmapped. */
export function decideIntentAction(intent?: string): string | null {
  const INTENT_ACTION_MAP: Record<string, string> = {
    question_price: 'send_price',
    scheduling: 'send_calendar',
    complaint: 'handover_human',
    objection: 'handle_objection',
  };
  return intent ? (INTENT_ACTION_MAP[intent] ?? null) : null;
}

/** Returns the funnel-stage action, or null when stage is irrelevant. */
export function decideStageAction(
  stage?: string,
  sentiment?: string,
  buyingSignal?: boolean,
): string | null {
  if (stage === 'new') {
    return 'qualify';
  }
  if (stage === 'closing') {
    return sentiment === 'positive' && !buyingSignal ? 'try_upsell' : 'send_cta';
  }
  return null;
}

/** Returns true when the current hour is in the "night" window (>22 or <7). */
export function isNightHour(hour: number): boolean {
  return hour > 22 || hour < 7;
}

/**
 * Picks the baseline autopilot action using the same precedence as the
 * service:
 *   night -> buying -> intent -> stage -> default `ai_chat`.
 */
export function decideActionBaseline(
  analysis: AnalysisShape,
  isOptimalTime: boolean,
  now: Date = new Date(),
): string {
  const { intent, sentiment, buyingSignal, stage } = analysis;
  const hour = now.getHours();
  const night = isNightHour(hour);

  return (
    decideNightAction(night, buyingSignal) ??
    decideBuyingAction(buyingSignal, isOptimalTime) ??
    decideIntentAction(intent) ??
    decideStageAction(stage, sentiment, buyingSignal) ??
    'ai_chat'
  );
}

/** Mind subject string — prefers contactId, falls back to conversationId. */
export function autopilotSubject(conv: ConversationShape): string {
  const contactId = conv.contact?.id ?? conv.contactId ?? null;
  return contactId ? `contact:${contactId}` : `conversation:${conv.id}`;
}

/** Mind outcome dedupe key — workspace + conv + last inbound timestamp. */
export function autopilotOutcomeKey(conv: ConversationShape): string {
  const lastInbound = conv.messages.find((m) => m.direction === 'INBOUND');
  const lastInboundAt =
    lastInbound?.createdAt?.toISOString?.() ?? 'no-inbound';
  return `autopilot_action:${conv.workspaceId}:${conv.id}:${lastInboundAt}`;
}

/** Builds the mind decision context payload (pure: depends only on inputs). */
export function buildMindActionContext(
  analysis: AnalysisShape,
  conv: ConversationShape,
  isOptimalTime: boolean,
  now: Date = new Date(),
): MindJson {
  const lastInbound = conv.messages.find((m) => m.direction === 'INBOUND');
  return {
    channel: 'whatsapp',
    conversationId: conv.id,
    contactId: conv.contact?.id ?? conv.contactId ?? null,
    hour: now.getHours(),
    intent: analysis.intent ?? 'unknown',
    sentiment: analysis.sentiment ?? 'neutral',
    buyingSignal: analysis.buyingSignal === true,
    stage: analysis.stage ?? 'unknown',
    isOptimalTime,
    lastInboundAt: lastInbound?.createdAt?.toISOString?.() ?? null,
  };
}

/** Materializes the option list the mind policy chooses from. */
export function buildMindActionOptions(context: MindJson): MindPolicyOption[] {
  return AUTOPILOT_ACTIONS.map((action) => ({
    action,
    predicate: 'P(success|autopilot_action,intent,stage,channel,hour)',
    context: { ...context, action },
  }));
}

/** Action types that imply commercial generation (need product context). */
const COMMERCIAL_ACTION_TYPES = new Set([
  'offer',
  'offer_soft',
  'price',
  'upsell',
  'lead_unlocker',
]);

/** True when the response type is commercial and needs product context. */
export function isCommercialAction(type: string): boolean {
  return COMMERCIAL_ACTION_TYPES.has(type);
}

/** Maps an action verb to the response generator type. */
export const ACTION_TO_RESPONSE_TYPE: Readonly<Record<string, string>> =
  Object.freeze({
    send_offer: 'offer',
    send_offer_soft: 'offer_soft',
    send_price: 'price',
    follow_up: 'follow_up',
    lead_unlocker: 'lead_unlocker',
    handle_objection: 'objection',
    qualify: 'qualify',
    try_upsell: 'upsell',
    ai_chat: 'chat',
  });

/** Returns the matching response generator type, or null if none. */
export function resolveResponseType(action: string): string | null {
  return ACTION_TO_RESPONSE_TYPE[action] ?? null;
}

/** Hardcoded night-window responses keyed by action. */
export const HARDCODED_NIGHT_RESPONSES: Readonly<Record<string, string>> =
  Object.freeze({
    soft_close_night:
      'Oi! Vi seu interesse. Já deixei tudo preparado para você. Amanhã cedo eu retomo para concluirmos, tudo bem?',
    auto_reply_night:
      'Opa! Agora estou offline, mas já anotei sua dúvida. Amanhã 8h te respondo sem falta!',
  });

/** Returns the hardcoded response for a night action, or null. */
export function resolveHardcodedNightResponse(action: string): string | null {
  return HARDCODED_NIGHT_RESPONSES[action] ?? null;
}

/** Formats a product list line for the LLM prompt — pure string assembly. */
export function formatProductLine(p: {
  name: string;
  price: number;
  currency: string;
  description: string | null;
}): string {
  const currencyPrefix = p.currency === 'BRL' ? 'R$' : `${p.currency} `;
  const priceStr = p.price.toFixed(2);
  const descSuffix = p.description ? ` — ${p.description}` : '';
  return `- ${p.name}: ${currencyPrefix}${priceStr}${descSuffix}`;
}

/** Joins formatted product lines into the prompt-ready product context. */
export function formatProductContext(
  products: Array<{
    name: string;
    price: number;
    currency: string;
    description: string | null;
  }>,
): string {
  return products.map(formatProductLine).join('\n');
}

/** Pure-prompt templates for each response type. */
export const RESPONSE_TEMPLATES: Readonly<Record<string, string>> = Object.freeze(
  {
    offer:
      'Generate an irresistible offer closing for this context. Create Urgency. Keep it short.',
    offer_soft: 'Generate a gentle offer closing. Focus on value, no pressure.',
    price: 'Explain the price/value proposition. Be direct but persuasive.',
    follow_up: 'Re-engage this lead who went silent. Be polite but intriguing.',
    lead_unlocker:
      "The lead disappeared. Send a 'mental trigger' question to unlock them (e.g., 'Did you give up on X?'). Short and punchy.",
    objection: "Overcome the user's objection with empathy and authority.",
    qualify: 'Ask a qualifying question to understand their needs better.',
    upsell: 'Suggest a complementary product or upgrade (Upsell) naturally.',
    chat: "Reply naturally to the user's last message. Be helpful and concise.",
  },
);

/** Returns the template for a response type, defaulting to `chat`. */
export function resolveResponseTemplate(type: string): string {
  return RESPONSE_TEMPLATES[type] ?? RESPONSE_TEMPLATES.chat ?? '';
}
