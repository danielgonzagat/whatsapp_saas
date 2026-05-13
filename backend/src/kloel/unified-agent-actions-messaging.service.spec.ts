import { Test, TestingModule } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { UnifiedAgentActionsMessagingService } from './unified-agent-actions-messaging.service';
import { WHATSAPP_MESSAGING } from '../whatsapp/whatsapp.tokens';
import { AudioService } from './audio.service';
import { OpsAlertService } from '../observability/ops-alert.service';
import { ChannelTransportRegistry } from './channel-transport.registry';
import { DailyLimitService } from './daily-limit.service';
import { BrainEventSpineService } from './brain-event-spine.service';
import type { IWhatsappMessaging } from '../whatsapp/whatsapp.interfaces';
import type { ChannelSendResult } from './channel-transport.types';

jest.mock('../marketing/mailbox-gmail-oauth.service', () => ({
  MailboxGmailOAuthService: jest.fn(),
}));

describe('UnifiedAgentActionsMessagingService', () => {
  let service: UnifiedAgentActionsMessagingService;
  let whatsappService: IWhatsappMessaging;
  let audioService: Pick<
    AudioService,
    'textToSpeech' | 'transcribeFromUrl' | 'transcribeFromBase64'
  >;
  let moduleRef: Pick<ModuleRef, 'get'>;
  let opsAlert: Pick<OpsAlertService, 'alertOnCriticalError'>;
  let dailyLimit: Pick<DailyLimitService, 'ensureProactiveDailyLimit' | 'isReply'>;
  let transports: Pick<ChannelTransportRegistry, 'send'>;
  let events: Pick<BrainEventSpineService, 'record'>;

  const wsId = 'ws-1';
  const phone = '5511999999999';

  beforeEach(async () => {
    whatsappService = {
      sendMessage: jest.fn().mockResolvedValue({
        success: true,
        delivery: 'sent',
        messageId: 'wamid.123',
        direct: false,
      }),
      syncRemoteContactProfile: jest.fn().mockResolvedValue(undefined),
    };
    audioService = {
      textToSpeech: jest.fn().mockResolvedValue(Buffer.from('fake-audio-data')),
      transcribeFromUrl: jest.fn().mockResolvedValue({
        text: 'Transcrição de áudio',
        duration: 30,
        language: 'pt',
      }),
      transcribeFromBase64: jest.fn().mockResolvedValue({
        text: 'Transcrição base64',
        duration: 15,
        language: 'pt',
      }),
    };
    moduleRef = {
      get: jest.fn().mockReturnValue(null),
    };
    opsAlert = {
      alertOnCriticalError: jest.fn(),
    };
    dailyLimit = {
      ensureProactiveDailyLimit: jest.fn().mockResolvedValue({ allowed: true, remaining: 24, capAtDay: 25 }),
      isReply: jest.fn().mockResolvedValue(false),
    };
    // Delegate transports.send to whatsappService.sendMessage so legacy
    // assertions on whatsappService keep firing while the new architecture
    // (transport registry) is exercised end-to-end.
    const delegatingSend = jest.fn(async (wid, params) => {
      const guardContext = (params?.guardContext ?? {}) as Record<string, unknown>;
      const fullContext = {
        ...guardContext,
        complianceMode:
          guardContext.deliveryMode === 'reactive' ? 'reactive' : 'proactive',
        forceDirect: guardContext.forceDirect === true,
        ...(params.mediaUrl !== undefined ? { mediaUrl: params.mediaUrl } : {}),
        ...(params.mediaType !== undefined ? { mediaType: params.mediaType } : {}),
      };
      const r = await whatsappService.sendMessage(
        wid,
        params.recipientId,
        params.content,
        fullContext,
      );
      const result = r as Record<string, unknown>;
      if (result.error) {
        return {
          success: false,
          blocked: false,
          error: (result.message as string) || 'send_failed',
        };
      }
      const delivery = result.delivery === 'queued' ? 'queued' : 'sent';
      return {
        success: true,
        blocked: false,
        delivery,
        ...(result.messageId !== undefined ? { messageId: result.messageId } : {}),
        ...(result.direct !== undefined ? { direct: result.direct } : {}),
      };
    });
    transports = { send: delegatingSend as never };
    events = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnifiedAgentActionsMessagingService,
        { provide: WHATSAPP_MESSAGING, useValue: whatsappService },
        { provide: AudioService, useValue: audioService },
        { provide: ModuleRef, useValue: moduleRef },
        { provide: OpsAlertService, useValue: opsAlert },
        { provide: ChannelTransportRegistry, useValue: transports },
        { provide: DailyLimitService, useValue: dailyLimit },
        { provide: BrainEventSpineService, useValue: events },
      ],
    }).compile();

    service = module.get<UnifiedAgentActionsMessagingService>(UnifiedAgentActionsMessagingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('actionSendMessage', () => {
    it('sends message via WhatsApp service', async () => {
      const result = await service.actionSendMessage(wsId, phone, {
        message: 'Olá, como vai?',
      });

      expect(result.success).toBe(true);
      expect(result.sent).toBe(true);
      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        wsId,
        phone,
        'Olá, como vai?',
        expect.objectContaining({
          complianceMode: 'proactive',
          forceDirect: false,
        }),
      );
    });

    it('returns error when message is empty', async () => {
      const result = await service.actionSendMessage(wsId, phone, {
        message: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Mensagem é obrigatória');
    });

    it('handles WhatsApp send failure', async () => {
      whatsappService.sendMessage = jest.fn().mockResolvedValue({
        error: true,
        message: 'invalid_phone_number',
      });

      const result = await service.actionSendMessage(wsId, phone, {
        message: 'Test',
      });

      expect(result.success).toBe(false);
    });

    it('detects queued delivery status', async () => {
      whatsappService.sendMessage = jest.fn().mockResolvedValue({
        delivery: 'queued',
        messageId: 'wamid.queued',
      });

      const result = await service.actionSendMessage(wsId, phone, {
        message: 'Test',
      });

      expect(result.success).toBe(true);
      expect(result.delivery).toBe('queued');
    });

    it('detects direct delivery', async () => {
      whatsappService.sendMessage = jest.fn().mockResolvedValue({
        delivery: 'direct',
        direct: true,
        messageId: 'wamid.direct',
      });

      const result = await service.actionSendMessage(wsId, phone, {
        message: 'Test',
      });

      expect(result.success).toBe(true);
      expect(result.delivery).toBe('sent');
    });

    it('handles thrown exceptions gracefully', async () => {
      whatsappService.sendMessage = jest.fn().mockRejectedValue(new Error('network timeout'));

      const result = await service.actionSendMessage(wsId, phone, {
        message: 'Test',
      });

      expect(result.success).toBe(false);
    });

    it('uses reactive compliance mode from context', async () => {
      await service.actionSendMessage(
        wsId,
        phone,
        { message: 'Reactive test' },
        { deliveryMode: 'reactive' },
      );

      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        wsId,
        phone,
        'Reactive test',
        expect.objectContaining({ complianceMode: 'reactive' }),
      );
    });

    it('passes forceDirect from context', async () => {
      await service.actionSendMessage(
        wsId,
        phone,
        { message: 'Direct test' },
        { forceDirect: true },
      );

      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        wsId,
        phone,
        'Direct test',
        expect.objectContaining({ forceDirect: true }),
      );
    });
  });

  describe('actionSendMedia', () => {
    it('sends media via WhatsApp service', async () => {
      const result = await service.actionSendMedia(wsId, phone, {
        type: 'image',
        url: 'https://example.com/photo.jpg',
        caption: 'Check this out',
      });

      expect(result.success).toBe(true);
      expect(result.sent).toBe(true);
      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        wsId,
        phone,
        'Check this out',
        expect.objectContaining({
          mediaUrl: 'https://example.com/photo.jpg',
          mediaType: 'image',
        }),
      );
    });

    it('returns error when URL is missing', async () => {
      const result = await service.actionSendMedia(wsId, phone, {
        type: 'image',
        url: '',
      });

      expect(result.success).toBe(false);
    });

    it('handles media send failure', async () => {
      whatsappService.sendMessage = jest.fn().mockResolvedValue({
        error: true,
        message: 'unsupported_media',
      });

      const result = await service.actionSendMedia(wsId, phone, {
        url: 'https://bad.url',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('actionSendVoiceNote', () => {
    it('generates audio and sends as voice note', async () => {
      const result = await service.actionSendVoiceNote(wsId, phone, {
        text: 'Olá, esta é uma nota de voz',
        voice: 'nova',
      });

      expect(result.success).toBe(true);
      expect(result.sent).toBe(true);
      expect(audioService.textToSpeech).toHaveBeenCalledWith(
        'Olá, esta é uma nota de voz',
        'nova',
        wsId,
      );
      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        wsId,
        phone,
        '',
        expect.objectContaining({
          mediaUrl: expect.stringContaining('data:audio/mp3;base64,'),
          mediaType: 'audio',
        }),
      );
    });

    it('returns error when text is empty', async () => {
      const result = await service.actionSendVoiceNote(wsId, phone, {
        text: '',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Texto é obrigatório para gerar áudio');
    });

    it('handles voice send failure', async () => {
      whatsappService.sendMessage = jest.fn().mockResolvedValue({
        error: true,
        message: 'voice_failed',
      });

      const result = await service.actionSendVoiceNote(wsId, phone, {
        text: 'Test voice',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('actionSendAudio', () => {
    it('generates audio TTS and sends', async () => {
      const result = await service.actionSendAudio(wsId, phone, {
        text: 'Audio content',
        voice: 'nova',
      });

      expect(result.success).toBe(true);
      expect(result.sent).toBe(true);
      expect(result.audioSize).toBeGreaterThan(0);
    });

    it('returns error when text is empty', async () => {
      const result = await service.actionSendAudio(wsId, phone, { text: '' });

      expect(result.success).toBe(false);
    });
  });

  describe('actionTranscribeAudio', () => {
    it('transcribes from URL', async () => {
      const result = await service.actionTranscribeAudio(wsId, {
        audioUrl: 'https://example.com/audio.mp3',
        language: 'pt',
      });

      expect(result.success).toBe(true);
      expect(result.text).toBe('Transcrição de áudio');
      expect(audioService.transcribeFromUrl).toHaveBeenCalledWith(
        'https://example.com/audio.mp3',
        'pt',
        wsId,
      );
    });

    it('transcribes from base64', async () => {
      const result = await service.actionTranscribeAudio(wsId, {
        audioBase64: 'base64data',
        language: 'en',
      });

      expect(result.success).toBe(true);
      expect(result.text).toBe('Transcrição base64');
      expect(audioService.transcribeFromBase64).toHaveBeenCalledWith('base64data', 'en', wsId);
    });

    it('returns error when no audio source provided', async () => {
      const result = await service.actionTranscribeAudio(wsId, {});

      expect(result.success).toBe(false);
    });

    it('returns error when transcription is empty', async () => {
      audioService.transcribeFromUrl = jest.fn().mockResolvedValue({ text: '', language: 'pt' });

      const result = await service.actionTranscribeAudio(wsId, {
        audioUrl: 'https://empty.audio',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('buildWhatsAppSendOptions', () => {
    it('resolves media options from extra', () => {
      const options = service.buildWhatsAppSendOptions(undefined, {
        mediaUrl: 'https://img.test',
        mediaType: 'image',
        caption: 'My caption',
      });

      expect(options.mediaUrl).toBe('https://img.test');
      expect(options.mediaType).toBe('image');
      expect(options.caption).toBe('My caption');
    });

    it('resolves quotedMessageId from context', () => {
      const options = service.buildWhatsAppSendOptions({ providerMessageId: 'wamid.q' }, {});

      expect(options.quotedMessageId).toBe('wamid.q');
    });

    it('defaults complianceMode to proactive', () => {
      const options = service.buildWhatsAppSendOptions(undefined);

      expect(options.complianceMode).toBe('proactive');
    });

    it('resolves complianceMode from context deliveryMode', () => {
      const options = service.buildWhatsAppSendOptions({
        deliveryMode: 'reactive',
      });

      expect(options.complianceMode).toBe('reactive');
    });
  });

  describe('resolveComplianceMode', () => {
    it('returns reactive when context deliveryMode is reactive', () => {
      expect(service.resolveComplianceMode({ deliveryMode: 'reactive' })).toBe('reactive');
    });

    it('returns proactive by default', () => {
      expect(service.resolveComplianceMode(undefined)).toBe('proactive');
    });
  });

  describe('tenant isolation', () => {
    it('actionSendMessage passes workspaceId to WhatsApp service', async () => {
      await service.actionSendMessage('ws-tenant', phone, {
        message: 'Test',
      });

      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        'ws-tenant',
        phone,
        'Test',
        expect.any(Object),
      );
    });

    it('actionSendMedia passes workspaceId to WhatsApp service', async () => {
      await service.actionSendMedia('ws-tenant', phone, {
        url: 'https://img.test',
      });

      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        'ws-tenant',
        phone,
        expect.any(String),
        expect.any(Object),
      );
    });

    it('actionSendVoiceNote passes workspaceId to audio service', async () => {
      await service.actionSendVoiceNote('ws-tenant', phone, {
        text: 'Voice',
      });

      expect(audioService.textToSpeech).toHaveBeenCalledWith('Voice', 'nova', 'ws-tenant');
    });

    it('actionTranscribeAudio passes workspaceId to audio service', async () => {
      await service.actionTranscribeAudio('ws-tenant', {
        audioUrl: 'https://test.audio',
      });

      expect(audioService.transcribeFromUrl).toHaveBeenCalledWith(
        'https://test.audio',
        'pt',
        'ws-tenant',
      );
    });
  });

  describe('error handling', () => {
    it('actionSendMessage catches and returns error', async () => {
      whatsappService.sendMessage = jest.fn().mockRejectedValue(new Error('network failure'));

      const result = await service.actionSendMessage(wsId, phone, {
        message: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('network failure');
    });

    it('actionSendMedia catches and returns error', async () => {
      whatsappService.sendMessage = jest.fn().mockRejectedValue(new Error('timeout'));

      const result = await service.actionSendMedia(wsId, phone, {
        url: 'https://fail.test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('timeout');
    });

    it('actionTranscribeAudio catches and returns error', async () => {
      audioService.transcribeFromUrl = jest
        .fn()
        .mockRejectedValue(new Error('transcription failed'));

      const result = await service.actionTranscribeAudio(wsId, {
        audioUrl: 'https://fail.audio',
      });

      expect(result.success).toBe(false);
    });
  });
});
