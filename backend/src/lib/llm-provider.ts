import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';

type ConfigLike = Pick<ConfigService, 'get'> | undefined;

const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

function readConfig(key: string, config?: ConfigLike): string | undefined {
  const fromConfig = config?.get<string>(key);
  const value = typeof fromConfig === 'string' && fromConfig.trim() ? fromConfig : process.env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readFirstConfig(keys: readonly string[], config?: ConfigLike): string | undefined {
  for (const key of keys) {
    const value = readConfig(key, config);
    if (value) {
      return value;
    }
  }
  return undefined;
}

/** Returns true for chat models served by DeepSeek's OpenAI-compatible API. */
export function isDeepSeekChatModel(model: unknown): boolean {
  return typeof model === 'string' && model.trim().toLowerCase().startsWith('deepseek-');
}

/** API key for the primary text LLM provider. */
export function resolveTextLlmApiKey(config?: ConfigLike): string | undefined {
  return readFirstConfig(['DEEPSEEK_API_KEY', 'LLM_API_KEY', 'OPENAI_API_KEY'], config);
}

/** Base URL for the primary text LLM provider. */
export function resolveTextLlmBaseUrl(config?: ConfigLike): string | undefined {
  return readFirstConfig(['DEEPSEEK_BASE_URL', 'LLM_BASE_URL', 'OPENAI_BASE_URL'], config);
}

/** Whether a primary text LLM key is configured. */
export function hasTextLlmApiKey(config?: ConfigLike): boolean {
  return !!resolveTextLlmApiKey(config);
}

/** Create an OpenAI-compatible client for Kloel text/chat completions. */
export function createTextLlmClient(
  config?: ConfigLike,
  options?: { timeout?: number; maxRetries?: number },
): OpenAI | null {
  const apiKey = resolveTextLlmApiKey(config);
  if (!apiKey) {
    return null;
  }
  return new OpenAI({
    apiKey,
    baseURL: resolveTextLlmBaseUrl(config) || DEFAULT_DEEPSEEK_BASE_URL,
    timeout: options?.timeout ?? 60_000,
    maxRetries: options?.maxRetries ?? 0,
  });
}
