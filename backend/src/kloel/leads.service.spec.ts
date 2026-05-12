import { Test, TestingModule } from '@nestjs/testing';
import { LeadsService } from './leads.service';
import { PrismaService } from '../prisma/prisma.service';

type LeadsPrismaMock = {
  kloelLead: { findMany: jest.Mock };
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
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: wsId }),
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
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: wsId,
            status: 'qualified',
          }),
        }),
      );
    });

    it('applies search filter when provided', async () => {
      await service.listLeads(wsId, { search: 'joao' });

      expect(prisma.kloelLead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: wsId,
            OR: expect.arrayContaining([
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
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ name: { contains: 'joao', mode: 'insensitive' } }]),
          }),
        }),
      );
    });

    it('does not apply search when empty string', async () => {
      await service.listLeads(wsId, { search: '   ' });

      const callArg = prisma.kloelLead.findMany.mock.calls[0][0];
      expect(callArg.where.OR).toBeUndefined();
    });

    it('respects custom limit', async () => {
      await service.listLeads(wsId, { limit: 10 });

      expect(prisma.kloelLead.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
    });

    it('defaults limit to 200', async () => {
      await service.listLeads(wsId);

      expect(prisma.kloelLead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 200 }),
      );
    });

    it('clamps limit between 1 and 500', async () => {
      await service.listLeads(wsId, { limit: 0 });
      expect(prisma.kloelLead.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }));

      await service.listLeads(wsId, { limit: 1000 });
      expect(prisma.kloelLead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 500 }),
      );
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
        status: 'new',
        lastIntent: 'general',
        totalMessages: 0,
        lastInteraction: expect.any(Date),
        metadata: {},
        createdAt: expect.any(Date),
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
        expect.objectContaining({ orderBy: { updatedAt: 'desc' } }),
      );
    });

    it('selects only specified fields', async () => {
      await service.listLeads(wsId);

      expect(prisma.kloelLead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            id: true,
            phone: true,
            name: true,
            email: true,
            status: true,
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
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-tenant' }),
        }),
      );
    });

    it('listLeads with status filter still scopes to workspaceId', async () => {
      await service.listLeads('ws-other', { status: 'contacted' });

      expect(prisma.kloelLead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
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
});
