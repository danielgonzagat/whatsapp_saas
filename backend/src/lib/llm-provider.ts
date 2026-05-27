import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';

type ConfigLike = Pick<ConfigService, 'get'> | undefined;

export type TextLlmProvider = 'deepseek' | 'generic' | 'openai';

const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1';

/** Reads a string env/ConfigService value with trim+fallback semantics.
 *  Exported so peer lib/* helpers (openai-models, ...) share the same
 *  config-read precedence (ConfigService → process.env → undefined). */
export function readConfig(key: string, config?: ConfigLike): string | undefined {
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

/** Provider selected for primary text LLM calls, based on key precedence. */
export function resolveTextLlmProvider(config?: ConfigLike): TextLlmProvider | null {
  if (readConfig('DEEPSEEK_API_KEY', config)) {
    return 'deepseek';
  }
  if (readConfig('LLM_API_KEY', config)) {
    return 'generic';
  }
  if (readConfig('OPENAI_API_KEY', config)) {
    return 'openai';
  }
  return null;
}

/** API key for the primary text LLM provider. */
export function resolveTextLlmApiKey(config?: ConfigLike): string | undefined {
  const provider = resolveTextLlmProvider(config);
  if (provider === 'deepseek') {
    return readConfig('DEEPSEEK_API_KEY', config);
  }
  if (provider === 'generic') {
    return readConfig('LLM_API_KEY', config);
  }
  if (provider === 'openai') {
    return readConfig('OPENAI_API_KEY', config);
  }
  return undefined;
}

/** Base URL for the primary text LLM provider. */
function resolveTextLlmBaseUrl(config?: ConfigLike): string | undefined {
  const provider = resolveTextLlmProvider(config);
  if (provider === 'deepseek') {
    return (
      readFirstConfig(['DEEPSEEK_BASE_URL', 'LLM_BASE_URL'], config) || DEFAULT_DEEPSEEK_BASE_URL
    );
  }
  if (provider === 'generic') {
    return (
      readFirstConfig(['LLM_BASE_URL', 'DEEPSEEK_BASE_URL'], config) || DEFAULT_DEEPSEEK_BASE_URL
    );
  }
  if (provider === 'openai') {
    return readConfig('OPENAI_BASE_URL', config);
  }
  return undefined;
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
  const baseURL = resolveTextLlmBaseUrl(config);
  return new OpenAI({
    apiKey,
    ...(baseURL !== undefined ? { baseURL } : {}),
    timeout: options?.timeout ?? 60_000,
    maxRetries: options?.maxRetries ?? 0,
  });
}
