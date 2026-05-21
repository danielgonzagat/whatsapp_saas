import { Test, TestingModule } from '@nestjs/testing';
import { KloelToolExecutorWhatsAppService } from './kloel-tool-executor-whatsapp.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AudioService } from './audio.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { ChannelTransportRegistry } from './channel-transport.registry';

type WhatsAppPrismaMock = {
  contact: { findFirst: jest.Mock; create: jest.Mock };
  message: { create: jest.Mock; updateMany: jest.Mock };
  document: { findFirst: jest.Mock };
};

describe('KloelToolExecutorWhatsAppService', () => {
  let service: KloelToolExecutorWhatsAppService;
  let prisma: WhatsAppPrismaMock;
  let whatsappService: {
    sendMessage: jest.Mock;
    listContacts: jest.Mock;
    createContact: jest.Mock;
    listChats: jest.Mock;
    getChatMessages: jest.Mock;
    getBacklog: jest.Mock;
    setPresence: jest.Mock;
    triggerSync: jest.Mock;
  };
  let providerRegistry: {
    startSession: jest.Mock;
    getSessionStatus: jest.Mock;
  };
  let audioService: {
    textToSpeech: jest.Mock;
    transcribeFromUrl: jest.Mock;
    transcribeFromBase64: jest.Mock;
  };
  let planLimits: {
    ensureDailyMessageQuota: jest.Mock;
    ensureTokenBudget: jest.Mock;
    trackAiUsage: jest.Mock;
  };
  let opsAlert: { alertOnCriticalError: jest.Mock };
  let transports: { send: jest.Mock };

  const wsId = 'ws-whatsapp-1';

  beforeEach(async () => {
    prisma = {
      contact: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'c-1', phone: '5511', name: 'Via KLOEL' }),
      },
      message: {
        create: jest.fn().mockResolvedValue({ id: 'm-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      document: { findFirst: jest.fn().mockResolvedValue(null) },
    };

    whatsappService = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
      listContacts: jest.fn().mockResolvedValue([]),
      createContact: jest.fn().mockResolvedValue({ id: 'c-1', phone: '5511', name: 'Test' }),
      listChats: jest.fn().mockResolvedValue([]),
      getChatMessages: jest.fn().mockResolvedValue([]),
      getBacklog: jest
        .fn()
        .mockResolvedValue({ connected: false, pendingConversations: 0, pendingMessages: 0 }),
      setPresence: jest.fn().mockResolvedValue({}),
      triggerSync: jest.fn().mockResolvedValue({ scheduled: true, reason: null }),
    };

    providerRegistry = {
      startSession: jest.fn().mockResolvedValue({ success: true, message: 'connected' }),
      getSessionStatus: jest
        .fn()
        .mockResolvedValue({ connected: true, phoneNumber: '5511', status: 'connected' }),
    };

    audioService = {
      textToSpeech: jest.fn().mockResolvedValue(Buffer.from('fake-audio')),
      transcribeFromUrl: jest.fn().mockResolvedValue({ text: 'transcribed', language: 'pt' }),
      transcribeFromBase64: jest.fn().mockResolvedValue({ text: 'transcribed', language: 'en' }),
    };

    planLimits = {
      ensureDailyMessageQuota: jest.fn().mockResolvedValue(undefined),
      ensureTokenBudget: jest.fn().mockResolvedValue(undefined),
      trackAiUsage: jest.fn().mockResolvedValue(undefined),
    };

    opsAlert = { alertOnCriticalError: jest.fn() };
    transports = { send: jest.fn().mockResolvedValue({ success: true }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelToolExecutorWhatsAppService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsappService, useValue: whatsappService },
        { provide: WhatsAppProviderRegistry, useValue: providerRegistry },
        { provide: ChannelTransportRegistry, useValue: transports },
        { provide: AudioService, useValue: audioService },
        { provide: PlanLimitsService, useValue: planLimits },
        { provide: OpsAlertService, useValue: opsAlert },
      ],
    }).compile();

    service = module.get<KloelToolExecutorWhatsAppService>(KloelToolExecutorWhatsAppService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('toolListWhatsAppChats', () => {
    it('returns chats with pending count', async () => {
      const chats = [{ unreadCount: 5 }, { unreadCount: 0 }, { unreadCount: 3 }];
      whatsappService.listChats.mockResolvedValue(chats);

      const result = await service.toolListWhatsAppChats(wsId, {});

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
      expect(result.pendingConversations).toBe(2);
      expect(result.pendingMessages).toBe(8);
    });
  });

  describe('toolGetWhatsAppMessages', () => {
    it('returns error when no chatId', async () => {
      const result = await service.toolGetWhatsAppMessages(wsId, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Informe chatId');
    });

    it('returns messages for chat', async () => {
      const messages = [
        { id: 'm1', content: 'Oi', direction: 'INBOUND' },
        { id: 'm2', content: 'Olá', direction: 'OUTBOUND' },
      ];
      whatsappService.getChatMessages.mockResolvedValue(messages);

      const result = await service.toolGetWhatsAppMessages(wsId, { chatId: 'chat-1' });

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      const getMessagesArgs = whatsappService.getChatMessages.mock.calls[0];
      expect(getMessagesArgs.slice(0, 2)).toEqual([wsId, 'chat-1']);
      expect(getMessagesArgs[2]).toBeDefined();
    });
  });

  describe('toolGetWhatsAppBacklog', () => {
    it('returns backlog from whatsappService', async () => {
      whatsappService.getBacklog.mockResolvedValue({
        connected: true,
        pendingConversations: 3,
        pendingMessages: 12,
      });

      const result = await service.toolGetWhatsAppBacklog(wsId);

      expect(result.success).toBe(true);
      expect(result.pendingConversations).toBe(3);
      expect(result.pendingMessages).toBe(12);
    });
  });

  describe('toolSetWhatsAppPresence', () => {
    it('sends typing presence', async () => {
      const result = await service.toolSetWhatsAppPresence(wsId, {
        chatId: 'chat-1',
        presence: 'typing',
      });

      expect(result.success).toBe(true);
      expect(whatsappService.setPresence).toHaveBeenCalledWith(wsId, 'chat-1', 'typing');
    });

    it('returns error when no chatId', async () => {
      const result = await service.toolSetWhatsAppPresence(wsId, {});

      expect(result.success).toBe(false);
    });
  });

  describe('toolSyncWhatsAppHistory', () => {
    it('triggers sync successfully', async () => {
      const result = await service.toolSyncWhatsAppHistory(wsId, { reason: 'manual' });

      expect(result.success).toBe(true);
      expect(whatsappService.triggerSync).toHaveBeenCalledWith(wsId, 'manual');
    });
  });

  describe('toolSendAudio', () => {
    it('sends audio message', async () => {
      const result = await service.toolSendAudio(wsId, {
        phone: '5511',
        text: 'Mensagem de voz',
      });

      expect(result.success).toBe(true);
      expect(audioService.textToSpeech).toHaveBeenCalledWith('Mensagem de voz', 'nova', wsId);
      expect(planLimits.ensureDailyMessageQuota).toHaveBeenCalledWith(wsId);
      expect(transports.send).toHaveBeenCalled();
    });

    it('returns error when phone or text missing', async () => {
      const result = await service.toolSendAudio(wsId, { phone: '', text: '' });

      expect(result.success).toBe(false);
    });

    it('returns error on TTS failure', async () => {
      audioService.textToSpeech.mockRejectedValue(new Error('TTS unavailable'));

      const result = await service.toolSendAudio(wsId, {
        phone: '5511',
        text: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('TTS unavailable');
    });
  });

  describe('toolSendDocument', () => {
    it('sends document by URL', async () => {
      const result = await service.toolSendDocument(wsId, {
        phone: '5511',
        url: 'https://cdn.test/doc.pdf',
        caption: 'Segue documento',
      });

      expect(result.success).toBe(true);
      expect(planLimits.ensureDailyMessageQuota).toHaveBeenCalledWith(wsId);
      expect(transports.send).toHaveBeenCalledWith(wsId, {
        workspaceId: wsId,
        channel: 'whatsapp',
        recipientId: '5511',
        content: 'Segue documento',
        caption: 'Segue documento',
        mediaUrl: 'https://cdn.test/doc.pdf',
        mediaType: 'document',
      });
    });

    it('looks up document by name from database', async () => {
      prisma.document.findFirst.mockResolvedValue({ filePath: 'https://cdn.test/contract.pdf' });

      const result = await service.toolSendDocument(wsId, {
        phone: '5511',
        documentName: 'Contrato',
      });

      expect(result.success).toBe(true);
      expect(prisma.document.findFirst).toHaveBeenCalledWith({
        where: { workspaceId: wsId, name: { contains: 'Contrato', mode: 'insensitive' } },
      });
    });

    it('returns error when document not found', async () => {
      prisma.document.findFirst.mockResolvedValue(null);

      const result = await service.toolSendDocument(wsId, {
        phone: '5511',
        documentName: 'NaoExiste',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Documento não encontrado');
    });

    it('returns error when phone missing', async () => {
      const result = await service.toolSendDocument(wsId, { phone: '' });

      expect(result.success).toBe(false);
    });

    it('returns error on send failure', async () => {
      transports.send.mockResolvedValueOnce({ success: false, error: 'upload failed' });

      const result = await service.toolSendDocument(wsId, {
        phone: '5511',
        url: 'https://cdn.test/bad.pdf',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('upload failed');
    });
  });

  describe('toolTranscribeAudio', () => {
    it('transcribes from URL', async () => {
      audioService.transcribeFromUrl.mockResolvedValue({ text: 'Olá mundo', language: 'pt' });

      const result = await service.toolTranscribeAudio(wsId, {
        audioUrl: 'https://cdn.test/audio.mp3',
      });

      expect(result.success).toBe(true);
      expect(result.transcript).toBe('Olá mundo');
      expect(audioService.transcribeFromUrl).toHaveBeenCalledWith(
        'https://cdn.test/audio.mp3',
        'pt',
        wsId,
      );
    });

    it('transcribes from base64', async () => {
      audioService.transcribeFromBase64.mockResolvedValue({ text: 'Hello', language: 'en' });

      const result = await service.toolTranscribeAudio(wsId, {
        audioBase64: 'base64data',
        language: 'en',
      });

      expect(result.success).toBe(true);
      expect(audioService.transcribeFromBase64).toHaveBeenCalledWith('base64data', 'en', wsId);
    });

    it('returns error when no source provided', async () => {
      const result = await service.toolTranscribeAudio(wsId, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Forneça audioUrl ou audioBase64');
    });

    it('returns error on transcription failure', async () => {
      audioService.transcribeFromUrl.mockRejectedValue(new Error('transcription failed'));

      const result = await service.toolTranscribeAudio(wsId, {
        audioUrl: 'https://cdn.test/bad.mp3',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('transcription failed');
    });
  });

  describe('workspace isolation', () => {
    it('toolSendWhatsAppMessage queries contact for correct workspace', async () => {
      providerRegistry.getSessionStatus.mockResolvedValue({ connected: true });
      prisma.contact.findFirst.mockResolvedValue(null);

      await service.toolSendWhatsAppMessage('ws-isolated', { phone: '5511', message: 'Test' });

      expect(prisma.contact.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-isolated', phone: { contains: '5511' } },
        }),
      );
      expect(prisma.contact.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ workspaceId: 'ws-isolated' }) }),
      );
    });

    it('toolSendDocument queries documents scoped to workspace', async () => {
      await service.toolSendDocument('ws-isolated', {
        phone: '5511',
        documentName: 'Contrato',
      });
      expect(prisma.document.findFirst).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-isolated', name: { contains: 'Contrato', mode: 'insensitive' } },
      });
    });
  });
});
