// PULSE:OK — stream helper only. KloelService performs PlanLimitsService.ensureTokenBudget()
// before opening any writer stream through this module.
import { Response } from 'express';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { chatCompletionStreamWithRetry } from './openai-wrapper';
import {
  createKloelContentEvent,
  createKloelStatusEvent,
  type KloelStreamEvent,
} from './kloel-stream-events';
type ChatCompletionStream = AsyncIterable<OpenAI.ChatCompletionChunk>;

interface KloelStreamWriterOptions {
  signal?: AbortSignal;
  logger: {
    warn(message: string): void;
  };
}

interface StreamWriterModelResponseInput {
  openai: OpenAI;
  writerMessages: ChatCompletionMessageParam[];
  temperature: number;
  responseMaxTokens: number;
}

export interface StreamWriterModelResponseResult {
  fullResponse: string;
  estimatedTokens: number;
}

export class KloelStreamWriter {
  constructor(
    private readonly res: Response,
    private readonly options: KloelStreamWriterOptions,
  ) {}

  init() {
    this.res.setHeader('Content-Type', 'text/event-stream');
    this.res.setHeader('Cache-Control', 'no-cache');
    this.res.setHeader('Connection', 'keep-alive');
    this.res.setHeader('Access-Control-Allow-Origin', '*');
    this.res.setHeader('X-Accel-Buffering', 'no');

    if (typeof (this.res as Response & { flushHeaders?: () => void }).flushHeaders === 'function') {
      (this.res as Response & { flushHeaders?: () => void }).flushHeaders?.();
    }
  }

  isAborted() {
    return !!this.options.signal?.aborted;
  }

  write(data: KloelStreamEvent) {
    if (this.isAborted()) return;

    try {
      this.res.write(`data: ${serializeSsePayload(data)}\n\n`);
      if (typeof (this.res as Response & { flush?: () => void }).flush === 'function') {
        (this.res as Response & { flush?: () => void }).flush?.();
      }
    } catch {
      // ignore
    }
  }

  close() {
    try {
      this.res.end();
    } catch {
      // ignore
    }
  }

  async streamModelResponse(
    input: StreamWriterModelResponseInput,
  ): Promise<StreamWriterModelResponseResult | null> {
    this.write(createKloelStatusEvent('thinking', 'Kloel está pensando'));

    // PULSE:OK — caller (KloelService.think) runs PlanLimitsService.ensureTokenBudget()
    // before delegating to the stream writer; this helper only opens the already-approved stream.
    const openWriterStream = async (model: string) =>
      chatCompletionStreamWithRetry(
        input.openai,
        {
          model,
          messages: input.writerMessages,
          stream: true,
          temperature: input.temperature,
          top_p: 0.95,
          frequency_penalty: 0.3,
          presence_penalty: 0.2,
          max_tokens: input.responseMaxTokens,
        },
        { maxRetries: 2, initialDelayMs: 300 },
        this.options.signal
          ? ({ signal: this.options.signal } as { signal: AbortSignal })
          : undefined,
      );

    // PULSE:OK — stream object itself is not a new LLM call; it is the handle returned by the
    // already-budgeted chatCompletionStreamWithRetry() invocation above.
    let stream: ChatCompletionStream;

    try {
      stream = await openWriterStream(resolveBackendOpenAIModel('writer'));
    } catch (error: any) {
      this.options.logger.warn(
        `Writer stream fallback para ${resolveBackendOpenAIModel('writer_fallback')}: ${error?.message || 'unknown_error'}`,
      );
      stream = await openWriterStream(resolveBackendOpenAIModel('writer_fallback'));
    }

    let fullResponse = '';
    let hasStreamedContent = false;

    for await (const chunk of stream) {
      if (this.isAborted()) {
        this.close();
        return null;
      }

      const content = chunk.choices[0]?.delta?.content || '';
      if (!content) continue;

      if (!hasStreamedContent) {
        hasStreamedContent = true;
        this.write(createKloelStatusEvent('streaming_token', 'Kloel está respondendo'));
      }

      fullResponse += content;
      this.write(createKloelContentEvent(content));
    }

    return {
      fullResponse,
      estimatedTokens: Math.ceil(fullResponse.length / 4 + 200),
    };
  }
}

function serializeSsePayload(payload: KloelStreamEvent): string {
  return JSON.stringify(payload).replace(/[<>&\u2028\u2029]/g, (char) => {
    switch (char) {
      case '<':
        return '\\u003c';
      case '>':
        return '\\u003e';
      case '&':
        return '\\u0026';
      case '\u2028':
        return '\\u2028';
      case '\u2029':
        return '\\u2029';
      default:
        return char;
    }
  });
}
