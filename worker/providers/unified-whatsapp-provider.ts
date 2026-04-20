import { whatsappApiProvider } from './whatsapp-api-provider';
import { getWhatsAppProviderFromEnv } from './whatsapp-provider-resolver';

/** Minimal workspace shape accepted by the unified provider. */
export interface WorkspaceOrId {
  /** Id property. */
  id?: string;
  /** Workspace id property. */
  workspaceId?: string;
  /** Whatsapp provider property. */
  whatsappProvider?: string;
  [key: string]: unknown;
}

/** Options for sending text messages. */
export interface SendTextOptions {
  /** Quoted message id property. */
  quotedMessageId?: string;
  /** External id property. */
  externalId?: string;
  /** Chat id property. */
  chatId?: string;
}

/** Options for sending media messages. */
export interface SendMediaOptions {
  /** Quoted message id property. */
  quotedMessageId?: string;
  /** External id property. */
  externalId?: string;
  /** Chat id property. */
  chatId?: string;
}

/** Options for retrieving chat messages. */
export interface GetChatMessagesOptions {
  /** Limit property. */
  limit?: number;
  /** Offset property. */
  offset?: number;
  /** Download media property. */
  downloadMedia?: boolean;
}

/** Contact profile shape for upsert operations. */
export interface ContactProfile {
  /** Phone property. */
  phone: string;
  /** Name property. */
  name?: string;
  /** Email property. */
  email?: string;
  /** Avatar url property. */
  avatarUrl?: string;
  [key: string]: unknown;
}

/** Methods that a WhatsApp provider may optionally implement. */
interface ExtendedProvider {
  sendText: typeof whatsappApiProvider.sendText;
  sendMedia: typeof whatsappApiProvider.sendMedia;
  getStatus?: (workspace: ReturnType<typeof normalizeWorkspace>) => Promise<unknown>;
  getClientInfo?: (workspace: ReturnType<typeof normalizeWorkspace>) => Promise<unknown>;
  getChats?: (workspace: ReturnType<typeof normalizeWorkspace>) => Promise<unknown[]>;
  getChatMessages?: (
    workspace: ReturnType<typeof normalizeWorkspace>,
    chatId: string,
    options?: GetChatMessagesOptions,
  ) => Promise<unknown[]>;
  readChatMessages?: (
    workspace: ReturnType<typeof normalizeWorkspace>,
    chatId: string,
  ) => Promise<unknown>;
  getLidMappings?: (workspace: ReturnType<typeof normalizeWorkspace>) => Promise<unknown[]>;
  upsertContactProfile?: (
    workspace: ReturnType<typeof normalizeWorkspace>,
    contact: ContactProfile,
  ) => Promise<boolean>;
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
    whatsappProvider: provider,
  };
}

function resolveProvider(workspaceOrId: string | WorkspaceOrId) {
  const workspace = normalizeWorkspace(workspaceOrId);
  return {
    workspace,
    provider: whatsappApiProvider as ExtendedProvider,
  };
}

/** Unified whats app provider. */
export const unifiedWhatsAppProvider = {
  async sendText(
    workspaceOrId: string | WorkspaceOrId,
    to: string,
    message: string,
    options?: SendTextOptions,
  ) {
    const { workspace, provider } = resolveProvider(workspaceOrId);
    return provider.sendText(workspace, to, message, options);
  },

  async sendMedia(
    workspaceOrId: string | WorkspaceOrId,
    to: string,
    type: 'image' | 'video' | 'audio' | 'document',
    url: string,
    caption?: string,
    options?: SendMediaOptions,
  ) {
    const { workspace, provider } = resolveProvider(workspaceOrId);
    return provider.sendMedia(workspace, to, type, url, caption, options);
  },

  async getStatus(workspaceOrId: string | WorkspaceOrId) {
    const { workspace, provider } = resolveProvider(workspaceOrId);
    if (typeof provider.getStatus === 'function') {
      return provider.getStatus(workspace);
    }
    return null;
  },

  async getClientInfo(workspaceOrId: string | WorkspaceOrId) {
    const { workspace, provider } = resolveProvider(workspaceOrId);
    if (typeof provider.getClientInfo === 'function') {
      return provider.getClientInfo(workspace);
    }
    return null;
  },

  async getChats(workspaceOrId: string | WorkspaceOrId) {
    const { workspace, provider } = resolveProvider(workspaceOrId);
    if (typeof provider.getChats === 'function') {
      return provider.getChats(workspace);
    }
    return [];
  },

  async getChatMessages(
    workspaceOrId: string | WorkspaceOrId,
    chatId: string,
    options?: GetChatMessagesOptions,
  ) {
    const { workspace, provider } = resolveProvider(workspaceOrId);
    if (typeof provider.getChatMessages === 'function') {
      return provider.getChatMessages(workspace, chatId, options);
    }
    return [];
  },

  async readChatMessages(workspaceOrId: string | WorkspaceOrId, chatId: string) {
    const { workspace, provider } = resolveProvider(workspaceOrId);
    if (typeof provider.readChatMessages === 'function') {
      return provider.readChatMessages(workspace, chatId);
    }
    return undefined;
  },

  async getLidMappings(workspaceOrId: string | WorkspaceOrId) {
    const { workspace, provider } = resolveProvider(workspaceOrId);
    if (typeof provider.getLidMappings === 'function') {
      return provider.getLidMappings(workspace);
    }
    return [];
  },

  async upsertContactProfile(workspaceOrId: string | WorkspaceOrId, contact: ContactProfile) {
    const { workspace, provider } = resolveProvider(workspaceOrId);
    if (typeof provider.upsertContactProfile === 'function') {
      return provider.upsertContactProfile(workspace, contact);
    }
    return false;
  },
};
