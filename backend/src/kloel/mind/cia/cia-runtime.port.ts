export const CIA_RUNTIME_SERVICE = Symbol('CIA_RUNTIME_SERVICE');

export type CiaBacklogMode = 'reply_all_recent_first' | 'reply_only_new' | 'prioritize_hot';

export type CiaBacklogOptions = {
  autoStarted?: boolean;
  runtimeState?: string;
  triggeredBy?: string;
};

export type CiaRuntimePort = {
  bootstrap(workspaceId: string): Promise<unknown>;
  ensureBacklogCoverage(workspaceId: string, options?: { triggeredBy?: string }): Promise<unknown>;
  getOperationalIntelligence(workspaceId: string): Promise<unknown>;
  pauseAutonomy(workspaceId: string): Promise<unknown>;
  resumeConversationAutonomy(workspaceId: string, conversationId: string): Promise<unknown>;
  startBacklogRun(
    workspaceId: string,
    mode?: CiaBacklogMode,
    limit?: number,
    options?: CiaBacklogOptions,
  ): Promise<unknown>;
};
