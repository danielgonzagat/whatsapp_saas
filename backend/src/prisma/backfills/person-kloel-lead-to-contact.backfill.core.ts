/**
 * PERSON backfill — migrate legacy KloelLead rows into the canonical Contact.
 *
 * Context
 * -------
 * The PERSON migration already shipped, in order:
 *   - P0: additive, nullable Contact columns
 *       (`leadStatus`, `leadStage`, `lastMessage`, `lastIntent`, `totalMessages`,
 *        `kloelLeadId`) — see migration `20260529141000_add_lead_contact_bridge_columns`.
 *   - P1: dual-write — new live traffic enriches the Contact funnel columns.
 *
 * This module is the **historical** backfill: it walks every legacy `KloelLead`
 * row that has not yet been reflected onto a `Contact` and upserts the canonical
 * `Contact` keyed on the unique `(workspaceId, phone)`. It is the data-move phase
 * that P0/P1 deliberately left out.
 *
 * Hard safety rules baked into this code (NOT optional):
 *   1. DRY-RUN is the DEFAULT. Nothing is written unless `mode === 'execute'`.
 *   2. `kloelLeadId` is WRITE-IF-NULL — an established provenance pointer is
 *      never overwritten (a Contact may already point at a *different* lead via
 *      live promotion; we must not clobber that lineage).
 *   3. The 5 funnel columns are WRITE-IF-NULL / WRITE-IF-DEFAULT — a Contact
 *      already enriched by live traffic (P1 dual-write) wins; the backfill only
 *      fills holes, it never regresses live state.
 *   4. A `KloelLead` is NEVER deleted. The legacy row stays as the source of
 *      truth for its own lineage; the bridge is one-directional.
 *   5. Every touched `contactId` is recorded in the canonical `AuditLog`
 *      (`RAC_AuditLog`) table, so the move is reversible / auditable. The audit
 *      write itself is idempotent (find-first-then-create on the same key).
 *   6. Idempotent: re-running is a no-op (write-if-null + audit-if-missing).
 *   7. Workspace-isolated and batched — leads are read per workspace in
 *      bounded `id`-cursor pages; the full table is never loaded at once.
 *
 * This file is intentionally framework-free and depends on a *structural*
 * Prisma client interface ({@link BackfillPrismaClient}) so it can be unit
 * tested with a plain mock and driven from a standalone `ts-node` runner.
 * The real `PrismaClient` / `PrismaService` satisfies the interface at the
 * call site without any cast.
 */

import { normalizePhone } from '../../common/phone/phone-normalization.util';
import {
  buildContactCreateData,
  computeFunnelPatch,
} from './person-kloel-lead-to-contact.backfill.transforms';
import {
  CONTACT_SELECT,
  DEFAULT_BACKFILL_BATCH_SIZE,
  FUNNEL_COLUMNS,
  LEAD_SELECT,
  PERSON_BACKFILL_AUDIT_ACTION,
  PERSON_BACKFILL_AUDIT_RESOURCE,
} from './person-kloel-lead-to-contact.backfill.types';
import type {
  BackfillKloelLead,
  BackfillMode,
  BackfillOptions,
  BackfillPrismaClient,
  BackfillReport,
  FunnelColumn,
  WorkspaceBackfillReport,
} from './person-kloel-lead-to-contact.backfill.types';

export {
  DEFAULT_BACKFILL_BATCH_SIZE,
  FUNNEL_COLUMNS,
  PERSON_BACKFILL_AUDIT_ACTION,
  PERSON_BACKFILL_AUDIT_RESOURCE,
} from './person-kloel-lead-to-contact.backfill.types';
export type {
  BackfillContact,
  BackfillKloelLead,
  BackfillMode,
  BackfillOptions,
  BackfillPrismaClient,
  BackfillReport,
  BackfillWorkspace,
  FunnelColumn,
  WorkspaceBackfillReport,
} from './person-kloel-lead-to-contact.backfill.types';
export { computeFunnelPatch } from './person-kloel-lead-to-contact.backfill.transforms';
interface WorkspaceAccumulator {
  leadsScanned: number;
  cleanMerges: number;
  collisions: number;
  intraLeadCollisions: number;
  unnormalizablePhones: number;
  kloelLeadIdWritten: number;
  funnelColumnsWritten: number;
  auditEntriesWritten: number;
}

function emptyAccumulator(): WorkspaceAccumulator {
  return {
    leadsScanned: 0,
    cleanMerges: 0,
    collisions: 0,
    intraLeadCollisions: 0,
    unnormalizablePhones: 0,
    kloelLeadIdWritten: 0,
    funnelColumnsWritten: 0,
    auditEntriesWritten: 0,
  };
}

