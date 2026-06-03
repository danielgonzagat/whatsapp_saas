/**
 * Pure helpers extracted from UnifiedAgentService.processMessage (Wave 106).
 *
 * Side-effect free — no Prisma, no HTTP, no logger. Suitable for in-process
 * unit testing without DI. Companion to ./unified-agent.helpers.ts
 * (smaller atoms there: isAllowedTool / formatPromptValue / actionSucceeded).
 *
 * The functions here capture the static prompt strings and the deterministic
 * payload shapes that processMessage feeds to OpenAI and to the agent runtime
 * turn recorder, so prompt drift and payload-shape regressions are caught at
 * unit-test time instead of mid-conversation.
 */

import type { ActionEntry } from './unified-agent.types';
import type { UnknownRecord } from '../common/types';
import { actionSucceeded } from './unified-agent.helpers';

/**
 * Static seed system message planted at the head of every chat completion
 * request. Describes the agent's identity in Portuguese and the boundary
 * "do not invent capabilities".
 *
 * Centralized so a unit test can assert the wording does not silently drift
 * (prompt regressions are otherwise invisible until they reach production).
 */
export const SEED_SYSTEM_MESSAGE_CONTENT =
  'Voce e o assistente comercial Kloel. Suas capacidades dependem do workspace e das ferramentas disponiveis. Use as tools quando o usuario pedir acoes reais. Nao invente capacidades que nao tem. Seja honesto sobre suas limitacoes.';

/**
 * Default cognitive-state preamble line prepended to the workspace/product
 * system prompt. Provides the LLM with a zero-state baseline so it never
 * hallucinates capabilities, memories, beliefs, or predictions before the
 * real cognitiveState payload arrives in the user message.
 */
export const COGNITIVE_STATE_PREAMBLE =
  'COGNITIVE STATE: capabilities.available=[], memory.workingMemory=[], memory.episodicRefs=[], memory.consolidatedRefs=[], beliefs=[], predictions.active=[], readinessTruth.verdict=INSUFFICIENT_EVIDENCE.';

/**
 * Strict English instruction telling the LLM to treat cognitiveState as the
 * exclusive source of truth. Lives here so prompt regressions can be detected
 * at unit-test time and so the wording is not duplicated across call sites.
 */
export const COGNITIVE_STATE_CONTEXT_INSTRUCTION =
  'Your cognitive state (cognitiveState) is your source of truth. You MUST respect it. Your capabilities are LIMITED to what cognitiveState.capabilities.available lists. Your memories are ONLY what cognitiveState.beliefs contains. Your beliefs are ONLY what cognitiveState.beliefs contains. NEVER claim to have capabilities, memories, beliefs, or predictions that are not present in your cognitiveState. If a field is empty, say it is empty.';

/**
 * Default tactical hint emitted when no lead-specific tactical hint can be
 * derived from history.
 */
export const DEFAULT_TACTICAL_HINT = 'responder com clareza, valor concreto e próximo passo.';

/**
 * Confidence score returned when at least one predecided action was executed.
 *
 * Higher than the empty-action default because a successful tool dispatch is a
 * strong signal that the agent took a deterministic, code-native step (versus
 * a bare verbal reply).
 */
export const CONFIDENCE_WITH_ACTIONS = 0.85;

/**
 * Confidence score returned when no predecided actions executed and the LLM
 * produced a bare verbal reply.
 */
export const CONFIDENCE_WITHOUT_ACTIONS = 0.55;

/**
 * Compute the confidence value for the predecided-actions branch of
 * processMessage. Single source of truth so the same constants are referenced
 * for both the `confidence` return field and the recordAgentRuntimeTurn call.
 */
export function confidenceForPredecidedActions(actions: { length: number }): number {
  return actions.length > 0 ? CONFIDENCE_WITH_ACTIONS : CONFIDENCE_WITHOUT_ACTIONS;
}

interface ContactSummary {
  name: string;
  sentiment: string;
  leadScore: string;
  /**
   * Comma-separated tag names (or the literal `'nenhuma'`) as produced by
   * `UnifiedAgentContextService.readTagList`. Kept as a string — not an array
   * — to match the production payload contract that downstream LLM prompts
   * already depend on.
   */
  tags: string;
}

interface ContactSummaryInput {
  /**
   * Best-effort name read from the contact record. May be empty.
   */
  rawName: string;
  /**
   * Best-effort sentiment string read from the contact record. May be empty.
   */
  rawSentiment: string;
  /**
   * Best-effort lead-score string read from the contact record. Defaults to "0".
   */
  rawLeadScore: string;
  /**
   * Pre-rendered tag list — comma-joined string, or `'nenhuma'` when absent.
   * Passed through verbatim into the final payload.
   */
  tags: string;
  /**
   * Fallback identifier shown when the contact has no name (e.g. phone number).
   */
  fallbackIdentifier: string;
}

/**
 * Build the trimmed contact summary embedded into the user payload so the LLM
 * can address the lead and tailor tone. Centralizes the "fall back to phone"
 * and "default sentiment to NEUTRAL" defaults.
 */
export function buildContactSummary(input: ContactSummaryInput): ContactSummary {
  const name = input.rawName.trim() || input.fallbackIdentifier;
  const sentiment = input.rawSentiment.trim() || 'NEUTRAL';
  const leadScore = input.rawLeadScore || '0';
  return {
    name,
    sentiment,
    leadScore,
    tags: input.tags,
  };
}

interface CurrentInput {
  raw: string;
  channel: string;
  arrivalTimestamp: string;
}

/**
 * Build the `currentInput` envelope feeding both the cognitive-state builder
 * and the JSON user payload. Centralizes the ISO timestamp convention so the
 * value is identical in both places and so tests can inject a deterministic
 * timestamp via `now`.
 */
