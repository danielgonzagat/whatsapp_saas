// before opening any writer stream through this module.
import { Response } from 'express';
import OpenAI from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources/chat';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import {
  type KloelStreamEvent,
  createKloelAssistantVisibleTextStreamFilter,
  createKloelContentEvent,
  createKloelStatusEvent,
  createKloelReasoningDeltaEvent,
  createKloelReasoningDoneEvent,
  createKloelDoneEvent,
} from './kloel-stream-events';
import { chatCompletionStreamWithRetry } from './openai-wrapper';
import { KloelLLME2EGuard } from './kloel-llm-e2e-guard';

const U2028_U2029_RE = /[<>&\u2028\u2029]/g;
type ChatCompletionStream = AsyncIterable<OpenAI.ChatCompletionChunk>;

const FENCED_BLOCK_G_RE = /```([a-zA-Z0-9_+-]*)[^\S\r\n]*\r?\n([\s\S]*?)```/g;
const TRAILING_WS_G_RE = /\s+$/;
const DIACRITICS_G_RE = /[̀-ͯ]/g;
const NON_SLUG_G_RE = /[^a-zA-Z0-9]+/g;
const EDGE_DASH_G_RE = /^-+|-+$/g;
const FILE_HEADING_RE = /^\s*#{1,3}\s+(.+)$/m;

interface DeliverableFileKind {
  ext: string;
  mime: string;
  label: string;
}

const FILE_KIND_BY_LANG: Record<string, DeliverableFileKind> = {
  markdown: { ext: 'md', mime: 'text/markdown', label: 'Documento' },
  md: { ext: 'md', mime: 'text/markdown', label: 'Documento' },
  html: { ext: 'html', mime: 'text/html', label: 'Página HTML' },
  svg: { ext: 'svg', mime: 'image/svg+xml', label: 'Imagem SVG' },
  csv: { ext: 'csv', mime: 'text/csv', label: 'Planilha CSV' },
  json: { ext: 'json', mime: 'application/json', label: 'Dados JSON' },
  mermaid: { ext: 'mmd', mime: 'text/plain', label: 'Diagrama' },
  yaml: { ext: 'yaml', mime: 'text/plain', label: 'Configuração' },
  yml: { ext: 'yml', mime: 'text/plain', label: 'Configuração' },
  sql: { ext: 'sql', mime: 'text/plain', label: 'Script SQL' },
  python: { ext: 'py', mime: 'text/x-python', label: 'Código Python' },
  py: { ext: 'py', mime: 'text/x-python', label: 'Código Python' },
  javascript: { ext: 'js', mime: 'text/javascript', label: 'Código JavaScript' },
  js: { ext: 'js', mime: 'text/javascript', label: 'Código JavaScript' },
  typescript: { ext: 'ts', mime: 'text/plain', label: 'Código TypeScript' },
  ts: { ext: 'ts', mime: 'text/plain', label: 'Código TypeScript' },
  tsx: { ext: 'tsx', mime: 'text/plain', label: 'Componente React' },
  jsx: { ext: 'jsx', mime: 'text/javascript', label: 'Componente React' },
  bash: { ext: 'sh', mime: 'text/x-sh', label: 'Script Shell' },
  sh: { ext: 'sh', mime: 'text/x-sh', label: 'Script Shell' },
};

const DEFAULT_FILE_KIND: DeliverableFileKind = {
  ext: 'txt',
  mime: 'text/plain',
  label: 'Documento',
};
const MIN_DELIVERABLE_CHARS = 280;
const MAX_DELIVERABLE_CARDS = 3;

function slugifyFileBase(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(DIACRITICS_G_RE, '')
    .replace(NON_SLUG_G_RE, '-')
    .replace(EDGE_DASH_G_RE, '')
    .toLowerCase()
    .slice(0, 48);
  return slug || 'documento';
}

export interface DeliverableFileCard {
  name: string;
  meta: string;
  downloadUrl: string;
}

/**
 * Detect substantial fenced document/code blocks in a completed answer and turn
 * each into a downloadable file card (data: URL). FIRST producer for the
 * already-built file-event pipeline. Honest: only real blocks become cards;
 * small inline snippets (< MIN_DELIVERABLE_CHARS) are ignored.
 */
export function detectDeliverableFileCards(answer: string): DeliverableFileCard[] {
  const source = String(answer || '');
  const cards: DeliverableFileCard[] = [];
  const seen = new Set<string>();
  FENCED_BLOCK_G_RE.lastIndex = 0;
  let match = FENCED_BLOCK_G_RE.exec(source);
  while (match && cards.length < MAX_DELIVERABLE_CARDS) {
    const lang = String(match[1] || '').toLowerCase();
    const content = String(match[2] || '').replace(TRAILING_WS_G_RE, '');
    match = FENCED_BLOCK_G_RE.exec(source);
    if (content.trim().length < MIN_DELIVERABLE_CHARS) {
      continue;
    }
    const dedupeKey = content.slice(0, 160);
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    const kind = FILE_KIND_BY_LANG[lang] || DEFAULT_FILE_KIND;
    const headingMatch = content.match(FILE_HEADING_RE);
    const base = headingMatch
      ? slugifyFileBase(headingMatch[1] || '')
      : `documento-${cards.length + 1}`;
    const base64 = Buffer.from(content, 'utf-8').toString('base64');
    cards.push({
      name: `${base}.${kind.ext}`,
      meta: `${kind.label} · ${kind.ext.toUpperCase()}`,
      downloadUrl: `data:${kind.mime};charset=utf-8;base64,${base64}`,
    });
  }
  return cards;
}

