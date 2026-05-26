import OpenAI from 'openai';
import type {
  ChatCompletionMessage,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import { resolveWorkerOpenAIModel } from './openai-models';

/**
 * =====================================================================
 * AI PROVIDER — WRAPPER SIMPLIFICADO
 * =====================================================================
 *
 * Hardened 2026-05-26 per WAVE3_LLM_PROMPT_AUDIT critical gap #1: this
 * generic worker wrapper previously had ZERO guardrails (no retry, no
 * max_tokens, no fallback, no logging) — every caller inherited every
 * gap. Now caps `max_tokens` to a safe default and retries transient
 * OpenAI failures up to 3 times with exponential backoff.
 */

/** Safe default `max_tokens` for any worker LLM call. Callers can override. */
const DEFAULT_WORKER_MAX_TOKENS = 1500;

/** Transient-error retry policy (3 attempts, 250ms / 500ms / 1000ms backoff). */
const RETRY_ATTEMPTS = 3;
const RETRY_BACKOFFS_MS = [250, 500, 1000];

function isTransient(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const e = error as { status?: number; code?: string; message?: string };
  // Rate limit, server error, network blip
  if (e.status && (e.status === 429 || (e.status >= 500 && e.status < 600))) {
    return true;
  }
  if (e.code && /ETIMEDOUT|ECONNRESET|ENOTFOUND|ECONNREFUSED|EAI_AGAIN/.test(e.code)) {
    return true;
  }
  if (
    e.message &&
    /timeout|rate limit|temporarily|overloaded|service unavailable/i.test(e.message)
  ) {
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AIProvider {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  private resolveModel(modelOrRole?: string): string {
    switch (modelOrRole) {
      case 'brain':
      case 'brain_fallback':
      case 'writer':
      case 'writer_fallback':
      case 'audio_understanding':
      case 'audio_understanding_fallback':
        return resolveWorkerOpenAIModel(modelOrRole);
      default:
        return modelOrRole || resolveWorkerOpenAIModel('writer');
    }
  }

  /** Generate response. */
  async generateResponse(
    systemPrompt: string,
    userMessage: string,
    model = 'writer',
  ): Promise<string> {
    const msg = await this.generateChatResponse(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      model,
    );
    return msg?.content || '';
  }

  // Backward compat helper used by some processors
  async generateText(prompt: string, model = 'writer'): Promise<string> {
    const msg = await this.generateChatResponse([{ role: 'user', content: prompt }], model);
    return msg?.content || '';
  }

  /** Generate chat response. Capped to DEFAULT_WORKER_MAX_TOKENS and
   *  retried on transient OpenAI failures (429 / 5xx / network blips). */
  async generateChatResponse(
    messages: ChatCompletionMessageParam[],
    model = 'writer',
    tools?: OpenAI.ChatCompletionTool[],
  ): Promise<ChatCompletionMessage> {
    const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      messages,
      model: this.resolveModel(model),
      max_tokens: DEFAULT_WORKER_MAX_TOKENS,
    };

    if (tools && tools.length > 0) {
      params.tools = tools;
      params.tool_choice = 'auto';
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      try {
        const completion = await this.openai.chat.completions.create(params);
        return completion.choices[0].message;
      } catch (error) {
        lastError = error;
        if (attempt < RETRY_ATTEMPTS - 1 && isTransient(error)) {
          console.warn(
            `AIProvider transient error (attempt ${attempt + 1}/${RETRY_ATTEMPTS}):`,
            error instanceof Error ? error.message : String(error),
          );
          await sleep(RETRY_BACKOFFS_MS[attempt] ?? 1000);
          continue;
        }
        console.error('Erro na AI:', error);
        throw error;
      }
    }
    throw lastError;
  }
}
