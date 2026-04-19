// Pure helpers extracted from chat-container.tsx to reduce cyclomatic
// complexity on the SSE reader path. Behaviour is byte-identical to the
// original inline implementation.

export interface GuestStreamLineUpdate {
  /** Delta to append to the assistant buffer, if any. */
  delta?: string;
  /** Full content from an error payload; caller must stop + replace buffer. */
  errorContent?: string;
}

interface AgentStatsShape {
  messagesSent: number;
  messagesReceived: number;
  leadsQualified: number;
  actionsExecuted: number;
  activeConversations: number;
}

interface AgentStreamEventLite {
  type?: string;
  meta?: {
    remaining?: number;
    pendingConversations?: number;
    pendingMessages?: number;
    importedMessages?: number;
  };
}

function applyContactEvent(next: AgentStatsShape, event: AgentStreamEventLite): void {
  next.messagesSent += 1;
  next.actionsExecuted += 1;
  if (typeof event.meta?.remaining === 'number') {
    next.activeConversations = event.meta.remaining;
  }
}

function applyBacklogEvent(next: AgentStatsShape, event: AgentStreamEventLite): void {
  if (typeof event.meta?.pendingConversations === 'number') {
    next.activeConversations = event.meta.pendingConversations;
  }
  if (typeof event.meta?.pendingMessages === 'number') {
    next.messagesReceived = Math.max(next.messagesReceived, event.meta.pendingMessages);
  }
}

export function applyAgentStatsEvent<T extends AgentStatsShape>(
  prev: T,
  event: AgentStreamEventLite,
): T {
  const next = { ...prev };
  if (event.type === 'contact') applyContactEvent(next, event);
  if (event.type === 'sale') {
    next.leadsQualified += 1;
    next.actionsExecuted += 1;
  }
  if (event.type === 'action' || event.type === 'proof' || event.type === 'account') {
    next.actionsExecuted += 1;
  }
  if (event.type === 'backlog' || event.type === 'prompt') applyBacklogEvent(next, event);
  if (event.type === 'status' && typeof event.meta?.importedMessages === 'number') {
    next.messagesReceived = Math.max(next.messagesReceived, event.meta.importedMessages);
  }
  if (event.type === 'summary') next.activeConversations = 0;
  return next;
}

export function parseGuestStreamLine(line: string): GuestStreamLineUpdate | null {
  if (!line.startsWith('data: ')) return null;
  const data = line.slice(6);
  if (data === '[DONE]') return null;
  try {
    const parsed = JSON.parse(data) as {
      error?: unknown;
      content?: unknown;
      chunk?: unknown;
      message?: unknown;
    };
    if (parsed.error) {
      const fallback =
        'Desculpe, tive uma instabilidade agora. Tenta de novo em alguns segundos.';
      const raw = parsed.content ?? parsed.chunk ?? parsed.message ?? fallback;
      return { errorContent: String(raw) };
    }
    const chunk = parsed.content ?? parsed.chunk;
    return chunk ? { delta: String(chunk) } : {};
  } catch {
    return {};
  }
}
