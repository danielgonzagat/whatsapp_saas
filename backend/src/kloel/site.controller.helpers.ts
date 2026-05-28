/**
 * Pure helpers extracted from `site.controller.ts` (Wave 77 Subagent B).
 *
 * Everything here is dependency-free, deterministic, and side-effect-free.
 * `SiteController` keeps only the Nest plumbing (DI, guards, decorators) plus
 * the orchestration glue that touches Prisma / Wallet / fetch.
 *
 * Money path is preserved: cost-estimation and actual-cost quote selection
 * still flow through the same provider-llm-billing primitives — this file
 * only routes/derives them.
 */

import { BRAND_COLORS } from '../common/kloel-colors';
import { DIACRITICS_RE, SLUG_EDGE_HYPHEN_RE } from '../common/regex';
import {
  estimateAnthropicMessageQuoteCostCents,
  estimateOpenAiChatQuoteCostCents,
  quoteAnthropicMessageActualCostCents,
  quoteOpenAiChatActualCostCents,
} from '../wallet/provider-llm-billing';

export type SiteProvider = 'openai' | 'anthropic';

/** Max output tokens for one-shot site generation. */
export const SITE_GENERATION_MAX_OUTPUT_TOKENS = 4096;

/** PT-BR error message returned via HTTP 402 when the wallet has no balance. */
export const INSUFFICIENT_WALLET_MESSAGE =
  'Saldo insuficiente na wallet prepaid para gerar o site. Recarregue via PIX ou aguarde a auto-recarga antes de tentar novamente.';

const SLUG_NON_ALPHANUM_RE = /[^a-z0-9]+/g;

/**
 * Pick which provider to call first based on which keys are configured.
 * Returns `null` when neither key is set.
 */
export function resolveSiteProviderPreference(input: {
  openaiKey: string | undefined | null;
  anthropicKey: string | undefined | null;
}): SiteProvider | null {
  if (input.openaiKey) {
    return 'openai';
  }
  if (input.anthropicKey) {
    return 'anthropic';
  }
  return null;
}

/**
 * Build the system prompt for site generation. Includes the brand palette
 * and, when editing, the prior HTML so the LLM can amend instead of replace.
 */
export function buildSiteSystemPrompt(input: { currentHtml?: string | undefined }): string {
  return [
    'You are a landing page generator. Return ONLY valid HTML (no markdown, no code fences).',
    'The HTML must be a complete, self-contained page with inline CSS.',
    `Use modern design: dark background (${BRAND_COLORS.VOID}), light text (${BRAND_COLORS.SILVER}), accent (${BRAND_COLORS.EMBER}).`,
    input.currentHtml
      ? `The user wants to edit an existing page. Here is the current HTML:\n${input.currentHtml}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Estimate the quote cost for a site-generation request. Returns `undefined`
 * when the provider has no published pricing for the requested model.
 *
 * Throws any pricing error other than unknown-model so the caller can route
 * unexpected billing failures into ops alerts.
 */
export function estimateSiteGenerationQuote(input: {
  providerPreference: SiteProvider;
  model: string;
  systemPrompt: string;
  prompt: string;
}): bigint | undefined {
  if (input.providerPreference === 'openai') {
    return estimateOpenAiChatQuoteCostCents({
      model: input.model,
      messages: [
        { role: 'system', content: input.systemPrompt },
        { role: 'user', content: input.prompt },
      ],
      maxOutputTokens: SITE_GENERATION_MAX_OUTPUT_TOKENS,
    });
  }

  return estimateAnthropicMessageQuoteCostCents({
    model: input.model,
    system: input.systemPrompt,
    messages: [{ role: 'user', content: input.prompt }],
    maxOutputTokens: SITE_GENERATION_MAX_OUTPUT_TOKENS,
  });
}

/** OpenAI chat-completions usage shape used by the actual-cost quoter. */
export type OpenAiSiteUsage = {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  prompt_tokens_details?: { cached_tokens?: number | null } | null;
};

/** Anthropic messages usage shape used by the actual-cost quoter. */
export type AnthropicSiteUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/**
 * Route the post-call usage payload through the correct provider quoter to
 * derive the actual settlement cost.
 */
export function quoteSiteActualCostCents(input: {
  providerPreference: SiteProvider;
  model: string;
  usage: unknown;
}): bigint {
  if (input.providerPreference === 'openai') {
    return quoteOpenAiChatActualCostCents({
      model: input.model,
      usage: input.usage as OpenAiSiteUsage,
    });
  }
  return quoteAnthropicMessageActualCostCents({
    model: input.model,
    usage: input.usage as AnthropicSiteUsage,
  });
}

/**
 * Build the publish slug for a site by name+id. Mirrors the original inline
 * pipeline: lowercase → strip diacritics → collapse non-alphanum to hyphens
 * → trim edge hyphens → suffix first 6 chars of the site id.
 */
export function buildSiteSlug(input: { name: string | null | undefined; id: string }): string {
  const baseSlug = (input.name || 'site')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS_RE, '')
    .replace(SLUG_NON_ALPHANUM_RE, '-')
    .replace(SLUG_EDGE_HYPHEN_RE, '');
  return `${baseSlug}-${input.id.slice(0, 6)}`;
}

/** Build the OpenAI chat-completions request body for site generation. */
export function buildOpenAiSiteRequestBody(input: {
  model: string;
  systemPrompt: string;
  prompt: string;
}): Record<string, unknown> {
  return {
    model: input.model,
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: input.prompt },
    ],
    max_tokens: SITE_GENERATION_MAX_OUTPUT_TOKENS,
    temperature: 0.7,
  };
}

/** Build the Anthropic messages request body for site generation. */
export function buildAnthropicSiteRequestBody(input: {
  model: string;
  systemPrompt: string;
  prompt: string;
}): Record<string, unknown> {
  return {
    model: input.model,
    max_tokens: SITE_GENERATION_MAX_OUTPUT_TOKENS,
    system: input.systemPrompt,
    messages: [{ role: 'user', content: input.prompt }],
  };
}

/** Pick the HTML string out of an OpenAI chat-completions response. */
export function extractOpenAiSiteHtml(result: {
  choices?: Array<{ message?: { content?: string | null } | null }>;
}): string | null {
  return result.choices?.[0]?.message?.content?.trim() || null;
}

/** Pick the HTML string out of an Anthropic messages response. */
export function extractAnthropicSiteHtml(result: {
  content?: Array<{ text?: string | null }>;
}): string | null {
  return result.content?.[0]?.text?.trim() || null;
}

/**
 * Resolve the effective request id from a (possibly absent) idempotency key.
 * Returns the trimmed key when non-empty, otherwise the provided fallback.
 *
 * Decoupled from `randomUUID` so callers (and tests) keep control over the
 * fallback source.
 */
export function resolveSiteRequestId(input: {
  idempotencyKey: string | undefined | null;
  fallback: string;
}): string {
  if (typeof input.idempotencyKey === 'string') {
    const trimmed = input.idempotencyKey.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return input.fallback;
}
