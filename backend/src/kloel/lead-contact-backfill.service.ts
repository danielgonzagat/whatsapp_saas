/**
 * LeadContactBackfillService — NestJS-injectable, per-workspace driver for the
 * idempotent KloelLead → canonical Contact backfill.
 *
 * Lead–Contact duplication family (contact-identity, MIGRATION_PLAYBOOK.md
 * STEP 3 "Backfill"). The data-move logic + every hard safety rule already live
 * in the framework-free core
 * ({@link runPersonKloelLeadToContactBackfill}); this service is a thin DI
 * wrapper that adapts the application `PrismaService` to the core's structural
 * `BackfillPrismaClient` (the SAME adapter the standalone `ts-node` runner
 * builds) so the backfill can also be driven from an admin endpoint or a cron
 * job, scoped to one workspace at a time.
 *
 * Safety (inherited from the core, NOT re-implemented here):
 *   - ADDITIVE: it only ever upserts `Contact` rows on the canonical
 *     `workspaceId_phone` key (via `normalizePhone().digits`, the same key
 *     `CrmService.upsertContact` / `LeadMindCoordinator.syncCanonicalContact`
 *     use). It NEVER deletes, mutates, or reads-to-delete any `KloelLead`.
 *   - WRITE-IF-NULL: an established `kloelLeadId` pointer and live-traffic funnel
 *     columns are never clobbered — the backfill only fills holes.
 *   - IDEMPOTENT: re-running a workspace is a no-op (write-if-null + audit-if-
 *     missing). Default `mode` is `'dry-run'` (reports only); callers must pass
 *     `'execute'` to perform writes.
 *
 * This service does NOT change schema, does NOT run `prisma migrate`, and is not
 * wired into app startup — it is invoked on demand.
 *
 * @see backend/src/prisma/backfills/person-kloel-lead-to-contact.backfill.core.ts
 * @see docs/architecture/MIGRATION_PLAYBOOK.md (Lead–Contact duplication family, STEP 3)
 */
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { StructuredLogger } from '../logging/structured-logger';
import { PrismaService } from '../prisma/prisma.service';
import {
  runPersonKloelLeadToContactBackfill,
  type BackfillMode,
  type BackfillPrismaClient,
  type BackfillReport,
} from '../prisma/backfills/person-kloel-lead-to-contact.backfill.core';

/** Options for a single workspace backfill run. */
export interface LeadContactBackfillRunOptions {
  /** `'dry-run'` (default) reports only; `'execute'` performs write-if-null upserts. */
  readonly mode?: BackfillMode;
  /** Page size for the lead cursor pagination. Defaults to the core's default. */
  readonly batchSize?: number;
}

function readRequiredString(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`[lead-contact-backfill] expected string field ${key}`);
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

/**
 * Build a strongly-typed `ContactUncheckedCreateInput` from the core's
 * untyped create payload, mirroring the standalone runner. Uses the unchecked
 * variant so `workspaceId` is set directly (no `workspace.connect` nesting).
 */
function buildContactCreateInput(
  data: Record<string, unknown>,
): Prisma.ContactUncheckedCreateInput {
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

/** Build the WRITE-IF-NULL `ContactUncheckedUpdateInput` patch. */
function buildContactUpdateInput(
  data: Record<string, unknown>,
): Prisma.ContactUncheckedUpdateInput {
  // Only forward keys the core actually placed in `updateData` (it emits just
  // the write-if-null patch it wants applied). Emitting `undefined` for absent
  // keys would be a no-op under real Prisma but clobbers values in naive mocks,
  // so we omit them — the on-disk result is identical either way.
  const patch: Prisma.ContactUncheckedUpdateInput = {};
  const kloelLeadId = readOptionalString(data, 'kloelLeadId');
  if (kloelLeadId !== undefined) {
    patch.kloelLeadId = kloelLeadId;
  }
  const leadStatus = readOptionalString(data, 'leadStatus');
  if (leadStatus !== undefined) {
    patch.leadStatus = leadStatus;
  }
  const leadStage = readOptionalString(data, 'leadStage');
  if (leadStage !== undefined) {
    patch.leadStage = leadStage;
  }
  const lastMessage = readOptionalString(data, 'lastMessage');
  if (lastMessage !== undefined) {
    patch.lastMessage = lastMessage;
  }
  const lastIntent = readOptionalString(data, 'lastIntent');
  if (lastIntent !== undefined) {
    patch.lastIntent = lastIntent;
  }
  const totalMessages = readOptionalNumber(data, 'totalMessages');
  if (totalMessages !== undefined) {
    patch.totalMessages = totalMessages;
  }
  return patch;
}

function isStringRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredRecord(data: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = data[key];
  if (!isStringRecord(value)) {
    throw new Error(`[lead-contact-backfill] expected object field ${key}`);
  }
  return value;
}

function readRequiredBoolean(data: Record<string, unknown>, key: string): boolean {
  const value = data[key];
  if (typeof value !== 'boolean') {
    throw new Error(`[lead-contact-backfill] expected boolean field ${key}`);
  }
  return value;
}

function readRequiredStringArray(data: Record<string, unknown>, key: string): string[] {
  const value = data[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`[lead-contact-backfill] expected string array field ${key}`);
  }
  return value;
}

/** Build the typed `AuditLogUncheckedCreateInput` for the reversibility entry. */
function buildAuditCreateInput(data: Record<string, unknown>): Prisma.AuditLogUncheckedCreateInput {
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

/**
 * Adapt the wide application `PrismaService` to the narrow structural
 * `BackfillPrismaClient` the core expects. Only the exact delegate methods the
 * backfill uses are forwarded; the field projections match the core's
 * `LEAD_SELECT` / `CONTACT_SELECT` / audit shapes.
 */
function createBackfillPrismaClient(prisma: PrismaService): BackfillPrismaClient {
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
      create: (args) =>
        prisma.auditLog.create({
          data: buildAuditCreateInput(args.data),
          select: { id: true },
        }),
    },
  };
}

/**
 * On-demand driver for the idempotent KloelLead → Contact backfill, scoped to a
 * single workspace. Safe to call from an admin endpoint or cron.
 */
@Injectable()
export class LeadContactBackfillService {
  private readonly logger = StructuredLogger.from(LeadContactBackfillService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ensure every `KloelLead` in `workspaceId` is reflected onto a canonical
   * `Contact` (write-if-null upsert on `normalizePhone().digits`). Idempotent —
   * re-running is a no-op. Pass `mode: 'execute'` to perform writes; the default
   * `'dry-run'` only reports clean-merge / collision counts.
   *
   * Contact-only and additive: never deletes or mutates a `KloelLead`.
   */
  async ensureContactsForWorkspace(
    workspaceId: string,
    options: LeadContactBackfillRunOptions = {},
  ): Promise<BackfillReport> {
    const mode: BackfillMode = options.mode ?? 'dry-run';
    const client = createBackfillPrismaClient(this.prisma);
    const report = await runPersonKloelLeadToContactBackfill(client, {
      workspaceId,
      mode,
      ...(options.batchSize !== undefined ? { batchSize: options.batchSize } : {}),
      log: (message: string) => this.logger.log(message),
    });
    this.logger.log(
      `lead-contact backfill ws=${workspaceId} mode=${mode} scanned=${report.leadsScanned} ` +
        `clean=${report.cleanMerges} collisions=${report.collisions} ` +
        `kloelLeadIdWritten=${report.kloelLeadIdWritten} funnelWritten=${report.funnelColumnsWritten}`,
    );
    return report;
  }
}
