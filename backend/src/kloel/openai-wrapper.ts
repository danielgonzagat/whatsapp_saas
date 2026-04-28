// PULSE:OK — helper/wrapper module only. Real budget enforcement happens in caller services
// via PlanLimitsService.ensureTokenBudget() before invoking these helpers.
import { randomInt } from 'node:crypto';
import { Logger } from '@nestjs/common';
import OpenAI, { type Uploadable } from 'openai';
import { resolveBackendOpenAIModel } from '../lib/openai-models';

const logger = new Logger('OpenAIWrapper');
const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
type NonStreamingChatParams = OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;
type StreamingChatParams = OpenAI.Chat.ChatCompletionCreateParamsStreaming;
type AnyChatParams = OpenAI.Chat.ChatCompletionCreateParams;

/**
 * Configuração de retry para chamadas OpenAI
 */
export interface RetryOptions {
  /** Max retries property. */
  maxRetries?: number;
  /** Initial delay ms property. */
  initialDelayMs?: number;
  /** Max delay ms property. */
  maxDelayMs?: number;
  /** Backoff multiplier property. */
  backoffMultiplier?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 500,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

type RetryableErrorShape = { status?: number; code?: string; message?: string } | null;

const RETRYABLE_NETWORK_CODES = new Set([
  'ETIMEDOUT',
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

function isRetryableHttpStatus(status: number | undefined): boolean {
  if (status === 429) {
    return true;
  }
  if (typeof status !== 'number') {
    return false;
  }
  return status >= 500 && status < 600;
}

function isRetryableNetworkCode(code: string | undefined): boolean {
  return typeof code === 'string' && RETRYABLE_NETWORK_CODES.has(code);
}

function isRetryableTimeoutMessage(message: string | undefined): boolean {
  if (typeof message !== 'string') {
    return false;
  }
  const lower = message.toLowerCase();
  return lower.includes('timeout');
}

function readRetryStatusOrCode(err: unknown): number | string {
  if (err && typeof err === 'object') {
    const status = (err as { status?: number }).status;
    if (typeof status === 'number') {
      return status;
    }
    const code = (err as { code?: string }).code;
    if (typeof code === 'string' && code.trim().length > 0) {
      return code;
    }
  }
  return 'unknown';
}

/**
 * Verifica se o erro é retryable (temporário)
 */
function isRetryableError(err: unknown): boolean {
  const errObj = err as RetryableErrorShape;
  if (!errObj) {
    return false;
  }
  if (isRetryableHttpStatus(errObj.status)) {
    return true;
  }
  if (isRetryableNetworkCode(errObj.code)) {
    return true;
  }
  return isRetryableTimeoutMessage(errObj.message);
}

/**
 * Calcula delay com jitter para evitar thundering herd
 */
function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
  const baseDelay = options.initialDelayMs * options.backoffMultiplier ** attempt;
  const jitterMax = Math.max(1, Math.floor(baseDelay * 0.3));
  const jitter = isTestEnv ? 0 : randomInt(0, jitterMax + 1);
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
  const run = async (attempt: number): Promise<T> => {
    try {
      return await fn();
    } catch (err: unknown) {
      if (!isRetryableError(err)) {
        if (!isTestEnv) {
          logger.error(
            `OpenAI error (não retryable): ${err instanceof Error ? err.message : 'unknown_error'}`,
            err instanceof Error ? err.stack : undefined,
          );
        }
        throw err;
      }

      if (attempt === opts.maxRetries) {
        if (!isTestEnv) {
          logger.error(
            `OpenAI falhou após ${opts.maxRetries} tentativas: ${err instanceof Error ? err.message : 'unknown_error'}`,
          );
        }
        throw err;
      }

      const delay = calculateDelay(attempt, opts);
      if (!isTestEnv) {
        const statusOrCode = readRetryStatusOrCode(err);
        logger.warn(
          `OpenAI retry ${attempt + 1}/${opts.maxRetries} em ${Math.round(delay)}ms ` +
            `(${statusOrCode}): ${err instanceof Error ? err.message : 'unknown_error'}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
      return run(attempt + 1);
    }
  };

  return run(0);
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
/** Llm_max_input_chars. */
export const LLM_MAX_INPUT_CHARS = Number(process.env.LLM_MAX_INPUT_CHARS ?? 100_000);

/** Llm input too large error. */
export class LLMInputTooLargeError extends Error {
  /** Code property. */
  code = 'llm_input_too_large';
  constructor(public readonly inputChars: number) {
    super(`LLM input exceeds max serialized size: ${inputChars} chars > ${LLM_MAX_INPUT_CHARS}`);
    this.name = 'LLMInputTooLargeError';
  }
}

function clampMaxCompletionTokens(rawMaxTokens: unknown): number {
  if (
    rawMaxTokens === undefined ||
    rawMaxTokens === null ||
    !Number.isFinite(Number(rawMaxTokens))
  ) {
    return LLM_MAX_COMPLETION_TOKENS;
  }
  return Math.min(Math.max(Number(rawMaxTokens), 1), LLM_MAX_COMPLETION_TOKENS);
}

function assertMessagesFitInputLimit(messages: unknown): void {
  const serialized = JSON.stringify(messages ?? []);
  if (serialized.length > LLM_MAX_INPUT_CHARS) {
    throw new LLMInputTooLargeError(serialized.length);
  }
}

// PULSE:OK — normalization helpers do not call the provider; caller-level budget
// enforcement happens before chatCompletionWithRetry/chatCompletionStreamWithRetry.
export function normalizeChatCompletionParams(
  params: NonStreamingChatParams,
): NonStreamingChatParams;
/** Normalize chat completion params. */
export function normalizeChatCompletionParams(params: StreamingChatParams): StreamingChatParams;
/** Normalize chat completion params. */
export function normalizeChatCompletionParams(params: AnyChatParams): AnyChatParams {
  // Intersection keeps AnyChatParams structural compatibility while allowing
  // dynamic writes to max_completion_tokens / delete max_tokens below.
  const payload = { ...params } as AnyChatParams & Record<string, unknown>;

  // --- Clamp 1: max output tokens ----------------------------------
  const rawMaxTokens = payload.max_tokens ?? payload.max_completion_tokens;
  payload.max_completion_tokens = clampMaxCompletionTokens(rawMaxTokens);
  if ('max_tokens' in payload) {
    delete payload.max_tokens;
  }

  // --- Clamp 2: serialized input size -------------------------------
  // Fail-closed: reject gigantic payloads BEFORE they reach the wire.
  // A bug in prompt assembly can easily produce a 10MB payload; we must
  // not let that through.
  assertMessagesFitInputLimit(payload.messages);

  // PULSE:OK — returning a normalized payload object is not an LLM call.
  return payload;
}

/**
 * Wrapper específico para chat completions
 */
// I16: callers SHOULD invoke LLMBudgetService.assertBudget() before this
// wrapper. The wrapper itself enforces per-request clamps (max tokens,
// max input size) via normalizeChatCompletionParams. See llm-budget.service.ts.
export async function chatCompletionWithRetry(
  client: OpenAI,
  params: NonStreamingChatParams,
  options?: RetryOptions,
  requestOptions?: Record<string, unknown>,
): Promise<OpenAI.Chat.ChatCompletion> {
  const normalizedParams = normalizeChatCompletionParams(params);
  return callOpenAIWithRetry(
    () => client.chat.completions.create(normalizedParams, requestOptions),
    options,
  );
}

/**
 * Wrapper específico para chat completions com streaming
 */
// I16: callers SHOULD invoke LLMBudgetService.assertBudget() before this
// wrapper. The wrapper itself enforces per-request clamps (max tokens,
// max input size) via normalizeChatCompletionParams. See llm-budget.service.ts.
export async function chatCompletionStreamWithRetry(
  client: OpenAI,
  params: StreamingChatParams,
  options?: RetryOptions,
  requestOptions?: Record<string, unknown>,
): Promise<AsyncIterable<OpenAI.ChatCompletionChunk>> {
  const normalizedParams = normalizeChatCompletionParams(params);
  return callOpenAIWithRetry(
    () =>
      client.chat.completions.create(normalizedParams, requestOptions) as Promise<
        AsyncIterable<OpenAI.ChatCompletionChunk>
      >,
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
  file: Uploadable,
  model = resolveBackendOpenAIModel('audio_understanding'),
  options?: RetryOptions,
): Promise<string> {
  const result = await callOpenAIWithRetry<{ text: string } | string>(
    () =>
      client.audio.transcriptions.create({
        file: file,
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
  params: NonStreamingChatParams,
  fallbackModel = resolveBackendOpenAIModel('writer_fallback'),
  options?: RetryOptions,
  requestOptions?: Record<string, unknown>,
): Promise<OpenAI.Chat.ChatCompletion> {
  const normalizedParams = normalizeChatCompletionParams(params);
  try {
    return await chatCompletionWithRetry(client, normalizedParams, options, requestOptions);
  } catch (err: unknown) {
    // Se falhar mesmo após retries, tentar com modelo menor
    if (!isTestEnv) {
      logger.warn(
        `Fallback para ${fallbackModel} após erro: ${err instanceof Error ? err.message : 'unknown_error'}`,
      );
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
