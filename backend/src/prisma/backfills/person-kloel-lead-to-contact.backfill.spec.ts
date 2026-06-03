/**
 * Unit tests for the PERSON KloelLead → Contact backfill core.
 *
 * Everything runs against a typed in-memory mock that satisfies
 * {@link BackfillPrismaClient}. No real database is touched.
 *
 * Coverage of the contracted requirements:
 *   - DRY-RUN writes nothing (no upsert, no audit).
 *   - Collision detection (existing Contact on workspaceId+normalizedPhone).
 *   - Intra-KloelLead collisions (two leads collapse to one phone).
 *   - Unnormalizable phones counted and never written.
 *   - WRITE-IF-NULL for `kloelLeadId` (never overwrites an established pointer).
 *   - WRITE-IF-NULL for the funnel columns (live-traffic enrichment wins).
 *   - New-contact create path seeds provenance + funnel.
 *   - Reversibility audit entry per touched contact.
 *   - Idempotent re-run is a no-op.
 *   - Workspace isolation (a lead is only matched within its own workspace).
 */

import {
  type BackfillContact,
  type BackfillKloelLead,
  type BackfillPrismaClient,
  computeFunnelPatch,
  PERSON_BACKFILL_AUDIT_ACTION,
  PERSON_BACKFILL_AUDIT_RESOURCE,
  runPersonKloelLeadToContactBackfill,
} from './person-kloel-lead-to-contact.backfill.core';

interface UpsertCall {
  readonly workspaceId: string;
  readonly phone: string;
  readonly create: Record<string, unknown>;
  readonly update: Record<string, unknown>;
}

interface AuditRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly action: string;
  readonly resource: string;
  readonly resourceId: string;
  readonly details: Record<string, unknown>;
}

/**
 * An in-memory store that behaves like the slice of Prisma the backfill uses.
 * Contacts are keyed on `${workspaceId}::${phone}` so the unique
 * `(workspaceId, phone)` constraint and workspace isolation are both modeled.
 */
class MockPrisma implements BackfillPrismaClient {
  private readonly workspaces: string[];
  private readonly leadsByWorkspace: Map<string, BackfillKloelLead[]>;
  private readonly contacts = new Map<string, BackfillContact>();
  private readonly audits: AuditRow[] = [];
  private contactSeq = 0;
  private auditSeq = 0;

  readonly upsertCalls: UpsertCall[] = [];

  constructor(input: {
    workspaces: string[];
    leads: BackfillKloelLead[];
    contacts?: BackfillContact[];
  }) {
    this.workspaces = [...input.workspaces].sort((a, b) => a.localeCompare(b));
    this.leadsByWorkspace = new Map();
    for (const lead of input.leads) {
      const list = this.leadsByWorkspace.get(lead.workspaceId) ?? [];
      list.push(lead);
      this.leadsByWorkspace.set(lead.workspaceId, list);
    }
    for (const list of this.leadsByWorkspace.values()) {
      list.sort((a, b) => a.id.localeCompare(b.id));
    }
    for (const c of input.contacts ?? []) {
      this.contacts.set(`${c.workspaceId}::${c.phone}`, c);
    }
  }

  get auditCount(): number {
    return this.audits.length;
  }

  contactSnapshot(workspaceId: string, phone: string): BackfillContact | undefined {
    return this.contacts.get(`${workspaceId}::${phone}`);
  }

  readonly workspace = {
    findMany: async (args: {
      orderBy: { id: 'asc' };
      cursor?: { id: string };
      skip?: number;
      take: number;
    }): Promise<{ id: string }[]> => {
      let start = 0;
      if (args.cursor) {
        const idx = this.workspaces.indexOf(args.cursor.id);
        start = idx >= 0 ? idx + (args.skip ?? 0) : this.workspaces.length;
      }
      return this.workspaces.slice(start, start + args.take).map((id) => ({ id }));
    },
  };

  readonly kloelLead = {
    findMany: async (args: {
      where: { workspaceId: string };
      orderBy: { id: 'asc' };
      cursor?: { id: string };
      skip?: number;
      take: number;
    }): Promise<BackfillKloelLead[]> => {
      const all = this.leadsByWorkspace.get(args.where.workspaceId) ?? [];
      let start = 0;
      if (args.cursor) {
        const idx = all.findIndex((l) => l.id === args.cursor?.id);
        start = idx >= 0 ? idx + (args.skip ?? 0) : all.length;
      }
      return all.slice(start, start + args.take);
    },
  };

