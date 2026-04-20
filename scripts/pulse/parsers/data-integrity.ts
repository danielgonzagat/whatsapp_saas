/**
 * PULSE Parser 61: Data Integrity
 * Layer 7: Database Health
 * Mode: DEEP (requires running infrastructure)
 *
 * CHECKS (read-only SQL queries):
 * 1. KloelWallet rows with available < 0 → DATA_WALLET_INCONSISTENT critical
 * 2. Workspaces with no valid owner (LEFT JOIN User) → DATA_WORKSPACE_NO_OWNER high
 *
 * All queries are wrapped in try/catch — if DB is unreachable, returns [] silently.
 * ZERO writes are performed.
 *
 * BREAK TYPES:
 * - DATA_WALLET_INCONSISTENT (critical) — wallet with negative available balance
 * - DATA_WORKSPACE_NO_OWNER (high) — workspace whose owner user no longer exists
 */

import type { Break, PulseConfig } from '../types';
import { dbQuery } from './runtime-utils';

export async function checkDataIntegrity(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires DB access
  if (!process.env.PULSE_DEEP) {
    return [];
  }

  const breaks: Break[] = [];
  const baseFile = 'scripts/pulse/parsers/data-integrity.ts';

  // ── Check 1: Wallets with negative available balance ──────────────────────
  try {
    const rows = await dbQuery(
      `SELECT COUNT(*) AS cnt FROM "KloelWallet" WHERE "available" < 0`,
      [],
    );
    const count = parseInt(rows[0]?.cnt ?? '0', 10);
    if (count > 0) {
      breaks.push({
        type: 'DATA_WALLET_INCONSISTENT',
        severity: 'critical',
        file: baseFile,
        line: 0,
        description: `${count} KloelWallet row(s) have negative available balance`,
        detail: `SELECT COUNT(*) FROM "KloelWallet" WHERE available < 0 → ${count}. Negative wallet balances indicate a financial data integrity violation.`,
      });
    }
  } catch (e: any) {
    // DB unreachable or table doesn't exist — skip silently
    // (Don't add a break: PULSE doesn't know if it's a missing table or network issue)
  }

  // ── Check 2: Workspaces with missing owner ────────────────────────────────
  try {
    const rows = await dbQuery(
      `SELECT COUNT(*) AS cnt
         FROM "Workspace" w
         LEFT JOIN "User" u ON w."ownerId" = u.id
        WHERE u.id IS NULL`,
      [],
    );
    const count = parseInt(rows[0]?.cnt ?? '0', 10);
    if (count > 0) {
      breaks.push({
        type: 'DATA_WORKSPACE_NO_OWNER',
        severity: 'high',
        file: baseFile,
        line: 0,
        description: `${count} Workspace row(s) have no valid owner User`,
        detail: `Workspace.ownerId references a User that no longer exists. This can cause authorization errors and orphaned data. Count: ${count}`,
      });
    }
  } catch (e: any) {
    // DB unreachable or table doesn't exist — skip silently
  }

  // ── Check 3: Plans with non-existent product (orphan detection) ───────────
  try {
    const rows = await dbQuery(
      `SELECT COUNT(*) AS cnt
         FROM "Plan" p
         LEFT JOIN "Product" pr ON p."productId" = pr.id
        WHERE pr.id IS NULL`,
      [],
    );
    const count = parseInt(rows[0]?.cnt ?? '0', 10);
    if (count > 0) {
      breaks.push({
        type: 'DATA_ORPHANED_RECORD',
        severity: 'high',
        file: baseFile,
        line: 0,
        description: `${count} Plan row(s) reference non-existent Product`,
        detail: `Plan.productId has no matching Product.id row. Orphaned plans can break checkout flows. Count: ${count}`,
      });
    }
  } catch {
    // skip
  }

  // ── Check 4: Orders with non-existent plan ────────────────────────────────
  try {
    const rows = await dbQuery(
      `SELECT COUNT(*) AS cnt
         FROM "Order" o
         LEFT JOIN "Plan" p ON o."planId" = p.id
        WHERE o."planId" IS NOT NULL
          AND p.id IS NULL`,
      [],
    );
    const count = parseInt(rows[0]?.cnt ?? '0', 10);
    if (count > 0) {
      breaks.push({
        type: 'DATA_ORPHANED_RECORD',
        severity: 'high',
        file: baseFile,
        line: 0,
        description: `${count} Order row(s) reference non-existent Plan`,
        detail: `Order.planId has no matching Plan.id row. Orphaned orders indicate data integrity problems. Count: ${count}`,
      });
    }
  } catch {
    // skip
  }

  return breaks;
}
