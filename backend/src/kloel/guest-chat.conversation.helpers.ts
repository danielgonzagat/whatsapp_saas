import type Redis from 'ioredis';
import { StructuredLogger } from '../logging/structured-logger';
export interface PendingOperationalAction {
  tool: string;
  args: Record<string, unknown>;
  createdAt: string;
  prompt: string;
  missingInputs?: string[];
}

export interface GuestConversation {
  messages: { role: 'user' | 'assistant'; content: string }[];
  createdAt: Date;
  lastMessageAt: Date;
  pendingAction?: PendingOperationalAction;
}
export const GUEST_CONVERSATION_TTL_SECONDS = 24 * 60 * 60;
export function getRedisKey(sessionId: string): string {
  return `kloel:guest-chat:${sessionId}`;
}

function readPendingOperationalAction(value: unknown): PendingOperationalAction | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.tool !== 'string' || !record.tool.trim()) {
    return undefined;
  }
  if (!record.args || typeof record.args !== 'object' || Array.isArray(record.args)) {
    return undefined;
  }
  const missingInputs = Array.isArray(record.missingInputs)
    ? record.missingInputs.filter((input): input is string => typeof input === 'string')
    : undefined;
  return {
    tool: record.tool,
    args: record.args as Record<string, unknown>,
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
    prompt: typeof record.prompt === 'string' ? record.prompt : '',
    ...(missingInputs && missingInputs.length > 0 ? { missingInputs } : {}),
  };
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
      pendingAction?: unknown;
    };
    if (!Array.isArray(parsed.messages)) {
      return null;
    }
    const pendingAction = readPendingOperationalAction(parsed.pendingAction);
    return {
      messages: parsed.messages.filter(
        (message): message is GuestConversation['messages'][number] =>
          message.role === 'user' || message.role === 'assistant',
      ),
      createdAt: parsed.createdAt ? new Date(parsed.createdAt) : new Date(),
      lastMessageAt: parsed.lastMessageAt ? new Date(parsed.lastMessageAt) : new Date(),
      ...(pendingAction ? { pendingAction } : {}),
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
export function getConversationStats(conversations: Map<string, GuestConversation>): {
  activeSessions: number;
  totalMessages: number;
} {
  let totalMessages = 0;
  for (const conversation of conversations.values()) {
    totalMessages += conversation.messages.length;
  }
  return {
    activeSessions: conversations.size,
    totalMessages,
  };
}
