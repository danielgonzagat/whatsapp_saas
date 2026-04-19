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

function replaceAssistantInPlace(
  prev: ChatMessage[],
  payload: PrepareSendPayload,
): ChatMessage[] {
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

export function buildPreparedMessages(
  prev: ChatMessage[],
  payload: PrepareSendPayload,
): ChatMessage[] {
  return payload.replaceAssistantId
    ? replaceAssistantInPlace(prev, payload)
    : appendUserThenAssistant(prev, payload);
}

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

export function markAssistantEnded(prev: ChatMessage[], assistantId: string): ChatMessage[] {
  return prev.map((message) =>
    message.id === assistantId ? { ...message, isStreaming: false } : message,
  );
}
