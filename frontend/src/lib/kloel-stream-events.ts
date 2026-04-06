'use client';

export type KloelStreamPhase = 'thinking' | 'streaming' | 'tool_calling' | 'tool_result';

export interface KloelStreamThreadEvent {
  type: 'thread';
  conversationId: string;
  title?: string;
}

export interface KloelStreamStatusEvent {
  type: 'status';
  phase: KloelStreamPhase;
  label?: string;
  streaming?: boolean;
}

export interface KloelStreamContentEvent {
  type: 'content';
  content: string;
}

export interface KloelStreamToolCallEvent {
  type: 'tool_call';
  callId?: string;
  tool: string;
  args?: Record<string, unknown>;
}

export interface KloelStreamToolResultEvent {
  type: 'tool_result';
  callId?: string;
  tool: string;
  success?: boolean;
  result?: unknown;
  error?: string;
}

export interface KloelStreamDoneEvent {
  type: 'done';
}

export interface KloelStreamErrorEvent {
  type: 'error';
  error: string;
  content?: string;
  done?: boolean;
}

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

export function parseKloelStreamPayload(payload: unknown): KloelStreamEvent[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const event = payload as Record<string, unknown>;
  const events: KloelStreamEvent[] = [];

  if (
    (event.type === 'thread' || typeof event.conversationId === 'string') &&
    typeof event.conversationId === 'string'
  ) {
    events.push({
      type: 'thread',
      conversationId: event.conversationId,
      title: typeof event.title === 'string' ? event.title : undefined,
    });
  }

  const normalizedPhase = normalizePhase(event.phase);
  if (event.type === 'status' && normalizedPhase) {
    events.push({
      type: 'status',
      phase: normalizedPhase,
      label: typeof event.message === 'string' ? event.message : undefined,
      streaming: event.streaming === true || normalizedPhase === 'streaming',
    });
  }

  if (event.type === 'tool_call' && typeof event.tool === 'string') {
    events.push({
      type: 'tool_call',
      callId: typeof event.callId === 'string' ? event.callId : undefined,
      tool: event.tool,
      args: isRecord(event.args) ? event.args : undefined,
    });
  }

  if (event.type === 'tool_result' && typeof event.tool === 'string') {
    events.push({
      type: 'tool_result',
      callId: typeof event.callId === 'string' ? event.callId : undefined,
      tool: event.tool,
      success: typeof event.success === 'boolean' ? event.success : undefined,
      result: event.result,
      error: typeof event.error === 'string' ? event.error : undefined,
    });
  }

  if (typeof event.content === 'string' && event.content.length > 0) {
    events.push({
      type: 'content',
      content: event.content,
    });
  }

  if (typeof event.error === 'string' && event.error.length > 0) {
    events.push({
      type: 'error',
      error: event.error,
      content:
        typeof event.content === 'string' && event.content.length > 0 ? event.content : undefined,
      done: event.done === true,
    });
  }

  if (
    (event.type === 'done' || event.done === true) &&
    !events.some((entry) => entry.type === 'done') &&
    !events.some((entry) => entry.type === 'error')
  ) {
    events.push({ type: 'done' });
  }

  return events;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
