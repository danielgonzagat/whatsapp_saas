import type { ConversationOperationalState } from './agent-conversation-state.util';
import type { PrismaService } from '../prisma/prisma.service';
import type { WhatsAppProviderRegistry } from './providers/provider-registry';

/** Normalized chat shape produced by `whatsapp.service.chats.ts` listing flow. */
export type ChatNormalized = {
  id: string;
  phone: string;
  name: string | null;
  unreadCount: number;
  pending: boolean;
  needsReply?: boolean;
  pendingMessages?: number;
  owner?: ConversationOperationalState['owner'];
  blockedReason?: ConversationOperationalState['blockedReason'];
  lastMessageDirection?: ConversationOperationalState['lastMessageDirection'];
  timestamp: number;
  lastMessageAt: string | null;
  conversationId: string | null;
  status: string | null;
  mode?: string | null;
  assignedAgentId?: string | null;
  source: 'provider' | 'crm' | 'waha+crm';
};

/** Service-side dependency bag passed into the chat helpers and listing functions. */
export type ChatHelperDeps = {
  prisma: PrismaService;
  providerRegistry: WhatsAppProviderRegistry;
  normalizeChats: (raw: unknown) => ChatNormalized[];
  normalizeMessages: (raw: unknown, fallbackChatId: string) => unknown[];
  normalizeNumber: (num: string) => string;
  normalizeChatId: (chatId: string) => string;
  isIndividualChatId: (chatId?: string | null) => boolean;
  toIsoTimestamp: (timestamp: number) => string | null;
  resolveTimestamp: (value: unknown) => number;
  resolveTrustedContactName: (phone: string, ...candidates: unknown[]) => string;
  listOperationalConversations: (
    workspaceId: string,
    options?: { limit?: number; pendingOnly?: boolean },
  ) => Promise<ConversationOperationalState[]>;
};
