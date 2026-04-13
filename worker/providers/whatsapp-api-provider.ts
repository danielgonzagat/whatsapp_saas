import { providerStatus } from './health-monitor';
import { getWhatsAppProviderFromEnv } from './whatsapp-provider-resolver';

function getBackendUrl(): string {
  const configured =
    process.env.BACKEND_URL || process.env.API_URL || process.env.SERVICE_BASE_URL || '';
  const normalized = configured.trim().replace(/\/+$/, '');

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

function normalizeWorkspace(workspaceOrId: any) {
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
  body?: Record<string, any>,
): Promise<T> {
  const url = `${getBackendUrl()}${path}`;
  const response = await fetch(url, {
    method,
    headers: getInternalHeaders(),
    ...(method === 'GET' ? {} : { body: JSON.stringify(body || {}) }),
    signal: AbortSignal.timeout(30000),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || `HTTP ${response.status}`);
  }

  return payload as T;
}

export const whatsappApiProvider = {
  name: 'meta-cloud',

  async sendText(workspaceOrId: any, to: string, message: string, options?: any) {
    const workspace = normalizeWorkspace(workspaceOrId);
    const startedAt = Date.now();
    const result = await request<any>('POST', '/internal/whatsapp-runtime/send-text', {
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
    workspaceOrId: any,
    to: string,
    type: 'image' | 'video' | 'audio' | 'document',
    url: string,
    caption?: string,
    options?: any,
  ) {
    const workspace = normalizeWorkspace(workspaceOrId);
    const startedAt = Date.now();
    const result = await request<any>('POST', '/internal/whatsapp-runtime/send-media', {
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

  async getStatus(workspaceOrId: any) {
    const workspace = normalizeWorkspace(workspaceOrId);
    return request<any>(
      'GET',
      `/internal/whatsapp-runtime/status?workspaceId=${encodeURIComponent(workspace.id)}`,
    );
  },

  async getClientInfo(workspaceOrId: any) {
    return this.getStatus(workspaceOrId);
  },

  async getChats(workspaceOrId: any) {
    const workspace = normalizeWorkspace(workspaceOrId);
    return request<any[]>(
      'GET',
      `/internal/whatsapp-runtime/chats?workspaceId=${encodeURIComponent(workspace.id)}`,
    );
  },

  async getChatMessages(workspaceOrId: any, chatId: string, options?: any) {
    const workspace = normalizeWorkspace(workspaceOrId);
    const query = new URLSearchParams({
      workspaceId: workspace.id,
      chatId,
      limit: String(options?.limit || 100),
      offset: String(options?.offset || 0),
    });
    return request<any[]>('GET', `/internal/whatsapp-runtime/messages?${query.toString()}`);
  },

  async readChatMessages(workspaceOrId: any, chatId: string) {
    const workspace = normalizeWorkspace(workspaceOrId);
    return request<any>('POST', '/internal/whatsapp-runtime/read', {
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
