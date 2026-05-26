import type Redis from 'ioredis';
import { StructuredLogger } from '../logging/structured-logger';
export interface GuestConversation {
  messages: { role: 'user' | 'assistant'; content: string }[];
  createdAt: Date;
  lastMessageAt: Date;
}
export const GUEST_CONVERSATION_TTL_SECONDS = 24 * 60 * 60;
export function getRedisKey(sessionId: string): string {
  return `kloel:guest-chat:${sessionId}`;
}
export function parseConversation(raw: string | null): GuestConversation | null {
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
export async function getOrCreateConversation(
  sessionId: string,
  redis: Redis | undefined,
  conversations: Map<string, GuestConversation>,
  logger: StructuredLogger,
): Promise<GuestConversation> {
  const cached = conversations.get(sessionId);
  if (cached) {
    return cached;
  }

  if (redis) {
    try {
      const stored = parseConversation(await redis.get(getRedisKey(sessionId)));
      if (stored) {
        conversations.set(sessionId, stored);
        return stored;
      }
    } catch (error: unknown) {
      logger.warn(
        `Guest chat Redis read failed (${error instanceof Error ? error.message : 'unknown_error'}). Falling back to local cache.`,
      );
    }
  }

  const created: GuestConversation = {
    messages: [],
    createdAt: new Date(),
    lastMessageAt: new Date(),
  };
  conversations.set(sessionId, created);
  return created;
}
export async function persistConversation(
  sessionId: string,
  conversation: GuestConversation,
  redis: Redis | undefined,
  conversations: Map<string, GuestConversation>,
  logger: StructuredLogger,
): Promise<void> {
  conversations.set(sessionId, conversation);
  if (!redis) {
    return;
  }
  try {
    await redis.set(
      getRedisKey(sessionId),
      JSON.stringify(conversation),
      'EX',
      GUEST_CONVERSATION_TTL_SECONDS,
    );
  } catch (error: unknown) {
    logger.warn(
      `Guest chat Redis write failed (${error instanceof Error ? error.message : 'unknown_error'}). Continuing with local cache.`,
    );
  }
}
export async function persistConversationMessage(
  sessionId: string,
  role: 'user' | 'assistant',
  content: string,
  redis: Redis | undefined,
  conversations: Map<string, GuestConversation>,
  logger: StructuredLogger,
): Promise<void> {
  const conversation = await getOrCreateConversation(sessionId, redis, conversations, logger);
  conversation.messages.push({ role, content });
  conversation.lastMessageAt = new Date();
  await persistConversation(sessionId, conversation, redis, conversations, logger);
}
export function cleanupOldConversations(
  conversations: Map<string, GuestConversation>,
  logger: StructuredLogger,
): void {
  const maxAge = 24 * 60 * 60 * 1000; // 24 horas
  const now = Date.now();
  let cleaned = 0;

  for (const [sessionId, conversation] of conversations.entries()) {
    if (now - conversation.lastMessageAt.getTime() > maxAge) {
      conversations.delete(sessionId);
      cleaned += 1;
    }
  }

  if (cleaned > 0) {
    logger.log(`Cleaned up ${cleaned} old guest conversations`);
  }
}
export function getConversationStats(
  conversations: Map<string, GuestConversation>,
): { activeSessions: number; totalMessages: number } {
  let totalMessages = 0;
  for (const conversation of conversations.values()) {
    totalMessages += conversation.messages.length;
  }
  return {
    activeSessions: conversations.size,
    totalMessages,
  };
}
