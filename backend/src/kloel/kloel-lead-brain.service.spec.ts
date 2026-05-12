import { Test, TestingModule } from '@nestjs/testing';
import { KloelLeadBrainService } from './kloel-lead-brain.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { LLMBudgetService } from './llm-budget.service';
import { UnifiedAgentService } from './unified-agent.service';
import { SmartPaymentService } from './smart-payment.service';

jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn().mockResolvedValue({
    choices: [{ message: { content: 'Resposta do Kloel Brain' } }],
    usage: { total_tokens: 120 },
  }),
}));

jest.mock('../lib/openai-models', () => ({
  resolveBackendOpenAIModel: jest.fn().mockReturnValue('gpt-4o'),
}));

jest.mock('openai', () => ({
  default: jest.fn().mockImplementation(() => ({
    apiKey: 'mock-key',
    chat: { completions: { create: jest.fn() } },
  })),
}));

type LeadBrainPrismaMock = {
  workspace: { findUnique: jest.Mock };
  kloelLead: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  kloelConversation: { create: jest.Mock; findMany: jest.Mock };
  contact: { upsert: jest.Mock };
  kloelMemory: { findMany: jest.Mock };
  product: { findMany: jest.Mock };
};

describe('KloelLeadBrainService', () => {
  let service: KloelLeadBrainService;
  let prisma: LeadBrainPrismaMock;
  let planLimits: Pick<PlanLimitsService, 'ensureTokenBudget' | 'trackAiUsage'>;
  let llmBudget: Pick<LLMBudgetService, 'assertBudget' | 'recordSpend'>;
  let unifiedAgent: Pick<UnifiedAgentService, 'processIncomingMessage'>;
  let smartPayment: { createSmartPayment: jest.Mock };

  const wsId = 'ws-1';

  beforeEach(async () => {
    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          providerSettings: {},
          name: 'Workspace Teste',
        }),
      },
      kloelLead: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue({ id: 'lead-1', workspaceId: wsId }),
        create: jest.fn().mockResolvedValue({
          id: 'lead-1',
          workspaceId: wsId,
          phone: '5511999999999',
          name: 'Lead 9999',
          stage: 'new',
          score: 0,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      kloelConversation: {
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      contact: {
        upsert: jest.fn().mockResolvedValue({ id: 'contact-1' }),
      },
      kloelMemory: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      product: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };
    llmBudget = {
      assertBudget: jest.fn().mockResolvedValue(undefined),
      recordSpend: jest.fn().mockResolvedValue(undefined),
    };
    unifiedAgent = {
      processIncomingMessage: jest.fn().mockResolvedValue({ reply: 'Resposta do agente' }),
    };
    smartPayment = {
      createSmartPayment: jest.fn().mockResolvedValue({
        paymentUrl: 'https://pay.test',
        suggestedMessage: 'Link',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelLeadBrainService,
        { provide: PrismaService, useValue: prisma },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: LLMBudgetService, useValue: llmBudget },
        { provide: UnifiedAgentService, useValue: unifiedAgent },
        { provide: SmartPaymentService, useValue: smartPayment },
      ],
    }).compile();

    service = module.get<KloelLeadBrainService>(KloelLeadBrainService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getOrCreateLead', () => {
    it('creates lead with workspaceId and phone', async () => {
      const lead = await service.getOrCreateLead(wsId, '5511999999999');
      expect(lead.id).toBe('lead-1');
      expect(prisma.kloelLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ workspaceId: wsId, phone: '5511999999999' }),
        }),
      );
    });

    it('returns existing lead when found', async () => {
      prisma.kloelLead.findFirst.mockResolvedValue({
        id: 'existing-lead',
        workspaceId: wsId,
        phone: '5511999999999',
        name: 'Existing',
        stage: 'new',
        score: 0,
      });
      const lead = await service.getOrCreateLead(wsId, '5511999999999');
      expect(lead.id).toBe('existing-lead');
      expect(prisma.kloelLead.create).not.toHaveBeenCalled();
    });
  });

  describe('saveLeadMessage', () => {
    it('creates conversation entry for valid lead', async () => {
      await service.saveLeadMessage('lead-1', wsId, 'user', 'Minha mensagem');
      expect(prisma.kloelConversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            leadId: 'lead-1',
            role: 'user',
            content: 'Minha mensagem',
          }),
        }),
      );
    });

    it('does not create when lead not found', async () => {
      prisma.kloelLead.findUnique.mockResolvedValue(null);
      await service.saveLeadMessage('bad-lead', wsId, 'user', 'msg');
      expect(prisma.kloelConversation.create).not.toHaveBeenCalled();
    });
  });

  describe('updateLeadFromConversation', () => {
    it('updates lead with high buy intent', async () => {
      await service.updateLeadFromConversation(wsId, 'lead-1', 'Quero comprar agora', 'Resposta');
      expect(prisma.kloelLead.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-1', workspaceId: wsId },
          data: expect.objectContaining({ stage: 'negotiation' }),
        }),
      );
    });

    it('updates lead with objection intent', async () => {
      await service.updateLeadFromConversation(
        wsId,
        'lead-1',
        'Muito caro, não posso pagar isso',
        'Resposta',
      );
      expect(prisma.kloelLead.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'lead-1', workspaceId: wsId },
          data: expect.objectContaining({ stage: 'objection' }),
        }),
      );
    });

    it('handles errors gracefully', async () => {
      prisma.kloelLead.updateMany.mockRejectedValue(new Error('DB error'));
      await expect(
        service.updateLeadFromConversation(wsId, 'lead-1', 'msg', 'reply'),
      ).resolves.toBeUndefined();
    });
  });

  describe('extractProductFromMessage', () => {
    it('finds product by name match in kloelMemory', async () => {
      prisma.kloelMemory.findMany.mockResolvedValue([
        { id: 'm-1', value: { name: 'Curso X', price: 99.9 } },
      ]);
      const product = await service.extractProductFromMessage(wsId, 'Quero comprar curso x hoje');
      expect(product).toEqual({ name: 'Curso X', price: 99.9 });
    });

    it('finds product from DB when memory is empty', async () => {
      prisma.kloelMemory.findMany.mockResolvedValue([]);
      prisma.product.findMany.mockResolvedValue([{ id: 'p-1', name: 'Produto DB', price: 149.9 }]);
      const product = await service.extractProductFromMessage(wsId, 'Quero produto db');
      expect(product).toEqual({ name: 'Produto DB', price: 149.9 });
    });

    it('returns null when no product matches', async () => {
      const product = await service.extractProductFromMessage(wsId, 'Ola tudo bem');
      expect(product).toBeNull();
    });

    it('filters by workspaceId', async () => {
      await service.extractProductFromMessage('ws-tenant', 'produto x');
      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws-tenant', type: 'product' } }),
      );
    });
  });

  describe('generatePaymentForLead', () => {
    it('creates smart payment', async () => {
      prisma.kloelLead.findFirst.mockResolvedValue({
        id: 'lead-1',
        workspaceId: wsId,
        name: 'Cliente',
      });
      const result = await service.generatePaymentForLead(
        wsId,
        'lead-1',
        '55119',
        'Produto',
        99.9,
        'conversa',
      );
      expect(result?.paymentUrl).toBe('https://pay.test');
    });

    it('returns null on error', async () => {
      smartPayment.createSmartPayment.mockRejectedValue(new Error('fail'));
      const result = await service.generatePaymentForLead(wsId, 'lead-1', '55119', 'P', 99, 'msg');
      expect(result).toBeNull();
    });
  });

  describe('processWhatsAppMessage', () => {
    it('processes message with autopilot disabled', async () => {
      const result = await service.processWhatsAppMessage(
        wsId,
        '5511999999999',
        'Quero ajuda',
        () => Promise.resolve('contexto'),
      );
      expect(result).toContain('Resposta');
    });

    it('processes message with autopilot enabled', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { autopilotEnabled: true },
        name: 'Test Workspace',
      });
      const result = await service.processWhatsAppMessage(wsId, '5511999999999', 'Oi', () =>
        Promise.resolve('context'),
      );
      expect(unifiedAgent.processIncomingMessage).toHaveBeenCalled();
      expect(result).toBe('Resposta do agente');
    });

    it('returns fallback on error', async () => {
      prisma.workspace.findUnique.mockRejectedValue(new Error('DB down'));
      const result = await service.processWhatsAppMessage(wsId, '55119', 'Oi', () =>
        Promise.resolve('c'),
      );
      expect(result).toContain('problema técnico');
    });

    it('scopes lead creation by workspaceId', async () => {
      await service.processWhatsAppMessage('ws-tenant', '5511988888888', 'Oi', () =>
        Promise.resolve('c'),
      );
      expect(prisma.kloelLead.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws-tenant', phone: '5511988888888' } }),
      );
    });
  });

  describe('processWhatsAppMessageWithPayment', () => {
    it('returns payment link on high buy intent', async () => {
      prisma.kloelLead.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'lead-1',
        workspaceId: wsId,
        phone: '5511999999999',
        name: 'Cliente',
      });
      prisma.kloelMemory.findMany.mockResolvedValue([
        { id: 'm-1', value: { name: 'Curso X', price: 99.9 } },
      ]);

      const result = await service.processWhatsAppMessageWithPayment(
        wsId,
        '5511999999999',
        'Quero comprar curso x',
        () => Promise.resolve('context'),
      );

      expect(result.paymentLink).toBeDefined();
    });

    it('returns only response for low intent', async () => {
      const result = await service.processWhatsAppMessageWithPayment(
        wsId,
        '5511999999999',
        'Oi tudo bem',
        () => Promise.resolve('context'),
      );
      expect(result.paymentLink).toBeUndefined();
    });
  });

  describe('workspace isolation', () => {
    it('getOrCreateLead scopes by workspaceId', async () => {
      await service.getOrCreateLead('ws-tenant', '55119');
      expect(prisma.kloelLead.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws-tenant', phone: '55119' } }),
      );
    });

    it('updateLeadFromConversation scopes by workspaceId', async () => {
      await service.updateLeadFromConversation('ws-tenant', 'lead-1', 'msg', 'reply');
      expect(prisma.kloelLead.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'lead-1', workspaceId: 'ws-tenant' } }),
      );
    });
  });
});
