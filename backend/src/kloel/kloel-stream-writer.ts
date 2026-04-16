// PULSE:OK — stream helper only. KloelService performs PlanLimitsService.ensureTokenBudget()
// before opening any writer stream through this module.
import { Response } from 'express';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import {
  type KloelStreamEvent,
  createKloelContentEvent,
  createKloelStatusEvent,
} from './kloel-stream-events';
import { chatCompletionStreamWithRetry } from './openai-wrapper';

const U2028_U2029_RE = /[<>&\u2028\u2029]/g;
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
  thinkingLabel?: string;
  streamingLabel?: string;
}

const SSE_HEARTBEAT_INTERVAL_MS = Number(process.env.KLOEL_STREAM_HEARTBEAT_MS ?? 10_000);

interface StreamWriterModelResponseResult {
  fullResponse: string;
  estimatedTokens: number;
}

export class KloelStreamWriter {
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private closed = false;

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

    this.startHeartbeat();
  }

  isAborted() {
    return !!this.options.signal?.aborted;
  }

  private isClientDisconnected() {
    return this.options.signal?.aborted && this.options.signal.reason === 'client_disconnected';
  }

  private isResponseClosed() {
    const response = this.res as Response & {
      writableEnded?: boolean;
      destroyed?: boolean;
    };

    return this.closed || response.writableEnded === true || response.destroyed === true;
  }

  private startHeartbeat() {
    if (
      SSE_HEARTBEAT_INTERVAL_MS <= 0 ||
      this.heartbeatInterval ||
      this.isResponseClosed() ||
      this.isClientDisconnected()
    ) {
      return;
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.isResponseClosed() || this.isClientDisconnected()) {
        this.stopHeartbeat();
        return;
      }

      this.writeComment('keepalive');
    }, SSE_HEARTBEAT_INTERVAL_MS);

    this.heartbeatInterval.unref?.();
  }

  private stopHeartbeat() {
    if (!this.heartbeatInterval) return;
    clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
  }

  private writeComment(comment: string) {
    if (this.isResponseClosed() || this.isClientDisconnected()) return;

    try {
      this.res.write(`: ${comment}\n\n`);
      if (typeof (this.res as Response & { flush?: () => void }).flush === 'function') {
        (this.res as Response & { flush?: () => void }).flush?.();
      }
    } catch {
      this.closed = true;
      this.stopHeartbeat();
    }
  }

  write(data: KloelStreamEvent) {
    if (this.isResponseClosed() || this.isClientDisconnected()) return;

    try {
      this.res.write(`data: ${serializeSsePayload(data)}\n\n`);
      if (typeof (this.res as Response & { flush?: () => void }).flush === 'function') {
        (this.res as Response & { flush?: () => void }).flush?.();
      }
    } catch {
      this.closed = true;
      this.stopHeartbeat();
    }
  }

  close() {
    this.stopHeartbeat();
    this.closed = true;

    try {
      this.res.end();
    } catch {
      // ignore
    }
  }

  async streamModelResponse(
    input: StreamWriterModelResponseInput,
  ): Promise<StreamWriterModelResponseResult | null> {
    this.write(createKloelStatusEvent('thinking', input.thinkingLabel));

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
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.options.logger.warn(
        `Writer stream fallback para ${resolveBackendOpenAIModel('writer_fallback')}: ${errorInstanceofError?.message || 'unknown_error'}`,
      );
      stream = await openWriterStream(resolveBackendOpenAIModel('writer_fallback'));
    }

    let fullResponse = '';
    let hasStreamedContent = false;

    const emitAnswerChunk = (content: string) => {
      if (!content) return;
      if (!hasStreamedContent) {
        hasStreamedContent = true;
        this.write(createKloelStatusEvent('streaming_token', input.streamingLabel));
      }

      fullResponse += content;
      this.write(createKloelContentEvent(content));
    };

    for await (const chunk of stream) {
      if (this.isAborted()) {
        if (this.isClientDisconnected()) {
          this.close();
          return null;
        }

        throw new Error(
          typeof this.options.signal?.reason === 'string'
            ? this.options.signal.reason
            : 'stream_aborted',
        );
      }

      const content = chunk.choices[0]?.delta?.content || '';
      if (!content) continue;
      emitAnswerChunk(content);
    }

    return {
      fullResponse,
      estimatedTokens: Math.ceil(fullResponse.length / 4 + 200),
    };
  }
}

function serializeSsePayload(payload: KloelStreamEvent): string {
  return JSON.stringify(payload).replace(U2028_U2029_RE, (char) => {
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
