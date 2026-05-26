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

  describe('toolGetWhatsAppMessages', () => {
    it('returns messages for a given chatId', async () => {
      whatsappService.getChatMessages.mockResolvedValue([
        { id: 'msg-1', content: 'Hello', direction: 'INBOUND' },
      ]);

      const result = await service.toolGetWhatsAppMessages(wsId, { chatId: 'chat-1', limit: 50 });

      expect(result.success).toBe(true);
      expect(result.messages).toHaveLength(1);
      expect(whatsappService.getChatMessages).toHaveBeenCalledWith(wsId, 'chat-1', {
        limit: 50,
        offset: 0,
      });
    });

    it('returns error for empty chatId', async () => {
      const result = await service.toolGetWhatsAppMessages(wsId, { chatId: '' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Informe chatId ou phone');
    });

    it('uses phone as fallback for chatId', async () => {
      await service.toolGetWhatsAppMessages(wsId, { phone: '5511999999999' });

      expect(whatsappService.getChatMessages).toHaveBeenCalledWith(wsId, '5511999999999', {
        limit: 100,
        offset: 0,
      });
    });
  });

  describe('toolGetWhatsAppBacklog', () => {
    it('returns backlog with pending counts', async () => {
      whatsappService.getBacklog.mockResolvedValue({
        connected: true,
        pendingConversations: 5,
        pendingMessages: 12,
      });

      const result = await service.toolGetWhatsAppBacklog(wsId);

      expect(result.success).toBe(true);
      expect(whatsappService.getBacklog).toHaveBeenCalledWith(wsId);
    });

    it('reports not connected when status shows disconnected', async () => {
      whatsappService.getBacklog.mockResolvedValue({
        connected: false,
        pendingConversations: 0,
        pendingMessages: 0,
      });

      const result = await service.toolGetWhatsAppBacklog(wsId);

      expect(result.message).toContain('não está conectado');
    });
  });

  describe('toolSetWhatsAppPresence', () => {
    it('sends presence to chat', async () => {
      const result = await service.toolSetWhatsAppPresence(wsId, {
        chatId: 'chat-1',
        presence: 'typing',
      });

      expect(result.success).toBe(true);
      expect(whatsappService.setPresence).toHaveBeenCalledWith(wsId, 'chat-1', 'typing');
    });

    it('returns error for empty chatId', async () => {
      const result = await service.toolSetWhatsAppPresence(wsId, {
        chatId: '',
        presence: 'typing',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Informe chatId ou phone');
    });
  });

  describe('toolSyncWhatsAppHistory', () => {
    it('triggers sync via whatsappService', async () => {
      const result = await service.toolSyncWhatsAppHistory(wsId, {
        reason: 'manual_refresh',
      });

      expect(result.success).toBe(true);
      expect(whatsappService.triggerSync).toHaveBeenCalledWith(wsId, 'manual_refresh');
    });

    it('reports when sync was not scheduled', async () => {
      whatsappService.triggerSync.mockResolvedValue({
        scheduled: false,
        reason: 'sync_already_in_progress',
      });

      const result = await service.toolSyncWhatsAppHistory(wsId, {});

      expect(result.success).toBe(true);
      expect(result.message).toContain('não foi agendada');
    });
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
      expect(transports.send).toHaveBeenCalled();
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
      expect(transports.send).toHaveBeenCalledWith(
        wsId,
        expect.objectContaining({
          channel: 'whatsapp',
          recipientId: '5511999999999',
          mediaUrl: 'https://cdn.test/doc.pdf',
          mediaType: 'document',
        }),
      );
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
});
