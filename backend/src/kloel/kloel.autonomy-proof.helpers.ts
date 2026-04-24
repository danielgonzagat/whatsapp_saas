/**
 * Shared types, constants and pure utility functions for
 * kloel.autonomy-proof.spec.ts and kloel.autonomy-proof2.spec.ts.
 * No mocks, no Jest APIs — pure helpers only.
 */

export type TraceEntry = {
  cycle: number;
  type:
    | 'connect'
    | 'status'
    | 'sync'
    | 'backlog'
    | 'list_contacts'
    | 'list_chats'
    | 'read_messages'
    | 'create_contact'
    | 'presence'
    | 'send_message'
    | 'inbound';
  phone?: string;
  chatId?: string;
  presence?: 'typing' | 'paused' | 'seen';
  count?: number;
  pendingMessages?: number;
  pendingConversations?: number;
  connected?: boolean;
  message?: string;
};

export type WorldChat = {
  id: string;
  phone: string;
  name: string;
  unreadCount: number;
  timestamp: number;
  lastMessageAt: string;
  pending?: boolean;
};

export type WorldMessage = {
  id: string;
  chatId: string;
  phone: string;
  body: string;
  direction: 'INBOUND' | 'OUTBOUND';
  fromMe: boolean;
  type: string;
  hasMedia: boolean;
  mediaUrl: string | null;
  timestamp: number;
  isoTimestamp: string;
  source: string;
};

export type DbContact = {
  id: string;
  workspaceId: string;
  phone: string;
  name: string;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export const WORKSPACE_ID = 'ws-proof';
export const ALICE_PHONE = '5511999991111';
export const CARLOS_PHONE = '5511999992222';
export const DANIELA_PHONE = '5511999993333';
export const ALICE_CHAT_ID = `${ALICE_PHONE}@c.us`;
export const CARLOS_CHAT_ID = `${CARLOS_PHONE}@c.us`;
export const DANIELA_CHAT_ID = `${DANIELA_PHONE}@c.us`;

export const EXPECTED_TOOL_ALPHABET = [
  'connect_whatsapp',
  'get_whatsapp_status',
  'sync_whatsapp_history',
  'get_whatsapp_backlog',
  'list_whatsapp_contacts',
  'list_whatsapp_chats',
  'get_whatsapp_messages',
  'create_whatsapp_contact',
  'set_whatsapp_presence',
  'send_whatsapp_message',
];

export function normalizePhone(value: string): string {
  return String(value || '').replace(/\D/g, '');
}

export function normalizeChatId(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.includes('@')) return raw;
  return `${normalizePhone(raw)}@c.us`;
}

export function phoneFromChatId(value: string): string {
  return normalizePhone(String(value || '').split('@')[0] ?? '');
}

export function asStr(v: unknown, fallback = ''): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return fallback;
}

export function currentBacklog(
  world: { connected: boolean },
  worldChats: Map<string, WorldChat>,
): {
  connected: boolean;
  status: string;
  pendingConversations: number;
  pendingMessages: number;
  chats: WorldChat[];
} {
  if (!world.connected) {
    return {
      connected: false,
      status: 'SCAN_QR_CODE',
      pendingConversations: 0,
      pendingMessages: 0,
      chats: [],
    };
  }
  const chats = Array.from(worldChats.values())
    .map((c) => ({ ...c, pending: c.unreadCount > 0 }))
    .sort((a, b) => b.timestamp - a.timestamp);
  const pending = chats.filter((c) => c.unreadCount > 0);
  return {
    connected: true,
    status: 'WORKING',
    pendingConversations: pending.length,
    pendingMessages: pending.reduce((s, c) => s + c.unreadCount, 0),
    chats: pending,
  };
}

export function upsertChat(
  worldChats: Map<string, WorldChat>,
  phone: string,
  name: string,
  unreadCount: number,
  timestamp: number,
): void {
  worldChats.set(phone, {
    id: `${phone}@c.us`,
    phone,
    name,
    unreadCount,
    timestamp,
    lastMessageAt: new Date(timestamp).toISOString(),
  });
}

export function parseEvents(writes: string[]): Array<Record<string, unknown>> {
  return writes
    .join('')
    .split('\n\n')
    .filter(Boolean)
    .map((block) => JSON.parse(block.replace(/^data: /, '')) as Record<string, unknown>);
}
