import { Test, TestingModule } from '@nestjs/testing';
import { KloelBusinessConfigToolsService } from './kloel-business-config-tools.service';
import { PrismaService } from '../prisma/prisma.service';
import { OpsAlertService } from '../observability/ops-alert.service';
jest.mock('../billing/stripe-runtime', () => ({
  StripeRuntime: jest.fn().mockImplementation(() => ({
    billingPortal: {
      sessions: {
        create: jest.fn(),
      },
    },
  })),
}));
type ContactRecord = {
  id: string;
  name: string | null;
  phone: string;
  leadScore: number | null;
  sentiment: string | null;
  email: string | null;
  createdAt: Date;
  updatedAt: Date;
  tags: Array<{ name: string }>;
  conversations: Array<{
    messages: Array<{ content: string; direction: string; createdAt: Date }>;
  }>;
};
type WorkspaceRecord = {
  id: string;
  name: string;
  providerSettings: Record<string, unknown> | null;
  stripeCustomerId: string | null;
  subscription: { plan: string; stripeId: string | null } | null;
};
type CampaignRecord = {
  id: string;
  name: string;
  messageTemplate: string;
  status: string;
  scheduledAt: Date | null;
  filters: Record<string, unknown>;
};
type BusinessConfigPrismaMock = {
  contact: { findMany: jest.Mock; findFirst: jest.Mock; count: jest.Mock };
  workspace: { findUnique: jest.Mock; update: jest.Mock };
  campaign: { create: jest.Mock };
  subscription: { upsert: jest.Mock };
  $transaction: jest.Mock;
};
describe('KloelBusinessConfigToolsService', () => {
  let service: KloelBusinessConfigToolsService;
  let prisma: BusinessConfigPrismaMock;
  let opsAlert: Pick<OpsAlertService, 'alertOnCriticalError'>;
  const wsId = 'ws-1';
  beforeEach(async () => {
    prisma = {
      contact: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({}),
      },
      campaign: { create: jest.fn().mockResolvedValue({}) },
      subscription: { upsert: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockImplementation((fn: unknown) => {
        if (typeof fn === 'function') {
          return fn(prisma);
        }
        return Promise.resolve(undefined);
      }),
    };
    opsAlert = { alertOnCriticalError: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelBusinessConfigToolsService,
        { provide: PrismaService, useValue: prisma },
        { provide: OpsAlertService, useValue: opsAlert },
      ],
    }).compile();
    service = module.get<KloelBusinessConfigToolsService>(KloelBusinessConfigToolsService);
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  describe('toolListLeads', () => {
    it('returns empty list when no contacts exist', async () => {
      prisma.contact.findMany.mockResolvedValue([]);
      const result = await service.toolListLeads(wsId, {});
      expect(result.success).toBe(true);
      expect(result.count).toBe(0);
      expect(result.message).toContain('0 lead');
    });
    it('filters by workspaceId and returns mapped leads', async () => {
      const contacts: ContactRecord[] = [
        {
          id: 'c-1',
          name: 'João',
          phone: '5511999999999',
          leadScore: 85,
          sentiment: 'positive',
          email: null,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-05-01'),
          tags: [],
          conversations: [],
        },
      ];
      prisma.contact.findMany.mockResolvedValue(contacts);
      const result = await service.toolListLeads(wsId, { limit: 5 });
      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspaceId: wsId }) }),
      );
      expect(result.leads).toHaveLength(1);
      expect((result.leads as Array<{ name: string }>)[0].name).toBe('João');
    });
    it('filters qualified leads by score >= 70', async () => {
      prisma.contact.findMany.mockResolvedValue([]);
      await service.toolListLeads(wsId, { status: 'qualified' });
      const whereArg = prisma.contact.findMany.mock.calls[0][0].where;
      expect(whereArg.leadScore).toEqual({ gte: 70 });
    });
    it('filters cold leads by score < 30', async () => {
      prisma.contact.findMany.mockResolvedValue([]);
      await service.toolListLeads(wsId, { status: 'cold' });
      const whereArg = prisma.contact.findMany.mock.calls[0][0].where;
      expect(whereArg.leadScore).toEqual({ lt: 30 });
    });
  });
  describe('toolGetLeadDetails', () => {
    it('returns success false when lead not found', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);
      const result = await service.toolGetLeadDetails(wsId, { leadId: 'no-exist' });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Lead não encontrado.');
    });
    it('finds lead by id with workspaceId filter', async () => {
      const contact = {
        id: 'c-1',
        name: 'Maria',
        phone: '5511',
        email: null,
        sentiment: 'neutral',
        leadScore: 50,
        tags: [],
        conversations: [],
      } as ContactRecord;
      prisma.contact.findFirst.mockResolvedValue(contact);
      const result = await service.toolGetLeadDetails(wsId, { leadId: 'c-1' });

      expect(prisma.contact.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'c-1', workspaceId: wsId } }),
      );
      expect(result.success).toBe(true);
    });

    it('finds lead by phone when leadId not provided', async () => {
      const contact = {
        id: 'c-2',
        name: null,
        phone: '5511988887777',
        email: null,
        sentiment: null,
        leadScore: null,
        tags: [],
        conversations: [],
      } as ContactRecord;
      prisma.contact.findFirst.mockResolvedValue(contact);

      const result = await service.toolGetLeadDetails(wsId, { phone: '(11) 98888-7777' });

      expect(result.success).toBe(true);
      expect(prisma.contact.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: wsId }),
        }),
      );
    });
  });

  describe('toolSaveBusinessInfo', () => {
    it('updates workspace name and providerSettings via transaction', async () => {
      const workspace = { id: wsId, providerSettings: {} };
      prisma.workspace.findUnique.mockResolvedValue(workspace);

      const result = await service.toolSaveBusinessInfo(wsId, {
        businessName: 'ACME',
        description: 'Vendas B2B',
        segment: 'tech',
      });

      expect(result.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('updates name only when description and segment are empty', async () => {
      prisma.workspace.update.mockResolvedValue({});

      const result = await service.toolSaveBusinessInfo(wsId, { businessName: 'ACME' });

      expect(result.success).toBe(true);
      expect(prisma.workspace.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: wsId } }),
      );
    });
  });

  describe('toolSetBusinessHours', () => {
    it('stores businessHours in providerSettings', async () => {
      const workspace = { id: wsId, providerSettings: {} };
      prisma.workspace.findUnique.mockResolvedValue(workspace);

      const result = await service.toolSetBusinessHours(wsId, {
        weekdayStart: '08:00',
        weekdayEnd: '18:00',
      });

      expect(result.success).toBe(true);
      expect((result.businessHours as Record<string, unknown>).weekday).toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('toolCreateCampaign', () => {
    it('creates campaign scoped to workspaceId', async () => {
      prisma.campaign.create.mockResolvedValue({
        id: 'camp-1',
        name: 'Promo Verão',
        status: 'DRAFT',
      });

      const result = await service.toolCreateCampaign(wsId, {
        name: 'Promo Verão',
        message: 'Aproveite ofertas!',
      });

      expect(result.success).toBe(true);
      expect(prisma.campaign.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ workspaceId: wsId }) }),
      );
    });

    it('counts contacts for target audience filter', async () => {
      prisma.contact.count.mockResolvedValue(42);
      prisma.campaign.create.mockResolvedValue({
        id: 'camp-2',
        name: 'Promo',
        status: 'DRAFT',
      });

      await service.toolCreateCampaign(wsId, {
        name: 'Promo',
        message: 'Teste',
        targetAudience: 'leads_quentes',
      });

      expect(prisma.contact.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: wsId, leadScore: { gte: 70 } }),
        }),
      );
    });
  });

  describe('toolGetBillingStatus', () => {
    it('returns plan and status for workspace with subscription', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        id: wsId,
        stripeCustomerId: 'cus_123',
        providerSettings: {},
        subscription: { plan: 'PRO', stripeId: 'sub_1' },
      });

      const result = await service.toolGetBillingStatus(wsId);

      expect(result.success).toBe(true);
      expect(result.plan).toBe('PRO');
      expect(result.hasPaymentMethod).toBe(true);
    });

    it('returns error when workspace not found', async () => {
      prisma.workspace.findUnique.mockResolvedValue(null);

      const result = await service.toolGetBillingStatus(wsId);

      expect(result.success).toBe(false);
    });

    it('reports SUSPENDED when billingSuspended in settings', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        id: wsId,
        stripeCustomerId: null,
        providerSettings: { billingSuspended: true },
        subscription: null,
      });

      const result = await service.toolGetBillingStatus(wsId);

      expect(result.status).toBe('SUSPENDED');
    });
  });

  describe('toolChangePlan', () => {
    it('rejects invalid plan names', async () => {
      const result = await service.toolChangePlan(wsId, { newPlan: 'megaultra' });
      expect(result.success).toBe(false);
    });

    it('rejects empty plan', async () => {
      const result = await service.toolChangePlan(wsId, {
        newPlan: '',
        immediate: true,
      });
      expect(result.success).toBe(false);
    });

    it('upserts subscription for valid plan change', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        subscription: { plan: 'STARTER', stripeId: null },
      });

      const result = await service.toolChangePlan(wsId, { newPlan: 'PRO' });

      expect(result.success).toBe(true);
      expect(prisma.subscription.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: wsId },
          update: { plan: 'PRO' },
        }),
      );
    });

    it('returns requiresAction when stripe subscription exists', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        subscription: { plan: 'PRO', stripeId: 'sub_1' },
      });

      const result = await service.toolChangePlan(wsId, { newPlan: 'enterprise' });

      expect(result.requiresAction).toBe(true);
    });
  });

  describe('tenant isolation', () => {
    it('toolListLeads always filters by workspaceId', async () => {
      await service.toolListLeads('ws-tenant', {});
      expect(prisma.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: 'ws-tenant' }),
        }),
      );
    });

    it('toolGetLeadDetails rejects cross-workspace access', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);

      const result = await service.toolGetLeadDetails('ws-other', { leadId: 'c-1' });

      expect(result.success).toBe(false);
      expect(prisma.contact.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-other' }) }),
      );
    });
  });

  describe('error handling', () => {
    it('toolGetBillingStatus returns error on Prisma failure', async () => {
      prisma.workspace.findUnique.mockRejectedValue(new Error('DB down'));

      const result = await service.toolGetBillingStatus(wsId);

      expect(result.success).toBe(false);
    });

    it('toolChangePlan returns error on Prisma failure', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        subscription: { plan: 'STARTER', stripeId: null },
      });
      prisma.subscription.upsert.mockRejectedValue(new Error('constraint violation'));

      const result = await service.toolChangePlan(wsId, { newPlan: 'PRO' });

      expect(result.success).toBe(false);
    });

    it('toolSaveBusinessInfo handles transaction failure', async () => {
      prisma.$transaction.mockRejectedValue(new Error('tx failed'));

      await expect(
        service.toolSaveBusinessInfo(wsId, { businessName: 'X', description: 'Y' }),
      ).rejects.toThrow('tx failed');
    });
  });
});
