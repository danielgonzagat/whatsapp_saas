import { providerStatus } from './health-monitor';
import { getWhatsAppProviderFromEnv } from './whatsapp-provider-resolver';

const PATTERN_RE = /\/+$/;

/** Workspace shape accepted by api-provider methods. */
interface WorkspaceOrId {
  id?: string;
  workspaceId?: string;
  whatsappProvider?: string;
  [key: string]: unknown;
}

/** Options for sending text messages. */
interface SendTextOptions {
  quotedMessageId?: string;
  externalId?: string;
  chatId?: string;
}

/** Options for sending media messages. */
interface SendMediaOptions {
  quotedMessageId?: string;
  externalId?: string;
  chatId?: string;
}

/** Options for retrieving chat messages. */
interface GetChatMessagesOptions {
  limit?: number;
  offset?: number;
  downloadMedia?: boolean;
}

/** Shape returned by the send-text and send-media endpoints. */
interface SendResult {
  success?: boolean;
  messageId?: string;
  [key: string]: unknown;
}

/** Shape returned by the status endpoint. */
interface StatusResult {
  connected?: boolean;
  phoneNumber?: string;
  [key: string]: unknown;
}

/** Shape of a chat object returned by the chats endpoint. */
interface ChatEntry {
  id: string;
  name?: string;
  [key: string]: unknown;
}

/** Shape of a message object returned by the messages endpoint. */
interface MessageEntry {
  id: string;
  body?: string;
  timestamp?: number;
  [key: string]: unknown;
}

/** Shape returned by the read endpoint. */
interface ReadResult {
  success?: boolean;
  [key: string]: unknown;
}

function getBackendUrl(): string {
  const configured =
    process.env.BACKEND_URL || process.env.API_URL || process.env.SERVICE_BASE_URL || '';
  const normalized = configured.trim().replace(PATTERN_RE, '');

  if (!normalized) {
    throw new Error('BACKEND_URL/API_URL not configured');
  }

  return normalized;
}

function getInternalHeaders(extra?: Record<string, string>) {
  const internalKey = String(process.env.INTERNAL_API_KEY || '').trim();
  return {
    'Content-Type': 'application/json',
    ...(internalKey ? { 'X-Internal-Key': internalKey } : {}),
    ...(extra || {}),
  };
}

function normalizeWorkspace(workspaceOrId: string | WorkspaceOrId) {
  const provider = getWhatsAppProviderFromEnv();
  if (typeof workspaceOrId === 'string') {
    return {
      id: workspaceOrId.trim(),
      whatsappProvider: provider,
    };
  }

  return {
    ...workspaceOrId,
    id: String(workspaceOrId?.id || workspaceOrId?.workspaceId || '').trim(),
    whatsappProvider: provider,
  };
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `${getBackendUrl()}${path}`;
  const response = await fetch(url, {
    method,
    headers: getInternalHeaders(),
    ...(method === 'GET' ? {} : { body: JSON.stringify(body || {}) }),
    signal: AbortSignal.timeout(30000),
  });

  const payload = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) {
    throw new Error(payload?.message || `HTTP ${response.status}`);
  }

  return payload as T;
}

export const whatsappApiProvider = {
  name: 'meta-cloud',

  async sendText(
    workspaceOrId: string | WorkspaceOrId,
    to: string,
    message: string,
    options?: SendTextOptions,
  ) {
    const workspace = normalizeWorkspace(workspaceOrId);
    const startedAt = Date.now();
    const result = await request<SendResult>('POST', '/internal/whatsapp-runtime/send-text', {
      workspaceId: workspace.id,
      to,
      message,
      quotedMessageId: options?.quotedMessageId,
      externalId: options?.externalId,
    });
    providerStatus.success('meta-cloud', Date.now() - startedAt);
    return result;
  },

  async sendMedia(
    workspaceOrId: string | WorkspaceOrId,
    to: string,
    type: 'image' | 'video' | 'audio' | 'document',
    url: string,
    caption?: string,
    options?: SendMediaOptions,
  ) {
    const workspace = normalizeWorkspace(workspaceOrId);
    const startedAt = Date.now();
    const result = await request<SendResult>('POST', '/internal/whatsapp-runtime/send-media', {
      workspaceId: workspace.id,
      to,
      mediaUrl: url,
      mediaType: type,
      caption,
      quotedMessageId: options?.quotedMessageId,
      externalId: options?.externalId,
    });
    providerStatus.success('meta-cloud', Date.now() - startedAt);
    return result;
  },

  async getStatus(workspaceOrId: string | WorkspaceOrId) {
    const workspace = normalizeWorkspace(workspaceOrId);
    return request<StatusResult>(
      'GET',
      `/internal/whatsapp-runtime/status?workspaceId=${encodeURIComponent(workspace.id)}`,
    );
  },

  async getClientInfo(workspaceOrId: string | WorkspaceOrId) {
    return this.getStatus(workspaceOrId);
  },

  async getChats(workspaceOrId: string | WorkspaceOrId) {
    const workspace = normalizeWorkspace(workspaceOrId);
    return request<ChatEntry[]>(
      'GET',
      `/internal/whatsapp-runtime/chats?workspaceId=${encodeURIComponent(workspace.id)}`,
    );
  },

  async getChatMessages(
    workspaceOrId: string | WorkspaceOrId,
    chatId: string,
    options?: GetChatMessagesOptions,
  ) {
    const workspace = normalizeWorkspace(workspaceOrId);
    const query = new URLSearchParams({
      workspaceId: workspace.id,
      chatId,
      limit: String(options?.limit || 100),
      offset: String(options?.offset || 0),
    });
    return request<MessageEntry[]>(
      'GET',
      `/internal/whatsapp-runtime/messages?${query.toString()}`,
    );
  },

  async readChatMessages(workspaceOrId: string | WorkspaceOrId, chatId: string) {
    const workspace = normalizeWorkspace(workspaceOrId);
    return request<ReadResult>('POST', '/internal/whatsapp-runtime/read', {
      workspaceId: workspace.id,
      chatId,
    });
  },

  async getLidMappings() {
    return [];
  },

  async upsertContactProfile() {
    return false;
  },
};
