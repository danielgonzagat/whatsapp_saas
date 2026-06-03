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

function readRequiredString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`[person-backfill] expected string field ${key}`);
  }
  return value;
}

function readOptionalString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  return typeof value === 'string' ? value : undefined;
}

function readOptionalNumber(data: Record<string, unknown>, key: string): number | undefined {
  const value = data[key];
  return typeof value === 'number' ? value : undefined;
}

function buildContactCreateInput(data: Record<string, unknown>) {
  return {
    workspaceId: readRequiredString(data, 'workspaceId'),
    phone: readRequiredString(data, 'phone'),
    name: readOptionalString(data, 'name'),
    email: readOptionalString(data, 'email'),
    kloelLeadId: readRequiredString(data, 'kloelLeadId'),
    leadStatus: readRequiredString(data, 'leadStatus'),
    leadStage: readRequiredString(data, 'leadStage'),
    lastMessage: readOptionalString(data, 'lastMessage'),
    lastIntent: readOptionalString(data, 'lastIntent'),
    totalMessages: readOptionalNumber(data, 'totalMessages') ?? 0,
  };
}

function buildContactUpdateInput(data: Record<string, unknown>) {
  return {
    kloelLeadId: readOptionalString(data, 'kloelLeadId'),
    leadStatus: readOptionalString(data, 'leadStatus'),
    leadStage: readOptionalString(data, 'leadStage'),
    lastMessage: readOptionalString(data, 'lastMessage'),
    lastIntent: readOptionalString(data, 'lastIntent'),
    totalMessages: readOptionalNumber(data, 'totalMessages'),
  };
}

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredRecord(data: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = data[key];
  if (!isStringRecord(value)) {
    throw new Error(`[person-backfill] expected object field ${key}`);
  }
  return value;
}

function readRequiredBoolean(data: Record<string, unknown>, key: string): boolean {
  const value = data[key];
  if (typeof value !== 'boolean') {
    throw new Error(`[person-backfill] expected boolean field ${key}`);
  }
  return value;
}

function readRequiredStringArray(data: Record<string, unknown>, key: string): string[] {
  const value = data[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`[person-backfill] expected string array field ${key}`);
  }
  return value;
}

function buildAuditCreateInput(data: Record<string, unknown>) {
  const details = readRequiredRecord(data, 'details');
  return {
    workspaceId: readRequiredString(data, 'workspaceId'),
    action: readRequiredString(data, 'action'),
    resource: readRequiredString(data, 'resource'),
    resourceId: readOptionalString(data, 'resourceId'),
    details: {
      source: readRequiredString(details, 'source'),
      kloelLeadId: readRequiredString(details, 'kloelLeadId'),
      createdContact: readRequiredBoolean(details, 'createdContact'),
      fieldsWritten: readRequiredStringArray(details, 'fieldsWritten'),
    },
  };
}

function createBackfillPrismaClient(prisma: PrismaClient): BackfillPrismaClient {
  return {
    workspace: {
      findMany: (args) =>
        prisma.workspace.findMany({
          select: { id: true },
          orderBy: args.orderBy,
          ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
          ...(args.skip !== undefined ? { skip: args.skip } : {}),
          take: args.take,
        }),
    },
    kloelLead: {
      findMany: (args) =>
        prisma.kloelLead.findMany({
          where: args.where,
          orderBy: args.orderBy,
          ...(args.cursor !== undefined ? { cursor: args.cursor } : {}),
          ...(args.skip !== undefined ? { skip: args.skip } : {}),
          take: args.take,
          select: {
            id: true,
            workspaceId: true,
            phone: true,
            name: true,
            email: true,
            status: true,
            stage: true,
            lastMessage: true,
            lastIntent: true,
            totalMessages: true,
          },
        }),
    },
    contact: {
      findUnique: (args) =>
        prisma.contact.findUnique({
          where: {
            workspaceId_phone: {
              workspaceId: args.where.workspaceId_phone.workspaceId,
              phone: args.where.workspaceId_phone.phone,
            },
          },
          select: {
            id: true,
            workspaceId: true,
            phone: true,
            kloelLeadId: true,
            leadStatus: true,
            leadStage: true,
            lastMessage: true,
            lastIntent: true,
            totalMessages: true,
          },
        }),
      upsert: (args) =>
        prisma.contact.upsert({
          where: {
            workspaceId_phone: {
              workspaceId: args.where.workspaceId_phone.workspaceId,
              phone: args.where.workspaceId_phone.phone,
            },
          },
          create: buildContactCreateInput(args.create),
          update: buildContactUpdateInput(args.update),
          select: { id: true },
        }),
    },
    auditLog: {
      findFirst: (args) =>
        prisma.auditLog.findFirst({
          where: {
            workspaceId: args.where.workspaceId,
            action: args.where.action,
            resource: args.where.resource,
            resourceId: args.where.resourceId,
          },
          select: { id: true },
        }),
      create: (args) => prisma.auditLog.create({ data: buildAuditCreateInput(args.data) }),
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  const client = createBackfillPrismaClient(prisma);

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
