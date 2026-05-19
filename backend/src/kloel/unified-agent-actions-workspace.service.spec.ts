import { Test, TestingModule } from '@nestjs/testing';
import { UnifiedAgentActionsWorkspaceService } from './unified-agent-actions-workspace.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { OpsAlertService } from '../observability/ops-alert.service';
jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn(),
}));
jest.mock('./unified-agent-actions-workspace.helpers', () => ({
  actionGetWorkspaceStatus: jest.fn(),
}));
type WorkspacePrismaMock = {
  product: { findFirst: jest.Mock; create: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock };
  kloelMemory: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    upsert: jest.Mock;
    updateMany: jest.Mock;
  };
  workspace: { findUnique: jest.Mock; update: jest.Mock };
  flow: { create: jest.Mock };
  contact: { count: jest.Mock };
  campaign: { updateMany: jest.Mock };
  $transaction: jest.Mock;
};
describe('UnifiedAgentActionsWorkspaceService', () => {
  let service: UnifiedAgentActionsWorkspaceService;
  let prisma: WorkspacePrismaMock;
  let planLimits: Pick<PlanLimitsService, 'ensureTokenBudget' | 'trackAiUsage'>;
  const wsId = 'ws-1';
  beforeEach(async () => {
    prisma = {
      product: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'p-1' }),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      kloelMemory: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({ providerSettings: {} }),
        update: jest.fn().mockResolvedValue({}),
      },
      flow: {
        create: jest.fn().mockResolvedValue({ id: 'f-1', name: 'Flow 1' }),
      },
      contact: {
        count: jest.fn().mockResolvedValue(0),
      },
      campaign: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest
        .fn()
        .mockImplementation((fnOrArg: unknown) =>
          typeof fnOrArg === 'function' ? fnOrArg(prisma) : Promise.resolve(undefined),
        ),
    };
    planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedAgentActionsWorkspaceService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: OpsAlertService, useValue: { alertOnCriticalError: jest.fn() } },
      ],
    }).compile();
    service = module.get<UnifiedAgentActionsWorkspaceService>(UnifiedAgentActionsWorkspaceService);
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  describe('actionCreateProduct', () => {
    it('creates product when no duplicate found', async () => {
      const result = await service.actionCreateProduct(wsId, {
        name: 'Plano Pro',
        price: 199,
      });
      expect(result.success).toBe(true);
      expect(result.productId).toBeDefined();
      expect(prisma.kloelMemory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: wsId,
            type: 'product',
            value: expect.objectContaining({ name: 'Plano Pro', price: 199 }),
          }),
        }),
      );
    });
    it('deduplicates when product already exists in DB', async () => {
      prisma.product.findFirst.mockResolvedValue({
        id: 'existing-p-1',
        name: 'Plano Pro',
        price: 199,
      });
      const result = await service.actionCreateProduct(wsId, {
        name: 'Plano Pro',
        price: 199,
      });
      expect(result.success).toBe(true);
      expect(result.deduplicated).toBe(true);
      expect(result.productId).toBe('existing-p-1');
      expect(prisma.kloelMemory.create).not.toHaveBeenCalled();
    });
    it('deduplicates when product exists in memory', async () => {
      prisma.kloelMemory.findFirst.mockResolvedValue({
        key: 'mem-p-1',
        value: { name: 'Plano Pro' },
      });
      const result = await service.actionCreateProduct(wsId, {
        name: 'Plano Pro',
        price: 199,
      });
      expect(result.success).toBe(true);
      expect(result.deduplicated).toBe(true);
    });
    it('saves in memory even when DB creation fails', async () => {
      prisma.product.create.mockRejectedValue(new Error('DB error'));
      const result = await service.actionCreateProduct(wsId, {
        name: 'Plano Pro',
        price: 199,
      });
      expect(result.success).toBe(true);
      expect(prisma.kloelMemory.create).toHaveBeenCalled();
    });
  });
  describe('actionUpdateProduct', () => {
    it('requires productId', async () => {
      const result = await service.actionUpdateProduct(wsId, {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('Product ID');
    });
    it('returns error when product not found', async () => {
      prisma.kloelMemory.findFirst.mockResolvedValue(null);
      const result = await service.actionUpdateProduct(wsId, { productId: 'nonexistent' });
      expect(result.success).toBe(false);
    });
    it('updates product in memory', async () => {
      prisma.kloelMemory.findFirst.mockResolvedValue({
        id: 'mem-1',
        key: 'product_123',
        value: { name: 'Old Name', price: 100 },
      });
      const result = await service.actionUpdateProduct(wsId, {
        productId: 'product_123',
        name: 'New Name',
        price: 150,
      });
      expect(result.success).toBe(true);
      expect(prisma.kloelMemory.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: wsId }),
          data: expect.objectContaining({
            value: expect.objectContaining({ name: 'New Name', price: 150 }),
          }),
        }),
      );
    });
  });
  describe('actionCreateFlow', () => {
    it('requires a name', async () => {
      const result = await service.actionCreateFlow(wsId, {});
      expect(result.success).toBe(false);
      expect(result.error).toContain('name');
    });
    it('creates flow in kloelMemory', async () => {
      const result = await service.actionCreateFlow(wsId, {
        name: 'Welcome Flow',
        trigger: 'welcome',
      });
      expect(result.success).toBe(true);
      expect(result.flowId).toBeDefined();
      expect(prisma.kloelMemory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: wsId,
            type: 'flow',
            category: 'automation',
          }),
        }),
      );
    });
  });
  describe('actionUpdateWorkspaceSettings', () => {
    it('updates business name', async () => {
      const result = await service.actionUpdateWorkspaceSettings(wsId, {
        businessName: 'NewCo',
      });
      expect(result.success).toBe(true);
      expect(prisma.workspace.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: wsId },
          data: expect.objectContaining({ name: 'NewCo' }),
        }),
      );
    });
    it('upserts businessHours in kloelMemory', async () => {
      await service.actionUpdateWorkspaceSettings(wsId, {
        businessHours: '9h-18h',
      });
      expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId_key: { workspaceId: wsId, key: 'businessHours' } },
        }),
      );
    });
    it('upserts autoReply settings', async () => {
      await service.actionUpdateWorkspaceSettings(wsId, {
        autoReplyEnabled: true,
        autoReplyMessage: 'Ola!',
      });
      expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId_key: { workspaceId: wsId, key: 'autoReply' } },
        }),
      );
    });
  });
  describe('actionCreateBroadcast', () => {
    it('creates broadcast with contact count', async () => {
      prisma.contact.count.mockResolvedValue(42);
      const result = await service.actionCreateBroadcast(wsId, {
        name: 'Promo',
        message: 'Oferta especial!',
        targetTags: ['vip'],
      });
      expect(result.success).toBe(true);
      expect(result.contactCount).toBe(42);
      expect(prisma.kloelMemory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: wsId,
            type: 'broadcast',
            category: 'campaign',
          }),
        }),
      );
    });
  });
  describe('actionConfigureAIPersona', () => {
    it('upserts AI persona in kloelMemory', async () => {
      const result = await service.actionConfigureAIPersona(wsId, {
        name: 'Atendente',
        personality: 'Amigavel',
        tone: 'friendly',
      });
      expect(result.success).toBe(true);
      expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId_key: { workspaceId: wsId, key: 'aiPersona' } },
          create: expect.objectContaining({
            workspaceId: wsId,
            value: expect.objectContaining({ name: 'Atendente' }),
          }),
        }),
      );
    });
    it('uses defaults when no args provided', async () => {
      await service.actionConfigureAIPersona(wsId, {});
      expect(prisma.kloelMemory.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            value: expect.objectContaining({
              name: 'KLOEL',
              tone: 'friendly',
              language: 'pt-BR',
            }),
          }),
        }),
      );
    });
  });
  describe('actionToggleAutopilot', () => {
    it('enables autopilot via transaction', async () => {
      const result = await service.actionToggleAutopilot(wsId, {
        enabled: true,
        mode: 'full',
        workingHoursOnly: true,
      });
      expect(result.success).toBe(true);
      expect(prisma.$transaction).toHaveBeenCalled();
    });
    it('disables autopilot', async () => {
      const result = await service.actionToggleAutopilot(wsId, {
        enabled: false,
        mode: 'off',
      });
      expect(result.success).toBe(true);
    });
  });
});
