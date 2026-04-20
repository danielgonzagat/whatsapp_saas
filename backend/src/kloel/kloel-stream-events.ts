/** Kloel stream status phase type. */
export type KloelStreamStatusPhase =
  | 'thinking'
  | 'streaming_token'
  | 'tool_calling'
  | 'tool_result';

/** Kloel thread event shape. */
export interface KloelThreadEvent {
  type: 'thread';
  conversationId: string;
  title?: string;
  done: false;
}

/** Kloel status event shape. */
export interface KloelStatusEvent {
  type: 'status';
  phase: KloelStreamStatusPhase;
  streaming?: boolean;
  message?: string;
  done: false;
}

/** Kloel content event shape. */
export interface KloelContentEvent {
  type: 'content';
  content: string;
  done: false;
}

/** Kloel tool call event shape. */
export interface KloelToolCallEvent {
  type: 'tool_call';
  callId: string;
  tool: string;
  args: Record<string, unknown>;
  done: false;
}

/** Kloel tool result event shape. */
export interface KloelToolResultEvent {
  type: 'tool_result';
  callId: string;
  tool: string;
  success: boolean;
  result: unknown;
  error?: string;
  done: false;
}

/** Kloel error event shape. */
export interface KloelErrorEvent {
  type: 'error';
  error: string;
  content?: string;
  done: boolean;
}

/** Kloel done event shape. */
export interface KloelDoneEvent {
  type: 'done';
  done: true;
}

/** Kloel stream event type. */
export type KloelStreamEvent =
  | KloelThreadEvent
  | KloelStatusEvent
  | KloelContentEvent
  | KloelToolCallEvent
  | KloelToolResultEvent
  | KloelErrorEvent
  | KloelDoneEvent;

/** Create kloel thread event. */
export function createKloelThreadEvent(
  conversationId: string,
  title?: string | null,
): KloelThreadEvent {
  return {
    type: 'thread',
    conversationId,
    title: typeof title === 'string' ? title : undefined,
    done: false,
  };
}

/** Create kloel status event. */
export function createKloelStatusEvent(
  phase: KloelStreamStatusPhase,
  message?: string,
): KloelStatusEvent {
  return {
    type: 'status',
    phase,
    streaming: phase === 'streaming_token',
    message,
    done: false,
  };
}

/** Create kloel content event. */
export function createKloelContentEvent(content: string): KloelContentEvent {
  return {
    type: 'content',
    content,
    done: false,
  };
}

/** Create kloel tool call event. */
export function createKloelToolCallEvent(
  callId: string,
  tool: string,
  args: Record<string, unknown>,
): KloelToolCallEvent {
  return {
    type: 'tool_call',
    callId,
    tool,
    args,
    done: false,
  };
}

/** Create kloel tool result event. */
export function createKloelToolResultEvent(input: {
  callId: string;
  tool: string;
  success: boolean;
  result: unknown;
  error?: string;
}): KloelToolResultEvent {
  return {
    type: 'tool_result',
    callId: input.callId,
    tool: input.tool,
    success: input.success,
    result: input.result,
    error: input.error,
    done: false,
  };
}

/** Create kloel error event. */
export function createKloelErrorEvent(input: {
  error: string;
  content?: string;
  done?: boolean;
}): KloelErrorEvent {
  return {
    type: 'error',
    error: input.error,
    content: input.content,
    done: input.done === true,
  };
}

/** Create kloel done event. */
export function createKloelDoneEvent(): KloelDoneEvent {
  return {
    type: 'done',
    done: true,
  };
}
