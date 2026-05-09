import { Test, TestingModule } from '@nestjs/testing';
import { ChannelTransportRegistry } from './channel-transport.registry';
import {
  EmailChannelTransport,
  InstagramChannelTransport,
  MessengerChannelTransport,
  TikTokChannelTransport,
  WhatsAppChannelTransport,
} from './channel-transport.providers';
import type { ChannelName, ChannelSendRequest } from './channel-transport.types';
import { InstagramService } from '../meta/instagram/instagram.service';
import { MetaWhatsAppService } from '../meta/meta-whatsapp.service';
import { MessengerService } from '../meta/messenger/messenger.service';
import { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';

class StubWhatsAppRegistry {
  sendMessage = jest.fn();
}

class StubInstagramService {
  sendMessage = jest.fn();
}

class StubMessengerService {
  sendTextMessage = jest.fn();
}

class StubMetaConnectionService {
  resolveConnection = jest.fn().mockResolvedValue({
    accessToken: '',
    instagramAccountId: null,
    pageAccessToken: null,
    pageId: null,
    tokenExpired: false,
  });
}

describe('ChannelTransportRegistry', () => {
  let registry: ChannelTransportRegistry;
  let stubWhatsApp: StubWhatsAppRegistry;
  let stubInstagram: StubInstagramService;
  let stubMessenger: StubMessengerService;
  let stubMetaConnection: StubMetaConnectionService;

  beforeEach(async () => {
    stubWhatsApp = new StubWhatsAppRegistry();
    stubInstagram = new StubInstagramService();
    stubMessenger = new StubMessengerService();
    stubMetaConnection = new StubMetaConnectionService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChannelTransportRegistry,
        InstagramChannelTransport,
        MessengerChannelTransport,
        TikTokChannelTransport,
        EmailChannelTransport,
        WhatsAppChannelTransport,
        { provide: InstagramService, useValue: stubInstagram },
        { provide: MessengerService, useValue: stubMessenger },
        { provide: MetaWhatsAppService, useValue: stubMetaConnection },
        { provide: WhatsAppProviderRegistry, useValue: stubWhatsApp },
      ],
    }).compile();

    registry = module.get<ChannelTransportRegistry>(ChannelTransportRegistry);

    registry.register(module.get<InstagramChannelTransport>(InstagramChannelTransport));
    registry.register(module.get<MessengerChannelTransport>(MessengerChannelTransport));
    registry.register(module.get<TikTokChannelTransport>(TikTokChannelTransport));
    registry.register(module.get<EmailChannelTransport>(EmailChannelTransport));
    registry.register(module.get<WhatsAppChannelTransport>(WhatsAppChannelTransport));
  });

  describe('registration', () => {
    it('registers providers and lists all five channels', () => {
      const channels = registry.getRegisteredChannels();
      expect(channels).toHaveLength(5);
      expect(channels.sort()).toEqual(
        ['whatsapp', 'instagram', 'messenger', 'tiktok', 'email'].sort(),
      );
    });
  });

  describe('getAllCapabilities', () => {
    it('returns capabilities for all five channels', async () => {
      const caps = await registry.getAllCapabilities('ws-1');
      expect(caps).toHaveLength(5);

      for (const cap of caps) {
        expect(cap).toHaveProperty('channel');
        expect(cap).toHaveProperty('sendAvailable');
        expect(cap).toHaveProperty('sendBlockedReason');
        expect(cap).toHaveProperty('requiredSetup');
      }
    });

    it('reports TikTok as blocked for outbound sends', async () => {
      const cap = await registry.getCapability('ws-1', 'tiktok');
      expect(cap.sendAvailable).toBe(false);
      expect(cap.sendBlockedReason).toContain('nao suporta envio outbound');
    });

    it('reports email as blocked when no email provider env var is set', async () => {
      delete process.env.RESEND_API_KEY;
      delete process.env.SENDGRID_API_KEY;
      delete process.env.EMAIL_OUTBOUND_SMTP_HOST;
      delete process.env.EMAIL_OUTBOUND_SMTP_USER;
      const cap = await registry.getCapability('ws-1', 'email');
      expect(cap.sendAvailable).toBe(false);
      expect(cap.sendBlockedReason).toContain('nao configurado');
    });

    it('reports whatsapp as available when provider is present', async () => {
      const cap = await registry.getCapability('ws-1', 'whatsapp');
      expect(cap.sendAvailable).toBe(true);
      expect(cap.sendBlockedReason).toBeNull();
    });

    it('reports instagram as blocked without a real workspace account token', async () => {
      const cap = await registry.getCapability('ws-1', 'instagram');
      expect(cap.sendAvailable).toBe(false);
      expect(cap.sendBlockedReason).toContain('token valido');
    });

    it('reports messenger as blocked without a real workspace page token', async () => {
      const cap = await registry.getCapability('ws-1', 'messenger');
      expect(cap.sendAvailable).toBe(false);
      expect(cap.sendBlockedReason).toContain('page token valido');
    });
  });

  describe('send', () => {
    function makeSendRequest(
      channel: ChannelName,
      overrides: Partial<ChannelSendRequest> = {},
    ): ChannelSendRequest {
      return {
        workspaceId: 'ws-1',
        channel,
        recipientId: 'recipient-1',
        content: 'Hello from KLOEL',
        ...overrides,
      };
    }

    it('blocks TikTok send with honest message', async () => {
      const result = await registry.send('ws-1', makeSendRequest('tiktok'));
      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toContain('nao esta configurado');
    });

    it('blocks email send when SMTP not configured', async () => {
      const result = await registry.send('ws-1', makeSendRequest('email'));
      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toContain('nao esta configurado');
    });

    it('returns blocked for unknown channel', async () => {
      const result = await registry.send(
        'ws-1',
        makeSendRequest('email', { channel: 'unknown' as ChannelName }),
      );
      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toContain('Nenhum provider registrado');
    });

    it('dispatches WhatsApp send to WhatsAppProviderRegistry', async () => {
      stubWhatsApp.sendMessage.mockResolvedValue({
        success: true,
        messageId: 'wa-msg-123',
      });

      const result = await registry.send('ws-1', makeSendRequest('whatsapp'));
      expect(result.success).toBe(true);
      expect(result.messageId).toBe('wa-msg-123');
      expect(result.blocked).toBe(false);
      expect(stubWhatsApp.sendMessage).toHaveBeenCalledWith(
        'ws-1',
        'recipient-1',
        'Hello from KLOEL',
        expect.objectContaining({
          mediaUrl: undefined,
          mediaType: undefined,
          caption: undefined,
          quotedMessageId: undefined,
        }),
      );
    });

    it('evaluates deterministic guards before dispatching a send', async () => {
      const guards = {
        evaluate: jest.fn().mockResolvedValue({
          allowed: false,
          guardName: 'opt_out',
          reason: 'Contato possui opt-out registrado.',
        }),
      };
      const guardedRegistry = new ChannelTransportRegistry(
        undefined,
        undefined,
        undefined,
        undefined,
        new WhatsAppChannelTransport(stubWhatsApp as never),
        guards as never,
      );

      const result = await guardedRegistry.send(
        'ws-1',
        makeSendRequest('whatsapp', { guardContext: { contactOptOut: true } }),
      );

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toContain('opt-out');
      expect(guards.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          decisionType: 'send_message',
          action: 'send_message',
          context: expect.objectContaining({ contactOptOut: true, channel: 'whatsapp' }),
        }),
      );
      expect(stubWhatsApp.sendMessage).not.toHaveBeenCalled();
    });

    it('enriches guard context before deterministic guard evaluation', async () => {
      const guards = {
        evaluate: jest.fn().mockResolvedValue({
          allowed: true,
          guardName: 'all_guards',
          reason: 'Ação aprovada pelas guardas determinísticas.',
        }),
      };
      const guardContextBuilder = {
        buildForSend: jest.fn().mockResolvedValue({
          channel: 'whatsapp',
          contactId: 'contact-1',
          contactOptOut: false,
          contactMessagesToday: 3,
          withinComplianceWindow: true,
          templateApproved: true,
          supportsAudio: true,
          supportsDocument: true,
        }),
      };
      const guardedRegistry = new ChannelTransportRegistry(
        undefined,
        undefined,
        undefined,
        undefined,
        new WhatsAppChannelTransport(stubWhatsApp as never),
        guards as never,
        guardContextBuilder as never,
      );

      await guardedRegistry.send(
        'ws-1',
        makeSendRequest('whatsapp', { guardContext: { contactId: 'contact-1' } }),
      );

      expect(guardContextBuilder.buildForSend).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({ channel: 'whatsapp', recipientId: 'recipient-1' }),
        expect.objectContaining({ channel: 'whatsapp', contactId: 'contact-1' }),
      );
      expect(guards.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({
          context: expect.objectContaining({
            contactId: 'contact-1',
            contactMessagesToday: 3,
            contactOptOut: false,
            templateApproved: true,
            withinComplianceWindow: true,
          }),
        }),
      );
    });

    it('propagates WhatsApp send failure', async () => {
      stubWhatsApp.sendMessage.mockResolvedValue({
        success: false,
        error: 'session_disconnected',
      });

      const result = await registry.send('ws-1', makeSendRequest('whatsapp'));
      expect(result.success).toBe(false);
      expect(result.error).toBe('session_disconnected');
      expect(result.blocked).toBe(false);
    });

    it('blocks Instagram send without placeholder token dispatch', async () => {
      stubInstagram.sendMessage.mockResolvedValue({ message_id: 'ig-msg-456' });

      const result = await registry.send('ws-1', makeSendRequest('instagram'));
      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toContain('token valido');
      expect(stubInstagram.sendMessage).not.toHaveBeenCalled();
    });

    it('blocks Messenger send without placeholder token dispatch', async () => {
      stubMessenger.sendTextMessage.mockResolvedValue({ message_id: 'fb-msg-789' });

      const result = await registry.send('ws-1', makeSendRequest('messenger'));
      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toContain('page token valido');
      expect(stubMessenger.sendTextMessage).not.toHaveBeenCalled();
    });
  });

  describe('getRegisteredChannels', () => {
    it('returns all five registered channel names', () => {
      const channels = registry.getRegisteredChannels();
      expect(channels).toContain('whatsapp');
      expect(channels).toContain('instagram');
      expect(channels).toContain('messenger');
      expect(channels).toContain('tiktok');
      expect(channels).toContain('email');
    });
  });
});
