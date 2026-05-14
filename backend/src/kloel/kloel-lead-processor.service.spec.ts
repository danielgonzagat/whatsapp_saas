import { Test, TestingModule } from '@nestjs/testing';
import { KloelLeadProcessorService } from './kloel-lead-processor.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnifiedAgentService } from './unified-agent.service';
import { SmartPaymentService } from './smart-payment.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { AbiBuilderService } from './abi/abi-builder.service';
import { chatCompletionWithFallback } from './openai-wrapper';

jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn().mockResolvedValue({
    choices: [{ message: { content: 'Resposta automatizada de teste' } }],
    usage: { total_tokens: 100 },
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

type LeadProcessorPrismaMock = {
  workspace: { findUnique: jest.Mock };
  kloelLead: { findFirst: jest.Mock; create: jest.Mock; findMany: jest.Mock };
  kloelConversation: { create: jest.Mock; findMany: jest.Mock };
  contact: { upsert: jest.Mock };
  kloelMemory: { findMany: jest.Mock };
  product: { findMany: jest.Mock };
};

describe('KloelLeadProcessorService', () => {
  let service: KloelLeadProcessorService;
  let prisma: LeadProcessorPrismaMock;
  let unifiedAgent: Pick<UnifiedAgentService, 'processIncomingMessage'>;
  let smartPayment: { createSmartPayment: jest.Mock };
  let planLimits: Pick<PlanLimitsService, 'ensureTokenBudget' | 'trackAiUsage'>;
  let abiBuilder: { build: jest.Mock };

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
        create: jest.fn().mockResolvedValue({
          id: 'lead-1',
          workspaceId: wsId,
          phone: '5511999999999',
          name: 'Lead 9999',
          stage: 'new',
          score: 0,
        }),
        findMany: jest.fn().mockResolvedValue([]),
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
    unifiedAgent = {
      processIncomingMessage: jest.fn().mockResolvedValue({ reply: 'Resposta do agente' }),
    };
    smartPayment = {
      createSmartPayment: jest.fn().mockResolvedValue({
        paymentUrl: 'https://pay.test',
        suggestedMessage: 'Link de pagamento',
      }),
    };
    planLimits = {
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };
    abiBuilder = {
      build: jest.fn().mockResolvedValue({
        status: 'ok',
        abi: {
          abiVersion: '1.0.0',
          lineage: {
            canonicalName: 'Kloel',
            genesisEventId: 'genesis-1',
            lineageStatus: 'intact',
            operationalAge: 'new',
            capabilities: [],
          },
          identityProjection: {
            audience: 'public',
            currentMaturity: 'developing',
            truthMode: 'observed',
          },
          perception: { currentSnapshot: {}, recentSalientEvents: [] },
          beliefs: [],
          predictions: { active: [], recentSurprises: [] },
          attention: { candidates: [] },
          memory: { workingMemory: [], episodicRefs: [], consolidatedRefs: [] },
          capabilities: { available: [], restricted: [] },
          valence: {
            recentTrace: [],
            aggregatedMood: {
              positive: 0,
              negative: 0,
              neutral: 1,
              ambiguous: 0,
              windowHours: 24,
            },
          },
          pulseTruth: {
            noOverclaimStatus: 'PASS',
            capabilityHealthScore: 1,
            gates: [],
            certificationVerdict: {
              verdict: 'INSUFFICIENT_EVIDENCE',
              score: 0,
              measuredAt: '2026-05-14T00:00:00.000Z',
            },
            overclaimRisk: 0,
          },
          currentInput: {
            raw: 'Mensagem',
            channel: 'whatsapp',
            arrivalTimestamp: '2026-05-14T00:00:00.000Z',
          },
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelLeadProcessorService,
        { provide: PrismaService, useValue: prisma },
        { provide: UnifiedAgentService, useValue: unifiedAgent },
        { provide: SmartPaymentService, useValue: smartPayment },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: AbiBuilderService, useValue: abiBuilder },
      ],
    }).compile();

    service = module.get<KloelLeadProcessorService>(KloelLeadProcessorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processWhatsAppMessage', () => {
    it('processes message for non-autopilot workspace', async () => {
      const result = await service.processWhatsAppMessage(
        wsId,
        '5511999999999',
        'Quero comprar um produto',
        () => Promise.resolve('Contexto da empresa'),
      );

      expect(result).toContain('Resposta');
      expect(prisma.kloelLead.create).toHaveBeenCalled();
      expect(prisma.kloelConversation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ leadId: 'lead-1', role: 'user' }),
        }),
      );
    });

    it('returns error message on failure', async () => {
      prisma.workspace.findUnique.mockRejectedValue(new Error('DB down'));
      const result = await service.processWhatsAppMessage(wsId, '5511999999999', 'Oi', () =>
        Promise.resolve('context'),
      );
      expect(result).toContain('problema técnico');
    });

    it('uses workspace scoped context', async () => {
      const contextFn = jest.fn().mockResolvedValue('contexto');
      await service.processWhatsAppMessage(wsId, '5511999999999', 'Mensagem', contextFn);
      expect(contextFn).toHaveBeenCalledWith(wsId);
    });

    it('sends structured ABI state without a system role', async () => {
      await service.processWhatsAppMessage(wsId, '5511999999999', 'Mensagem', () =>
        Promise.resolve('contexto'),
      );

      expect(abiBuilder.build).toHaveBeenCalledWith(
        expect.objectContaining({
          audience: 'public',
          currentInput: expect.objectContaining({
            raw: 'Mensagem',
            channel: 'whatsapp',
          }),
        }),
      );
      const completionInput = (chatCompletionWithFallback as jest.Mock).mock.calls.at(-1)?.[1];
      expect(completionInput.messages).toEqual(
        expect.not.arrayContaining([expect.objectContaining({ role: 'system' })]),
      );
      expect(completionInput.messages.at(-1)).toEqual(
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('"cognitiveState"'),
        }),
      );
    });

    it('handles autopilot enabled mode', async () => {
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { autopilot: { enabled: true } },
        name: 'Workspace Teste',
      });
      const result = await service.processWhatsAppMessage(wsId, '5511999999999', 'Oi', () =>
        Promise.resolve('context'),
      );
      expect(unifiedAgent.processIncomingMessage).toHaveBeenCalled();
      expect(result).toEqual('Resposta do agente');
    });

    it('creates lead when not found', async () => {
      prisma.kloelLead.findFirst.mockResolvedValue(null);
      await service.processWhatsAppMessage(wsId, '5511999999999', 'Teste', () =>
        Promise.resolve('c'),
      );
      expect(prisma.kloelLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ workspaceId: wsId }),
        }),
      );
    });
  });

  describe('processWhatsAppMessageWithPayment', () => {
    it('returns payment link when buy intent is high', async () => {
      prisma.kloelLead.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'lead-1',
        workspaceId: wsId,
        phone: '5511999999999',
        name: 'Cliente',
        stage: 'new',
        score: 0,
      });
      prisma.kloelMemory.findMany.mockResolvedValue([
        {
          id: 'mem-1',
          type: 'product',
          value: { name: 'Curso X', price: 99.9 },
        },
      ]);

      const result = await service.processWhatsAppMessageWithPayment(
        wsId,
        '5511999999999',
        'Quero comprar curso x agora!',
        () => Promise.resolve('context'),
      );

      expect(result.paymentLink).toBeDefined();
      expect(result.response).toContain('pay.test');
    });

    it('returns base response when buy intent is low', async () => {
      const result = await service.processWhatsAppMessageWithPayment(
        wsId,
        '5511999999999',
        'Oi, tudo bem?',
        () => Promise.resolve('context'),
      );
      expect(result.paymentLink).toBeUndefined();
      expect(result.response).toBeDefined();
    });
  });

  describe('generatePaymentForLead', () => {
    it('creates smart payment for lead', async () => {
      prisma.kloelLead.findFirst.mockResolvedValue({
        id: 'lead-1',
        workspaceId: wsId,
        name: 'Cliente Teste',
        phone: '5511999999999',
      });
      const result = await service.generatePaymentForLead(
        wsId,
        'lead-1',
        '5511999999999',
        'Produto X',
        199.9,
        'Conversa toda',
      );
      expect(result?.paymentUrl).toBe('https://pay.test');
      expect(smartPayment.createSmartPayment).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: wsId, amount: 199.9 }),
      );
    });

    it('returns null on error', async () => {
      smartPayment.createSmartPayment.mockRejectedValue(new Error('stripe error'));
      const result = await service.generatePaymentForLead(
        wsId,
        'lead-1',
        '5511988888888',
        'X',
        99,
        'conversa',
      );
      expect(result).toBeNull();
    });
  });

  describe('listFollowups', () => {
    it('returns followups from kloelMemory', async () => {
      prisma.kloelMemory.findMany.mockResolvedValue([
        {
          id: 'f-1',
          key: 'followup_1',
          value: 'Mensagem de followup',
          metadata: { phone: '5511999999999', status: 'pending' },
          createdAt: new Date(),
        },
      ]);
      const result = await service.listFollowups(wsId);
      expect(result.total).toBe(1);
      expect(result.followups[0].status).toBe('pending');
      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspaceId: wsId }) }),
      );
    });

    it('filters by contactId when provided', async () => {
      await service.listFollowups(wsId, 'contact-1');
      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId: wsId }),
        }),
      );
    });

    it('returns empty on error', async () => {
      prisma.kloelMemory.findMany.mockRejectedValue(new Error('DB down'));
      const result = await service.listFollowups(wsId);
      expect(result.total).toBe(0);
      expect(result.followups).toEqual([]);
    });
  });

  describe('detectBuyIntent', () => {
    it('delegates to detectBuyIntent', () => {
      const result = service.detectBuyIntent('Quero comprar');
      expect(['high', 'medium', 'low', 'objection']).toContain(result);
    });
  });

  describe('workspace isolation', () => {
    it('getOrCreateLead filters by workspaceId', async () => {
      await service.processWhatsAppMessage('ws-tenant', '5511988888888', 'Oi', () =>
        Promise.resolve('c'),
      );
      expect(prisma.kloelLead.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws-tenant', phone: '5511988888888' } }),
      );
    });

    it('generatePaymentForLead filters by workspaceId', async () => {
      prisma.kloelLead.findFirst.mockResolvedValue({
        id: 'lead-1',
        workspaceId: 'ws-tenant',
        name: 'Lead',
      });
      await service.generatePaymentForLead('ws-tenant', 'lead-1', '55119', 'Prod', 99, 'msg');
      expect(prisma.kloelLead.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'lead-1', workspaceId: 'ws-tenant' } }),
      );
    });
  });

  describe('error handling', () => {
    it('processWhatsAppMessage propagates Prisma error gracefully', async () => {
      prisma.kloelLead.findFirst.mockRejectedValue(new Error('unique constraint'));
      const result = await service.processWhatsAppMessage(wsId, '55119', 'Oi', () =>
        Promise.resolve('c'),
      );
      expect(result).toContain('problema técnico');
    });
  });
});
