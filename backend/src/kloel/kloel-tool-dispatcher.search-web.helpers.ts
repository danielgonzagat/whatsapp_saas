import type { PlanLimitsService } from '../billing/plan-limits.service';
import type { KloelComposerService } from './kloel-composer.service';

export async function runToolSearchWeb(planLimits: PlanLimitsService, composerService: KloelComposerService, 
  workspaceId: string,
  args: { query?: string },
): Promise<{
  success: boolean;
  query?: string;
  summary?: string;
  sources?: unknown[];
  error?: string;
}> {
  const query = String(args?.query || '').trim();
  if (!query) {
    return { success: false, error: 'missing_query' };
  }
  try {
    await planLimits.ensureTokenBudget(workspaceId);
    const digest = await composerService.searchWeb(query);
    await planLimits
      .trackAiUsage(workspaceId, Math.max(180, Math.ceil(digest.answer.length / 4)))
      .catch(() => {});
    return { success: true, query, summary: digest.answer, sources: digest.sources };
  } catch (error: unknown) {
    void this.opsAlert?.alertOnCriticalError(error, 'KloelToolDispatcherService.trackAiUsage');
    const msg = error instanceof Error ? error.message : 'web_search_failed';
    this.logger.warn(`Falha em search_web para "${query}": ${msg}`);
    return { success: false, error: msg };
  }
}
