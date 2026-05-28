/**
 * Pure helpers extracted from `worker/providers/unified-agent-integrator.ts`
 * so the routing predicates, autopilot setting parsers, and Unified→legacy
 * action mappers can be unit-tested without spinning up the HTTP transport.
 *
 * Keep this module **free of side effects**: no `fetch`, no logger, no
 * environment reads beyond pure string constants. The HTTP entrypoint
 * (`processWithUnifiedAgent`) intentionally remains in the parent module
 * because it has side effects and depends on the shared
 * `resolveBackendUrl()` from `worker/utils/backend-url.helpers.ts`.
 */

const QUESTION_MARK_RE = /\?/g;

// ─── Public types (re-exported by the parent module) ──────────────────

/** Result envelope returned by the backend Unified Agent endpoint. */
export interface UnifiedAgentResult {
  /** Optional direct text response from the agent. */
  response?: string | undefined;
  /** Ordered list of tool invocations the agent decided to perform. */
  actions: Array<{
    /** Tool name (see TOOL_TO_INTENT / TOOL_TO_ACTION). */
    tool: string;
    /** Tool-specific arguments. */
    args: Record<string, unknown>;
    /** Tool execution result, when available. */
    result?: unknown;
  }>;
  /** Model identifier used for the decision, when reported. */
  model?: string | undefined;
}

/** Decision shape produced by {@link mapUnifiedActionsToAutopilot}. */
export interface AutopilotLegacyDecision {
  /** Legacy autopilot intent label. */
  intent: string;
  /** Legacy autopilot action label. */
  action: string;
  /** Free-form decision reason (always prefixed with `unified_agent:` here). */
  reason: string;
  /** Decision confidence in `[0, 1]`. */
  confidence: number;
  /** `true` when one of the actions already sent a message to the contact. */
  alreadyExecuted: boolean;
}

// ─── Keyword corpora ──────────────────────────────────────────────────

/** Heuristic markers that indicate the contact is in a negotiation posture. */
export const NEGOTIATION_KEYWORDS = [
  'desconto',
  'promoção',
  'parcelar',
  'parcela',
  'negociar',
  'melhor preço',
  'consigo menos',
  'tá caro',
  'está caro',
  'caro demais',
  'se eu pagar',
  'à vista',
  'a vista',
] as const;

/** Heuristic markers that indicate the contact is asking product questions. */
export const PRODUCT_KEYWORDS = [
  'como funciona',
  'quanto tempo',
  'garantia',
  'entrega',
  'prazo',
  'inclui',
  'diferença entre',
  'qual a diferença',
  'comparar',
] as const;

// ─── Autopilot setting parsers ─────────────────────────────────────────

/** Optional autopilot block carried inside the workspace settings record. */
export type AutopilotSettings = Record<string, unknown> | null;

/** Agent modes that explicitly disable the Unified Agent path. */
export const AGENT_MODE_DISABLES: ReadonlySet<string> = new Set(['fallback_only', 'local_only']);

/** Agent modes that explicitly require the Unified Agent path. */
export const AGENT_MODE_ENABLES: ReadonlySet<string> = new Set(['primary', 'unified_primary']);

/**
 * Pull the `autopilot` sub-object out of an opaque workspace settings record.
 *
 * @param settings - Workspace settings or `null`.
 * @returns Autopilot settings record or `null` when absent / non-object.
 */
export const extractAutopilotSettings = (
  settings?: Record<string, unknown> | null,
): AutopilotSettings =>
  (settings?.autopilot && typeof settings.autopilot === 'object'
    ? settings.autopilot
    : null) as AutopilotSettings;

/**
 * Map `autopilot.agentMode` to a hard override of the Unified Agent routing.
 *
 * @param autopilot - Autopilot settings block.
 * @returns `false` to disable, `true` to enable, `null` when the mode is
 *   unrecognized (caller should consult other signals).
 */
export const resolveAgentModeOverride = (autopilot: AutopilotSettings): boolean | null => {
  const mode = String(autopilot?.agentMode || '')
    .trim()
    .toLowerCase();
  if (AGENT_MODE_DISABLES.has(mode)) {
    return false;
  }
  if (AGENT_MODE_ENABLES.has(mode)) {
    return true;
  }
  return null;
};

