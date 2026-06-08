import OpenAI, { AuthenticationError, APIConnectionError } from 'openai';
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

// --- Provider-level fallback chain (PI-k1) ------------------------------

/** Base URL resolution for a specific provider (deepseek/generic/openai). */
function resolveProviderBaseUrl(
  provider: TextLlmProvider,
  config?: ConfigLike,
): string | undefined {
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

/** API key for a specific provider (deepseek/generic/openai). */
function resolveProviderApiKey(provider: TextLlmProvider, config?: ConfigLike): string | undefined {
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

/**
 * Returns an ordered pool of OpenAI clients — one per configured provider.
 * Order follows env precedence: deepseek > generic > openai.
 * Only providers whose API key is set are included.
 * If no key is set, returns an empty array.
 */
export function createTextLlmClientPool(
  config?: ConfigLike,
  options?: { timeout?: number; maxRetries?: number },
): OpenAI[] {
  const providers: TextLlmProvider[] = ['deepseek', 'generic', 'openai'];
  const pool: OpenAI[] = [];
  for (const provider of providers) {
    const apiKey = resolveProviderApiKey(provider, config);
    if (!apiKey) {
      continue;
    }
    const baseURL = resolveProviderBaseUrl(provider, config);
    pool.push(
      new OpenAI({
        apiKey,
        ...(baseURL !== undefined ? { baseURL } : {}),
        timeout: options?.timeout ?? 60_000,
        maxRetries: options?.maxRetries ?? 0,
      }),
    );
  }
  return pool;
}

/** Error class for when every provider in the pool has been exhausted. */
export class ProviderPoolExhaustedError extends Error {
  constructor(public readonly errors: unknown[]) {
    super('All configured LLM providers exhausted');
    this.name = 'ProviderPoolExhaustedError';
  }
}

/**
 * Tries each client in `pool` in order, catching AuthenticationError
 * and APIConnectionError and advancing to the next provider.
 *
 * @param pool       Ordered list of OpenAI clients (from {@link createTextLlmClientPool}).
 * @param params     Chat completion params (non-streaming).
 * @param fallbackModel  Model name to use on the last provider when the
 *                   primary model fails (same semantics as
 *                   {@link chatCompletionWithFallback}). Optional.
 * @returns The first successful chat completion response.
 * @throws  ProviderPoolExhaustedError when every provider fails.
 */
export async function chatCompletionWithProviderFallback(
  pool: OpenAI[],
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  fallbackModel?: string,
): Promise<OpenAI.Chat.ChatCompletion> {
  if (pool.length === 0) {
    throw new ProviderPoolExhaustedError([]);
  }

  const errors: unknown[] = [];

  for (let i = 0; i < pool.length; i++) {
    const client = pool[i];
    if (client === undefined) {
      continue;
    }
    try {
      return await client.chat.completions.create(params);
    } catch (err: unknown) {
      if (err instanceof AuthenticationError || err instanceof APIConnectionError) {
        errors.push(err);
        const isLast = i === pool.length - 1;
        if (isLast && fallbackModel) {
          try {
            return await client.chat.completions.create({
              ...params,
              model: fallbackModel,
            });
          } catch (fallbackErr: unknown) {
            errors.push(fallbackErr);
            throw new ProviderPoolExhaustedError(errors);
          }
        }
        continue;
      }
      // Non-fallbackable error: surface immediately.
      throw err;
    }
  }

  throw new ProviderPoolExhaustedError(errors);
}
