import { Test, TestingModule } from '@nestjs/testing';
import { PartnershipsService } from './partnerships.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../auth/email.service';

describe('PartnershipsService', () => {
  let service: PartnershipsService;
  let emailService: { sendPartnerInviteEmail: jest.Mock };
  let prisma: {
    agent: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
      updateMany: jest.Mock;
    };
    collaboratorInvite: {
      findMany: jest.Mock;
      create: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
      findFirst: jest.Mock;
    };
    affiliatePartner: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
    workspace: {
      findUnique: jest.Mock;
    };
    partnerMessage: {
      findMany: jest.Mock;
      create: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
      updateMany: jest.Mock;
    };
    checkoutProductPlan: {
      findFirst: jest.Mock;
    };
    checkoutPlanLink: {
      findFirst: jest.Mock;
    };
    affiliateLink: {
      findFirst: jest.Mock;
    };
    checkoutOrder: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      agent: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        updateMany: jest.fn(),
      },
      collaboratorInvite: {
        findMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
        findFirst: jest.fn(),
      },
      affiliatePartner: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ name: 'Workspace Teste' }),
      },
      partnerMessage: {
        findMany: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
        updateMany: jest.fn(),
      },
      checkoutProductPlan: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      checkoutPlanLink: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      affiliateLink: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      checkoutOrder: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    emailService = {
      sendPartnerInviteEmail: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartnershipsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('http://localhost:3000') },
        },
        {
          provide: EmailService,
          useValue: emailService,
        },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(PartnershipsService);
  });

  // ═══ COLLABORATORS ═══

  describe('listCollaborators', () => {
    it('returns agents and pending invites for workspace', async () => {
      prisma.agent.findMany.mockResolvedValue([
        { id: '1', name: 'Agent One', email: 'a@b.com', role: 'SUPPORT' },
      ]);
      prisma.collaboratorInvite.findMany.mockResolvedValue([]);

      const result = await service.listCollaborators('ws-1');

      expect(result.agents).toHaveLength(1);
      expect(result.invites).toHaveLength(0);
      expect(prisma.agent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws-1' } }),
      );
    });
  });

  describe('getCollaboratorStats', () => {
    it('aggregates total, online, and pending counts', async () => {
      prisma.agent.count
        .mockResolvedValueOnce(5) // totalAgents
        .mockResolvedValueOnce(2); // onlineAgents
      prisma.collaboratorInvite.count.mockResolvedValue(3);

      const stats = await service.getCollaboratorStats('ws-1');

      expect(stats).toEqual({ total: 5, online: 2, pendingInvites: 3 });
    });
  });

  describe('inviteCollaborator', () => {
    it('throws ConflictException if agent already exists in workspace', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: '1' });

      await expect(
        service.inviteCollaborator('ws-1', 'test@test.com', 'SUPPORT', 'inv-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('throws ConflictException if pending invite already exists', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.collaboratorInvite.findFirst.mockResolvedValue({ id: 'existing' });

      await expect(
        service.inviteCollaborator('ws-1', 'test@test.com', 'SUPPORT', 'inv-1'),
      ).rejects.toThrow(ConflictException);
    });

    it('creates invite with 7-day expiry when no conflicts', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      prisma.collaboratorInvite.findFirst.mockResolvedValue(null);
      prisma.collaboratorInvite.create.mockResolvedValue({
        id: 'inv-1',
        email: 'new@test.com',
        role: 'SUPPORT',
      });

      const result = await service.inviteCollaborator('ws-1', 'new@test.com', 'SUPPORT', 'admin-1');

      expect(result.email).toBe('new@test.com');
      const createCall = prisma.collaboratorInvite.create.mock.calls[0][0];
      const expiry = new Date(createCall.data.expiresAt);
      const now = Date.now();
      // Expiry should be roughly 7 days from now
      expect(expiry.getTime() - now).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
      expect(expiry.getTime() - now).toBeLessThan(8 * 24 * 60 * 60 * 1000);
    });
  });

  describe('removeCollaborator', () => {
    it('throws NotFoundException when agent does not exist', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);

      await expect(service.removeCollaborator('agent-1', 'ws-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ConflictException when trying to remove admin', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'a1', role: 'ADMIN' });

      await expect(service.removeCollaborator('a1', 'ws-1')).rejects.toThrow(ConflictException);
    });

    it('deletes non-admin agent successfully', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'a1', role: 'SUPPORT' });
      prisma.agent.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.removeCollaborator('a1', 'ws-1');

      expect(prisma.agent.deleteMany).toHaveBeenCalledWith({
        where: { id: 'a1', workspaceId: 'ws-1' },
      });
      expect(result.id).toBe('a1');
    });
  });

  // ═══ AFFILIATES ═══

  describe('listAffiliates', () => {
    it('normalizes lowercase filters and requests the fields used by the dashboard', async () => {
      prisma.affiliatePartner.findMany.mockResolvedValue([
        {
          id: 'partner-1',
          partnerName: 'Ana',
          partnerEmail: 'ana@example.com',
          type: 'AFFILIATE',
          status: 'PENDING',
          totalSales: 9,
          totalRevenue: 1250,
          totalCommission: 375,
          commissionRate: 30,
          temperature: 72,
          productIds: ['prod_1'],
        },
      ]);

      const result = await service.listAffiliates('ws-1', {
        type: 'affiliate',
        status: 'pending',
        search: 'Ana',
      });

      expect(prisma.affiliatePartner.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: 'ws-1',
            type: 'AFFILIATE',
            status: 'PENDING',
            partnerName: { contains: 'Ana', mode: 'insensitive' },
          }),
          select: expect.objectContaining({
            totalSales: true,
            temperature: true,
            productIds: true,
          }),
        }),
      );
      expect(result.affiliates).toHaveLength(1);
    });
  });

  describe('getAffiliateStats', () => {
    it('calculates stats correctly from partner list', async () => {
      prisma.affiliatePartner.findMany.mockResolvedValue([
        {
          type: 'AFFILIATE',
          status: 'ACTIVE',
          totalRevenue: 1000,
          totalCommission: 300,
          partnerName: 'A',
        },
        {
          type: 'AFFILIATE',
          status: 'ACTIVE',
          totalRevenue: 2000,
          totalCommission: 600,
          partnerName: 'B',
        },
        {
          type: 'AFFILIATE',
          status: 'PENDING',
          totalRevenue: 500,
          totalCommission: 100,
          partnerName: 'C',
        },
        {
          type: 'PRODUCER',
          status: 'ACTIVE',
          totalRevenue: 800,
          totalCommission: 200,
          partnerName: 'D',
        },
      ]);

      const stats = await service.getAffiliateStats('ws-1');

      expect(stats.activeAffiliates).toBe(2);
      expect(stats.producers).toBe(1);
      expect(stats.totalRevenue).toBe(3500); // all AFFILIATE revenue
      expect(stats.totalCommissions).toBe(1200); // all commissions
      expect(stats.topPartner).toEqual({ name: 'B', revenue: 2000 });
    });

    it('returns null topPartner when no partners exist', async () => {
      prisma.affiliatePartner.findMany.mockResolvedValue([]);

      const stats = await service.getAffiliateStats('ws-1');

      expect(stats.activeAffiliates).toBe(0);
      expect(stats.topPartner).toBeNull();
    });
  });

  describe('getAffiliateDetail', () => {
    it('throws NotFoundException for missing affiliate', async () => {
      prisma.affiliatePartner.findFirst.mockResolvedValue(null);

      await expect(service.getAffiliateDetail('bad-id', 'ws-1')).rejects.toThrow(NotFoundException);
    });

    it('returns affiliate when found', async () => {
      const partner = { id: 'p1', partnerName: 'Test', type: 'AFFILIATE' };
      prisma.affiliatePartner.findFirst.mockResolvedValue(partner);

      const result = await service.getAffiliateDetail('p1', 'ws-1');

      expect(result.affiliate).toEqual(partner);
    });
  });

  describe('createAffiliate', () => {
    it('creates affiliate invites in pending state and sends the signup email', async () => {
      prisma.affiliatePartner.create.mockImplementation(async ({ data }) => ({
        id: 'new-1',
        ...data,
      }));

      const result = await service.createAffiliate('ws-1', {
        partnerName: 'John Doe',
        partnerEmail: 'john@example.com',
        type: 'AFFILIATE',
        commissionRate: 25,
      });

      expect(typeof result.affiliateCode).toBe('string');
      expect(result.affiliateCode.length).toBeGreaterThan(0);
      expect(result.affiliateLink).toContain(result.affiliateCode);
      expect(result.commissionRate).toBe(25);
      expect(result.status).toBe('PENDING');
      expect(result.metadata).toEqual(
        expect.objectContaining({
          inviteTokenHash: expect.any(String),
          inviteSentAt: expect.any(String),
        }),
      );

      expect(emailService.sendPartnerInviteEmail).toHaveBeenCalledWith(
        'john@example.com',
        'John Doe',
        'Workspace Teste',
        expect.stringContaining('affiliateInviteToken='),
        'afiliado',
      );
    });

    it('creates coproducer invites in pending state and labels the partner role correctly', async () => {
      prisma.affiliatePartner.create.mockImplementation(async ({ data }) => ({
        id: 'coprod-1',
        ...data,
      }));

      const result = await service.createPartner('ws-1', {
        partnerName: 'Copro',
        partnerEmail: 'copro@example.com',
        type: 'COPRODUCER',
        commissionRate: 12,
      });

      expect(result.status).toBe('PENDING');
      expect(result.type).toBe('COPRODUCER');
      expect(emailService.sendPartnerInviteEmail).toHaveBeenCalledWith(
        'copro@example.com',
        'Copro',
        'Workspace Teste',
        expect.stringContaining('affiliateInviteToken='),
        'coprodutor',
      );
    });

    it('defaults commissionRate to 30 when not provided', async () => {
      prisma.affiliatePartner.create.mockImplementation(async ({ data }) => ({
        id: 'new-1',
        ...data,
      }));

      const result = await service.createAffiliate('ws-1', {
        partnerName: 'Jane',
        partnerEmail: 'jane@example.com',
        type: 'AFFILIATE',
      });

      expect(result.commissionRate).toBe(30);
    });

    it('returns an existing partner when the same email is already linked to the same role', async () => {
      prisma.affiliatePartner.findFirst.mockResolvedValueOnce({
        id: 'existing-1',
        workspaceId: 'ws-1',
        partnerName: 'John Doe',
        partnerEmail: 'john@example.com',
        type: 'AFFILIATE',
        status: 'PENDING',
      });

      const result = await service.createAffiliate('ws-1', {
        partnerName: 'John Doe',
        partnerEmail: 'john@example.com',
        type: 'AFFILIATE',
      });

      expect(result.id).toBe('existing-1');
      expect(prisma.affiliatePartner.create).not.toHaveBeenCalled();
      expect(emailService.sendPartnerInviteEmail).not.toHaveBeenCalled();
    });

    it('rejects reusing the same email under a different partner role', async () => {
      prisma.affiliatePartner.findFirst.mockResolvedValueOnce({
        id: 'existing-1',
        workspaceId: 'ws-1',
        partnerName: 'John Doe',
        partnerEmail: 'john@example.com',
        type: 'AFFILIATE',
      });

      await expect(
        service.createPartner('ws-1', {
          partnerName: 'John Doe',
          partnerEmail: 'john@example.com',
          type: 'COPRODUCER',
        }),
      ).rejects.toThrow(ConflictException);

      expect(prisma.affiliatePartner.create).not.toHaveBeenCalled();
    });

    it('keeps producer records active without sending affiliate invite email', async () => {
      prisma.affiliatePartner.create.mockImplementation(async ({ data }) => ({
        id: 'producer-1',
        ...data,
      }));

      const result = await service.createAffiliate('ws-1', {
        partnerName: 'Produtor',
        partnerEmail: 'producer@example.com',
        type: 'PRODUCER',
      });

      expect(result.status).toBe('ACTIVE');
      expect(result.metadata).toBeUndefined();

      expect(emailService.sendPartnerInviteEmail).not.toHaveBeenCalled();
    });

    it('rolls back the partner record when the invite email fails', async () => {
      prisma.affiliatePartner.create.mockImplementation(async ({ data }) => ({
        id: 'new-1',
        ...data,
      }));

      emailService.sendPartnerInviteEmail.mockResolvedValueOnce(false);

      await expect(
        service.createAffiliate('ws-1', {
          partnerName: 'John Doe',
          partnerEmail: 'john@example.com',
          type: 'AFFILIATE',
        }),
      ).rejects.toThrow(ServiceUnavailableException);

      expect(prisma.affiliatePartner.deleteMany).toHaveBeenCalledWith({
        where: { id: 'new-1', workspaceId: 'ws-1' },
      });
    });
  });

  describe('getAffiliatePerformance', () => {
    it('throws when affiliate is missing', async () => {
      prisma.affiliatePartner.findFirst.mockResolvedValue(null);

      await expect(service.getAffiliatePerformance('missing', 'ws-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns persisted totals and real monthly performance from attributed orders', async () => {
      const currentYear = new Date().getUTCFullYear();
      const partner = {
        id: 'aff-1',
        workspaceId: 'ws-1',
        partnerName: 'Affiliate One',
        partnerEmail: 'affiliate@test.com',
        commissionRate: 25,
        totalSales: 7,
        totalRevenue: 2450,
        affiliateCode: 'AFF-CODE-1',
        partnerWorkspaceId: 'aff-ws-1',
        createdAt: new Date(Date.UTC(currentYear - 1, 5, 10)),
      };
      prisma.affiliatePartner.findFirst.mockResolvedValue(partner);
      prisma.checkoutOrder.findMany.mockResolvedValue([
        {
          createdAt: new Date(Date.UTC(currentYear, 0, 10)),
          paidAt: new Date(Date.UTC(currentYear, 0, 11)),
        },
        {
          createdAt: new Date(Date.UTC(currentYear, 2, 4)),
          paidAt: new Date(Date.UTC(currentYear, 2, 5)),
        },
        {
          createdAt: new Date(Date.UTC(currentYear, 2, 22)),
          paidAt: null,
        },
      ]);
      prisma.checkoutOrder.findFirst.mockResolvedValue({
        createdAt: new Date(Date.UTC(currentYear, 2, 22)),
        paidAt: new Date(Date.UTC(currentYear, 3, 1)),
      });

      const result = await service.getAffiliatePerformance('aff-1', 'ws-1');

      expect(result).toEqual({
        totalSales: 7,
        totalRevenue: 2450,
        commission: 25,
        monthlyPerformance: expect.any(Array),
        lastSaleAt: new Date(Date.UTC(currentYear, 3, 1)).toISOString(),
      });
      expect(result.monthlyPerformance).toHaveLength(12);
      expect(result.monthlyPerformance[0]).toBe(1);
      expect(result.monthlyPerformance[2]).toBe(2);
      expect(prisma.checkoutOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId: 'ws-1',
            status: { in: ['PAID', 'SHIPPED', 'DELIVERED'] },
            OR: expect.arrayContaining([
              { affiliateId: 'aff-ws-1' },
              { metadata: { path: ['affiliateCode'], equals: 'AFF-CODE-1' } },
              { metadata: { path: ['affiliateWorkspaceId'], equals: 'aff-ws-1' } },
            ]),
          }),
        }),
      );
    });
  });

  // ═══ CHAT ═══

  describe('getChatContacts', () => {
    it('sorts contacts by most recent message first', async () => {
      prisma.affiliatePartner.findMany.mockResolvedValue([
        {
          id: 'p1',
          partnerName: 'Older Message',
          partnerEmail: 'old@test.com',
          type: 'AFFILIATE',
        },
        {
          id: 'p2',
          partnerName: 'Newer Message',
          partnerEmail: 'new@test.com',
          type: 'PRODUCER',
        },
      ]);
      prisma.partnerMessage.groupBy.mockResolvedValue([]);
      prisma.partnerMessage.findMany.mockResolvedValue([
        { partnerId: 'p2', content: 'new', createdAt: new Date('2026-03-27') },
        { partnerId: 'p1', content: 'old', createdAt: new Date('2026-03-20') },
      ]);

      const result = await service.getChatContacts('ws-1');

      expect(result.contacts[0].name).toBe('Newer Message');
      expect(result.contacts[1].name).toBe('Older Message');
    });

    it('generates avatar initials from partner name', async () => {
      prisma.affiliatePartner.findMany.mockResolvedValue([
        {
          id: 'p1',
          partnerName: 'Ana Beatriz Costa',
          partnerEmail: 'abc@test.com',
          type: 'AFFILIATE',
        },
      ]);
      prisma.partnerMessage.groupBy.mockResolvedValue([]);
      prisma.partnerMessage.findMany.mockResolvedValue([]);

      const result = await service.getChatContacts('ws-1');

      expect(result.contacts[0].avatar).toBe('AB'); // first 2 initials
    });

    it('contacts with no messages sort to the end', async () => {
      prisma.affiliatePartner.findMany.mockResolvedValue([
        {
          id: 'p1',
          partnerName: 'No Messages',
          partnerEmail: 'no@test.com',
          type: 'AFFILIATE',
        },
        {
          id: 'p2',
          partnerName: 'Has Message',
          partnerEmail: 'has@test.com',
          type: 'AFFILIATE',
        },
      ]);
      prisma.partnerMessage.groupBy.mockResolvedValue([]);
      prisma.partnerMessage.findMany.mockResolvedValue([
        { partnerId: 'p2', content: 'hi', createdAt: new Date() },
      ]);

      const result = await service.getChatContacts('ws-1');

      expect(result.contacts[0].name).toBe('Has Message');
      expect(result.contacts[1].name).toBe('No Messages');
    });
  });

  // messageLimit: partner chat is internal DB-only, not WhatsApp; no rate limit applies
  describe('sendMessage', () => {
    it('creates message with OWNER senderType', async () => {
      prisma.partnerMessage.create.mockResolvedValue({
        id: 'm1',
        content: 'Hello',
        senderType: 'OWNER',
      });

      const result = await service.sendMessage('p1', 'Hello', 'agent-1', 'Admin');

      expect(prisma.partnerMessage.create).toHaveBeenCalledWith({
        data: {
          partnerId: 'p1',
          senderId: 'agent-1',
          senderType: 'OWNER',
          senderName: 'Admin',
          content: 'Hello',
        },
      });
      expect(result.content).toBe('Hello');
    });
  });

  describe('markAsRead', () => {
    it('marks only PARTNER messages as read', async () => {
      prisma.partnerMessage.updateMany.mockResolvedValue({ count: 3 });

      await service.markAsRead('p1');

      expect(prisma.partnerMessage.updateMany).toHaveBeenCalledWith({
        where: { partnerId: 'p1', senderType: 'PARTNER', readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });
  });
});
