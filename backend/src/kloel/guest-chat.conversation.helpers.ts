export interface GuestConversation {
  messages: { role: 'user' | 'assistant'; content: string }[];
  createdAt: Date;
  lastMessageAt: Date;
}

export const GUEST_CONVERSATION_TTL_SECONDS = 24 * 60 * 60;

export function getGuestConversationRedisKey(sessionId: string): string {
  return `kloel:guest-chat:${sessionId}`;
}

export function parseGuestConversation(raw: string | null): GuestConversation | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as {
      messages?: GuestConversation['messages'];
      createdAt?: string;
      lastMessageAt?: string;
    };
    if (!Array.isArray(parsed.messages)) {
      return null;
    }
    return {
      messages: parsed.messages.filter(
        (message): message is GuestConversation['messages'][number] =>
          message.role === 'user' || message.role === 'assistant',
      ),
      createdAt: parsed.createdAt ? new Date(parsed.createdAt) : new Date(),
      lastMessageAt: parsed.lastMessageAt ? new Date(parsed.lastMessageAt) : new Date(),
    };
  } catch {
    return null;
  }
}
