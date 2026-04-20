'use client';

/** Kloel stream phase type. */
export type KloelStreamPhase = 'thinking' | 'streaming' | 'tool_calling' | 'tool_result';

/** Kloel stream thread event shape. */
export interface KloelStreamThreadEvent {
  type: 'thread';
  conversationId: string;
  title?: string;
}

/** Kloel stream status event shape. */
export interface KloelStreamStatusEvent {
  type: 'status';
  phase: KloelStreamPhase;
  label?: string;
  streaming?: boolean;
}

/** Kloel stream content event shape. */
export interface KloelStreamContentEvent {
  type: 'content';
  content: string;
}

/** Kloel stream tool call event shape. */
export interface KloelStreamToolCallEvent {
  type: 'tool_call';
  callId?: string;
  tool: string;
  args?: Record<string, unknown>;
}

/** Kloel stream tool result event shape. */
export interface KloelStreamToolResultEvent {
  type: 'tool_result';
  callId?: string;
  tool: string;
  success?: boolean;
  result?: unknown;
  error?: string;
}

/** Kloel stream done event shape. */
export interface KloelStreamDoneEvent {
  type: 'done';
}

/** Kloel stream error event shape. */
export interface KloelStreamErrorEvent {
  type: 'error';
  error: string;
  content?: string;
  done?: boolean;
}

/** Kloel stream event type. */
export type KloelStreamEvent =
  | KloelStreamThreadEvent
  | KloelStreamStatusEvent
  | KloelStreamContentEvent
  | KloelStreamToolCallEvent
  | KloelStreamToolResultEvent
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
    tool: event.tool,
    success: typeof event.success === 'boolean' ? event.success : undefined,
    result: event.result,
    error: typeof event.error === 'string' ? event.error : undefined,
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

  if (shouldAppendDone(event, events)) {
    events.push({ type: 'done' });
  }

  return events;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
