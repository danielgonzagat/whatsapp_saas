/**
 * Pure helpers extracted from {@link LeadMindCoordinator}.
 *
 * Everything here is dependency-free (no Prisma, no Nest, no LLM) so it can be
 * unit-tested without mocks. The service keeps its impure orchestration; this
 * module owns the deterministic logic (autopilot gating, lead update payload
 * shaping, product matching, response formatting).
 *
 * Wave Claude-w119 — refactor(kloel/lead-mind): extract pure helpers.
 *
 * @cluster Mind/Coordination
 */
import type { Prisma } from '@prisma/client';

import { asProviderSettings } from '../../../marketing/channels/whatsapp/provider-settings.types';
import { asUnknownRecord, safeStr } from '../../kloel-lead-processor-helpers';
import type { BuyIntent } from './lead-mind-coordinator.types';

/** Default fallback message returned when the LLM produces an empty reply. */
export const LEAD_DEFAULT_GREETING = 'Olá! Como posso ajudá-lo hoje?';

/** Default reply returned when the unified-agent autopilot path returns no text. */
export const LEAD_AUTOPILOT_FALLBACK = 'Olá! Como posso ajudar?';

/** Default reply surfaced after a top-level error inside the processing loop. */
export const LEAD_TECH_ERROR_REPLY =
  'Olá! Tive um pequeno problema técnico. Pode repetir sua mensagem?';

/** Autonomy modes that unlock unattended autopilot replies. */
const AUTOPILOT_AUTONOMY_MODES = new Set(['LIVE', 'BACKLOG', 'FULL']);

/**
 * Decide whether autopilot is active for a workspace based on its raw
 * `providerSettings` payload (`Prisma.JsonValue` at the storage layer).
 * Mirrors the legacy in-line check inside
 * `LeadMindCoordinator.processWhatsAppMessage`.
 *
 * Order of precedence (any one is enough):
 *   1. `autonomy.mode` is one of LIVE / BACKLOG / FULL.
 *   2. `autopilot.enabled === true`.
 *   3. `autopilotEnabled === true` (legacy top-level flag).
 */
export function isAutopilotEnabled(providerSettings: unknown): boolean {
  const settings = asProviderSettings(providerSettings);
  const autonomyMode = safeStr(asUnknownRecord(settings.autonomy)?.mode).toUpperCase();
  if (AUTOPILOT_AUTONOMY_MODES.has(autonomyMode)) {
    return true;
  }
  if (asUnknownRecord(settings.autopilot)?.enabled === true) {
    return true;
  }
  return settings.autopilotEnabled === true;
}

/**
 * Pick the first non-empty reply text returned by the unified agent. Mirrors
 * the legacy `unifiedResult?.reply || unifiedResult?.response || 'Olá! …'`
 * pattern so the orchestrator can stay one-liner thin.
 */
export function pickUnifiedAgentReply(
  result: { reply?: string | null; response?: string | null } | null | undefined,
): string {
  if (result?.reply) {
    return result.reply;
  }
  if (result?.response) {
    return result.response;
  }
  return LEAD_AUTOPILOT_FALLBACK;
}

/**
 * Build the Prisma update payload for a lead based on the freshly observed
 * user message. Encodes the score/stage mutation rules that used to live
 * inside `LeadMindCoordinator.updateLeadFromConversation`.
 */
export function buildLeadUpdateData(
  userMessage: string,
  buyIntent: BuyIntent,
  now: Date = new Date(),
): Prisma.KloelLeadUpdateManyMutationInput {
  const updateData: Prisma.KloelLeadUpdateManyMutationInput = {
    lastMessage: userMessage,
    lastIntent: buyIntent,
    updatedAt: now,
  };
  if (buyIntent === 'high') {
    updateData.score = { increment: 20 };
    updateData.stage = 'negotiation';
  } else if (buyIntent === 'medium') {
    updateData.score = { increment: 10 };
    updateData.stage = 'interested';
  } else if (buyIntent === 'objection') {
    updateData.stage = 'objection';
  }
  return updateData;
}

/** Minimal candidate shape consumed by {@link findProductMatch}. */
export type ProductMatchCandidate = {
  /** Display name of the product (case-insensitive needle). */
  name: string;
  /** Price already coerced into a number (cents or units, opaque to matcher). */
  price: number;
};