interface KloelStreamWriterOptions {
  signal?: AbortSignal;
  logger: {
    warn(message: string): void;
  };
  llmE2EGuard?: KloelLLME2EGuard;
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

/** Kloel stream writer. */
export class KloelStreamWriter {
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  // Tracks whether a terminal SSE event (`done` or `error`) has been written.
  // The frontend stream reader releases its in-flight lock ONLY on a terminal
  // event; a bare socket close (res.end) without one leaves the chat wedged
  // ("Perdi acesso ao motor de conversa"). close() uses this to guarantee a
  // terminal `done` is always emitted before the socket is ended.
  private terminalSent = false;

  constructor(
    private readonly res: Response,
    private readonly options: KloelStreamWriterOptions,
  ) {}

  /** Init. */
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

  /** Is aborted. */
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
    if (!this.heartbeatInterval) {
      return;
    }
    clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = null;
  }

  private writeComment(comment: string) {
    if (this.isResponseClosed() || this.isClientDisconnected()) {
      return;
    }

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

  /** Write. */
  write(data: KloelStreamEvent) {
    if (this.isResponseClosed() || this.isClientDisconnected()) {
      return;
    }

    if (data.type === 'done' || data.type === 'error') {
      this.terminalSent = true;
    }

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

  /** Close. */
  close() {
    this.stopHeartbeat();

    // Terminal-event guarantee: if the caller is ending the stream without
    // having emitted a `done` or `error` event, synthesize a terminal `done`
    // here BEFORE res.end(). Without this, a bare socket close leaves the
    // frontend's isReplyInFlight flag stuck true (silent no-op on every next
    // send) until its 300s watchdog fires. Best-effort: a write failure here
    // must never prevent the socket from being ended.
    if (!this.terminalSent && !this.isResponseClosed() && !this.isClientDisconnected()) {
      this.terminalSent = true;
      try {
        this.res.write(`data: ${serializeSsePayload(createKloelDoneEvent())}\n\n`);
        if (typeof (this.res as Response & { flush?: () => void }).flush === 'function') {
          (this.res as Response & { flush?: () => void }).flush?.();
        }
      } catch {
        // ignore — proceed to end the socket regardless
      }
    }

    this.closed = true;

    try {
      this.res.end();
    } catch {
      // ignore
    }
  }

  /** Stream model response. */
  async streamModelResponse(
    input: StreamWriterModelResponseInput,
  ): Promise<StreamWriterModelResponseResult | null> {
    // Flip the UI into the thinking phase WITHOUT a synthesized label — the model's
    // real reasoning now streams as reasoning_delta below. If the provider emits no
    // reasoning, no reasoning text is shown (honest: no fabricated chain-of-thought).
    this.write(createKloelStatusEvent('thinking'));

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
        this.options.signal ? { signal: this.options.signal } : undefined,
      );

    // already-budgeted chatCompletionStreamWithRetry() invocation above.
    let stream: ChatCompletionStream;

    if (this.options.llmE2EGuard?.isEnabled()) {
      stream = this.options.llmE2EGuard.buildStream(input.writerMessages);
    } else {
      try {
        stream = await openWriterStream(resolveBackendOpenAIModel('writer'));
      } catch (error: unknown) {
        this.options.logger.warn(
          `Writer stream fallback para ${resolveBackendOpenAIModel('writer_fallback')}: ${error instanceof Error ? error.message : 'unknown_error'}`,
        );
        stream = await openWriterStream(resolveBackendOpenAIModel('writer_fallback'));
      }
    }

    let fullResponse = '';
    let hasStreamedContent = false;
    const visibleTextFilter = createKloelAssistantVisibleTextStreamFilter();
    let reasoningStartedAt = 0;
    let reasoningEmitted = false;
    let reasoningDoneEmitted = false;

    const emitAnswerChunk = (content: string) => {
      if (!content) {
        return;
      }
      if (!hasStreamedContent) {
        hasStreamedContent = true;
        this.write(createKloelStatusEvent('streaming_token'));
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

      const delta = chunk.choices[0]?.delta as
        | { content?: string; reasoning_content?: string }
        | undefined;

      // Real reasoning passthrough: DeepSeek reasoner streams its chain-of-thought
      // as delta.reasoning_content (gated by DEEPSEEK_THINKING=enabled via
      // normalizeChatCompletionParams). We forward each piece as a reasoning_delta
      // so the ReasoningTimeline renders the model's actual reasoning, never a
      // fabricated label.
      const reasoningPiece =
        typeof delta?.reasoning_content === 'string' ? delta.reasoning_content : '';
      if (reasoningPiece) {
        if (!reasoningEmitted) {
          reasoningEmitted = true;
          reasoningStartedAt = Date.now();
        }
        this.write(createKloelReasoningDeltaEvent(reasoningPiece));
      }

      const content = delta?.content || '';
      if (!content) {
        continue;
      }
      if (reasoningEmitted && !reasoningDoneEmitted) {
        reasoningDoneEmitted = true;
        this.write(createKloelReasoningDoneEvent(Date.now() - reasoningStartedAt));
      }
      emitAnswerChunk(visibleTextFilter.push(content));
    }

    emitAnswerChunk(visibleTextFilter.flush());

    // Deliverable artifacts: any substantial fenced document/code block in the
    // completed answer becomes a downloadable file card. The file-event pipeline
    // already exists end-to-end (the frontend renders the card with "Baixar");
    // this is its first producer. Honest: only real blocks emit cards.
    for (const fileCard of detectDeliverableFileCards(fullResponse)) {
      this.write({
        type: 'file',
        name: fileCard.name,
        meta: fileCard.meta,
        downloadUrl: fileCard.downloadUrl,
        done: false,
      });
    }

    return {
      fullResponse,
      estimatedTokens: Math.ceil(fullResponse.length / 4 + 200),
    };
  }
}