/**
 * Idempotently write the reversibility audit entry for a touched contact.
 * No-op if an entry for `(workspaceId, action, resource, contactId)` already
 * exists. Returns `true` iff a new audit row was created.
 */
async function recordBackfillAudit(
  client: BackfillPrismaClient,
  input: {
    workspaceId: string;
    contactId: string;
    leadId: string;
    fieldsWritten: string[];
    createdContact: boolean;
  },
): Promise<boolean> {
  const existing = await client.auditLog.findFirst({
    where: {
      workspaceId: input.workspaceId,
      action: PERSON_BACKFILL_AUDIT_ACTION,
      resource: PERSON_BACKFILL_AUDIT_RESOURCE,
      resourceId: input.contactId,
    },
    select: { id: true },
  });
  if (existing) {
    return false;
  }
  await client.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      action: PERSON_BACKFILL_AUDIT_ACTION,
      resource: PERSON_BACKFILL_AUDIT_RESOURCE,
      resourceId: input.contactId,
      details: {
        source: 'person-kloel-lead-to-contact.backfill',
        kloelLeadId: input.leadId,
        createdContact: input.createdContact,
        fieldsWritten: input.fieldsWritten,
      },
    },
  });
  return true;
}

/**
 * Process a single lead against the current Contact state. In dry-run mode this
 * only classifies (clean-merge vs collision) and never writes. In execute mode
 * it performs the write-if-null upsert + audit.
 *
 * `seenPhones` tracks normalized phones already handled *within this workspace
 * run* so two leads collapsing to the same phone are counted as an intra-lead
 * collision exactly once.
 */
async function processLead(
  client: BackfillPrismaClient,
  lead: BackfillKloelLead,
  mode: BackfillMode,
  seenPhones: Set<string>,
  acc: WorkspaceAccumulator,
): Promise<void> {
  const normalized = normalizePhone(lead.phone);
  if (normalized === null) {
    acc.unnormalizablePhones += 1;
    return;
  }
  acc.leadsScanned += 1;
  const phone = normalized.digits;

  const intraCollision = seenPhones.has(phone);
  if (intraCollision) {
    acc.intraLeadCollisions += 1;
  }
  seenPhones.add(phone);

  const existing = await client.contact.findUnique({
    where: { workspaceId_phone: { workspaceId: lead.workspaceId, phone } },
    select: CONTACT_SELECT,
  });

  if (existing === null) {
    acc.cleanMerges += 1;
  } else {
    acc.collisions += 1;
  }

  if (mode === 'dry-run') {
    return;
  }

  // EXECUTE — write-if-null upsert.
  const fieldsWritten: string[] = [];
  let willWriteKloelLeadId = false;
  let updateData: Record<string, unknown> = {};

  if (existing === null) {
    // Brand-new Contact: seed full create data with normalized phone.
    fieldsWritten.push('created', 'kloelLeadId', ...FUNNEL_COLUMNS);
    willWriteKloelLeadId = true;
  } else {
    // WRITE-IF-NULL kloelLeadId — never overwrite an established pointer.
    if (existing.kloelLeadId === null) {
      updateData.kloelLeadId = lead.id;
      willWriteKloelLeadId = true;
      fieldsWritten.push('kloelLeadId');
    }
    const funnelPatch = computeFunnelPatch(lead, existing);
    if (Object.keys(funnelPatch).length > 0) {
      updateData = { ...updateData, ...funnelPatch };
      fieldsWritten.push(...Object.keys(funnelPatch));
    }
    if (Object.keys(updateData).length === 0) {
      // Already fully enriched — idempotent no-op. Still ensure an audit row
      // exists so the contact is recorded as backfill-touched exactly once.
      const created = await recordBackfillAudit(client, {
        workspaceId: lead.workspaceId,
        contactId: existing.id,
        leadId: lead.id,
        fieldsWritten: [],
        createdContact: false,
      });
      if (created) {
        acc.auditEntriesWritten += 1;
      }
      return;
    }
  }

  const result = await client.contact.upsert({
    where: {
      workspaceId_phone: { workspaceId: lead.workspaceId, phone },
    },
    create: buildContactCreateData({ ...lead, phone }),
    update: updateData,
    select: { id: true },
  });

  if (willWriteKloelLeadId) {
    acc.kloelLeadIdWritten += 1;
  }
  const wroteFunnel = fieldsWritten.some((f): f is FunnelColumn =>
    (FUNNEL_COLUMNS as readonly string[]).includes(f),
  );
  if (wroteFunnel) {
    acc.funnelColumnsWritten += 1;
  }

  const created = await recordBackfillAudit(client, {
    workspaceId: lead.workspaceId,
    contactId: result.id,
    leadId: lead.id,
    fieldsWritten,
    createdContact: existing === null,
  });
  if (created) {
    acc.auditEntriesWritten += 1;
  }
}

