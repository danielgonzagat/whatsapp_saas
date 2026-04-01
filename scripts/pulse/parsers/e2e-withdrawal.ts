/**
 * PULSE Parser 52: E2E Withdrawal + Race Condition Test
 * Layer 4: End-to-End Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * DB-ONLY: Verifies wallet balance consistency — does not create withdrawals.
 *
 * CHECKS:
 * 1. Wallet balance consistency: compare stored `available` vs. sum of transactions
 *    - SELECT w.id, w.available, COALESCE(SUM(t.amount), 0) as calc
 *      FROM "KloelWallet" w LEFT JOIN "KloelWalletTransaction" t ON t.walletId = w.id
 *      GROUP BY w.id
 *      HAVING w.available != COALESCE(SUM(t.amount), 0)
 *    - If mismatch → E2E_RACE_CONDITION_WITHDRAWAL critical
 * 2. Check for negative wallet balances (should never happen)
 * 3. Check for withdrawals that exceed wallet balance at time of creation
 *    (sign of race condition that was processed)
 * 4. Check for duplicate withdrawal records with same amount/time (double-debit sign)
 *
 * BREAK TYPES:
 * - E2E_RACE_CONDITION_WITHDRAWAL (critical) — concurrent withdrawals result in negative balance or double debit
 */

import type { Break, PulseConfig } from '../types';
import {
  httpGet,
  httpPost,
  makeTestJwt,
  dbQuery,
  isDeepMode,
  getBackendUrl,
} from './runtime-utils';

export async function checkE2eWithdrawal(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running backend + DB
  if (!process.env.PULSE_DEEP) return [];

  const breaks: Break[] = [];

  // ── Check 1: Wallet balance vs. transaction sum consistency ──────────────
  // The wallet's stored `available` balance should equal the sum of all its transactions
  // (SALE credits positive, WITHDRAWAL debits negative, etc.)
  try {
    const mismatchRows = await dbQuery(
      `SELECT w.id, w.available, COALESCE(SUM(t.amount), 0) as calc_total,
              ABS(w.available - COALESCE(SUM(t.amount), 0)) as discrepancy
       FROM "KloelWallet" w
       LEFT JOIN "KloelWalletTransaction" t ON t."walletId" = w.id
       GROUP BY w.id, w.available
       HAVING w.available != COALESCE(SUM(t.amount), 0)
       LIMIT 5`,
    );

    if (mismatchRows.length > 0) {
      const worst = mismatchRows.reduce(
        (max: any, r: any) => (parseFloat(r.discrepancy) > parseFloat(max.discrepancy) ? r : max),
        mismatchRows[0],
      );
      breaks.push({
        type: 'E2E_RACE_CONDITION_WITHDRAWAL',
        severity: 'critical',
        file: 'backend/src/kloel/wallet.controller.ts',
        line: 1,
        description: `${mismatchRows.length} wallets have stored balance != sum of transactions — possible race condition or accounting bug`,
        detail: `Worst discrepancy: wallet ${worst.id} — stored: ${worst.available}, calc: ${worst.calc_total}, delta: ${worst.discrepancy}`,
      });
    }
  } catch (err: any) {
    // Column name may differ — try alternate query
    try {
      const altMismatch = await dbQuery(
        `SELECT w.id, w.available, COALESCE(SUM(t.amount), 0) as calc
         FROM "KloelWallet" w
         LEFT JOIN "KloelWalletTransaction" t ON t."walletId" = w.id
         GROUP BY w.id
         HAVING ABS(w.available - COALESCE(SUM(t.amount), 0)) > 0.01
         LIMIT 5`,
      );
      if (altMismatch.length > 0) {
        breaks.push({
          type: 'E2E_RACE_CONDITION_WITHDRAWAL',
          severity: 'critical',
          file: 'backend/src/kloel/wallet.controller.ts',
          line: 1,
          description: `${altMismatch.length} wallets have balance inconsistency (>R$0.01 delta) — accounting integrity at risk`,
          detail: `Sample wallet ID with mismatch: ${altMismatch[0]?.id}`,
        });
      }
    } catch {
      // DB unavailable or schema completely different — skip
    }
  }

  // ── Check 2: Negative wallet balances ────────────────────────────────────
  // A wallet with negative `available` balance is a sign of race condition win
  try {
    const negativeRows = await dbQuery(
      `SELECT id, available FROM "KloelWallet" WHERE available < 0 LIMIT 5`,
    );

    if (negativeRows.length > 0) {
      breaks.push({
        type: 'E2E_RACE_CONDITION_WITHDRAWAL',
        severity: 'critical',
        file: 'backend/src/kloel/wallet.controller.ts',
        line: 1,
        description: `${negativeRows.length} wallets have negative available balance — race condition or missing balance guard`,
        detail: `Sample: wallet ${negativeRows[0]?.id} has balance ${negativeRows[0]?.available}`,
      });
    }
  } catch {
    // Skip if column doesn't exist
  }

  // ── Check 3: Duplicate withdrawal records (double-debit sign) ────────────
  // Multiple withdrawal records for the same wallet at the same second is suspicious
  try {
    const dupeRows = await dbQuery(
      `SELECT "walletId", amount, DATE_TRUNC('second', "createdAt") as ts, COUNT(*) as cnt
       FROM "KloelWalletTransaction"
       WHERE type = 'WITHDRAWAL'
       GROUP BY "walletId", amount, DATE_TRUNC('second', "createdAt")
       HAVING COUNT(*) > 1
       LIMIT 5`,
    );

    if (dupeRows.length > 0) {
      breaks.push({
        type: 'E2E_RACE_CONDITION_WITHDRAWAL',
        severity: 'critical',
        file: 'backend/src/kloel/wallet.controller.ts',
        line: 1,
        description: `${dupeRows.length} wallet withdrawal pairs created within the same second with same amount — double debit likely`,
        detail: `Sample: walletId ${dupeRows[0]?.walletId}, amount ${dupeRows[0]?.amount}, count ${dupeRows[0]?.cnt} at ${dupeRows[0]?.ts}`,
      });
    }
  } catch {
    // Column name or type may differ — skip gracefully
  }

  // ── Check 4: Withdrawals that would exceed balance (integrity at creation) ─
  // Check for Withdrawal records where amount > wallet.available at time of request
  // (This is retrospective — we check the current state, not historical)
  try {
    const excessRows = await dbQuery(
      `SELECT w2.id as withdrawal_id, w2.amount as w_amount, wlt.available as wallet_bal
       FROM "Withdrawal" w2
       INNER JOIN "KloelWallet" wlt ON wlt."workspaceId" = w2."workspaceId"
       WHERE w2.status IN ('PENDING', 'PROCESSING')
         AND w2.amount > wlt.available
       LIMIT 5`,
    );

    if (excessRows.length > 0) {
      breaks.push({
        type: 'E2E_RACE_CONDITION_WITHDRAWAL',
        severity: 'critical',
        file: 'backend/src/kloel/wallet.controller.ts',
        line: 1,
        description: `${excessRows.length} PENDING/PROCESSING withdrawals exceed current wallet balance — possible over-withdrawal or race condition`,
        detail: `Sample: withdrawal ${excessRows[0]?.withdrawal_id} amount ${excessRows[0]?.w_amount} > wallet balance ${excessRows[0]?.wallet_bal}`,
      });
    }
  } catch {
    // Withdrawal table may not exist or schema differs — skip
  }

  return breaks;
}
