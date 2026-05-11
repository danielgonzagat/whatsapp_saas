export interface IWhatsappMessaging {
  sendMessage(
    workspaceId: string,
    phone: string,
    text: string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  syncRemoteContactProfile(workspaceId: string, phone: string, name: string): Promise<unknown>;
}

export interface IInboundProcessor {
  process(input: unknown): Promise<unknown>;
}

export interface ICiaRuntime {
  startBacklogRun(
    workspaceId: string,
    mode: string,
    limit: number,
    options: { autoStarted: boolean; runtimeState: string; triggeredBy: string },
  ): Promise<{ runId?: string; totalQueued?: number }>;
}

export interface ICatchupHistory {
  sanitizePlaceholderContacts(workspaceId: string): Promise<void>;
  resolveBackfillCursor(meta: {
    backfillCursor?: unknown;
    [key: string]: unknown;
  }): CatchupBackfillCursor;
  resolveWorkspaceSelfPhone(workspaceId: string, session: unknown): Promise<string | null>;
  reconcileRemoteChatState(workspaceId: string, chat: unknown): Promise<void>;
  persistHistoricalOutboundMessage(workspaceId: string, message: unknown): Promise<unknown>;
  toInboundMessage(workspaceId: string, message: unknown): unknown;
  isRemoteChatAwaitingReply(chat: unknown): boolean;
  rotateFallbackChatsByCursor(chats: unknown[], cursor: unknown): unknown[];
}

export type CatchupBackfillCursor = {
  chatId: string;
  activityTimestamp: number;
  updatedAt: string;
} | null;
