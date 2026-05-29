import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logging/structured-logger';
import { KloelThreadSearchService } from '../kloel-thread-search.service';

export interface SessionSearchArgs {
  query: string;
  limit?: number;
  [key: string]: unknown;
}

/**
 * SessionService — workspace conversation-session search.
 *
 * domainService alias: SessionService.search
 * Workspace isolation: delegated to KloelThreadSearchService (always workspace-scoped).
 *
 * "Session" in capability context = a chat thread (conversation session).
 * This service wraps KloelThreadSearchService.search to make it available
 * via the domainService resolver without duplicating search logic.
 */
@Injectable()
export class SessionService {
  private readonly logger = StructuredLogger.from(SessionService.name);

  constructor(private readonly threadSearch: KloelThreadSearchService) {}

  /** Search conversation sessions (chat threads) by query string. */
  async search(
    workspaceId: string,
    args: SessionSearchArgs,
  ): Promise<{ success: boolean; data: unknown }> {
    const query = String(args.query ?? '').trim();
    const limit = String(args.limit ?? '20');

    if (!query) {
      return { success: true, data: [] };
    }

    const results = await this.threadSearch.search(workspaceId, query, limit);
    this.logger.log(`SessionService.search ws=${workspaceId} query="${query}" found=${results.length}`);
    return { success: true, data: results };
  }
}