/** Memory record shape used by the kloelMemory product search. */
export type ProductMemoryValue = {
  name?: string;
  price?: number;
  [key: string]: unknown;
};

/**
 * Lower-case a message once and find the first product whose name is mentioned
 * inside it. Returns `null` when nothing matches. Empty / whitespace-only
 * names are skipped to avoid spurious full-string matches.
 */
export function findProductMatch(
  message: string,
  candidates: ReadonlyArray<ProductMatchCandidate>,
): ProductMatchCandidate | null {
  const lower = message.toLowerCase();
  for (const product of candidates) {
    const name = product.name.toLowerCase().trim();
    if (!name) {
      continue;
    }
    if (lower.includes(name)) {
      return product;
    }
  }
  return null;
}

/**
 * Normalize a `kloelMemory` row payload (`{ value: ProductMemoryValue }`)
 * into a {@link ProductMatchCandidate}. Returns `null` when the record lacks
 * a usable name.
 */
export function productCandidateFromMemory(
  value: ProductMemoryValue | null | undefined,
): ProductMatchCandidate | null {
  const name = safeStr(value?.name);
  if (!name) {
    return null;
  }
  const priceRaw = Number(value?.price);
  const price = Number.isFinite(priceRaw) ? priceRaw : 0;
  return { name, price };
}

/**
 * Build the `currentInput` envelope used as the LLM user content when the ABI
 * builder is unavailable. Stable JSON ordering keeps the shape diff-friendly.
 */
export function buildFallbackCognitiveContent(input: {
  abiStatus: 'unavailable_or_invalid' | 'builder_not_injected';
  workspaceContext: string;
  channel: string;
  message: string;
  arrivalTimestamp: string;
  audience?: string;
}): string {
  return JSON.stringify({
    cognitiveState: {
      abiStatus: input.abiStatus,
      audience: input.audience ?? 'public',
      workspaceContext: input.workspaceContext,
      perceptionSnapshot: { channel: input.channel },
    },
    currentInput: {
      raw: input.message,
      channel: input.channel,
      arrivalTimestamp: input.arrivalTimestamp,
    },
  });
}

/**
 * Build the LLM user content from a validated ABI payload + workspace context.
 * The `abi` value is serialized as-is — callers must ensure it is JSON-safe.
 */
export function buildAbiCognitiveContent(input: {
  abi: unknown;
  workspaceContext: string;
  channel: string;
  message: string;
  arrivalTimestamp: string;
}): string {
  return JSON.stringify({
    cognitiveState: input.abi,
    workspaceContext: input.workspaceContext,
    currentInput: {
      raw: input.message,
      channel: input.channel,
      arrivalTimestamp: input.arrivalTimestamp,
    },
  });
}

/**
 * Format the WhatsApp reply that accompanies a freshly generated payment
 * link. The Portuguese copy mirrors what `LeadMindCoordinator.processWhatsApp`
 * used to produce.
 */
export function formatPaymentReply(baseResponse: string, paymentUrl: string): string {
  return `${baseResponse}\n\nAqui está o link para finalizar sua compra:\n${paymentUrl}`;
}

/**
 * Compose the default lead-creation payload used by `getOrCreateLead`. Kept
 * separate so the suffix-derived name can be unit-tested independently of
 * Prisma.
 */
export function buildNewLeadName(phone: string): string {
  return `Lead ${phone.slice(-4)}`;
}

/** Compose the default contact-name fallback used when upserting a contact. */
export function buildContactDisplayName(phone: string): string {
  return `Contato ${phone.slice(-4)}`;
}

/**
 * Decide whether an LLM response is "short" enough that the orchestrator
 * should log a warning. Empty / whitespace-only / under-5-char replies count.
 */
export function isShortLlmOutput(raw: string): boolean {
  return !raw || raw.trim().length < 5;
}

/**
 * Pick the LLM reply text, falling back to the canonical Portuguese greeting
 * when the model returned nothing usable.
 */
export function pickKloelReply(raw: string): string {
  return raw || LEAD_DEFAULT_GREETING;
}

/**
 * Extract a safe, secret-free error message from an `unknown` thrown value.
 * Falls back to `'unknown error'` for non-Error throws (legacy default).
 */
export function leadErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error';
}
