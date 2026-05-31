/**
 * Shared, side-effect-free helpers for the REAL-DB cognitive-loop liveness
 * proof spec. Extracted verbatim from
 * `cognitive-loop-realdb.proof.integration.spec.ts` so the spec stays within
 * the repository file-size guardrail. Behaviour is identical — these are the
 * same functions, just hoisted into a sibling module the spec imports.
 */
import { existsSync } from 'fs';
import { join } from 'path';
import * as dotenv from 'dotenv';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Hydrate DATABASE_URL from backend/.env when it is not already set. The unit
 * jest config (package.json) does NOT load test/jest.env.ts, so a standalone
 * run has no env. PrismaClient reads DATABASE_URL at construction (`new
 * PrismaService()` in beforeAll), so calling this before that is sufficient —
 * no import-ordering trick needed. If it stays unset, the connect guard skips
 * with a precise blocker.
 */
export function hydrateDatabaseUrl(): void {
  if (process.env.DATABASE_URL) {
    return;
  }
  const envPath = join(__dirname, '..', '..', '.env');
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

/**
 * Polls `predicate` until it returns true or the budget elapses. Used to await
 * the fire-and-forget bandit `register()` that recordDecision dispatches.
 */
export async function waitFor(
  predicate: () => Promise<boolean>,
  {
    timeoutMs = 8000,
    intervalMs = 100,
    label = 'condition',
  }: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    if (await predicate()) {
      return;
    }
    if (Date.now() >= deadline) {
      // Fail loudly rather than letting a later assertion read a confusing null.
      throw new Error(`waitFor timed out after ${timeoutMs}ms waiting for ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/**
 * Pre-flight schema-drift gate. MindBeliefService.getOrInit persists the belief
 * through a raw `INSERT INTO "RAC_MindBelief" (...)` that does NOT list
 * `updatedAt`, relying on the column's DB-level `DEFAULT NOW()` installed by
 * migration 20260507120000_add_kloel_mind_updated_at. If a later `prisma db
 * push` / `migrate reset` regenerated the column from schema.prisma (where
 * `@updatedAt` carries NO DB default), the raw INSERT throws NOT NULL (23502)
 * and the loop cannot persist beliefs. Detect that precise precondition and
 * return the exact blocker string so the caller can SKIP rather than dying
 * mid-loop — this is an environment finding, not a weakened proof. Returns null
 * when both columns carry their DB-level default.
 */
export async function detectUpdatedAtSchemaDrift(prisma: PrismaService): Promise<string | null> {
  const driftRows = await prisma.$queryRaw<
    Array<{ table_name: string; column_default: string | null }>
  >`
    SELECT table_name, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('RAC_MindBelief', 'RAC_MindPrediction')
      AND column_name = 'updatedAt'
  `;
  const missingDefault = driftRows.filter((r) => !r.column_default);
  if (missingDefault.length === 0) {
    return null;
  }
  return (
    'SCHEMA DRIFT: ' +
    missingDefault.map((r) => `${r.table_name}.updatedAt`).join(', ') +
    ' has NO DB-level default on this dev DB, yet migration ' +
    '20260507120000_add_kloel_mind_updated_at set DEFAULT NOW(). ' +
    "MindBeliefService.getOrInit's raw INSERT omits updatedAt and relies " +
    'on that default, so the cognitive loop cannot persist new beliefs ' +
    'here (Postgres 23502 NOT NULL). Fix the dev DB to match migrations: ' +
    'ALTER COLUMN updatedAt SET DEFAULT NOW() on both RAC_MindBelief and ' +
    'RAC_MindPrediction. Do NOT use `prisma db push`, which re-drops the default.'
  );
}
