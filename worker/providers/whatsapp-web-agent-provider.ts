import { browserSessionManager } from "../browser-runtime/session-manager";

function normalizeWorkspaceId(workspaceOrId: any): string {
  if (typeof workspaceOrId === "string") {
    return workspaceOrId.trim();
  }

  return String(
    workspaceOrId?.id || workspaceOrId?.workspaceId || "",
  ).trim();
}

export const whatsappWebAgentProvider = {
  async sendText(
    workspaceOrId: any,
    to: string,
    message: string,
    options?: { quotedMessageId?: string; chatId?: string },
  ) {
    const workspaceId = normalizeWorkspaceId(workspaceOrId);
    return browserSessionManager.sendText({
      workspaceId,
      to,
      message,
      quotedMessageId: options?.quotedMessageId,
      chatId: options?.chatId,
    });
  },

  async sendMedia(
    workspaceOrId: any,
    to: string,
    type: "image" | "video" | "audio" | "document",
    url: string,
    caption?: string,
    options?: { quotedMessageId?: string; chatId?: string },
  ) {
    const workspaceId = normalizeWorkspaceId(workspaceOrId);
    return browserSessionManager.sendMedia({
      workspaceId,
      to,
      mediaType: type,
      mediaUrl: url,
      caption,
      quotedMessageId: options?.quotedMessageId,
      chatId: options?.chatId,
    });
  },

  async getChats(workspaceOrId: any) {
    const workspaceId = normalizeWorkspaceId(workspaceOrId);
    return browserSessionManager.getChats(workspaceId);
  },

  async getChatMessages(workspaceOrId: any, chatId?: string, options?: any) {
    const workspaceId = normalizeWorkspaceId(workspaceOrId);
    return browserSessionManager.getChatMessages(workspaceId, chatId, options);
  },

  async getClientInfo(workspaceOrId: any) {
    const workspaceId = normalizeWorkspaceId(workspaceOrId);
    const snapshot = await browserSessionManager.getSnapshot(workspaceId, true);
    return {
      phone: snapshot.phoneNumber || null,
      phoneNumber: snapshot.phoneNumber || null,
      pushName: snapshot.pushName || null,
      me: {
        id: snapshot.phoneNumber
          ? `${snapshot.phoneNumber}@c.us`
          : null,
        phone: snapshot.phoneNumber || null,
      },
      provider: "whatsapp-web-agent",
      state: snapshot.state,
    };
  },

  async getStatus(workspaceOrId: any) {
    const workspaceId = normalizeWorkspaceId(workspaceOrId);
    const snapshot = await browserSessionManager.getSnapshot(workspaceId, true);
    return {
      connected: snapshot.connected,
      state: snapshot.state,
      provider: snapshot.provider,
    };
  },

  async getLidMappings() {
    return [];
  },

  async readChatMessages() {
    return undefined;
  },

  async upsertContactProfile() {
    return false;
  },
};
