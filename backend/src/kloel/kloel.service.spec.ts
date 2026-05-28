import { matchInstance } from '../../test/helpers/match-instance';
import { KloelService } from './kloel.service';
import type { KloelPrismaMock } from './kloel.service.spec.types';

describe('KloelService', () => {
  let service: KloelService;
  let prisma: KloelPrismaMock;
  let mocks: {
    planLimits: {
      ensureTokenBudget: jest.Mock;
      trackAiUsage: jest.Mock;
      trackMessageSend: jest.Mock;
    };
    threadService: { normalizeThreadMessageMetadataRecord: jest.Mock };
    wsContextService: {
      getWorkspaceContext: jest.Mock;
      buildLinkedProductPromptContext: jest.Mock;
      contextFormatter: { sanitizeUserNameForAssistant: jest.Mock };
    };
    leadBrainService: {
      processWhatsAppMessage: jest.Mock;
      processWhatsAppMessageWithPayment: jest.Mock;
      generatePaymentForLead: jest.Mock;
    };
    composerService: {
      executeComposerCapability: jest.Mock;
      searchWeb: jest.Mock;
      buildCapabilityPrompt: jest.Mock;
    };
    thinkerService: {
      think: jest.Mock;
      thinkSync: jest.Mock;
      regenerateThreadAssistantResponse: jest.Mock;
    };
    replyEngineService: {
      buildAssistantReply: jest.Mock;
      buildMarketingPromptAddendum: jest.Mock;
    };
    toolDispatcher: { executeTool: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      chatThread: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'thread-1', title: 'Nova conversa' }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        count: jest.fn().mockResolvedValue(0),
      },
      chatMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'msg-1' }),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      kloelMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      kloelMemory: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({}),
      },
      persona: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      integration: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
      product: {
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      workspace: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
      agent: { findFirst: jest.fn().mockResolvedValue(null) },
      flow: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      contact: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn() },
      message: { create: jest.fn(), update: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      autopilotEvent: { create: jest.fn().mockResolvedValue({}) },
      $transaction: jest.fn().mockResolvedValue(undefined),
    };

    mocks = {
      planLimits: {
        ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
        trackAiUsage: jest.fn().mockResolvedValue(undefined),
        trackMessageSend: jest.fn().mockResolvedValue(undefined),
      },
      threadService: {
        normalizeThreadMessageMetadataRecord: jest.fn().mockReturnValue({}),
      },
      wsContextService: {
        getWorkspaceContext: jest.fn().mockResolvedValue(''),
        buildLinkedProductPromptContext: jest.fn().mockResolvedValue(null),
        contextFormatter: {
          sanitizeUserNameForAssistant: jest.fn().mockReturnValue('Usuário'),
        },
      },
      leadBrainService: {
        processWhatsAppMessage: jest.fn().mockResolvedValue('resposta'),
        processWhatsAppMessageWithPayment: jest.fn().mockResolvedValue({ response: 'r' }),
        generatePaymentForLead: jest.fn().mockResolvedValue({}),
      },
      composerService: {
        executeComposerCapability: jest.fn(),
        searchWeb: jest.fn().mockResolvedValue({ answer: '', sources: [] }),
        buildCapabilityPrompt: jest.fn().mockReturnValue(''),
      },
      thinkerService: {
        think: jest.fn().mockResolvedValue(undefined),
        thinkSync: jest.fn().mockResolvedValue({ response: 'ok' }),
        regenerateThreadAssistantResponse: jest.fn().mockResolvedValue({}),
      },
      replyEngineService: {
        buildAssistantReply: jest.fn().mockResolvedValue('reply'),
        buildMarketingPromptAddendum: jest.fn().mockResolvedValue(''),
      },
      toolDispatcher: {
        executeTool: jest.fn().mockResolvedValue({ success: true }),
      },
    };

    service = new KloelService(
      prisma as never,
      mocks.planLimits as never,
      mocks.threadService as never,
      mocks.wsContextService as never,
      mocks.leadBrainService as never,
      mocks.thinkerService as never,
      mocks.replyEngineService as never,
      mocks.toolDispatcher as never,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('thinkSync deterministic actions', () => {
    it('returns canonical material payment rail proof in sync chat replies', async () => {
      mocks.toolDispatcher.executeTool.mockResolvedValueOnce({
        success: true,
        saleId: 'sale-pix-1',
        externalPaymentId: 'mp-payment-1',
        pixCopiaECola: '000201pix',
        pixQrCode: 'qr-base64',
        capabilityId: 'sales.create_pix',
        auditLogId: 'audit-pix-1',
        evidenceUrl: '/vendas/sale-pix-1',
        domainEvents: ['sale.created', 'payment.pending'],
        receipt: {
          capabilityId: 'sales.create_pix',
          auditLogId: 'audit-pix-1',
          evidenceUrl: '/vendas/sale-pix-1',
          domainEvents: ['sale.created', 'payment.pending'],
          idempotencyKey: 'sales.create_pix:ws-1:user-42',
          success: true,
          executionRail: {
            provider: 'mercadopago',
            paymentMethod: 'PIX',
            providerMethod: 'pix',
            proofFields: ['saleId', 'externalPaymentId', 'pixCopiaECola', 'pixQrCode'],
          },
        },
      });

      const result = await service.thinkSync({
        message: 'emite um PIX de R$197 para Joao comprar PDRN',
        workspaceId: 'ws-1',
        userId: 'user-42',
      });

      expect(mocks.toolDispatcher.executeTool).toHaveBeenCalledWith(
        'ws-1',
        'sales.create_pix',
        expect.objectContaining({ amount: 197 }),
        'user-42',
      );
      expect(result.response).toContain('PIX gerado');
      expect(result.response).toContain('PIX copia e cola: 000201pix');
      expect(result.response).toContain('Prova material:');
      expect(result.response).toContain('Capacidade: sales.create_pix');
      expect(result.response).toContain('Evidência: /vendas/sale-pix-1');
      expect(result.response).toContain('AuditLog: audit-pix-1');
      expect(result.response).toContain('Provedor: mercadopago');
      expect(result.response).toContain('Método: PIX');
      expect(result.response).toContain('Método do provedor: pix');
      expect(result.response).toContain(
        'Contrato de prova: saleId, externalPaymentId, pixCopiaECola, pixQrCode',
      );
      expect(result.response).toContain('Idempotência: sales.create_pix:ws-1:user-42');
    });
  });

  // ── getHistory ──

  describe('getHistory', () => {
    it('returns empty array when workspaceId is falsy', async () => {
      const result = await service.getHistory('');
      expect(result).toEqual([]);
      expect(prisma.kloelMessage.findMany).not.toHaveBeenCalled();
    });

    it('queries kloelMessage scoped by workspaceId', async () => {
      prisma.kloelMessage.findMany.mockResolvedValue([
        { id: 'm1', role: 'user', content: 'hello', createdAt: new Date('2026-01-01') },
      ]);

      const result = await service.getHistory('ws-1');

      expect(prisma.kloelMessage.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        orderBy: { createdAt: 'asc' },
        take: 50,
        select: { id: true, role: true, content: true, createdAt: true },
      });
      expect(result).toEqual([
        { id: 'm1', role: 'user', content: 'hello', timestamp: new Date('2026-01-01') },
      ]);
    });

    it('returns empty array on prisma error', async () => {
      prisma.kloelMessage.findMany.mockRejectedValue(new Error('db down'));
      const result = await service.getHistory('ws-1');
      expect(result).toEqual([]);
    });
  });

  // ── saveMemory ──

  describe('saveMemory', () => {
    it('delegates to conversationStore with workspaceId', async () => {
      const captured: Array<{ where?: unknown; create?: unknown }> = [];
      prisma.kloelMemory.upsert.mockImplementation(
        (args: { where?: unknown; create?: unknown }) => {
          captured.push(args);
          return Promise.resolve({});
        },
      );

      await service.saveMemory('ws-1', 'fact', 'content');

      expect(captured.length).toBe(1);
      const wsKey = captured[0].where as { workspaceId_key?: { workspaceId?: string } } | undefined;
      const createData = captured[0].create as { workspaceId?: string } | undefined;
      expect(wsKey?.workspaceId_key?.workspaceId).toBe('ws-1');
      expect(createData?.workspaceId).toBe('ws-1');
    });
  });

  // ── listFollowups ──

  describe('listFollowups', () => {
    it('queries kloelMemory scoped by workspaceId', async () => {
      prisma.kloelMemory.findMany.mockResolvedValue([]);

      await service.listFollowups('ws-1');

      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1', category: 'followups' },
        }),
      );
    });

    it('adds contactId filter when provided', async () => {
      prisma.kloelMemory.findMany.mockResolvedValue([]);

      await service.listFollowups('ws-1', 'contact-1');

      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId: 'ws-1',
            category: 'followups',
            metadata: { path: ['contactId'], equals: 'contact-1' },
          },
        }),
      );
    });

    it('maps followup metadata to list items', async () => {
      const createdAt = new Date('2026-01-01');
      prisma.kloelMemory.findMany.mockResolvedValue([
        {
          id: 'f1',
          key: 'followup-1',
          value: 'some value',
          metadata: { phone: '5511', contactId: 'c1', message: 'msg', status: 'done' },
          createdAt,
        },
      ]);

      const result = await service.listFollowups('ws-1');

      expect(result.total).toBe(1);
      expect(result.followups[0]).toEqual({
        id: 'f1',
        key: 'followup-1',
        phone: '5511',
        contactId: 'c1',
        message: 'msg',
        scheduledFor: undefined,
        delayMinutes: undefined,
        status: 'done',
        createdAt,
        executedAt: undefined,
      });
    });

    it('returns empty result on prisma error', async () => {
      prisma.kloelMemory.findMany.mockRejectedValue(new Error('db down'));
      const result = await service.listFollowups('ws-1');
      expect(result).toEqual({ total: 0, followups: [] });
    });
  });

  // ── listPersonas ──

  describe('listPersonas', () => {
    it('queries persona scoped by workspaceId', async () => {
      prisma.persona.findMany.mockResolvedValue([]);

      await service.listPersonas('ws-1');

      expect(prisma.persona.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          name: true,
          role: true,
          basePrompt: true,
          voiceId: true,
          knowledgeBaseId: true,
          workspaceId: true,
          createdAt: true,
        },
      });
    });
  });

  // ── createPersona ──

  describe('createPersona', () => {
    it('creates persona with workspaceId in data', async () => {
      prisma.persona.create.mockResolvedValue({ id: 'p1' });

      await service.createPersona('ws-1', { name: 'Vendedor', role: 'SALES' });

      expect(prisma.persona.create).toHaveBeenCalledWith({
        data: {
          workspaceId: 'ws-1',
          name: 'Vendedor',
          role: 'SALES',
          basePrompt: '',
        },
      });
    });

    it('defaults role to SALES and uses systemPrompt as basePrompt when provided', async () => {
      prisma.persona.create.mockResolvedValue({ id: 'p2' });

      await service.createPersona('ws-2', { name: 'Suporte', systemPrompt: 'Você é suporte' });

      expect(prisma.persona.create).toHaveBeenCalledWith({
        data: {
          workspaceId: 'ws-2',
          name: 'Suporte',
          role: 'SALES',
          basePrompt: 'Você é suporte',
        },
      });
    });

    it('prefers basePrompt over systemPrompt when both provided', async () => {
      prisma.persona.create.mockResolvedValue({ id: 'p3' });

      await service.createPersona('ws-3', {
        name: 'Bot',
        basePrompt: 'Prompt base',
        systemPrompt: 'System prompt',
      });

      expect(prisma.persona.create).toHaveBeenCalledWith({
        data: {
          workspaceId: 'ws-3',
          name: 'Bot',
          role: 'SALES',
          basePrompt: 'Prompt base',
        },
      });
    });
  });

  // ── listIntegrations ──

  describe('listIntegrations', () => {
    it('queries integration scoped by workspaceId', async () => {
      prisma.integration.findMany.mockResolvedValue([]);

      await service.listIntegrations('ws-1');

      expect(prisma.integration.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          type: true,
          name: true,
          credentials: true,
          isActive: true,
          workspaceId: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
  });

  // ── createIntegration ──

  describe('createIntegration', () => {
    it('creates integration with workspaceId in data', async () => {
      prisma.integration.create.mockResolvedValue({ id: 'i1' });

      await service.createIntegration('ws-1', {
        type: 'blig',
        name: 'Bling',
        credentials: { apiKey: 'k' },
      });

      expect(prisma.integration.create).toHaveBeenCalledWith({
        data: {
          workspaceId: 'ws-1',
          type: 'blig',
          name: 'Bling',
          credentials: { apiKey: 'k' },
        },
      });
    });
  });

  // ── Delegation methods ──

  describe('processWhatsAppMessage', () => {
    it('passes workspaceId to leadBrainService', async () => {
      await service.processWhatsAppMessage('ws-1', '5511', 'hello');

      expect(mocks.leadBrainService.processWhatsAppMessage).toHaveBeenCalledWith(
        'ws-1',
        '5511',
        'hello',
        matchInstance(Function),
      );
    });
  });

  describe('processWhatsAppMessageWithPayment', () => {
    it('passes workspaceId to leadBrainService', async () => {
      await service.processWhatsAppMessageWithPayment('ws-1', '5511', 'hello');

      expect(mocks.leadBrainService.processWhatsAppMessageWithPayment).toHaveBeenCalledWith(
        'ws-1',
        '5511',
        'hello',
        matchInstance(Function),
      );
    });
  });

  describe('generatePaymentForLead', () => {
    it('passes workspaceId to leadBrainService', async () => {
      await service.generatePaymentForLead('ws-1', 'lead-1', '5511', 'Prod', 100, 'conv');

      expect(mocks.leadBrainService.generatePaymentForLead).toHaveBeenCalledWith(
        'ws-1',
        'lead-1',
        '5511',
        'Prod',
        100,
        'conv',
      );
    });
  });

  describe('regenerateThreadAssistantResponse', () => {
    it('passes workspaceId to thinkerService', async () => {
      await service.regenerateThreadAssistantResponse({
        workspaceId: 'ws-1',
        conversationId: 'conv-1',
        assistantMessageId: 'msg-1',
      });

      expect(mocks.thinkerService.regenerateThreadAssistantResponse).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        conversationId: 'conv-1',
        assistantMessageId: 'msg-1',
      });
    });
  });

  // ── Tenant isolation ──

  describe('tenant isolation', () => {
    it('getHistory enforces workspaceId filter', async () => {
      prisma.kloelMessage.findMany.mockResolvedValue([
        { id: 'm1', role: 'user', content: 'hello', createdAt: new Date() },
      ]);

      await service.getHistory('ws-a');

      expect(prisma.kloelMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws-a' } }),
      );
    });

    it('listFollowups enforces workspaceId filter', async () => {
      await service.listFollowups('ws-b');

      expect(prisma.kloelMemory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws-b', category: 'followups' } }),
      );
    });

    it('listPersonas enforces workspaceId filter', async () => {
      await service.listPersonas('ws-c');

      expect(prisma.persona.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws-c' } }),
      );
    });

    it('createPersona includes workspaceId in data', async () => {
      await service.createPersona('ws-d', { name: 'P' });

      expect(prisma.persona.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { workspaceId: 'ws-d', name: 'P', role: 'SALES', basePrompt: '' },
        }),
      );
    });

    it('listIntegrations enforces workspaceId filter', async () => {
      await service.listIntegrations('ws-e');

      expect(prisma.integration.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { workspaceId: 'ws-e' } }),
      );
    });

    it('createIntegration includes workspaceId in data', async () => {
      await service.createIntegration('ws-f', { type: 't', name: 'n', credentials: {} });

      expect(prisma.integration.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { workspaceId: 'ws-f', type: 't', name: 'n', credentials: {} },
        }),
      );
    });
  });
});
