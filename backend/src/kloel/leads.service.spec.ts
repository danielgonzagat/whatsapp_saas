import { Test, TestingModule } from '@nestjs/testing';
import { LeadsService } from './leads.service';
import { PrismaService } from '../prisma/prisma.service';
import { partialMatch } from '../../test/helpers/match-instance';

// Typed wrappers so nested jest matcher values stay typed (eslint no-unsafe-assignment).
const arrayContains = (items: unknown[]): jest.AsymmetricMatcher =>
  expect.arrayContaining(items) as jest.AsymmetricMatcher;

type LeadsPrismaMock = {
  kloelLead: { findMany: jest.Mock };
  contact: { findMany: jest.Mock };
};

function makeLead(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    phone: '5511999999999',
    name: 'João Silva',
    email: 'joao@test.com',
    status: 'new',
    lastIntent: 'purchase',
    totalMessages: 5,
    metadata: { source: 'whatsapp' },
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-05-01'),
    ...overrides,
  };
}

describe('LeadsService', () => {
  let service: LeadsService;
  let prisma: LeadsPrismaMock;

  const wsId = 'ws-1';

  beforeEach(async () => {
    prisma = {
      kloelLead: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      contact: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LeadsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<LeadsService>(LeadsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listLeads', () => {
    it('returns leads scoped to workspaceId', async () => {
      prisma.kloelLead.findMany.mockResolvedValue([makeLead({ id: 'lead-1' })]);

      const result = await service.listLeads(wsId);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('lead-1');
      expect(prisma.kloelLead.findMany).toHaveBeenCalledWith(
        partialMatch({
          where: partialMatch({ workspaceId: wsId }),
        }),
      );
    });

    it('returns empty array when no leads exist', async () => {
      const result = await service.listLeads(wsId);

      expect(result).toHaveLength(0);
      expect(Array.isArray(result)).toBe(true);
    });

    it('applies status filter when provided', async () => {
      await service.listLeads(wsId, { status: 'qualified' });

      expect(prisma.kloelLead.findMany).toHaveBeenCalledWith(
        partialMatch({
          where: partialMatch({
            workspaceId: wsId,
            status: 'qualified',
          }),
        }),
      );
    });

    it('applies search filter when provided', async () => {
      await service.listLeads(wsId, { search: 'joao' });

      expect(prisma.kloelLead.findMany).toHaveBeenCalledWith(
        partialMatch({
          where: partialMatch({
            workspaceId: wsId,
            OR: arrayContains([
              { name: { contains: 'joao', mode: 'insensitive' } },
              { email: { contains: 'joao', mode: 'insensitive' } },
              { phone: { contains: 'joao', mode: 'insensitive' } },
            ]),
          }),
        }),
      );
    });

    it('trims search value', async () => {
      await service.listLeads(wsId, { search: '  joao  ' });

      expect(prisma.kloelLead.findMany).toHaveBeenCalledWith(
        partialMatch({
          where: partialMatch({
            OR: arrayContains([{ name: { contains: 'joao', mode: 'insensitive' } }]),
          }),
        }),
      );
    });

    it('does not apply search when empty string', async () => {
      await service.listLeads(wsId, { search: '   ' });

      const callArg = (prisma.kloelLead.findMany.mock.calls as unknown[][])[0][0] as {
        where: { OR?: unknown };
      };
      expect(callArg.where.OR).toBeUndefined();
    });

    it('respects custom limit', async () => {
      await service.listLeads(wsId, { limit: 10 });

      expect(prisma.kloelLead.findMany).toHaveBeenCalledWith(partialMatch({ take: 10 }));
    });

    it('defaults limit to 200', async () => {
      await service.listLeads(wsId);

      expect(prisma.kloelLead.findMany).toHaveBeenCalledWith(partialMatch({ take: 200 }));
    });

    it('clamps limit between 1 and 500', async () => {
      await service.listLeads(wsId, { limit: 0 });
      expect(prisma.kloelLead.findMany).toHaveBeenCalledWith(partialMatch({ take: 1 }));

      await service.listLeads(wsId, { limit: 1000 });
      expect(prisma.kloelLead.findMany).toHaveBeenCalledWith(partialMatch({ take: 500 }));
    });

    it('maps lead fields to return shape', async () => {
      prisma.kloelLead.findMany.mockResolvedValue([
        makeLead({
          id: 'lead-1',
          phone: '5511999999999',
          name: 'Maria',
          email: null,
          status: null,
          lastIntent: null,
          totalMessages: null,
          metadata: null,
          createdAt: new Date('2026-01-01'),
          updatedAt: null,
        }),
      ]);

      const result = await service.listLeads(wsId);

      expect(result[0]).toEqual({
        id: 'lead-1',
        phone: '5511999999999',
        name: 'Maria',
        email: null,
        commercialScore: null,
        status: 'new',
        stage: null,
        lastIntent: 'general',
        totalMessages: 0,
        lastInteraction: new Date('2026-01-01'),
        metadata: {},
        createdAt: new Date('2026-01-01'),
        updatedAt: null,
      });
    });

    it('uses updatedAt as lastInteraction when available', async () => {
      prisma.kloelLead.findMany.mockResolvedValue([
        makeLead({
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-05-01'),
        }),
      ]);

      const result = await service.listLeads(wsId);

      expect(result[0].lastInteraction).toEqual(new Date('2026-05-01'));
    });

    it('falls back to createdAt for lastInteraction when updatedAt is null', async () => {
      prisma.kloelLead.findMany.mockResolvedValue([
        makeLead({
          id: 'lead-1',
          name: 'Lead',
          createdAt: new Date('2026-01-01'),
          updatedAt: null,
        }),
      ]);

      const result = await service.listLeads(wsId);

      expect(result[0].lastInteraction).toEqual(new Date('2026-01-01'));
    });

    it('orders by updatedAt descending', async () => {
      await service.listLeads(wsId);

      expect(prisma.kloelLead.findMany).toHaveBeenCalledWith(
        partialMatch({ orderBy: { updatedAt: 'desc' } }),
      );
    });

    it('selects only specified fields', async () => {
      await service.listLeads(wsId);

      expect(prisma.kloelLead.findMany).toHaveBeenCalledWith(
        partialMatch({
          select: {
            id: true,
            phone: true,
            name: true,
            email: true,
            status: true,
            stage: true,
            lastIntent: true,
            totalMessages: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      );
    });
  });

  describe('tenant isolation', () => {
    it('listLeads scopes query to workspaceId', async () => {
      await service.listLeads('ws-tenant');

      expect(prisma.kloelLead.findMany).toHaveBeenCalledWith(
        partialMatch({
          where: partialMatch({ workspaceId: 'ws-tenant' }),
        }),
      );
    });

    it('listLeads with status filter still scopes to workspaceId', async () => {
      await service.listLeads('ws-other', { status: 'contacted' });

      expect(prisma.kloelLead.findMany).toHaveBeenCalledWith(
        partialMatch({
          where: partialMatch({
            workspaceId: 'ws-other',
            status: 'contacted',
          }),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('listLeads propagates Prisma error', async () => {
      prisma.kloelLead.findMany.mockRejectedValue(new Error('DB connection lost'));

      await expect(service.listLeads(wsId)).rejects.toThrow('DB connection lost');
    });

    it('listLeads with filters propagates Prisma error', async () => {
      prisma.kloelLead.findMany.mockRejectedValue(new Error('timeout'));

      await expect(service.listLeads(wsId, { status: 'new', search: 'test' })).rejects.toThrow(
        'timeout',
      );
    });
  });

  describe('KLOEL_LEADS_READ_CONTACT flag', () => {
    const FLAG = 'KLOEL_LEADS_READ_CONTACT';
    const original = process.env[FLAG];

    afterEach(() => {
      if (original === undefined) {
        delete process.env[FLAG];
      } else {
        process.env[FLAG] = original;
      }
    });

    function makeContactRow(overrides: Record<string, unknown> = {}) {
      return {
        id: 'contact-1',
        phone: '5511999999999',
        name: 'Maria',
        email: 'maria@test.com',
        leadStatus: 'hot',
        leadStage: 'negotiation',
        lastIntent: 'purchase',
        totalMessages: 4,
        customFields: { source: 'crm' },
        createdAt: new Date('2026-02-01'),
        updatedAt: new Date('2026-05-10'),
        ...overrides,
      };
    }

    describe('flag OFF (default)', () => {
      it('reads from kloelLead and never queries contact', async () => {
        delete process.env[FLAG];
        prisma.kloelLead.findMany.mockResolvedValue([makeLead({ id: 'lead-1' })]);

        const result = await service.listLeads(wsId);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('lead-1');
        expect(prisma.kloelLead.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.contact.findMany).not.toHaveBeenCalled();
      });

      it('is byte-identical to legacy when flag is a non-true value', async () => {
        process.env[FLAG] = 'false';
        prisma.kloelLead.findMany.mockResolvedValue([makeLead({ id: 'lead-1' })]);

        await service.listLeads(wsId, { status: 'qualified' });

        expect(prisma.kloelLead.findMany).toHaveBeenCalledWith(
          partialMatch({ where: partialMatch({ workspaceId: wsId, status: 'qualified' }) }),
        );
        expect(prisma.contact.findMany).not.toHaveBeenCalled();
      });
    });

    describe('flag ON', () => {
      beforeEach(() => {
        process.env[FLAG] = 'true';
      });

      it('reads from contact and maps the funnel snapshot onto LeadOutput', async () => {
        prisma.contact.findMany.mockResolvedValue([makeContactRow({ id: 'contact-1' })]);

        const result = await service.listLeads(wsId);

        expect(prisma.contact.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.kloelLead.findMany).not.toHaveBeenCalled();
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(
          expect.objectContaining({
            id: 'contact-1',
            phone: '5511999999999',
            name: 'Maria',
            email: 'maria@test.com',
            status: 'hot',
            stage: 'negotiation',
            lastIntent: 'purchase',
            totalMessages: 4,
            metadata: { source: 'crm' },
            lastInteraction: new Date('2026-05-10'),
          }),
        );
      });

      it('maps the status filter onto leadStatus on the contact query', async () => {
        prisma.contact.findMany.mockResolvedValue([makeContactRow()]);

        await service.listLeads(wsId, { status: 'hot' });

        expect(prisma.contact.findMany).toHaveBeenCalledWith(
          partialMatch({
            where: partialMatch({ workspaceId: wsId, leadStatus: 'hot' }),
          }),
        );
      });

      it('restricts the contact query to provenance-backed leads', async () => {
        prisma.contact.findMany.mockResolvedValue([makeContactRow()]);

        await service.listLeads(wsId);

        expect(prisma.contact.findMany).toHaveBeenCalledWith(
          partialMatch({
            where: partialMatch({
              workspaceId: wsId,
              OR: arrayContains([
                { kloelLeadId: { not: null } },
                { checkoutSocialLeadId: { not: null } },
                { scrapingJobId: { not: null } },
              ]),
            }),
          }),
        );
      });

      it('keeps the search filter alongside the provenance predicate', async () => {
        prisma.contact.findMany.mockResolvedValue([makeContactRow()]);

        await service.listLeads(wsId, { search: 'maria' });

        const callArg = (prisma.contact.findMany.mock.calls as unknown[][])[0][0] as {
          where: { OR?: unknown[]; AND?: unknown[] };
        };
        // Provenance disjunction stays on the top-level OR key.
        expect(callArg.where.OR).toEqual(expect.arrayContaining([{ kloelLeadId: { not: null } }]));
        // Search disjunction is AND-nested so it does not clobber provenance.
        expect(callArg.where.AND).toEqual([
          {
            OR: expect.arrayContaining([
              { name: { contains: 'maria', mode: 'insensitive' } },
              { email: { contains: 'maria', mode: 'insensitive' } },
              { phone: { contains: 'maria', mode: 'insensitive' } },
            ]),
          },
        ]);
      });

      it('falls back to kloelLead when only non-lead contacts exist', async () => {
        // A workspace with only manually-created contacts (no provenance) yields
        // an empty provenance-filtered result, so the legacy fallback still fires.
        prisma.contact.findMany.mockResolvedValue([]);
        prisma.kloelLead.findMany.mockResolvedValue([makeLead({ id: 'legacy-lead' })]);

        const result = await service.listLeads(wsId);

        expect(prisma.contact.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.kloelLead.findMany).toHaveBeenCalledTimes(1);
        expect(result[0].id).toBe('legacy-lead');
      });

      it('falls back to kloelLead when the contact result is empty', async () => {
        prisma.contact.findMany.mockResolvedValue([]);
        prisma.kloelLead.findMany.mockResolvedValue([makeLead({ id: 'legacy-lead' })]);

        const result = await service.listLeads(wsId);

        expect(prisma.contact.findMany).toHaveBeenCalledTimes(1);
        expect(prisma.kloelLead.findMany).toHaveBeenCalledTimes(1);
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('legacy-lead');
      });

      it('does NOT fall back when the contact result is non-empty', async () => {
        prisma.contact.findMany.mockResolvedValue([makeContactRow({ id: 'contact-1' })]);
        prisma.kloelLead.findMany.mockResolvedValue([makeLead({ id: 'legacy-lead' })]);

        const result = await service.listLeads(wsId);

        expect(result[0].id).toBe('contact-1');
        expect(prisma.kloelLead.findMany).not.toHaveBeenCalled();
      });
    });
  });
});
