import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { PlanLimitsService } from '../../billing/plan-limits.service';
import { KloelComposerService } from '../kloel-composer.service';

export interface SearchWebArgs {
  query: string;
  [key: string]: unknown;
}

/**
 * SearchService — web search for the AI agent via KloelComposerService.
 *
 * domainService alias: SearchService.web
 * Workspace isolation: plan budget enforced per workspaceId via PlanLimitsService.
 *
 * Delegates to the existing KloelComposerService.searchWeb — no duplicate
 * implementation. This wrapper makes the capability resolvable through the
 * domainService resolver with proper workspace plan-budget enforcement.
 */
@Injectable()
export class SearchService {
  private readonly logger = StructuredLogger.from(SearchService.name);

  constructor(
    private readonly composer: KloelComposerService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  /** Perform a web search and return a summarized digest. */
  async web(
    workspaceId: string,
    args: SearchWebArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const query = String(args.query ?? '').trim();
    if (!query) {
      return { success: false, data: null };
    }

    try {
      await this.planLimits.ensureTokenBudget(workspaceId);
      const digest = await this.composer.searchWeb(query);
      await this.planLimits
        .trackAiUsage(workspaceId, Math.max(180, Math.ceil(digest.answer.length / 4)))
        .catch(() => {});

      this.logger.log(`SearchService.web ws=${workspaceId} query="${query.slice(0, 60)}"`);
      return { success: true, data: { query, summary: digest.answer, sources: digest.sources } };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'web_search_failed';
      this.logger.warn(`SearchService.web failed ws=${workspaceId} error=${msg}`);
      return { success: false, data: { error: msg } };
    }
  }
}
