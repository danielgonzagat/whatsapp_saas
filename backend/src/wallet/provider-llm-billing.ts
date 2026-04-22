import { LLM_MAX_COMPLETION_TOKENS } from '../kloel/openai-wrapper';

import {
  estimateOpenAiTextCostFromCharsCents,
  quoteOpenAiTextUsageCostCents,
} from './provider-pricing';

interface OpenAiChatUsageShape {
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  prompt_tokens_details?: {
    cached_tokens?: number | null;
  } | null;
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
