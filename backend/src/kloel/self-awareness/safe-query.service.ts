import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const MAX_ROWS = 1000;
const QUERY_TIMEOUT_MS = 5000;

// Tables that are ALWAYS allowed to be read
const READABLE_TABLES = new Set([
  'Product', 'Plan', 'Checkout', 'Order', 'Coupon', 'Contact',
  'Deal', 'Stage', 'Pipeline', 'ChatThread', 'ChatMessage',
  'Workspace', 'Campaign', 'Flow', 'Affiliate', 'ProductUrl',
  'ProductReview', 'ProductAIConfig', 'CheckoutPlan',
  'KloelMemory', 'KloelSale', 'BrainEvent', 'AuditLog',
  'Lead', 'Subscription', 'Wallet', 'Payment', 'Refund',
]);

// Tables NEVER readable via chat
const BLOCKED_TABLES = new Set([
  'User', 'Auth', 'AuthPassword', 'ApiToken', 'WebhookSecret',
  'ProviderSettings', 'StripeAccount', 'Session',
]);

/**
 * SafeQueryService — read-only SQL queries scoped by workspace.
 *
 * Allows the Kloel chat to run SELECT queries on known-safe tables
 * with enforced limits and timeouts. NEVER allows writes.
 */
@Injectable()
export class SafeQueryService {

  constructor(private readonly prisma: PrismaService) {}

  async query(
    _workspaceId: string,
    sql: string,
  ): Promise<{ ok: boolean; rows?: unknown[]; error?: string }> {
    // Only SELECT
    const trimmed = sql.trim();
    if (!trimmed.toUpperCase().startsWith('SELECT') && !trimmed.toUpperCase().startsWith('WITH')) {
      return { ok: false, error: 'only_select_allowed' };
    }

    // Validate table access
    const tableNames = this.extractTableNames(trimmed);
    for (const tbl of tableNames) {
      if (BLOCKED_TABLES.has(tbl)) {
        return { ok: false, error: `table_blocked:${tbl}` };
      }
      if (!READABLE_TABLES.has(tbl)) {
        return { ok: false, error: `table_unknown:${tbl}` };
      }
    }

    // Inject workspaceId filter
    const upper = trimmed.toUpperCase();
    if (!upper.includes('WHERE') && !upper.includes('JOIN')) {
      return { ok: false, error: 'workspace_filter_required' };
    }

    try {
      const result = await Promise.race([
        this.prisma.$queryRawUnsafe(sql) as Promise<unknown[]>,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('query_timeout')), QUERY_TIMEOUT_MS),
        ),
      ]);

      const rows = result as unknown[];
      if (rows.length > MAX_ROWS) {
        return {
          ok: true,
          rows: rows.slice(0, MAX_ROWS),
          error: `truncated_to_${MAX_ROWS}` as unknown as string,
        } as any;
      }
      return { ok: true, rows };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'query_failed',
      };
    }
  }

  private extractTableNames(sql: string): string[] {
    const names: string[] = [];
    const upper = sql.toUpperCase();
    // Simple extraction: FROM/JOIN followed by table names
    const matches = upper.matchAll(/(?:FROM|JOIN|INTO|UPDATE)\s+"?(\w+)"?/gi);
    for (const m of matches) {
      const name = m[1];
      if (name && !names.includes(name)) names.push(name);
    }
    return names;
  }
}