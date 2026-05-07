import type { CiaBacklogMode, CiaBacklogOptions, CiaRuntimePort } from '../cia/cia-runtime.port';

export abstract class CiaRuntimeService implements CiaRuntimePort {
  abstract bootstrap(workspaceId: string): Promise<unknown>;
  abstract ensureBacklogCoverage(
    workspaceId: string,
    options?: { triggeredBy?: string },
  ): Promise<unknown>;
  abstract getOperationalIntelligence(workspaceId: string): Promise<unknown>;
  abstract pauseAutonomy(workspaceId: string): Promise<unknown>;
  abstract resumeConversationAutonomy(
    workspaceId: string,
    conversationId: string,
  ): Promise<unknown>;
  abstract startBacklogRun(
    workspaceId: string,
    mode?: CiaBacklogMode,
    limit?: number,
    options?: CiaBacklogOptions,
  ): Promise<unknown>;
}
