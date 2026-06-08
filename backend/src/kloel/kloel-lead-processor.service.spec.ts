import { Test, TestingModule } from '@nestjs/testing';
import { KloelLeadProcessorService } from './kloel-lead-processor.service';
import { PrismaService } from '../prisma/prisma.service';
import { UnifiedAgentService } from './unified-agent.service';
import { SmartPaymentService } from './smart-payment.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { AbiBuilderService } from './abi/abi-builder.service';
import { MindMemoryItemService } from './mind/aliases/mind-memory-item.service';
import { chatCompletionWithFallback } from './openai-wrapper';
import { partialMatch, stringContains } from '../../test/helpers/match-instance';
import { castMock } from '../../test/helpers/cast-mock';
import { DecisionOutcomeService } from './decision-outcome.service';
import { WHATSAPP_REPLY_DECISION_TYPE } from './whatsapp-inbound-learn.flag';

jest.mock('./openai-wrapper', () => ({
  chatCompletionWithFallback: jest.fn().mockResolvedValue({
    choices: [{ message: { content: 'Resposta automatizada de teste' } }],
    usage: { total_tokens: 100 },
  }),
}));

jest.mock('../lib/openai-models', () => {
  const actual = jest.requireActual<typeof import('../lib/openai-models')>('../lib/openai-models');
  return {
    ...actual,
    resolveBackendOpenAIModel: jest.fn().mockReturnValue(actual.CANONICAL_MODEL_IDS.openAiTextOmni),
  };
});

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
  contact: { upsert: jest.Mock; findUnique: jest.Mock };
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
        findUnique: jest.fn().mockResolvedValue(null),
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
          readinessTruth: {
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
      const [[createArg]] = prisma.kloelConversation.create.mock.calls as Array<
        [
          {
            data: { leadId: string; role: string };
          },
        ]
      >;
      expect(createArg).toMatchObject({ data: { leadId: 'lead-1', role: 'user' } });
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
          currentInput: partialMatch({
            raw: 'Mensagem',
            channel: 'whatsapp',
          }),
        }),
      );
      const completionInput = castMock<[unknown, { messages: { at(i: number): unknown }[] }][]>(
        (chatCompletionWithFallback as jest.Mock).mock.calls,
      ).at(-1)?.[1];
      expect(completionInput.messages).toEqual(
        expect.not.arrayContaining([expect.objectContaining({ role: 'system' })]),
      );
      expect(completionInput.messages.at(-1)).toEqual(
        expect.objectContaining({
          role: 'user',
          content: stringContains('"cognitiveState"'),
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
      const [[createArg]] = prisma.kloelLead.create.mock.calls as Array<
        [
          {
            data: { workspaceId: string };
          },
        ]
      >;
      expect(createArg).toMatchObject({ data: { workspaceId: wsId } });
    });

    it('dual-writes canonical Contact mirroring funnel + kloelLeadId (PERSON PHASE 1)', async () => {
      // Existing Contact with no link yet → write-if-null stamps it in update.
      prisma.contact.findUnique.mockResolvedValue({ kloelLeadId: null });
      prisma.kloelLead.create.mockResolvedValue({
        id: 'lead-1',
        workspaceId: wsId,
        phone: '5511999999999',
        name: 'Lead 9999',
        status: 'hot',
        stage: 'negotiation',
        lastMessage: 'Quero comprar',
        lastIntent: 'purchase',
        totalMessages: 3,
        score: 0,
      });
      await service.processWhatsAppMessage(wsId, '5511999999999', 'Quero comprar', () =>
        Promise.resolve('c'),
      );
      expect(prisma.contact.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId_phone: { workspaceId: wsId, phone: '5511999999999' } },
        }),
      );
      expect(prisma.contact.upsert).toHaveBeenCalledWith(
        partialMatch({
          where: { workspaceId_phone: { workspaceId: wsId, phone: '5511999999999' } },
          create: partialMatch({
            workspaceId: wsId,
            phone: '5511999999999',
            leadStatus: 'hot',
            leadStage: 'negotiation',
            lastMessage: 'Quero comprar',
            lastIntent: 'purchase',
            totalMessages: 3,
            kloelLeadId: 'lead-1',
          }),
          update: partialMatch({
            leadStatus: 'hot',
            leadStage: 'negotiation',
            kloelLeadId: 'lead-1',
          }),
        }),
      );
    });

    it('does not overwrite an existing Contact.kloelLeadId (write-if-null)', async () => {
      prisma.contact.findUnique.mockResolvedValue({ kloelLeadId: 'other-lead' });
      await service.processWhatsAppMessage(wsId, '5511999999999', 'Oi', () => Promise.resolve('c'));
      const upsertArg = castMock<[{ update: Record<string, unknown> }]>(
        prisma.contact.upsert.mock.calls[0],
      )[0];
      expect(upsertArg.update).not.toHaveProperty('kloelLeadId');
    });

    it('is fail-open when Contact dual-write throws', async () => {
      prisma.contact.upsert.mockRejectedValueOnce(new Error('contact DB error'));
      const result = await service.processWhatsAppMessage(wsId, '5511999999999', 'Oi', () =>
        Promise.resolve('c'),
      );
      expect(result).toContain('Resposta');
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

  describe('canonical MindMemoryItemService surface', () => {
    it('routes product extraction through MindMemoryItemService.items (not raw prisma.kloelMemory)', async () => {
      // Canonical-surface product row, served by MindMemoryItemService.items.
      const itemsFindMany = jest.fn().mockResolvedValue([
        {
          id: 'mem-canon',
          type: 'product',
          value: { name: 'Curso X', price: 99.9 },
        },
      ]);
      // Raw prisma delegate must NOT be consulted when the canonical service is wired.
      prisma.kloelMemory.findMany.mockResolvedValue([]);
      prisma.kloelLead.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        id: 'lead-1',
        workspaceId: wsId,
        phone: '5511999999999',
        name: 'Cliente',
        stage: 'new',
        score: 0,
      });

      const mindMemory = { items: { findMany: itemsFindMany } };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelLeadProcessorService,
          { provide: PrismaService, useValue: prisma },
          { provide: UnifiedAgentService, useValue: unifiedAgent },
          { provide: SmartPaymentService, useValue: smartPayment },
          { provide: PlanLimitsService, useValue: planLimits },
          { provide: AbiBuilderService, useValue: abiBuilder },
          { provide: MindMemoryItemService, useValue: mindMemory },
        ],
      }).compile();
      const canonicalService = module.get<KloelLeadProcessorService>(KloelLeadProcessorService);

      const result = await canonicalService.processWhatsAppMessageWithPayment(
        wsId,
        '5511999999999',
        'Quero comprar curso x agora!',
        () => Promise.resolve('context'),
      );

      // Behavior preserved: canonical row still yields the payment link.
      expect(result.paymentLink).toBeDefined();
      expect(result.response).toContain('pay.test');
      // The product lookup hit the canonical surface…
      expect(itemsFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: wsId, type: 'product' } }),
      );
      // …and NOT the raw prisma.kloelMemory delegate.
      expect(prisma.kloelMemory.findMany).not.toHaveBeenCalled();
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
      const [[findManyArg]] = prisma.kloelMemory.findMany.mock.calls as Array<
        [
          {
            where: { workspaceId: string };
          },
        ]
      >;
      expect(findManyArg).toMatchObject({ where: { workspaceId: wsId } });
    });

    it('filters by contactId when provided', async () => {
      await service.listFollowups(wsId, 'contact-1');
      const [[findManyArg]] = prisma.kloelMemory.findMany.mock.calls as Array<
        [
          {
            where: { workspaceId: string };
          },
        ]
      >;
      expect(findManyArg).toMatchObject({ where: { workspaceId: wsId } });
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

  describe('WhatsApp-inbound learning loop (KLOEL_WHATSAPP_INBOUND_LEARN)', () => {
    const ORIGINAL_FLAG = process.env.KLOEL_WHATSAPP_INBOUND_LEARN;
    let decisionOutcome: { recordDecision: jest.Mock; closeOutcome: jest.Mock };

    /** Flush the fire-and-forget async closure inside recordWhatsAppInboundOutcome. */
    async function flush(): Promise<void> {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    }

    async function buildService(): Promise<KloelLeadProcessorService> {
      decisionOutcome = {
        recordDecision: jest.fn().mockResolvedValue(undefined),
        closeOutcome: jest.fn().mockResolvedValue(undefined),
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          KloelLeadProcessorService,
          { provide: PrismaService, useValue: prisma },
          { provide: UnifiedAgentService, useValue: unifiedAgent },
          { provide: SmartPaymentService, useValue: smartPayment },
          { provide: PlanLimitsService, useValue: planLimits },
          { provide: AbiBuilderService, useValue: abiBuilder },
          { provide: DecisionOutcomeService, useValue: decisionOutcome },
        ],
      }).compile();
      return module.get<KloelLeadProcessorService>(KloelLeadProcessorService);
    }

    afterEach(() => {
      if (ORIGINAL_FLAG === undefined) {
        delete process.env.KLOEL_WHATSAPP_INBOUND_LEARN;
      } else {
        process.env.KLOEL_WHATSAPP_INBOUND_LEARN = ORIGINAL_FLAG;
      }
    });

    it('flag OFF: reply path NEVER records or closes a decision (byte-identical)', async () => {
      delete process.env.KLOEL_WHATSAPP_INBOUND_LEARN;
      const svc = await buildService();
      const result = await svc.processWhatsAppMessage(wsId, '5511999999999', 'Quero comprar', () =>
        Promise.resolve('contexto'),
      );
      await flush();
      expect(result).toContain('Resposta');
      expect(decisionOutcome.recordDecision).not.toHaveBeenCalled();
      expect(decisionOutcome.closeOutcome).not.toHaveBeenCalled();
    });

    it('flag ON: the lead-processor reply seam closes the whatsapp_reply loop', async () => {
      process.env.KLOEL_WHATSAPP_INBOUND_LEARN = 'true';
      const svc = await buildService();
      await svc.processWhatsAppMessage(wsId, '5511999999999', 'Quero comprar', () =>
        Promise.resolve('contexto'),
      );
      await flush();

      expect(decisionOutcome.recordDecision).toHaveBeenCalledTimes(1);
      expect(decisionOutcome.recordDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: wsId,
          decisionType: WHATSAPP_REPLY_DECISION_TYPE,
          chosenAction: 'engage',
          baselineAction: 'silence',
        }),
      );
      // The SAME outcomeKey that was recorded is the one that gets closed.
      const recordedKey = castMock<[{ outcomeKey: string }]>(
        decisionOutcome.recordDecision.mock.calls[0],
      )[0].outcomeKey;
      expect(decisionOutcome.closeOutcome).toHaveBeenCalledTimes(1);
      expect(decisionOutcome.closeOutcome).toHaveBeenCalledWith(
        expect.objectContaining({ outcomeKey: recordedKey }),
      );
    });

    it('flag ON: the autopilot reply seam also closes the loop', async () => {
      process.env.KLOEL_WHATSAPP_INBOUND_LEARN = 'true';
      prisma.workspace.findUnique.mockResolvedValue({
        providerSettings: { autopilot: { enabled: true } },
        name: 'Workspace Teste',
      });
      const svc = await buildService();
      const result = await svc.processWhatsAppMessage(wsId, '5511999999999', 'Oi', () =>
        Promise.resolve('contexto'),
      );
      await flush();
      expect(result).toEqual('Resposta do agente');
      expect(decisionOutcome.recordDecision).toHaveBeenCalledWith(
        expect.objectContaining({
          decisionType: WHATSAPP_REPLY_DECISION_TYPE,
          contextSnapshot: partialMatch({ surface: 'whatsapp-autopilot' }),
        }),
      );
      expect(decisionOutcome.closeOutcome).toHaveBeenCalledTimes(1);
    });

    it('flag ON: a learning failure is fail-open and still returns the reply', async () => {
      process.env.KLOEL_WHATSAPP_INBOUND_LEARN = 'true';
      const svc = await buildService();
      decisionOutcome.recordDecision.mockRejectedValue(new Error('decision DB down'));
      const result = await svc.processWhatsAppMessage(wsId, '5511999999999', 'Oi', () =>
        Promise.resolve('contexto'),
      );
      await flush();
      expect(result).toContain('Resposta');
    });
  });
});
