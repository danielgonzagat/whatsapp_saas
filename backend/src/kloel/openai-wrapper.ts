import { Logger } from '@nestjs/common';
import OpenAI from 'openai';

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
          logger.error(
            `OpenAI falhou após ${opts.maxRetries} tentativas: ${err.message}`,
          );
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
export async function chatCompletionWithRetry(
  client: OpenAI,
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  options?: RetryOptions,
  requestOptions?: any,
): Promise<OpenAI.Chat.ChatCompletion> {
  return callOpenAIWithRetry(
    () => client.chat.completions.create(params, requestOptions),
    options,
  );
}

/**
 * Wrapper para embeddings
 */
export async function embeddingsWithRetry(
  client: OpenAI,
  params: OpenAI.Embeddings.EmbeddingCreateParams,
  options?: RetryOptions,
): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> {
  return callOpenAIWithRetry(
    () => client.embeddings.create(params),
    options,
  );
}

/**
 * Wrapper para TTS (text-to-speech)
 */
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
export async function transcribeWithRetry(
  client: OpenAI,
  file: any,
  model = 'whisper-1',
  options?: RetryOptions,
): Promise<string> {
  const result = await callOpenAIWithRetry<any>(
    () => client.audio.transcriptions.create({
      file,
      model,
      response_format: 'text',
    }),
    options,
  );
  return typeof result === 'string' ? result : (result as any).text;
}

/**
 * Fallback para modelo menor em caso de falha do modelo principal
 */
export async function chatCompletionWithFallback(
  client: OpenAI,
  params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming,
  fallbackModel = 'gpt-4o-mini',
  options?: RetryOptions,
  requestOptions?: any,
): Promise<OpenAI.Chat.ChatCompletion> {
  try {
    return await chatCompletionWithRetry(client, params, options, requestOptions);
  } catch (err: any) {
    // Se falhar mesmo após retries, tentar com modelo menor
    if (!isTestEnv) {
      logger.warn(`Fallback para ${fallbackModel} após erro: ${err.message}`);
    }
    
    return chatCompletionWithRetry(
      client,
      { ...params, model: fallbackModel },
      { ...options, maxRetries: 1 }, // Menos retries no fallback
      requestOptions,
    );
  }
}
