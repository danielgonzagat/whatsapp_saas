// Pure helpers extracted from FloatingChat.tsx to reduce the sendMessage
// callback's cyclomatic complexity. Behaviour is byte-identical to the
// original inline implementation.

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  feedback?: 'positive' | 'negative' | null;
  sourceUserId?: string | null;
}

/** Prepare send payload shape. */
export interface PrepareSendPayload {
  text: string;
  assistantId: string;
  sourceUserId: string;
  replaceAssistantId?: string | null;
  appendUserMessage: boolean;
}

function appendUserThenAssistant(prev: ChatMessage[], payload: PrepareSendPayload): ChatMessage[] {
  const next = [...prev];
  if (payload.appendUserMessage) {
    next.push({ id: payload.sourceUserId, role: 'user', content: payload.text });
  }
  next.push({
    id: payload.assistantId,
    role: 'assistant',
    content: '',
    isStreaming: true,
    feedback: null,
    sourceUserId: payload.sourceUserId,
  });
  return next;
}

function replaceAssistantInPlace(prev: ChatMessage[], payload: PrepareSendPayload): ChatMessage[] {
  const next = [...prev];
  if (payload.appendUserMessage) {
    next.push({ id: payload.sourceUserId, role: 'user', content: payload.text });
  }
  return next.map((message) =>
    message.id === payload.replaceAssistantId
      ? {
          ...message,
          role: 'assistant',
          content: '',
          isStreaming: true,
          feedback: null,
          sourceUserId: payload.sourceUserId,
        }
      : message,
  );
}

/** Build prepared messages. */
export function buildPreparedMessages(
  prev: ChatMessage[],
  payload: PrepareSendPayload,
): ChatMessage[] {
  return payload.replaceAssistantId
    ? replaceAssistantInPlace(prev, payload)
    : appendUserThenAssistant(prev, payload);
}

/** Mark assistant error. */
export function markAssistantError(
  prev: ChatMessage[],
  assistantId: string,
  fallback: string,
): ChatMessage[] {
  return prev.map((message) =>
    message.id === assistantId && message.role === 'assistant'
      ? { ...message, content: message.content || fallback, isStreaming: false }
      : message,
  );
}

/** Mark assistant ended. */
export function markAssistantEnded(prev: ChatMessage[], assistantId: string): ChatMessage[] {
  return prev.map((message) =>
    message.id === assistantId ? { ...message, isStreaming: false } : message,
  );
}

/** Guest sse payload shape. */
export interface GuestSsePayload {
  sessionId?: string;
  content?: unknown;
  chunk?: unknown;
  delta?: unknown;
}

/** Parse guest sse line. */
export function parseGuestSseLine(line: string): GuestSsePayload | null {
  if (!line.startsWith('data: ')) {
    return null;
  }
  try {
    return JSON.parse(line.slice(6)) as GuestSsePayload;
  } catch {
    return null;
  }
}

/** Pick guest chunk. */
export function pickGuestChunk(payload: GuestSsePayload): string {
  const candidate = payload.content ?? payload.chunk ?? payload.delta ?? '';
  return typeof candidate === 'string' ? candidate : String(candidate ?? '');
}

/** Append assistant content. */
export function appendAssistantContent(
  prev: ChatMessage[],
  assistantId: string,
  fullContent: string,
): ChatMessage[] {
  return prev.map((message) =>
    message.id === assistantId && message.role === 'assistant'
      ? { ...message, content: fullContent }
      : message,
  );
}

/** Persist guest session. */
export function persistGuestSession(storageKey: string, sessionId: string): void {
  try {
    localStorage.setItem(storageKey, sessionId);
  } catch {
    // localStorage unavailable in private tabs / SSR - fallback silently.
  }
}
