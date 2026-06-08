import { Test, TestingModule } from '@nestjs/testing';
import { LeadContactBackfillService } from './lead-contact-backfill.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  MockPrisma,
  makeLead,
  makeContact,
} from '../prisma/backfills/person-kloel-lead-to-contact.backfill.spec.helpers';

/**
 * Tests for the NestJS-injectable per-workspace driver. The heavy data-move
 * semantics are covered by the core spec; here we assert the DI wrapper:
 *   - drives the core in execute mode (creates a canonical Contact per lead);
 *   - is IDEMPOTENT — a second execute run performs zero new writes;
 *   - dry-run writes nothing;
 *   - is workspace-scoped (never bleeds into another workspace);
 *   - never deletes/mutates a KloelLead (the adapter exposes no such method).
 */
describe('LeadContactBackfillService', () => {
  async function buildService(prisma: MockPrisma): Promise<LeadContactBackfillService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LeadContactBackfillService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    return module.get(LeadContactBackfillService);
  }

  describe('ensureContactsForWorkspace (execute)', () => {
    it('creates a canonical Contact for a lead with no existing Contact', async () => {
      const prisma = new MockPrisma({
        workspaces: ['ws-1'],
        leads: [makeLead({ id: 'lead-1', phone: '11987654321' })],
      });
      const service = await buildService(prisma);

      const report = await service.ensureContactsForWorkspace('ws-1', { mode: 'execute' });

      expect(report.mode).toBe('execute');
      expect(report.leadsScanned).toBe(1);
      expect(report.cleanMerges).toBe(1);
      // Contact keyed on the NORMALIZED phone (BR-promoted 55 prefix).
      expect(prisma.contactSnapshot('ws-1', '5511987654321')).toBeDefined();
      expect(prisma.contactSnapshot('ws-1', '5511987654321')?.kloelLeadId).toBe('lead-1');
    });

    it('is idempotent — a second execute run performs zero new writes', async () => {
      const prisma = new MockPrisma({
        workspaces: ['ws-1'],
        leads: [
          makeLead({ id: 'lead-1', phone: '11987654321' }),
          makeLead({ id: 'lead-2', phone: '11912345678', email: null }),
        ],
      });
      const service = await buildService(prisma);

      const first = await service.ensureContactsForWorkspace('ws-1', { mode: 'execute' });
      const upsertsAfterFirst = prisma.upsertCalls.length;
      const auditsAfterFirst = prisma.auditCount;

      const second = await service.ensureContactsForWorkspace('ws-1', { mode: 'execute' });

      // The second run scans the same leads but writes nothing new.
      expect(second.leadsScanned).toBe(first.leadsScanned);
      expect(second.kloelLeadIdWritten).toBe(0);
      expect(second.funnelColumnsWritten).toBe(0);
      expect(second.auditEntriesWritten).toBe(0);
      // No NEW contact rows created on the second pass.
      const newCreates = prisma.upsertCalls
        .slice(upsertsAfterFirst)
        .filter((call) => Object.keys(call.update).length === 0);
      expect(newCreates).toHaveLength(0);
      // Audit ledger did not grow.
      expect(prisma.auditCount).toBe(auditsAfterFirst);
    });

    it('does not regress a Contact already enriched by live traffic (write-if-null)', async () => {
      const prisma = new MockPrisma({
        workspaces: ['ws-1'],
        leads: [makeLead({ id: 'lead-1', phone: '11987654321', status: 'hot' })],
        contacts: [
          makeContact({
            id: 'live-contact',
            phone: '5511987654321',
            kloelLeadId: 'other-lead',
            leadStatus: 'converted',
          }),
        ],
      });
      const service = await buildService(prisma);

      await service.ensureContactsForWorkspace('ws-1', { mode: 'execute' });

      const snapshot = prisma.contactSnapshot('ws-1', '5511987654321');
      // Established provenance pointer is NEVER overwritten.
      expect(snapshot?.kloelLeadId).toBe('other-lead');
      // Live leadStatus wins over the backfill's lead status.
      expect(snapshot?.leadStatus).toBe('converted');
    });
  });

  describe('dry-run (default)', () => {
    it('writes nothing in dry-run mode', async () => {
      const prisma = new MockPrisma({
        workspaces: ['ws-1'],
        leads: [makeLead({ id: 'lead-1', phone: '11987654321' })],
      });
      const service = await buildService(prisma);

      const report = await service.ensureContactsForWorkspace('ws-1');

      expect(report.mode).toBe('dry-run');
      expect(report.leadsScanned).toBe(1);
      expect(prisma.upsertCalls).toHaveLength(0);
      expect(prisma.auditCount).toBe(0);
      expect(prisma.contactSnapshot('ws-1', '5511987654321')).toBeUndefined();
    });
  });

  describe('workspace isolation', () => {
    it('only processes the requested workspace', async () => {
      const prisma = new MockPrisma({
        workspaces: ['ws-1', 'ws-2'],
        leads: [
          makeLead({ id: 'lead-1', workspaceId: 'ws-1', phone: '11987654321' }),
          makeLead({ id: 'lead-2', workspaceId: 'ws-2', phone: '11912345678' }),
        ],
      });
      const service = await buildService(prisma);

      const report = await service.ensureContactsForWorkspace('ws-1', { mode: 'execute' });

      expect(report.workspacesProcessed).toBe(1);
      expect(report.leadsScanned).toBe(1);
      // ws-2's lead is untouched.
      expect(prisma.contactSnapshot('ws-2', '5511912345678')).toBeUndefined();
    });
  });
});