/**
 * Check explicit opt-in / opt-out hints from the autopilot settings, falling
 * back to `agentMode` when neither boolean flag is present.
 *
 * @param autopilot - Autopilot settings block.
 * @returns `true`/`false` when settings force a decision, `null` when undecided.
 */
export const resolveUnifiedAgentSettingOverride = (
  autopilot: AutopilotSettings,
): boolean | null => {
  if (autopilot?.useUnifiedAgent === false) {
    return false;
  }
  if (autopilot?.useUnifiedAgent === true) {
    return true;
  }
  return resolveAgentModeOverride(autopilot);
};

// ─── Content signal predicates ─────────────────────────────────────────

/**
 * Return `true` when `messageContent` carries two or more question marks.
 * Two questions in one message is a strong signal of multi-intent input.
 *
 * @param messageContent - Raw contact message text.
 * @returns `true` when ≥ 2 `?` characters are present.
 */
export const hasEnoughQuestions = (messageContent: string): boolean =>
  (messageContent.match(QUESTION_MARK_RE) || []).length >= 2;

/**
 * Case-sensitive keyword scan. Returns `true` when any keyword in `keywords`
 * appears as a substring of `text`. Caller is responsible for casing.
 *
 * @param text - Haystack string (typically `messageContent.toLowerCase()`).
 * @param keywords - Needle list.
 * @returns `true` when at least one needle is found.
 */
export const matchesAnyKeyword = (text: string, keywords: readonly string[]): boolean =>
  keywords.some((keyword) => text.includes(keyword));

/**
 * Decide whether the message content itself signals a need for the advanced
 * unified agent (long copy, multiple questions, negotiation or product
 * inquiries).
 *
 * @param messageContent - Raw contact message text.
 * @returns `true` when any of the documented signals is present.
 */
export const hasUnifiedAgentContentSignals = (messageContent: string): boolean => {
  if (messageContent.length > 200) {
    return true;
  }
  if (hasEnoughQuestions(messageContent)) {
    return true;
  }
  const text = messageContent.toLowerCase();
  return matchesAnyKeyword(text, NEGOTIATION_KEYWORDS) || matchesAnyKeyword(text, PRODUCT_KEYWORDS);
};

/**
 * Determine whether a message should be routed through the Unified Agent
 * instead of the cheaper local Autopilot path.
 *
 * Decision order:
 *   1. Hard override from autopilot settings.
 *   2. Hot lead heuristic (leadScore ≥ 70).
 *   3. Content signal heuristics.
 *
 * @param params - Routing inputs.
 * @returns `true` when the Unified Agent should handle the message.
 */
export function shouldUseUnifiedAgent(params: {
  /** Raw contact message text. */
  messageContent: string;
  /** Optional lead score in `[0, 100]`. */
  leadScore?: number | undefined;
  /** Workspace settings record (autopilot block is honored). */
  settings?: Record<string, unknown> | null;
}): boolean {
  const { messageContent, leadScore, settings } = params;
  const autopilot = extractAutopilotSettings(settings);

  const override = resolveUnifiedAgentSettingOverride(autopilot);
  if (override !== null) {
    return override;
  }

  // Leads quentes sempre usam o agente unificado
  if (leadScore && leadScore >= 70) {
    return true;
  }

  // PR P4-1: previously this returned `messageContent.trim().length > 0`,
  // which made every preceding heuristic dead code (any non-empty
  // message returned true). The actual intent of this function is
  // "use the unified agent for messages that need it"; if none of
  // the explicit signals above match, return false so the cheaper
  // local autopilot path handles the message.
  return hasUnifiedAgentContentSignals(messageContent);
}

// ─── Unified → legacy Autopilot mappers ────────────────────────────────

