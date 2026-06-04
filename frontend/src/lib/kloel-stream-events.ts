'use client';

/** Kloel stream phase type. */
export type KloelStreamPhase = 'thinking' | 'streaming' | 'tool_calling' | 'tool_result';

/** Kloel stream thread event shape. */
export interface KloelStreamThreadEvent {
  /** Type property. */
  type: 'thread';
  /** Conversation id property. */
  conversationId: string;
  /** Title property. */
  title?: string | undefined;
}

/** Kloel stream status event shape. */
export interface KloelStreamStatusEvent {
  /** Type property. */
  type: 'status';
  /** Phase property. */
  phase: KloelStreamPhase;
  /** Label property. */
  label?: string | undefined;
  /** Streaming property. */
  streaming?: boolean | undefined;
}

/** Kloel stream content event shape. */
export interface KloelStreamContentEvent {
  /** Type property. */
  type: 'content';
  /** Content property. */
  content: string;
}

/** Kloel stream tool call event shape. */
export interface KloelStreamToolCallEvent {
  /** Type property. */
  type: 'tool_call';
  /** Call id property. */
  callId?: string | undefined;
  /** Span id property. */
  spanId?: string | undefined;
  /** Tool property. */
  tool: string;
  /** Args property. */
  args?: Record<string, unknown> | undefined;
}

/** Kloel stream tool result event shape. */
export interface KloelStreamToolResultEvent {
  /** Type property. */
  type: 'tool_result';
  /** Call id property. */
  callId?: string | undefined;
  /** Span id property. */
  spanId?: string | undefined;
  /** Tool property. */
  tool: string;
  /** Success property. */
  success?: boolean | undefined;
  /** Result property. */
  result?: unknown | undefined;
  /** Error property. */
  error?: string | undefined;
  /** Artifact id property. */
  artifactId?: string | undefined;
  /** Duration ms property. */
  durationMs?: number | undefined;
}

/** Kloel stream done event shape. */
export interface KloelStreamDoneEvent {
  /** Type property. */
  type: 'done';
  /** Metadata property. */
  metadata?: Record<string, unknown>;
}

/** Kloel stream error event shape. */
export interface KloelStreamErrorEvent {
  /** Type property. */
  type: 'error';
  /** Error property. */
  error: string;
  /** Content property. */
  content?: string | undefined;
  /** Done property. */
  done?: boolean | undefined;
}

/** Kloel stream reasoning summary event shape. */
export interface KloelStreamReasoningSummaryEvent {
  /** Type property. */
  type: 'reasoning_summary';
  /** Text property. */
  text: string;
}

/** Kloel stream reasoning delta event shape. */
export interface KloelStreamReasoningDeltaEvent {
  /** Type property. */
  type: 'reasoning_delta';
  /** Text property. */
  text: string;
}

/** Kloel stream reasoning done event shape. */
export interface KloelStreamReasoningDoneEvent {
  /** Type property. */
  type: 'reasoning_done';
  /** Duration ms property. */
  durationMs: number;
}

/** Kloel stream file event shape. */
export interface KloelStreamFileEvent {
  /** Type property. */
  type: 'file';
  /** Name property. */
  name: string;
  /** Meta property. */
  meta?: string | undefined;
  /** Url property. */
  url?: string | undefined;
  /** Download url property. */
  downloadUrl?: string | undefined;
}

/** Kloel stream event type. */
export type KloelStreamEvent =
  | KloelStreamThreadEvent
  | KloelStreamStatusEvent
  | KloelStreamContentEvent
  | KloelStreamToolCallEvent
  | KloelStreamToolResultEvent
  | KloelStreamReasoningSummaryEvent
  | KloelStreamReasoningDeltaEvent
  | KloelStreamReasoningDoneEvent
  | KloelStreamFileEvent
  | KloelStreamDoneEvent
  | KloelStreamErrorEvent;

function normalizePhase(raw: unknown): KloelStreamPhase | null {
  switch (String(raw || '').trim()) {
    case 'thinking':
      return 'thinking';
    case 'streaming':
    case 'streaming_token':
      return 'streaming';
    case 'tool_calling':
      return 'tool_calling';
    case 'tool_result':
      return 'tool_result';
    default:
      return null;
  }
}

function tryAppendThread(event: Record<string, unknown>, events: KloelStreamEvent[]): void {
  const hasConversationId = typeof event.conversationId === 'string';
  if (!hasConversationId) {
    return;
  }
  if (event.type !== 'thread' && !hasConversationId) {
    return;
  }
  events.push({
    type: 'thread',
    conversationId: event.conversationId as string,
    title: typeof event.title === 'string' ? event.title : undefined,
  });
}

