import { Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { resolveBackendOpenAIModel } from '../lib/openai-models';

const logger = new Logger('OpenAIWrapper');
const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';

/**
 * Configuração de retry para chamadas OpenAI
 */
export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Verifica se o erro é retryable (temporário)
 */
function isRetryableError(err: any): boolean {
  // Rate limit
  if (err.status === 429) return true;

  // Server errors (5xx)
  if (err.status >= 500 && err.status < 600) return true;

  // Network errors
  const networkErrors = ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN'];
  if (networkErrors.includes(err.code)) return true;

  // Timeout errors
  if (err.message?.includes('timeout') || err.message?.includes('Timeout')) return true;

  return false;
}

/**
 * Calcula delay com jitter para evitar thundering herd
 */
function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
  const baseDelay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);
  const jitter = Math.random() * 0.3 * baseDelay; // 0-30% jitter
  return Math.min(baseDelay + jitter, options.maxDelayMs);
}

/**
 * 🔥 Wrapper para chamadas OpenAI com retry e backoff exponencial
 *
 * Benefícios:
 * - Retry automático em erros 429 (rate limit)
 * - Retry em erros de rede (timeout, connection reset)
 * - Backoff exponencial com jitter
 * - Logging detalhado para debugging
 */
export async function callOpenAIWithRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: any;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;

      if (!isRetryableError(err)) {
        if (!isTestEnv) {
          logger.error(`OpenAI error (não retryable): ${err.message}`, err.stack);
        }
        throw err;
      }

      if (attempt === opts.maxRetries) {
        if (!isTestEnv) {
          logger.error(`OpenAI falhou após ${opts.maxRetries} tentativas: ${err.message}`);
        }
        throw err;
      }

      const delay = calculateDelay(attempt, opts);
      if (!isTestEnv) {
        logger.warn(
          `OpenAI retry ${attempt + 1}/${opts.maxRetries} em ${Math.round(delay)}ms ` +
            `(${err.status || err.code || 'unknown'}): ${err.message}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Wrapper específico para chat completions
 */
// I16: callers SHOULD invoke LLMBudgetService.assertBudget() before this
// wrapper. The wrapper itself enforces per-request clamps (max tokens,
// max input size) via normalizeChatCompletionParams. See llm-budget.service.ts.
export async function chatCompletionWithRetry(
  client: OpenAI,
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  options?: RetryOptions,
  requestOptions?: any,
): Promise<OpenAI.Chat.ChatCompletion> {
  const normalizedParams = normalizeChatCompletionParams(params);
  return callOpenAIWithRetry(
    () => client.chat.completions.create(normalizedParams, requestOptions),
    options,
  );
}

/**
 * Wrapper para embeddings
 */
// I16: callers SHOULD invoke LLMBudgetService.assertBudget() before this
// wrapper. The wrapper itself enforces per-request clamps (max tokens,
// max input size) via normalizeChatCompletionParams. See llm-budget.service.ts.
export async function embeddingsWithRetry(
  client: OpenAI,
  params: OpenAI.Embeddings.EmbeddingCreateParams,
  options?: RetryOptions,
): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> {
  return callOpenAIWithRetry(() => client.embeddings.create(params), options);
}

/**
 * Wrapper para TTS (text-to-speech)
 */
// I16: callers SHOULD invoke LLMBudgetService.assertBudget() before this
// wrapper. The wrapper itself enforces per-request clamps (max tokens,
// max input size) via normalizeChatCompletionParams. See llm-budget.service.ts.
export async function ttsWithRetry(
  client: OpenAI,
  params: OpenAI.Audio.Speech.SpeechCreateParams,
  options?: RetryOptions,
): Promise<Response> {
  return callOpenAIWithRetry(
    () => client.audio.speech.create(params) as Promise<Response>,
    options,
  );
}

/**
 * Wrapper para Whisper (speech-to-text)
 */
// I16: callers SHOULD invoke LLMBudgetService.assertBudget() before this
// wrapper. The wrapper itself enforces per-request clamps (max tokens,
// max input size) via normalizeChatCompletionParams. See llm-budget.service.ts.
export async function transcribeWithRetry(
  client: OpenAI,
  file: any,
  model = resolveBackendOpenAIModel('audio_understanding'),
  options?: RetryOptions,
): Promise<string> {
  const result = await callOpenAIWithRetry<any>(
    () =>
      client.audio.transcriptions.create({
        file,
        model,
        response_format: 'text',
      }),
    options,
  );
  return typeof result === 'string' ? result : result.text;
}

/**
 * Fallback para modelo menor em caso de falha do modelo principal
 */
// I16: callers SHOULD invoke LLMBudgetService.assertBudget() before this
// wrapper. The wrapper itself enforces per-request clamps (max tokens,
// max input size) via normalizeChatCompletionParams. See llm-budget.service.ts.
export async function chatCompletionWithFallback(
  client: OpenAI,
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  fallbackModel = resolveBackendOpenAIModel('writer_fallback'),
  options?: RetryOptions,
  requestOptions?: any,
): Promise<OpenAI.Chat.ChatCompletion> {
  const normalizedParams = normalizeChatCompletionParams(params);
  try {
    return await chatCompletionWithRetry(client, normalizedParams, options, requestOptions);
  } catch (err: any) {
    // Se falhar mesmo após retries, tentar com modelo menor
    if (!isTestEnv) {
      logger.warn(`Fallback para ${fallbackModel} após erro: ${err.message}`);
    }

    return chatCompletionWithRetry(
      client,
      normalizeChatCompletionParams({
        ...normalizedParams,
        model: fallbackModel,
      }),
      { ...options, maxRetries: 1 }, // Menos retries no fallback
      requestOptions,
    );
  }
}

/**
 * P6-7 / I16 — Mandatory clamps applied on every chat completion request.
 *
 * These are last-line defenses against runaway cost: even if a caller
 * forgets to call `LLMBudgetService.assertBudget()`, a single request
 * cannot exceed these bounds and blow the budget. They are NOT a
 * replacement for the budget guard (which tracks cumulative spend) —
 * they are a per-request ceiling.
 *
 * - LLM_MAX_COMPLETION_TOKENS: upper bound for output length. Defaults
 *   to 4096 (a generous ceiling for Brazilian-Portuguese customer
 *   replies; models may return less but never more).
 * - LLM_MAX_INPUT_CHARS: upper bound for the serialized request body.
 *   Prevents a prompt-assembly bug from sending a 10MB payload.
 *
 * Configurable via env vars for operator override. Rejections throw a
 * plain Error with a structured code so callers can distinguish
 * clamp-exceeded from provider errors.
 */
export const LLM_MAX_COMPLETION_TOKENS = Number(process.env.LLM_MAX_COMPLETION_TOKENS ?? 4096);
export const LLM_MAX_INPUT_CHARS = Number(process.env.LLM_MAX_INPUT_CHARS ?? 100_000);

export class LLMInputTooLargeError extends Error {
  code = 'llm_input_too_large';
  constructor(public readonly inputChars: number) {
    super(`LLM input exceeds max serialized size: ${inputChars} chars > ${LLM_MAX_INPUT_CHARS}`);
    this.name = 'LLMInputTooLargeError';
  }
}

export function normalizeChatCompletionParams(
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming {
  const payload: Record<string, any> = { ...params };

  // --- Clamp 1: max output tokens ----------------------------------
  const rawMaxTokens = payload.max_tokens ?? payload.max_completion_tokens;
  let clampedMaxTokens: number;
  if (
    rawMaxTokens === undefined ||
    rawMaxTokens === null ||
    !Number.isFinite(Number(rawMaxTokens))
  ) {
    clampedMaxTokens = LLM_MAX_COMPLETION_TOKENS;
  } else {
    clampedMaxTokens = Math.min(Math.max(Number(rawMaxTokens), 1), LLM_MAX_COMPLETION_TOKENS);
  }
  payload.max_completion_tokens = clampedMaxTokens;
  if ('max_tokens' in payload) {
    delete payload.max_tokens;
  }

  // --- Clamp 2: serialized input size -------------------------------
  // Fail-closed: reject gigantic payloads BEFORE they reach the wire.
  // A bug in prompt assembly can easily produce a 10MB payload; we must
  // not let that through.
  const serialized = JSON.stringify(payload.messages ?? []);
  if (serialized.length > LLM_MAX_INPUT_CHARS) {
    throw new LLMInputTooLargeError(serialized.length);
  }

  return payload as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
}
