import { whatsappApiProvider } from "./whatsapp-api-provider";

function normalizeWorkspace(workspaceOrId: any) {
  if (typeof workspaceOrId === "string") {
    return {
      id: workspaceOrId.trim(),
      whatsappProvider: "meta-cloud",
    };
  }

  return {
    ...workspaceOrId,
    whatsappProvider: "meta-cloud",
  };
}

function resolveProvider(workspaceOrId: any) {
  const workspace = normalizeWorkspace(workspaceOrId);
  return {
    workspace,
    provider: whatsappApiProvider,
  };
}

export const unifiedWhatsAppProvider = {
  async sendText(workspaceOrId: any, to: string, message: string, options?: any) {
    const { workspace, provider } = resolveProvider(workspaceOrId);
    return provider.sendText(workspace, to, message, options);
  },

  async sendMedia(
    workspaceOrId: any,
    to: string,
    type: "image" | "video" | "audio" | "document",
    url: string,
    caption?: string,
    options?: any,
  ) {
    const { workspace, provider } = resolveProvider(workspaceOrId);
    return provider.sendMedia(workspace, to, type, url, caption, options);
  },

  async getStatus(workspaceOrId: any) {
    const { workspace, provider } = resolveProvider(workspaceOrId);
    if (typeof (provider as any).getStatus === "function") {
      return (provider as any).getStatus(workspace);
    }
    return null;
  },

  async getClientInfo(workspaceOrId: any) {
    const { workspace, provider } = resolveProvider(workspaceOrId);
    if (typeof (provider as any).getClientInfo === "function") {
      return (provider as any).getClientInfo(workspace);
    }
    return null;
  },

  async getChats(workspaceOrId: any) {
    const { workspace, provider } = resolveProvider(workspaceOrId);
    if (typeof (provider as any).getChats === "function") {
      return (provider as any).getChats(workspace);
    }
    return [];
  },

  async getChatMessages(workspaceOrId: any, chatId: string, options?: any) {
    const { workspace, provider } = resolveProvider(workspaceOrId);
    if (typeof (provider as any).getChatMessages === "function") {
      return (provider as any).getChatMessages(workspace, chatId, options);
    }
    return [];
  },

  async readChatMessages(workspaceOrId: any, chatId: string) {
    const { workspace, provider } = resolveProvider(workspaceOrId);
    if (typeof (provider as any).readChatMessages === "function") {
      return (provider as any).readChatMessages(workspace, chatId);
    }
    return undefined;
  },

  async getLidMappings(workspaceOrId: any) {
    const { workspace, provider } = resolveProvider(workspaceOrId);
    if (typeof (provider as any).getLidMappings === "function") {
      return (provider as any).getLidMappings(workspace);
    }
    return [];
  },

  async upsertContactProfile(workspaceOrId: any, contact: any) {
    const { workspace, provider } = resolveProvider(workspaceOrId);
    if (typeof (provider as any).upsertContactProfile === "function") {
      return (provider as any).upsertContactProfile(workspace, contact);
    }
    return false;
  },
};
