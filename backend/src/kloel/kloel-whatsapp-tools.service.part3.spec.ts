import { Test, TestingModule } from '@nestjs/testing';
import { KloelWhatsAppToolsService } from './kloel-whatsapp-tools.service';
import { PrismaService } from '../prisma/prisma.service';
import { WHATSAPP_MESSAGING } from '../whatsapp/whatsapp.tokens';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
import { AudioService } from './audio.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { ChannelTransportRegistry } from './channel-transport.registry';

jest.mock('../whatsapp/providers/provider-registry');
jest.mock('./audio.service');
jest.mock('../billing/plan-limits.service');
jest.mock('../observability/ops-alert.service');

type WhatsappToolsPrismaMock = {
  contact: { findFirst: jest.Mock; create: jest.Mock; upsert: jest.Mock };
  message: { create: jest.Mock; updateMany: jest.Mock };
};

type ProviderRegistryMock = {
  startSession: jest.Mock;
  getSessionStatus: jest.Mock;
};

type WhatsappServiceMock = {
  sendMessage: jest.Mock;
  listContacts: jest.Mock;
  createContact: jest.Mock;
  listChats: jest.Mock;
  getChatMessages: jest.Mock;
  getBacklog: jest.Mock;
  setPresence: jest.Mock;
  triggerSync: jest.Mock;
};

type AudioServiceMock = {
  textToSpeech: jest.Mock;
  transcribeFromUrl: jest.Mock;
  transcribeFromBase64: jest.Mock;
};

type PlanLimitsMock = {
  ensureDailyMessageQuota: jest.Mock;
};

describe('KloelWhatsAppToolsService', () => {
  let service: KloelWhatsAppToolsService;
  let prisma: WhatsappToolsPrismaMock;
  let providerRegistry: ProviderRegistryMock;
  let whatsappService: WhatsappServiceMock;
  let audioService: AudioServiceMock;
  let planLimits: PlanLimitsMock;
  let opsAlert: { alertOnCriticalError: jest.Mock };
  let transports: Pick<ChannelTransportRegistry, 'send'>;

  const wsId = 'ws-1';

  beforeEach(async () => {
    prisma = {
      contact: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'c-1', name: 'Via KLOEL' }),
        upsert: jest.fn().mockResolvedValue({ id: 'c-1' }),
      },
      message: {
        create: jest.fn().mockResolvedValue({ id: 'm-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    providerRegistry = {
      startSession: jest.fn().mockResolvedValue({
        success: true,
        authUrl: 'https://meta.com/auth',
        message: 'ok',
      }),
      getSessionStatus: jest.fn().mockResolvedValue({
        connected: true,
        phoneNumber: '5511999999999',
        status: 'connected',
        authUrl: null,
        phoneNumberId: null,
        degradedReason: null,
      }),
    };

    whatsappService = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
      listContacts: jest.fn().mockResolvedValue([]),
      createContact: jest
        .fn()
        .mockResolvedValue({ id: 'c-1', phone: '5511999999999', name: 'João' }),
      listChats: jest.fn().mockResolvedValue([]),
      getChatMessages: jest.fn().mockResolvedValue([]),
      getBacklog: jest.fn().mockResolvedValue({
        connected: true,
        pendingConversations: 0,
        pendingMessages: 0,
      }),
      setPresence: jest.fn().mockResolvedValue({}),
      triggerSync: jest.fn().mockResolvedValue({ scheduled: true }),
    };

    audioService = {
      textToSpeech: jest.fn().mockResolvedValue(Buffer.from('fake-audio')),
      transcribeFromUrl: jest.fn().mockResolvedValue({ text: 'Hello', language: 'pt' }),
      transcribeFromBase64: jest.fn().mockResolvedValue({ text: 'Hello base64', language: 'pt' }),
    };

    planLimits = {
      ensureDailyMessageQuota: jest.fn().mockResolvedValue(undefined),
    };

    opsAlert = {
      alertOnCriticalError: jest.fn().mockResolvedValue(undefined),
    };

    transports = {
      send: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelWhatsAppToolsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppProviderRegistry, useValue: providerRegistry },
        { provide: WHATSAPP_MESSAGING, useValue: whatsappService },
        { provide: ChannelTransportRegistry, useValue: transports },
        { provide: AudioService, useValue: audioService },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: OpsAlertService, useValue: opsAlert },
      ],
    }).compile();

    service = module.get<KloelWhatsAppToolsService>(KloelWhatsAppToolsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('upsertContactForPhone', () => {
    it('upserts contact and returns id', async () => {
      prisma.contact.upsert.mockResolvedValue({ id: 'c-10' });

      const id = await service.upsertContactForPhone(wsId, '5511999999999');

      expect(id).toBe('c-10');
      expect(prisma.contact.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId_phone: { workspaceId: wsId, phone: '5511999999999' } },
          create: expect.objectContaining({ workspaceId: wsId, phone: '5511999999999' }),
        }),
      );
    });

    it('returns null on upsert failure', async () => {
      prisma.contact.upsert.mockRejectedValue(new Error('unique constraint'));

      const id = await service.upsertContactForPhone(wsId, '5511999999999');

      expect(id).toBeNull();
    });
  });

  describe('tenant isolation', () => {
    it('toolSendWhatsAppMessage scopes contact lookup to workspaceId', async () => {
      await service.toolSendWhatsAppMessage('ws-tenant', {
        phone: '5511999999999',
        message: 'Olá',
      });

      expect(prisma.contact.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-tenant', phone: { contains: '5511999999999' } },
        }),
      );
    });

    it('toolConnectWhatsapp passes workspaceId to providerRegistry', async () => {
      await service.toolConnectWhatsapp('ws-tenant');

      expect(providerRegistry.startSession).toHaveBeenCalledWith('ws-tenant');
    });

    it('toolGetWhatsAppStatus passes workspaceId to providerRegistry', async () => {
      await service.toolGetWhatsAppStatus('ws-tenant');

      expect(providerRegistry.getSessionStatus).toHaveBeenCalledWith('ws-tenant');
    });
  });

  describe('error handling', () => {
    it('toolConnectWhatsapp returns error result on throw', async () => {
      providerRegistry.startSession.mockRejectedValue(new Error('DB down'));

      const result = await service.toolConnectWhatsapp(wsId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('DB down');
    });

    it('toolSendWhatsAppMessage returns error result on Prisma failure', async () => {
      prisma.contact.findFirst.mockRejectedValue(new Error('DB connection lost'));

      await expect(
        service.toolSendWhatsAppMessage(wsId, { phone: '5511999999999', message: 'Olá' }),
      ).rejects.toThrow('DB connection lost');
    });
  });
});