export function buildCurrentInput(params: {
  message: string;
  channel: string;
  now?: () => Date;
}): CurrentInput {
  const arrival = (params.now ?? (() => new Date()))();
  return {
    raw: params.message,
    channel: params.channel,
    arrivalTimestamp: arrival.toISOString(),
  };
}

/**
 * Compose the layered system prompt: cognitive preamble → workspace/product
 * block → agent-runtime injection. Single string is what the LLM sees in the
 * `runtimeContext.workspaceProductContext` field of the user payload.
 */
export function buildLayeredSystemPrompt(parts: {
  workspaceProductBlock: string;
  agentRuntimeBlock: string;
}): string {
  return [COGNITIVE_STATE_PREAMBLE, parts.workspaceProductBlock, parts.agentRuntimeBlock].join(
    '\n\n',
  );
}

interface AgentUserPayloadInput {
  cognitiveState: Record<string, unknown>;
  systemPrompt: string;
  compressedContext: string | null | undefined;
  additionalContext: string;
  tacticalHint: string;
  stylePolicy: string;
  contact: ContactSummary;
  currentInput: CurrentInput;
}

/**
 * Build the deterministic JSON payload sent as the `user` role content to the
 * LLM. Returned as a parsed object so unit tests can assert shape without
 * fighting JSON.stringify ordering; callers serialize with JSON.stringify().
 *
 * Falls the tactical hint back to {@link DEFAULT_TACTICAL_HINT} when the
 * caller passes an empty string.
 */
export function buildAgentUserPayload(input: AgentUserPayloadInput): Record<string, unknown> {
  return {
    contextInstruction: COGNITIVE_STATE_CONTEXT_INSTRUCTION,
    cognitiveState: input.cognitiveState,
    runtimeContext: {
      workspaceProductContext: input.systemPrompt,
      compressedMemory: input.compressedContext || null,
      additionalContext: input.additionalContext,
      tacticalHint: input.tacticalHint || DEFAULT_TACTICAL_HINT,
      responsePolicy: input.stylePolicy,
    },
    contact: {
      name: input.contact.name,
      sentiment: input.contact.sentiment,
      leadScore: input.contact.leadScore,
      tags: input.contact.tags,
    },
    currentInput: input.currentInput,
  };
}

/**
 * Safely parse a tool-call argument string from OpenAI into a plain record.
 *
 * Returns an empty object when the input is empty/undefined OR when the JSON
 * is malformed. Never throws — matches the production behavior at the call
 * site that simply warned and proceeded with empty args.
 *
 * `onParseError` is invoked once per failure so the caller can emit a
 * structured log without re-implementing the try/catch.
 */
export function parseToolArguments(
  rawArguments: string | null | undefined,
  onParseError?: (error: unknown) => void,
): Record<string, unknown> {
  if (!rawArguments) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(rawArguments);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch (err: unknown) {
    if (onParseError) {
      onParseError(err);
    }
    return {};
  }
}

interface TurnOutcomeAction {
  toolName: string;
  success: boolean;
  result?: unknown;
}

/**
 * Map executed actions into the lean shape consumed by the agent runtime turn
 * recorder. `result` is preserved so downstream consumers (analytics, replay)
 * can introspect tool outputs.
 */
export function mapActionsForTurnOutcome(actions: ReadonlyArray<ActionEntry>): TurnOutcomeAction[] {
  return actions.map((action) => ({
    toolName: action.tool,
    success: actionSucceeded(action.result),
    result: action.result,
  }));
}

/**
 * Build the blocked-tool record persisted both in the action list and in the
 * autopilot audit log when a tool is rejected by the allowlist.
 */
export function buildBlockedToolResult(): { blocked: true; reason: 'capability_not_allowed' } {
  return { blocked: true, reason: 'capability_not_allowed' };
}

/**
 * Build a blocked action entry (no args were parsed because we short-circuit
 * before parsing). Kept symmetric with the production code to avoid drift.
 */
export function buildBlockedActionEntry(toolName: string): ActionEntry {
  return {
    tool: toolName,
    args: {},
    result: buildBlockedToolResult(),
  };
}

/**
 * Resolve product identifiers from the loaded product context entries.
 *
 * The context service returns wrapped records where the canonical id may live
 * under `value.id` (Prisma result envelope) or directly on the outer record.
 * This helper centralizes the dual-lookup so the prisma `findMany` filter
 * never receives undefined/empty ids.
 */
export function extractProductIds(
  products: ReadonlyArray<UnknownRecord>,
  readers: {
    readRecord: (value: unknown) => UnknownRecord;
    readOptionalText: (value: unknown) => string | undefined;
  },
): string[] {
  return products
    .map((product) => {
      const productValue = readers.readRecord(product.value);
      return readers.readOptionalText(productValue.id) ?? readers.readOptionalText(product.id);
    })
    .filter((productId): productId is string => Boolean(productId));
}

/**
 * Stable Prisma `select` projection for `productAIConfig.findMany`.
 *
 * Centralized as a const so prompt-context regressions and analytics queries
 * read the exact same set of fields — adding a column here is the one place
 * to touch.
 */
export const PRODUCT_AI_CONFIG_SELECT = {
  id: true,
  productId: true,
  tone: true,
  persistenceLevel: true,
  messageLimit: true,
  customerProfile: true,
  positioning: true,
  objections: true,
  salesArguments: true,
} as const;

/**
 * Maximum number of ProductAIConfig rows pulled per processMessage turn.
 * 50 mirrors the original literal; centralized so a future change is single-site.
 */
export const PRODUCT_AI_CONFIG_BATCH_SIZE = 50 as const;
