export type KloelStreamStatusPhase =
  | 'thinking'
  | 'streaming_token'
  | 'tool_calling'
  | 'tool_result';

export interface KloelThreadEvent {
  type: 'thread';
  conversationId: string;
  title?: string;
  done: false;
}

export interface KloelStatusEvent {
  type: 'status';
  phase: KloelStreamStatusPhase;
  streaming?: boolean;
  message?: string;
  done: false;
}

export interface KloelContentEvent {
  type: 'content';
  content: string;
  done: false;
}

export interface KloelToolCallEvent {
  type: 'tool_call';
  callId: string;
  tool: string;
  args: Record<string, unknown>;
  done: false;
}

export interface KloelToolResultEvent {
  type: 'tool_result';
  callId: string;
  tool: string;
  success: boolean;
  result: unknown;
  error?: string;
  done: false;
}

export interface KloelErrorEvent {
  type: 'error';
  error: string;
  content?: string;
  done: boolean;
}

export interface KloelDoneEvent {
  type: 'done';
  done: true;
}

export type KloelStreamEvent =
  | KloelThreadEvent
  | KloelStatusEvent
  | KloelContentEvent
  | KloelToolCallEvent
  | KloelToolResultEvent
  | KloelErrorEvent
  | KloelDoneEvent;

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

export function createKloelContentEvent(content: string): KloelContentEvent {
  return {
    type: 'content',
    content,
    done: false,
  };
}

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

export function createKloelDoneEvent(): KloelDoneEvent {
  return {
    type: 'done',
    done: true,
  };
}
