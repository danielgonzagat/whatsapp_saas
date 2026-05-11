import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../whatsapp/whatsapp-normalization.util', () => ({
  includesAnyPhrase: jest.fn(
    (text: string, phrases: string[]) => {
      if (!text) return false;
      for (const phrase of phrases) {
        if (text.toLowerCase().includes(phrase)) return true;
      }
      return false;
    },
  ),
  normalizeIntentText: jest.fn((text: string) => (text || '').toLowerCase()),
}));

import { WhatsAppBrainService } from './whatsapp-brain.service';
import { PrismaService } from '../prisma/prisma.service';
import { KloelService } from './kloel.service';

type BrainPrismaMock = {
  kloelLead: { findFirst: jest.Mock; create: jest.Mock };
};

describe('WhatsAppBrainService', () => {
  let service: WhatsAppBrainService;
  let prisma: BrainPrismaMock;
  let kloelService: Pick<KloelService, 'thinkSync'>;

  const wsId = 'ws-1';
  const phone = '5511999999999';

  beforeEach(async () => {
    prisma = {
      kloelLead: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'lead-1', workspaceId: wsId, phone }),
      },
    };
    kloelService = {
      thinkSync: jest.fn().mockResolvedValue({ response: 'Olá! Como posso ajudar?' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppBrainService,
        { provide: PrismaService, useValue: prisma },
        { provide: KloelService, useValue: kloelService },
      ],
    }).compile();

    service = module.get<WhatsAppBrainService>(WhatsAppBrainService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processWebhook', () => {
    it('processes a valid text message webhook', async () => {
      prisma.kloelLead.findFirst.mockResolvedValue({ id: 'lead-1' });

      await service.processWebhook(
        {
          entry: [
            {
              changes: [
                {
                  messages: [
                    {
                      from: phone,
                      id: 'msg-1',
                      timestamp: '1715432100',
                      type: 'text',
                      text: { body: 'Olá, quero comprar' },
                    },
                  ],
                  metadata: { display_phone_number: '5511988888888' },
                },
              ],
            },
          ],
        },
        wsId,
      );

      expect(kloelService.thinkSync).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: wsId,
          mode: 'sales',
        }),
      );
    });

    it('handles webhook with missing messages gracefully', async () => {
      await service.processWebhook({ entry: [{ changes: [{ messages: [] }] }] }, wsId);

      expect(kloelService.thinkSync).not.toHaveBeenCalled();
    });

    it('handles webhook with no entry', async () => {
      await service.processWebhook({}, wsId);

      expect(kloelService.thinkSync).not.toHaveBeenCalled();
    });

    it('handles webhook with missing changes', async () => {
      await service.processWebhook({ entry: [] }, wsId);

      expect(kloelService.thinkSync).not.toHaveBeenCalled();
    });

    it('normalizes unknown message type to text', async () => {
      prisma.kloelLead.findFirst.mockResolvedValue({ id: 'lead-1' });

      await service.processWebhook(
        {
          entry: [
            {
              changes: [
                {
                  messages: [
                    {
                      from: phone,
                      id: 'msg-2',
                      timestamp: '1715432100',
                      type: 'video',
                      text: { body: '' },
                    },
                  ],
                  metadata: {},
                },
              ],
            },
          ],
        },
        wsId,
      );

      expect(kloelService.thinkSync).toHaveBeenCalled();
    });
  });

  describe('handleIncomingMessage', () => {
    it('creates a new lead when not found', async () => {
      prisma.kloelLead.findFirst.mockResolvedValue(null);
      prisma.kloelLead.create.mockResolvedValue({ id: 'new-lead-1' });

      const result = await service.handleIncomingMessage({
        from: phone,
        to: '5511988888888',
        message: 'Quero comprar',
        messageType: 'text',
        timestamp: new Date(),
        messageId: 'msg-1',
        workspaceId: wsId,
      });

      expect(prisma.kloelLead.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: wsId,
            phone,
            status: 'new',
          }),
        }),
      );
      expect(result).toContain('Olá');
    });

    it('reuses existing lead', async () => {
      prisma.kloelLead.findFirst.mockResolvedValue({ id: 'existing-lead' });

      await service.handleIncomingMessage({
        from: phone,
        to: '5511988888888',
        message: 'Quero comprar',
        messageType: 'text',
        timestamp: new Date(),
        messageId: 'msg-1',
        workspaceId: wsId,
      });

      expect(prisma.kloelLead.create).not.toHaveBeenCalled();
    });

    it('detects purchase intent', async () => {
      prisma.kloelLead.findFirst.mockResolvedValue({ id: 'lead-1' });
      const { includesAnyPhrase } = require('../whatsapp/whatsapp-normalization.util');

      const result = await service.handleIncomingMessage({
        from: phone,
        to: '5511988888888',
        message: 'quero comprar',
        messageType: 'text',
        timestamp: new Date(),
        messageId: 'msg-1',
        workspaceId: wsId,
      });

      expect(includesAnyPhrase).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('detects support intent', async () => {
      prisma.kloelLead.findFirst.mockResolvedValue({ id: 'lead-1' });

      const result = await service.handleIncomingMessage({
        from: phone,
        to: '5511988888888',
        message: 'Estou com um problema',
        messageType: 'text',
        timestamp: new Date(),
        messageId: 'msg-1',
        workspaceId: wsId,
      });

      expect(result).toBeDefined();
    });

    it('detects return intent', async () => {
      prisma.kloelLead.findFirst.mockResolvedValue({ id: 'lead-1' });

      const result = await service.handleIncomingMessage({
        from: phone,
        to: '5511988888888',
        message: 'Quero devolver o produto',
        messageType: 'text',
        timestamp: new Date(),
        messageId: 'msg-1',
        workspaceId: wsId,
      });

      expect(result).toBeDefined();
    });

    it('detects status intent', async () => {
      prisma.kloelLead.findFirst.mockResolvedValue({ id: 'lead-1' });

      const result = await service.handleIncomingMessage({
        from: phone,
        to: '5511988888888',
        message: 'Qual o status do meu pedido?',
        messageType: 'text',
        timestamp: new Date(),
        messageId: 'msg-1',
        workspaceId: wsId,
      });

      expect(result).toBeDefined();
    });

    it('falls back to general intent', async () => {
      prisma.kloelLead.findFirst.mockResolvedValue({ id: 'lead-1' });

      const result = await service.handleIncomingMessage({
        from: phone,
        to: '5511988888888',
        message: 'Bom dia',
        messageType: 'text',
        timestamp: new Date(),
        messageId: 'msg-1',
        workspaceId: wsId,
      });

      expect(result).toBeDefined();
    });
  });

  describe('workspace isolation', () => {
    it('processWebhook passes workspaceId to kloelService', async () => {
      prisma.kloelLead.findFirst.mockResolvedValue({ id: 'lead-1' });

      await service.processWebhook(
        {
          entry: [
            {
              changes: [
                {
                  messages: [{ from: phone, id: 'm1', timestamp: '1', type: 'text', text: { body: 'Oi' } }],
                  metadata: {},
                },
              ],
            },
          ],
        },
        'ws-tenant',
      );

      expect(kloelService.thinkSync).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws-tenant' }),
      );
    });

    it('handleIncomingMessage creates lead scoped to workspaceId', async () => {
      await service.handleIncomingMessage({
        from: phone,
        to: '5511988888888',
        message: 'Oi',
        messageType: 'text',
        timestamp: new Date(),
        messageId: 'msg-1',
        workspaceId: 'ws-tenant',
      });

      expect(prisma.kloelLead.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ workspaceId: 'ws-tenant' }) }),
      );
    });
  });

  describe('error handling', () => {
    it('handleIncomingMessage handles kloelService error', async () => {
      kloelService.thinkSync = jest.fn().mockRejectedValue(new Error('AI service down'));

      await expect(
        service.handleIncomingMessage({
          from: phone,
          to: '5511988888888',
          message: 'Oi',
          messageType: 'text',
          timestamp: new Date(),
          messageId: 'msg-1',
          workspaceId: wsId,
        }),
      ).rejects.toThrow('AI service down');
    });

    it('handleIncomingMessage handles prisma error', async () => {
      prisma.kloelLead.findFirst.mockRejectedValue(new Error('DB down'));

      await expect(
        service.handleIncomingMessage({
          from: phone,
          to: '5511988888888',
          message: 'Oi',
          messageType: 'text',
          timestamp: new Date(),
          messageId: 'msg-1',
          workspaceId: wsId,
        }),
      ).rejects.toThrow('DB down');
    });
  });
});
