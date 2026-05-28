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
  let transports: { send: jest.Mock };

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
    transports = { send: jest.fn().mockResolvedValue({ success: true }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelWhatsAppToolsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppProviderRegistry, useValue: providerRegistry },
        { provide: WHATSAPP_MESSAGING, useValue: whatsappService },
        { provide: AudioService, useValue: audioService },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: OpsAlertService, useValue: opsAlert },
        { provide: ChannelTransportRegistry, useValue: transports },
      ],
    }).compile();

    service = module.get<KloelWhatsAppToolsService>(KloelWhatsAppToolsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('toolSendAudio', () => {
    it('sends audio via textToSpeech and whatsappService', async () => {
      const result = await service.toolSendAudio(wsId, {
        phone: '5511999999999',
        text: 'Olá, bem-vindo!',
        voice: 'nova',
      });

      expect(result.success).toBe(true);
      expect(audioService.textToSpeech).toHaveBeenCalledWith('Olá, bem-vindo!', 'nova', wsId);
      expect(planLimits.ensureDailyMessageQuota).toHaveBeenCalledWith(wsId);
      expect(transports.send).toHaveBeenCalledWith(wsId, {
        workspaceId: wsId,
        channel: 'whatsapp',
        recipientId: '5511999999999',
        content: '',
        mediaUrl: expect.stringContaining('data:audio/mpeg;base64,'),
        mediaType: 'audio',
      });
    });

    it('returns error when textToSpeech fails', async () => {
      audioService.textToSpeech.mockRejectedValue(new Error('TTS failure'));

      const result = await service.toolSendAudio(wsId, {
        phone: '5511999999999',
        text: 'Olá!',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('toolSendDocument', () => {
    it('sends document by URL', async () => {
      const result = await service.toolSendDocument(wsId, {
        phone: '5511999999999',
        url: 'https://cdn.test/doc.pdf',
        caption: 'Seu documento',
      });

      expect(result.success).toBe(true);
      expect(transports.send).toHaveBeenCalledWith(wsId, {
        workspaceId: wsId,
        channel: 'whatsapp',
        recipientId: '5511999999999',
        content: 'Seu documento',
        mediaUrl: 'https://cdn.test/doc.pdf',
        mediaType: 'document',
        caption: 'Seu documento',
      });
    });

    it('returns error when no URL or document name provided', async () => {
      const result = await service.toolSendDocument(wsId, {
        phone: '5511999999999',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('toolTranscribeAudio', () => {
    it('transcribes from URL', async () => {
      const result = await service.toolTranscribeAudio(wsId, {
        audioUrl: 'https://cdn.test/audio.mp3',
        language: 'pt',
      });

      expect(result.success).toBe(true);
      expect(result.transcript).toBe('Hello');
      expect(audioService.transcribeFromUrl).toHaveBeenCalledWith(
        'https://cdn.test/audio.mp3',
        'pt',
        wsId,
      );
    });

    it('transcribes from base64', async () => {
      const result = await service.toolTranscribeAudio(wsId, {
        audioBase64: 'ZmFrZQ==',
        language: 'en',
      });

      expect(result.success).toBe(true);
      expect(result.transcript).toBe('Hello base64');
      expect(audioService.transcribeFromBase64).toHaveBeenCalledWith('ZmFrZQ==', 'en', wsId);
    });

    it('returns error when no audio source provided', async () => {
      const result = await service.toolTranscribeAudio(wsId, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Forneça audioUrl ou audioBase64');
    });

    it('returns error on transcription failure', async () => {
      audioService.transcribeFromUrl.mockRejectedValue(new Error('transcribe failed'));

      const result = await service.toolTranscribeAudio(wsId, {
        audioUrl: 'https://cdn.test/audio.mp3',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('transcribe failed');
    });
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