  readonly contact = {
    findUnique: async (args: {
      where: { workspaceId_phone: { workspaceId: string; phone: string } };
    }): Promise<BackfillContact | null> => {
      const { workspaceId, phone } = args.where.workspaceId_phone;
      return this.contacts.get(`${workspaceId}::${phone}`) ?? null;
    },
    upsert: async (args: {
      where: { workspaceId_phone: { workspaceId: string; phone: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<{ id: string }> => {
      const { workspaceId, phone } = args.where.workspaceId_phone;
      this.upsertCalls.push({ workspaceId, phone, create: args.create, update: args.update });
      const key = `${workspaceId}::${phone}`;
      const existing = this.contacts.get(key);
      if (existing) {
        const merged: BackfillContact = {
          ...existing,
          ...(args.update as Partial<BackfillContact>),
        };
        this.contacts.set(key, merged);
        return { id: merged.id };
      }
      this.contactSeq += 1;
      const id = `contact-${this.contactSeq}`;
      const created: BackfillContact = {
        id,
        workspaceId,
        phone,
        kloelLeadId: (args.create.kloelLeadId as string | undefined) ?? null,
        leadStatus: (args.create.leadStatus as string | undefined) ?? null,
        leadStage: (args.create.leadStage as string | undefined) ?? null,
        lastMessage: (args.create.lastMessage as string | undefined) ?? null,
        lastIntent: (args.create.lastIntent as string | undefined) ?? null,
        totalMessages: (args.create.totalMessages as number | undefined) ?? 0,
      };
      this.contacts.set(key, created);
      return { id };
    },
  };

  readonly auditLog = {
    findFirst: async (args: {
      where: { workspaceId: string; action: string; resource: string; resourceId: string };
    }): Promise<{ id: string } | null> => {
      const match = this.audits.find(
        (a) =>
          a.workspaceId === args.where.workspaceId &&
          a.action === args.where.action &&
          a.resource === args.where.resource &&
          a.resourceId === args.where.resourceId,
      );
      return match ? { id: match.id } : null;
    },
    create: async (args: { data: Record<string, unknown> }): Promise<{ id: string }> => {
      this.auditSeq += 1;
      const id = `audit-${this.auditSeq}`;
      this.audits.push({
        id,
        workspaceId: args.data.workspaceId as string,
        action: args.data.action as string,
        resource: args.data.resource as string,
        resourceId: args.data.resourceId as string,
        details: args.data.details as Record<string, unknown>,
      });
      return { id };
    },
  };

  auditFor(contactId: string): AuditRow | undefined {
    return this.audits.find((a) => a.resourceId === contactId);
  }
}

function makeLead(overrides: Partial<BackfillKloelLead> = {}): BackfillKloelLead {
  return {
    id: 'lead-1',
    workspaceId: 'ws-1',
    phone: '11987654321',
    name: 'João Silva',
    email: 'joao@test.com',
    status: 'hot',
    stage: 'negotiation',
    lastMessage: 'quero comprar',
    lastIntent: 'purchase',
    totalMessages: 7,
    ...overrides,
  };
}

function makeContact(overrides: Partial<BackfillContact> = {}): BackfillContact {
  return {
    id: 'existing-contact',
    workspaceId: 'ws-1',
    phone: '5511987654321',
    kloelLeadId: null,
    leadStatus: null,
    leadStage: null,
    lastMessage: null,
    lastIntent: null,
    totalMessages: 0,
    ...overrides,
  };
}

describe('person-kloel-lead-to-contact backfill', () => {
  describe('DRY-RUN', () => {
    it('writes nothing — no upsert, no audit — and reports a clean merge', async () => {
      const prisma = new MockPrisma({ workspaces: ['ws-1'], leads: [makeLead()] });

      const report = await runPersonKloelLeadToContactBackfill(prisma); // default mode

      expect(report.mode).toBe('dry-run');
      expect(prisma.upsertCalls).toHaveLength(0);
      expect(prisma.auditCount).toBe(0);
      expect(report.cleanMerges).toBe(1);
      expect(report.collisions).toBe(0);
      expect(report.leadsScanned).toBe(1);
    });

    it('detects a collision when a Contact already exists on workspaceId+normalizedPhone', async () => {
      // Lead phone "11987654321" normalizes to "5511987654321" — matches contact.
      const prisma = new MockPrisma({
        workspaces: ['ws-1'],
        leads: [makeLead()],
        contacts: [makeContact()],
      });

      const report = await runPersonKloelLeadToContactBackfill(prisma, { mode: 'dry-run' });

      expect(report.collisions).toBe(1);
      expect(report.cleanMerges).toBe(0);
      expect(prisma.upsertCalls).toHaveLength(0);
    });

    it('counts intra-KloelLead collisions when two leads collapse to one phone', async () => {
      const prisma = new MockPrisma({
        workspaces: ['ws-1'],
        leads: [
          makeLead({ id: 'lead-a', phone: '11987654321' }),
          makeLead({ id: 'lead-b', phone: '(11) 98765-4321' }), // same normalized digits
        ],
      });

      const report = await runPersonKloelLeadToContactBackfill(prisma, { mode: 'dry-run' });

      expect(report.intraLeadCollisions).toBe(1);
      expect(report.leadsScanned).toBe(2);
    });

    it('counts unnormalizable phones and never writes them', async () => {
      const prisma = new MockPrisma({
        workspaces: ['ws-1'],
        leads: [makeLead({ id: 'bad', phone: 'not-a-phone' })],
      });

      const report = await runPersonKloelLeadToContactBackfill(prisma, { mode: 'execute' });

      expect(report.unnormalizablePhones).toBe(1);
      expect(report.leadsScanned).toBe(0);
      expect(prisma.upsertCalls).toHaveLength(0);
    });
  });

  describe('EXECUTE — new contact', () => {
    it('creates a Contact seeding provenance + funnel and writes one audit row', async () => {
      const prisma = new MockPrisma({ workspaces: ['ws-1'], leads: [makeLead()] });

      const report = await runPersonKloelLeadToContactBackfill(prisma, { mode: 'execute' });

      expect(prisma.upsertCalls).toHaveLength(1);
      const created = prisma.contactSnapshot('ws-1', '5511987654321');
      expect(created).toBeDefined();
      expect(created?.kloelLeadId).toBe('lead-1');
      expect(created?.leadStatus).toBe('hot');
      expect(created?.leadStage).toBe('negotiation');
      expect(created?.lastMessage).toBe('quero comprar');
      expect(created?.lastIntent).toBe('purchase');
      expect(created?.totalMessages).toBe(7);

      expect(report.kloelLeadIdWritten).toBe(1);
      expect(report.funnelColumnsWritten).toBe(1);
      expect(report.auditEntriesWritten).toBe(1);

      const audit = prisma.auditFor(created?.id ?? '');
      expect(audit?.action).toBe(PERSON_BACKFILL_AUDIT_ACTION);
      expect(audit?.resource).toBe(PERSON_BACKFILL_AUDIT_RESOURCE);
      expect(audit?.details.kloelLeadId).toBe('lead-1');
    });
  });

  describe('EXECUTE — write-if-null on existing contact', () => {
    it('sets kloelLeadId when the Contact pointer is null', async () => {
      const prisma = new MockPrisma({
        workspaces: ['ws-1'],
        leads: [makeLead()],
        contacts: [makeContact({ kloelLeadId: null })],
      });

      await runPersonKloelLeadToContactBackfill(prisma, { mode: 'execute' });

      expect(prisma.upsertCalls[0]?.update.kloelLeadId).toBe('lead-1');
      expect(prisma.contactSnapshot('ws-1', '5511987654321')?.kloelLeadId).toBe('lead-1');
    });

    it('NEVER overwrites an established kloelLeadId pointer', async () => {
      const prisma = new MockPrisma({
        workspaces: ['ws-1'],
        leads: [makeLead({ id: 'lead-new' })],
        contacts: [makeContact({ kloelLeadId: 'lead-established' })],
      });

      await runPersonKloelLeadToContactBackfill(prisma, { mode: 'execute' });

      // The update payload must not carry kloelLeadId at all.
      for (const call of prisma.upsertCalls) {
        expect(call.update).not.toHaveProperty('kloelLeadId');
      }
      expect(prisma.contactSnapshot('ws-1', '5511987654321')?.kloelLeadId).toBe('lead-established');
    });

    it('fills only the null funnel columns and never regresses live-enriched ones', async () => {
      const prisma = new MockPrisma({
        workspaces: ['ws-1'],
        leads: [
          makeLead({
            status: 'hot',
            stage: 'negotiation',
            lastMessage: 'L',
            lastIntent: 'buy',
            totalMessages: 9,
          }),
        ],
        contacts: [
          makeContact({
            kloelLeadId: 'lead-established',
            leadStatus: 'live-status', // already enriched — must NOT change
            leadStage: null, // hole — should be filled with lead.stage
            lastMessage: null, // hole — fill
            lastIntent: 'live-intent', // enriched — keep
            totalMessages: 3, // non-default — keep (live wins)
          }),
        ],
      });

      await runPersonKloelLeadToContactBackfill(prisma, { mode: 'execute' });

      const update = prisma.upsertCalls[0]?.update ?? {};
      expect(update).not.toHaveProperty('leadStatus');
      expect(update.leadStage).toBe('negotiation');
      expect(update.lastMessage).toBe('L');
      expect(update).not.toHaveProperty('lastIntent');
      expect(update).not.toHaveProperty('totalMessages');

      const after = prisma.contactSnapshot('ws-1', '5511987654321');
      expect(after?.leadStatus).toBe('live-status');
      expect(after?.lastIntent).toBe('live-intent');
      expect(after?.totalMessages).toBe(3);
    });
  });

  describe('idempotency', () => {
    it('re-running EXECUTE is a no-op (no second upsert, no duplicate audit)', async () => {
      const prisma = new MockPrisma({ workspaces: ['ws-1'], leads: [makeLead()] });

      await runPersonKloelLeadToContactBackfill(prisma, { mode: 'execute' });
      const upsertsAfterFirst = prisma.upsertCalls.length;
      const auditsAfterFirst = prisma.auditCount;

      const second = await runPersonKloelLeadToContactBackfill(prisma, { mode: 'execute' });

      // Second run finds the Contact fully enriched: no new upsert, no new audit.
      expect(prisma.upsertCalls.length).toBe(upsertsAfterFirst);
      expect(prisma.auditCount).toBe(auditsAfterFirst);
      expect(second.auditEntriesWritten).toBe(0);
      expect(second.kloelLeadIdWritten).toBe(0);
      expect(second.funnelColumnsWritten).toBe(0);
    });
  });

  describe('workspace isolation', () => {
    it('does not match a Contact from a different workspace', async () => {
      // Same phone, different workspace — must be treated as a clean merge in ws-2.
      const prisma = new MockPrisma({
        workspaces: ['ws-1', 'ws-2'],
        leads: [makeLead({ id: 'lead-ws2', workspaceId: 'ws-2' })],
        contacts: [makeContact({ id: 'c-ws1', workspaceId: 'ws-1' })],
      });

      const report = await runPersonKloelLeadToContactBackfill(prisma, { mode: 'dry-run' });

      expect(report.collisions).toBe(0);
      expect(report.cleanMerges).toBe(1);
      const ws2 = report.perWorkspace.find((r) => r.workspaceId === 'ws-2');
      expect(ws2?.cleanMerges).toBe(1);
    });

    it('honors a single-workspace filter', async () => {
      const prisma = new MockPrisma({
        workspaces: ['ws-1', 'ws-2'],
        leads: [
          makeLead({ id: 'l1', workspaceId: 'ws-1' }),
          makeLead({ id: 'l2', workspaceId: 'ws-2' }),
        ],
      });

      const report = await runPersonKloelLeadToContactBackfill(prisma, {
        mode: 'dry-run',
        workspaceId: 'ws-1',
      });

      expect(report.workspacesProcessed).toBe(1);
      expect(report.leadsScanned).toBe(1);
      expect(report.perWorkspace[0]?.workspaceId).toBe('ws-1');
    });
  });

  describe('batching', () => {
    it('cursor-paginates leads across multiple pages', async () => {
      const leads = Array.from({ length: 5 }, (_unused, i) =>
        makeLead({ id: `lead-${i}`, phone: `1198765432${i}` }),
      );
      const prisma = new MockPrisma({ workspaces: ['ws-1'], leads });

      const report = await runPersonKloelLeadToContactBackfill(prisma, {
        mode: 'dry-run',
        batchSize: 2,
      });

      expect(report.leadsScanned).toBe(5);
      expect(report.cleanMerges).toBe(5);
    });
  });

  describe('computeFunnelPatch unit', () => {
    it('emits only the null/default holes', () => {
      const patch = computeFunnelPatch(
        makeLead({ status: 's', stage: 'g', lastMessage: 'm', lastIntent: 'i', totalMessages: 4 }),
        { leadStatus: 'X', leadStage: null, lastMessage: null, lastIntent: 'Y', totalMessages: 2 },
      );
      expect(patch).toEqual({ leadStage: 'g', lastMessage: 'm' });
    });

    it('returns empty when the contact is fully enriched', () => {
      const patch = computeFunnelPatch(makeLead(), {
        leadStatus: 'x',
        leadStage: 'y',
        lastMessage: 'm',
        lastIntent: 'i',
        totalMessages: 99,
      });
      expect(patch).toEqual({});
    });
  });
});
