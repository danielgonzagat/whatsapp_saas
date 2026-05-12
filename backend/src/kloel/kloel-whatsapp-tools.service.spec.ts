import { Test, TestingModule } from '@nestjs/testing';
import { KloelWhatsAppToolsService } from './kloel-whatsapp-tools.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
import { AudioService } from './audio.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { OpsAlertService } from '../observability/ops-alert.service';

jest.mock('../whatsapp/providers/provider-registry');
jest.mock('../whatsapp/whatsapp.service');
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelWhatsAppToolsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WhatsAppProviderRegistry, useValue: providerRegistry },
        { provide: WhatsappService, useValue: whatsappService },
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

  describe('toolConnectWhatsapp', () => {
    it('returns authUrl when session is started successfully', async () => {
      const result = await service.toolConnectWhatsapp(wsId);

      expect(result.success).toBe(true);
      expect(result.connectionRequired).toBe(true);
      expect(result.authUrl).toBe('https://meta.com/auth');
      expect(providerRegistry.startSession).toHaveBeenCalledWith(wsId);
    });

    it('returns connected when already connected', async () => {
      providerRegistry.startSession.mockResolvedValue({
        success: true,
        message: 'already_connected',
      });

      const result = await service.toolConnectWhatsapp(wsId);

      expect(result.success).toBe(true);
      expect(result.connected).toBe(true);
      expect(result.message).toContain('já conectado');
    });

    it('returns error when startSession fails', async () => {
      providerRegistry.startSession.mockRejectedValue(new Error('network error'));

      const result = await service.toolConnectWhatsapp(wsId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('network error');
    });
  });

  describe('toolGetWhatsAppStatus', () => {
    it('returns connected status with phone number', async () => {
      const result = await service.toolGetWhatsAppStatus(wsId);

      expect(result.success).toBe(true);
      expect(result.connected).toBe(true);
      expect(result.phoneNumber).toBe('5511999999999');
      expect(providerRegistry.getSessionStatus).toHaveBeenCalledWith(wsId);
    });

    it('returns disconnected status when not connected', async () => {
      providerRegistry.getSessionStatus.mockResolvedValue({
        connected: false,
        status: 'disconnected',
        authUrl: 'https://meta.com/auth',
        phoneNumberId: null,
        degradedReason: null,
      });

      const result = await service.toolGetWhatsAppStatus(wsId);

      expect(result.success).toBe(true);
      expect(result.connected).toBe(false);
      expect(result.connectionRequired).toBe(true);
    });
  });

  describe('toolSendWhatsAppMessage', () => {
    const phone = '(11) 99999-9999';
    const normalizedPhone = '11999999999';

    it('sends message and marks as SENT on success', async () => {
      const result = await service.toolSendWhatsAppMessage(wsId, {
        phone,
        message: 'Olá!',
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('m-1');
      expect(prisma.contact.findFirst).toHaveBeenCalledWith({
        where: { workspaceId: wsId, phone: { contains: normalizedPhone } },
      });
      expect(planLimits.ensureDailyMessageQuota).toHaveBeenCalledWith(wsId);
      expect(whatsappService.sendMessage).toHaveBeenCalledWith(wsId, normalizedPhone, 'Olá!');
      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: { id: 'm-1', workspaceId: wsId },
        data: { status: 'SENT' },
      });
    });

    it('creates contact when not found', async () => {
      prisma.contact.findFirst.mockResolvedValue(null);

      await service.toolSendWhatsAppMessage(wsId, { phone, message: 'Olá!' });

      expect(prisma.contact.create).toHaveBeenCalledWith({
        data: { workspaceId: wsId, phone: normalizedPhone, name: 'Via KLOEL' },
      });
    });

    it('returns error when WhatsApp is not connected', async () => {
      providerRegistry.getSessionStatus.mockResolvedValue({
        connected: false,
        status: 'disconnected',
        authUrl: 'https://meta.com/auth',
      });

      const result = await service.toolSendWhatsAppMessage(wsId, { phone, message: 'Olá!' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('não está conectado');
    });

    it('marks message as FAILED on send error', async () => {
      whatsappService.sendMessage.mockRejectedValue(new Error('rate limit'));

      const result = await service.toolSendWhatsAppMessage(wsId, { phone, message: 'Olá!' });

      expect(result.success).toBe(false);
      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: { id: 'm-1', workspaceId: wsId },
        data: { status: 'FAILED' },
      });
    });
  });

  describe('toolListWhatsAppContacts', () => {
    it('returns contacts from whatsappService', async () => {
      whatsappService.listContacts.mockResolvedValue([
        { id: 'c-1', phone: '5511999999999', name: 'Alice' },
        { id: 'c-2', phone: '5521988888888', name: 'Bob' },
      ]);

      const result = await service.toolListWhatsAppContacts(wsId, { limit: 10 });

      expect(result.success).toBe(true);
      expect(result.contacts).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(whatsappService.listContacts).toHaveBeenCalledWith(wsId);
    });

    it('returns empty message when no contacts', async () => {
      const result = await service.toolListWhatsAppContacts(wsId, {});

      expect(result.success).toBe(true);
      expect(result.message).toContain('Não encontrei contatos');
    });

    it('clamps limit between 1 and 200', async () => {
      await service.toolListWhatsAppContacts(wsId, { limit: 500 });
      await service.toolListWhatsAppContacts(wsId, { limit: 0 });
      await service.toolListWhatsAppContacts(wsId, { limit: 50 });

      expect(whatsappService.listContacts).toHaveBeenCalledTimes(3);
    });
  });

  describe('toolCreateWhatsAppContact', () => {
    it('creates contact via whatsappService', async () => {
      const result = await service.toolCreateWhatsAppContact(wsId, {
        phone: '5511999999999',
        name: 'Maria',
        email: 'maria@test.com',
      });

      expect(result.success).toBe(true);
      expect((result.contact as Record<string, unknown>).name).toBe('João');
      expect(whatsappService.createContact).toHaveBeenCalledWith(wsId, {
        phone: '5511999999999',
        name: 'Maria',
        email: 'maria@test.com',
      });
    });
  });

  describe('toolListWhatsAppChats', () => {
    it('returns chats and pending counts', async () => {
      whatsappService.listChats.mockResolvedValue([
        { id: 'chat-1', unreadCount: 3, name: 'Alice' },
        { id: 'chat-2', unreadCount: 0, name: 'Bob' },
        { id: 'chat-3', unreadCount: 1, name: 'Carlos' },
      ]);

      const result = await service.toolListWhatsAppChats(wsId, { limit: 10 });

      expect(result.success).toBe(true);
      expect(result.chats).toHaveLength(3);
      expect(result.pendingConversations).toBe(2);
      expect(result.pendingMessages).toBe(4);
      expect(whatsappService.listChats).toHaveBeenCalledWith(wsId);
    });

    it('returns empty message when no chats', async () => {
      const result = await service.toolListWhatsAppChats(wsId, {});

      expect(result.success).toBe(true);
      expect(result.message).toContain('Não encontrei conversas');
    });
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
      expect(whatsappService.sendMessage).toHaveBeenCalled();
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
      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        wsId,
        '5511999999999',
        'Seu documento',
        { mediaUrl: 'https://cdn.test/doc.pdf', mediaType: 'document', caption: 'Seu documento' },
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