function tryAppendStatus(event: Record<string, unknown>, events: KloelStreamEvent[]): void {
  const normalizedPhase = normalizePhase(event.phase);
  if (event.type !== 'status' || !normalizedPhase) {
    return;
  }
  events.push({
    type: 'status',
    phase: normalizedPhase,
    label: typeof event.message === 'string' ? event.message : undefined,
    streaming: event.streaming === true || normalizedPhase === 'streaming',
  });
}

function tryAppendToolCall(event: Record<string, unknown>, events: KloelStreamEvent[]): void {
  if (event.type !== 'tool_call' || typeof event.tool !== 'string') {
    return;
  }
  events.push({
    type: 'tool_call',
    callId: typeof event.callId === 'string' ? event.callId : undefined,
    spanId: typeof event.spanId === 'string' ? event.spanId : undefined,
    tool: event.tool,
    args: isRecord(event.args) ? event.args : undefined,
  });
}

function tryAppendToolResult(event: Record<string, unknown>, events: KloelStreamEvent[]): void {
  if (event.type !== 'tool_result' || typeof event.tool !== 'string') {
    return;
  }
  events.push({
    type: 'tool_result',
    callId: typeof event.callId === 'string' ? event.callId : undefined,
    spanId: typeof event.spanId === 'string' ? event.spanId : undefined,
    tool: event.tool,
    success: typeof event.success === 'boolean' ? event.success : undefined,
    result: event.result,
    error: typeof event.error === 'string' ? event.error : undefined,
    artifactId: typeof event.artifactId === 'string' ? event.artifactId : undefined,
    durationMs: typeof event.durationMs === 'number' ? event.durationMs : undefined,
  });
}

function tryAppendContent(event: Record<string, unknown>, events: KloelStreamEvent[]): void {
  if (typeof event.content !== 'string' || event.content.length === 0) {
    return;
  }
  events.push({
    type: 'content',
    content: event.content,
  });
}

function tryAppendError(event: Record<string, unknown>, events: KloelStreamEvent[]): void {
  if (typeof event.error !== 'string' || event.error.length === 0) {
    return;
  }
  events.push({
    type: 'error',
    error: event.error,
    content:
      typeof event.content === 'string' && event.content.length > 0 ? event.content : undefined,
    done: event.done === true,
  });
}

function tryAppendReasoningSummary(
  event: Record<string, unknown>,
  events: KloelStreamEvent[],
): void {
  if (
    event.type !== 'reasoning_summary' ||
    typeof event.text !== 'string' ||
    event.text.length === 0
  ) {
    return;
  }
  events.push({ type: 'reasoning_summary', text: event.text });
}

function tryAppendReasoningDelta(
  event: Record<string, unknown>,
  events: KloelStreamEvent[],
): void {
  if (
    event.type !== 'reasoning_delta' ||
    typeof event.text !== 'string' ||
    event.text.length === 0
  ) {
    return;
  }
  events.push({ type: 'reasoning_delta', text: event.text });
}

function tryAppendReasoningDone(
  event: Record<string, unknown>,
  events: KloelStreamEvent[],
): void {
  if (event.type !== 'reasoning_done' || typeof event.durationMs !== 'number') {
    return;
  }
  events.push({ type: 'reasoning_done', durationMs: event.durationMs });
}

function tryAppendFile(event: Record<string, unknown>, events: KloelStreamEvent[]): void {
  if (event.type !== 'file' || typeof event.name !== 'string' || event.name.length === 0) {
    return;
  }
  events.push({
    type: 'file',
    name: event.name,
    meta: typeof event.meta === 'string' ? event.meta : undefined,
    url: typeof event.url === 'string' ? event.url : undefined,
    downloadUrl: typeof event.downloadUrl === 'string' ? event.downloadUrl : undefined,
  });
}

function shouldAppendDone(event: Record<string, unknown>, events: KloelStreamEvent[]): boolean {
  const isDoneSignal = event.type === 'done' || event.done === true;
  if (!isDoneSignal) {
    return false;
  }
  if (events.some((entry) => entry.type === 'done')) {
    return false;
  }
  if (events.some((entry) => entry.type === 'error')) {
    return false;
  }
  return true;
}

/** Parse kloel stream payload. */
export function parseKloelStreamPayload(payload: unknown): KloelStreamEvent[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const event = payload as Record<string, unknown>;
  const events: KloelStreamEvent[] = [];

  tryAppendThread(event, events);
  tryAppendStatus(event, events);
  tryAppendToolCall(event, events);
  tryAppendToolResult(event, events);
  tryAppendContent(event, events);
  tryAppendError(event, events);
  tryAppendReasoningSummary(event, events);
  tryAppendReasoningDelta(event, events);
  tryAppendReasoningDone(event, events);
  tryAppendFile(event, events);

  if (shouldAppendDone(event, events)) {
    const metadata = isRecord(event.metadata) ? event.metadata : undefined;
    events.push({ type: 'done', ...(metadata !== undefined ? { metadata } : {}) });
  }

  return events;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