/** Cursor-paginate every lead in one workspace and process it. */
async function processWorkspace(
  client: BackfillPrismaClient,
  workspaceId: string,
  mode: BackfillMode,
  batchSize: number,
): Promise<WorkspaceBackfillReport> {
  const acc = emptyAccumulator();
  const seenPhones = new Set<string>();
  let cursor: string | undefined;

  for (;;) {
    const leads: BackfillKloelLead[] = await client.kloelLead.findMany({
      where: { workspaceId },
      orderBy: { id: 'asc' },
      ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: batchSize,
      select: LEAD_SELECT,
    });
    if (leads.length === 0) {
      break;
    }
    for (const lead of leads) {
      await processLead(client, lead, mode, seenPhones, acc);
    }
    const last = leads[leads.length - 1];
    if (last === undefined || leads.length < batchSize) {
      break;
    }
    cursor = last.id;
  }

  return { workspaceId, ...acc };
}

/**
 * Run the PERSON KloelLead → Contact backfill.
 *
 * DRY-RUN (default) writes nothing — it only reports clean-merge / collision /
 * intra-lead-collision / unnormalizable-phone counts per workspace. EXECUTE
 * performs the write-if-null upsert + reversibility audit. Re-running EXECUTE
 * is a no-op (idempotent).
 */
export async function runPersonKloelLeadToContactBackfill(
  client: BackfillPrismaClient,
  options: BackfillOptions = {},
): Promise<BackfillReport> {
  const mode: BackfillMode = options.mode ?? 'dry-run';
  const batchSize =
    options.batchSize && options.batchSize > 0 ? options.batchSize : DEFAULT_BACKFILL_BATCH_SIZE;
  const log = options.log ?? (() => undefined);

  const perWorkspace: WorkspaceBackfillReport[] = [];

  const workspaceIds = await collectWorkspaceIds(client, options.workspaceId, batchSize);
  log(`[person-backfill] mode=${mode} workspaces=${workspaceIds.length} batchSize=${batchSize}`);

  for (const workspaceId of workspaceIds) {
    const report = await processWorkspace(client, workspaceId, mode, batchSize);
    perWorkspace.push(report);
    log(
      `[person-backfill] workspace=${workspaceId} scanned=${report.leadsScanned} ` +
        `clean=${report.cleanMerges} collisions=${report.collisions} ` +
        `intraLead=${report.intraLeadCollisions} unnormalizable=${report.unnormalizablePhones}`,
    );
  }

  return aggregate(mode, perWorkspace);
}

/**
 * Resolve the workspace id list to process. When `only` is given, it is the
 * single workspace; otherwise every workspace is cursor-paginated so the full
 * table is never loaded at once.
 */
async function collectWorkspaceIds(
  client: BackfillPrismaClient,
  only: string | undefined,
  batchSize: number,
): Promise<string[]> {
  if (only !== undefined && only !== '') {
    return [only];
  }
  const ids: string[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await client.workspace.findMany({
      select: { id: true },
      orderBy: { id: 'asc' },
      ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: batchSize,
    });
    if (page.length === 0) {
      break;
    }
    for (const w of page) {
      ids.push(w.id);
    }
    const last = page[page.length - 1];
    if (last === undefined || page.length < batchSize) {
      break;
    }
    cursor = last.id;
  }
  return ids;
}

function aggregate(mode: BackfillMode, perWorkspace: WorkspaceBackfillReport[]): BackfillReport {
  const sum = (pick: (r: WorkspaceBackfillReport) => number): number =>
    perWorkspace.reduce((total, r) => total + pick(r), 0);
  return {
    mode,
    workspacesProcessed: perWorkspace.length,
    leadsScanned: sum((r) => r.leadsScanned),
    cleanMerges: sum((r) => r.cleanMerges),
    collisions: sum((r) => r.collisions),
    intraLeadCollisions: sum((r) => r.intraLeadCollisions),
    unnormalizablePhones: sum((r) => r.unnormalizablePhones),
    kloelLeadIdWritten: sum((r) => r.kloelLeadIdWritten),
    funnelColumnsWritten: sum((r) => r.funnelColumnsWritten),
    auditEntriesWritten: sum((r) => r.auditEntriesWritten),
    perWorkspace,
  };
}
