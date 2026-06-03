#!/usr/bin/env ts-node
/**
 * Standalone runner for the PERSON KloelLead → Contact backfill.
 *
 * This is a thin CLI wrapper around
 * {@link runPersonKloelLeadToContactBackfill} (all logic + safety rules live in
 * `./person-kloel-lead-to-contact.backfill.core`). It instantiates a real
 * `PrismaClient`, parses flags, runs the backfill, prints the report, and
 * disconnects.
 *
 * USAGE (from `backend/`):
 *
 *   DRY-RUN (default — writes NOTHING, just reports):
 *     npx ts-node src/prisma/backfills/person-kloel-lead-to-contact.backfill.ts
 *     # or via the package script:
 *     npm run backfill:person-lead-to-contact
 *
 *   DRY-RUN for a single workspace:
 *     npx ts-node src/prisma/backfills/person-kloel-lead-to-contact.backfill.ts \
 *       --workspace <workspaceId>
 *
 *   EXECUTE (performs the write-if-null upsert + audit — requires the explicit
 *   flag, so it can never run by accident):
 *     npx ts-node src/prisma/backfills/person-kloel-lead-to-contact.backfill.ts --execute
 *
 *   Custom batch size:
 *     ... --batch 1000
 *
 * The script connects to whatever `DATABASE_URL` is in the environment. It is a
 * one-off operational tool — it is NOT wired into app startup, NestJS DI, or
 * any migration. The owner runs it manually.
 */

import { PrismaClient } from '@prisma/client';
import {
  type BackfillMode,
  type BackfillOptions,
  type BackfillPrismaClient,
  runPersonKloelLeadToContactBackfill,
} from './person-kloel-lead-to-contact.backfill.core';

interface ParsedArgs {
  readonly mode: BackfillMode;
  readonly workspaceId?: string;
  readonly batchSize?: number;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const mode: BackfillMode = argv.includes('--execute') ? 'execute' : 'dry-run';
  let workspaceId: string | undefined;
  let batchSize: number | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === '--workspace' || arg === '-w') && i + 1 < argv.length) {
      workspaceId = argv[i + 1];
      i += 1;
    } else if ((arg === '--batch' || arg === '-b') && i + 1 < argv.length) {
      const next = argv[i + 1];
      const parsed = next !== undefined ? Number.parseInt(next, 10) : Number.NaN;
      if (Number.isFinite(parsed) && parsed > 0) {
        batchSize = parsed;
      }
      i += 1;
    }
  }

  return {
    mode,
    ...(workspaceId !== undefined ? { workspaceId } : {}),
    ...(batchSize !== undefined ? { batchSize } : {}),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  // The real PrismaClient satisfies the structural BackfillPrismaClient
  // interface; this is a widening to the read-only subset the backfill uses.
  const client = prisma as unknown as BackfillPrismaClient;

  const options: BackfillOptions = {
    mode: args.mode,
    ...(args.workspaceId !== undefined ? { workspaceId: args.workspaceId } : {}),
    ...(args.batchSize !== undefined ? { batchSize: args.batchSize } : {}),
    log: (message: string) => {
      console.log(message);
    },
  };

  if (args.mode === 'dry-run') {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(' PERSON backfill — DRY-RUN (no writes). Pass --execute to apply.');
    console.log('═══════════════════════════════════════════════════════════════');
  } else {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(' PERSON backfill — EXECUTE (write-if-null upsert + audit).');
    console.log('═══════════════════════════════════════════════════════════════');
  }

  try {
    const report = await runPersonKloelLeadToContactBackfill(client, options);
    console.log('');
    console.log('──────────────────────── SUMMARY ────────────────────────');
    console.log(JSON.stringify(report, null, 2));
    console.log('──────────────────────────────────────────────────────────');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('[person-backfill] FAILED:', error);
  process.exit(1);
});