/** Mapping from Unified Agent tool names to legacy Autopilot intents. */
export const TOOL_TO_INTENT: Record<string, string> = {
  send_product_info: 'BUYING',
  create_payment_link: 'BUYING',
  apply_discount: 'BUYING',
  handle_objection: 'OBJECTION',
  qualify_lead: 'FOLLOW_UP',
  update_lead_status: 'FOLLOW_UP',
  add_tag: 'FOLLOW_UP',
  schedule_meeting: 'SCHEDULING',
  schedule_followup: 'FOLLOW_UP',
  send_message: 'FOLLOW_UP',
  send_media: 'FOLLOW_UP',
  send_document: 'BUYING',
  send_voice_note: 'VOICE_RESPONSE',
  send_audio: 'VOICE_RESPONSE',
  transfer_to_human: 'SUPPORT',
  search_knowledge_base: 'SUPPORT',
  anti_churn_action: 'CHURN_RISK',
  reactivate_ghost: 'FOLLOW_UP',
  trigger_flow: 'FOLLOW_UP',
  log_event: 'IDLE',
};

/** Mapping from Unified Agent tool names to legacy Autopilot actions. */
export const TOOL_TO_ACTION: Record<string, string> = {
  send_product_info: 'SEND_OFFER',
  create_payment_link: 'SEND_OFFER',
  apply_discount: 'SEND_OFFER',
  handle_objection: 'HANDLE_OBJECTION',
  qualify_lead: 'QUALIFY',
  update_lead_status: 'FOLLOW_UP',
  add_tag: 'FOLLOW_UP',
  schedule_meeting: 'SEND_CALENDAR',
  schedule_followup: 'FOLLOW_UP',
  send_message: 'FOLLOW_UP',
  send_media: 'SEND_OFFER',
  send_document: 'SEND_OFFER',
  send_voice_note: 'SEND_AUDIO',
  send_audio: 'SEND_AUDIO',
  transfer_to_human: 'TRANSFER_AGENT',
  search_knowledge_base: 'FOLLOW_UP',
  anti_churn_action: 'ANTI_CHURN',
  reactivate_ghost: 'GHOST_CLOSER',
  trigger_flow: 'FOLLOW_UP',
  log_event: 'NONE',
};

/** Tools that physically send a message to the contact (no extra dispatch needed). */
export const SENDING_TOOLS: ReadonlySet<string> = new Set([
  'send_message',
  'send_product_info',
  'create_payment_link',
  'send_media',
  'send_document',
  'send_voice_note',
  'send_audio',
]);

/** Default decision returned when the Unified Agent produced no actions. */
export const EMPTY_AUTOPILOT_DECISION: AutopilotLegacyDecision = {
  intent: 'IDLE',
  action: 'NONE',
  reason: 'no_actions_from_unified_agent',
  confidence: 0.5,
  alreadyExecuted: false,
};

/**
 * Translate a Unified Agent action list into the legacy Autopilot decision
 * shape so the existing `executeAction` runtime stays compatible.
 *
 * @param actions - Ordered actions returned by the Unified Agent.
 * @returns Legacy autopilot decision (always populated, never `null`).
 */
export function mapUnifiedActionsToAutopilot(
  actions: UnifiedAgentResult['actions'],
): AutopilotLegacyDecision {
  if (!actions || actions.length === 0) {
    return { ...EMPTY_AUTOPILOT_DECISION };
  }

  // The first tool usually carries the primary intent.
  const tool = actions[0].tool;

  return {
    intent: TOOL_TO_INTENT[tool] || 'FOLLOW_UP',
    action: TOOL_TO_ACTION[tool] || 'FOLLOW_UP',
    reason: `unified_agent:${tool}`,
    confidence: 0.9, // High confidence when the unified agent decides.
    alreadyExecuted: actions.some((action) => SENDING_TOOLS.has(action.tool)),
  };
}

/**
 * Extract the user-visible text response from a Unified Agent envelope.
 * Falls back to the `send_message` tool's `args.message` when no top-level
 * `response` was provided.
 *
 * @param result - Unified Agent envelope.
 * @returns Plain string (empty when neither source provided text).
 */
export function extractTextResponse(result: UnifiedAgentResult): string {
  if (result.response) {
    return result.response;
  }

  const sendMessage = result.actions.find((a) => a.tool === 'send_message');
  if (sendMessage?.args?.message && typeof sendMessage.args.message === 'string') {
    return sendMessage.args.message;
  }

  return '';
}
