/** Action name used for the reversibility audit entry in `RAC_AuditLog`. */
export const PERSON_BACKFILL_AUDIT_ACTION = 'person_backfill_kloel_lead_to_contact';
/** `resource` value for the audit entry. */
export const PERSON_BACKFILL_AUDIT_RESOURCE = 'Contact';

/** Default page size when cursor-paginating leads within a workspace. */
export const DEFAULT_BACKFILL_BATCH_SIZE = 500;

/**
 * The five denormalized funnel columns mirrored from `KloelLead` onto
 * `Contact`. `totalMessages` defaults to `0` (so "unset" means `0`); the rest
 * default to `null`.
 */
export const FUNNEL_COLUMNS = [
  'leadStatus',
  'leadStage',
  'lastMessage',
  'lastIntent',
  'totalMessages',
] as const;

export type FunnelColumn = (typeof FUNNEL_COLUMNS)[number];

/** Minimal shape of a `KloelLead` row this backfill reads. */
export interface BackfillKloelLead {
  readonly id: string;
  readonly workspaceId: string;
  readonly phone: string;
  readonly name: string | null;
  readonly email: string | null;
  readonly status: string;
  readonly stage: string;
  readonly lastMessage: string | null;
  readonly lastIntent: string | null;
  readonly totalMessages: number;
}

/** Minimal shape of the existing `Contact` row this backfill inspects. */
export interface BackfillContact {
  readonly id: string;
  readonly workspaceId: string;
  readonly phone: string;
  readonly kloelLeadId: string | null;
  readonly leadStatus: string | null;
  readonly leadStage: string | null;
  readonly lastMessage: string | null;
  readonly lastIntent: string | null;
  readonly totalMessages: number;
}

/** Minimal `{ id }` workspace row. */
export interface BackfillWorkspace {
  readonly id: string;
}

/**
 * Structural subset of the Prisma client the backfill needs. Only the exact
 * delegate methods used are declared, so a unit-test in-memory client stays tiny and the
 * production `PrismaClient` satisfies it structurally (no cast required).
 */
export interface BackfillPrismaClient {
  readonly workspace: {
    findMany(args: {
      select: { id: true };
      orderBy: { id: 'asc' };
      cursor?: { id: string };
      skip?: number;
      take: number;
    }): Promise<BackfillWorkspace[]>;
  };
  readonly kloelLead: {
    findMany(args: {
      where: { workspaceId: string };
      orderBy: { id: 'asc' };
      cursor?: { id: string };
      skip?: number;
      take: number;
      select: Record<string, true>;
    }): Promise<BackfillKloelLead[]>;
  };
  readonly contact: {
    findUnique(args: {
      where: { workspaceId_phone: { workspaceId: string; phone: string } };
      select: Record<string, true>;
    }): Promise<BackfillContact | null>;
    upsert(args: {
      where: { workspaceId_phone: { workspaceId: string; phone: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
      select: { id: true };
    }): Promise<{ id: string }>;
  };
  readonly auditLog: {
    findFirst(args: {
      where: {
        workspaceId: string;
        action: string;
        resource: string;
        resourceId: string;
      };
      select: { id: true };
    }): Promise<{ id: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
}

export type BackfillMode = 'dry-run' | 'execute';

export interface BackfillOptions {
  /** `'dry-run'` (default) reports only; `'execute'` performs the writes. */
  readonly mode?: BackfillMode;
  /** Restrict the run to a single workspace (still isolated). Optional. */
  readonly workspaceId?: string;
  /** Page size for both workspace and lead cursor pagination. */
  readonly batchSize?: number;
  /** Optional structured log sink (defaults to a no-op). */
  readonly log?: (message: string) => void;
}

/** Per-workspace tallies. */
export interface WorkspaceBackfillReport {
  readonly workspaceId: string;
  /** Leads whose phone normalized cleanly. */
  readonly leadsScanned: number;
  /** Leads collapsing to a Contact that did not previously exist. */
  readonly cleanMerges: number;
  /** Leads whose normalized phone already had a Contact. */
  readonly collisions: number;
  /** Distinct normalized phones where >1 lead collapses to the same Contact. */
  readonly intraLeadCollisions: number;
  /** Leads whose phone could not be normalized (skipped, never written). */
  readonly unnormalizablePhones: number;
  /** Contacts whose `kloelLeadId` pointer was newly set (execute mode). */
  readonly kloelLeadIdWritten: number;
  /** Contacts whose funnel columns were filled (execute mode). */
  readonly funnelColumnsWritten: number;
  /** Audit rows written (execute mode). */
  readonly auditEntriesWritten: number;
}

/** Top-level aggregate report. */
export interface BackfillReport {
  readonly mode: BackfillMode;
  readonly workspacesProcessed: number;
  readonly leadsScanned: number;
  readonly cleanMerges: number;
  readonly collisions: number;
  readonly intraLeadCollisions: number;
  readonly unnormalizablePhones: number;
  readonly kloelLeadIdWritten: number;
  readonly funnelColumnsWritten: number;
  readonly auditEntriesWritten: number;
  readonly perWorkspace: readonly WorkspaceBackfillReport[];
}

export const CONTACT_SELECT = {
  id: true,
  workspaceId: true,
  phone: true,
  kloelLeadId: true,
  leadStatus: true,
  leadStage: true,
  lastMessage: true,
  lastIntent: true,
  totalMessages: true,
} as const;

export const LEAD_SELECT = {
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
} as const;
