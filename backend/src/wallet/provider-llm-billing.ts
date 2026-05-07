import { LLM_MAX_COMPLETION_TOKENS } from '../kloel/openai-wrapper';

import {
  estimateOpenAiTextCostFromCharsCents,
  quoteAnthropicTextUsageCostCents,
  quoteOpenAiTextUsageCostCents,
} from './provider-pricing';

interface OpenAiChatUsageShape {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  prompt_tokens_details?: {
    cached_tokens?: number | null;
  } | null;
}

interface AnthropicMessageUsageShape {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

function measureSerializedChars(payload: unknown): number {
  return JSON.stringify(payload ?? '').length;
}

function resolveMaxOutputTokens(raw?: number): number {
  if (Number.isSafeInteger(raw) && Number(raw) >= 0) {
    return Number(raw);
  }

  if (Number.isSafeInteger(LLM_MAX_COMPLETION_TOKENS) && Number(LLM_MAX_COMPLETION_TOKENS) >= 0) {
    return Number(LLM_MAX_COMPLETION_TOKENS);
  }

  return 4096;
}

/** Estimate open ai chat quote cost cents. */
export function estimateOpenAiChatQuoteCostCents(input: {
  model: string;
  messages: unknown;
  maxOutputTokens?: number;
}): bigint {
  return estimateOpenAiTextCostFromCharsCents({
    model: input.model,
    inputChars: measureSerializedChars(input.messages),
    maxOutputTokens: resolveMaxOutputTokens(input.maxOutputTokens),
  });
}

/** Estimate anthropic message quote cost cents. */
export function estimateAnthropicMessageQuoteCostCents(input: {
  model: string;
  system?: unknown;
  messages: unknown;
  maxOutputTokens?: number;
}): bigint {
  const estimatedInputTokens = Math.ceil(
    measureSerializedChars({
      system: input.system,
      messages: input.messages,
    }) / 4,
  );

  return quoteAnthropicTextUsageCostCents({
    model: input.model,
    inputTokens: estimatedInputTokens,
    outputTokens: resolveMaxOutputTokens(input.maxOutputTokens),
  });
}

/** Quote open ai chat actual cost cents. */
export function quoteOpenAiChatActualCostCents(input: {
  model: string;
  usage?: OpenAiChatUsageShape | null;
}): bigint {
  return quoteOpenAiTextUsageCostCents({
    model: input.model,
    inputTokens: input.usage?.prompt_tokens ?? 0,
    cachedInputTokens: input.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    outputTokens: input.usage?.completion_tokens ?? 0,
  });
}

/** Quote anthropic message actual cost cents. */
export function quoteAnthropicMessageActualCostCents(input: {
  model: string;
  usage?: AnthropicMessageUsageShape | null;
}): bigint {
  return quoteAnthropicTextUsageCostCents({
    model: input.model,
    inputTokens: (input.usage?.input_tokens ?? 0) + (input.usage?.cache_creation_input_tokens ?? 0),
    cachedInputTokens: input.usage?.cache_read_input_tokens ?? 0,
    outputTokens: input.usage?.output_tokens ?? 0,
  });
}
