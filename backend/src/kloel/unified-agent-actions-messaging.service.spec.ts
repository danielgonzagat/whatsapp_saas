import { UnifiedAgentActionsMessagingService } from './unified-agent-actions-messaging.service';

type TransportRegistryMock = {
  send: jest.Mock;
};

type OpsAlertMock = {
  alertOnCriticalError: jest.Mock;
};

describe('UnifiedAgentActionsMessagingService', () => {
  let messaging: UnifiedAgentActionsMessagingService;
  let transports: TransportRegistryMock;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    transports = {
      send: jest.fn().mockResolvedValue({ success: true, blocked: false, messageId: 'msg-1' }),
    };
    const opsAlert: OpsAlertMock = { alertOnCriticalError: jest.fn() };

    messaging = new UnifiedAgentActionsMessagingService(
      transports as never,
      {
        textToSpeech: jest.fn(),
        transcribeFromUrl: jest.fn(),
        transcribeFromBase64: jest.fn(),
      } as never,
      opsAlert as never,
    );
  });

  describe('sendViaTransport', () => {
    it('passes guardContext from context param through to transport registry', async () => {
      await messaging.sendViaTransport('ws-1', '5511999999999', 'Hello', {
        contactOptOut: true,
        contactMessagesToday: 5,
        complianceMode: 'reactive',
        contactId: 'contact-1',
      });

      expect(transports.send).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          guardContext: expect.objectContaining({
            contactOptOut: true,
            contactMessagesToday: 5,
            complianceMode: 'reactive',
            contactId: 'contact-1',
          }),
        }),
      );
    });

    it('passes empty guardContext when context is undefined', async () => {
      await messaging.sendViaTransport('ws-1', '5511999999999', 'Hello', undefined);

      expect(transports.send).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          guardContext: expect.objectContaining({}),
        }),
      );
    });

    it('maps audio guard fields from extra params', async () => {
      await messaging.sendViaTransport(
        'ws-1',
        '5511999999999',
        '',
        { contactOptOut: false },
        { mediaUrl: 'data:audio/mpeg;base64,xxx', mediaType: 'audio' },
      );

      expect(transports.send).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          channel: 'whatsapp',
          mediaType: 'audio',
          guardContext: expect.objectContaining({
            contactOptOut: false,
          }),
        }),
      );
    });

    it('passes guardContext for document send', async () => {
      await messaging.sendViaTransport(
        'ws-1',
        '5511999999999',
        'Docs attached',
        { withinComplianceWindow: false, templateApproved: true },
        { mediaUrl: 'https://docs.example.com/file.pdf', mediaType: 'document' },
      );

      expect(transports.send).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({
          channel: 'whatsapp',
          mediaType: 'document',
          guardContext: expect.objectContaining({
            withinComplianceWindow: false,
            templateApproved: true,
          }),
        }),
      );
    });
  });

  describe('actionSendMessage', () => {
    it('returns success when transport succeeds', async () => {
      const result = await messaging.actionSendMessage('ws-1', '5511999999999', {
        message: 'Oi, tudo bem?',
      });

      expect(result).toEqual({
        success: true,
        message: 'Oi, tudo bem?',
        queued: false,
        sent: false,
        delivery: 'sent',
        direct: false,
        messageId: 'msg-1',
      });
    });

    it('returns error when transport returns blocked', async () => {
      transports.send.mockResolvedValueOnce({
        success: false,
        blocked: true,
        blockedReason: 'Contato possui opt-out registrado.',
      });

      const result = await messaging.actionSendMessage('ws-1', '5511999999999', { message: 'Oi' });

      expect(result).toEqual({
        success: false,
        error: 'Contato possui opt-out registrado.',
      });
    });

    it('returns error when message is empty', async () => {
      const result = await messaging.actionSendMessage('ws-1', '5511999999999', { message: '' });

      expect(result).toEqual({ success: false, error: 'Mensagem é obrigatória' });
    });
  });

  describe('resolveChannel', () => {
    it('defaults to whatsapp when no channel in context', async () => {
      await messaging.sendViaTransport('ws-1', '5511', 'text', {});

      expect(transports.send).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({ channel: 'whatsapp' }),
      );
    });

    it('uses explicit channel from context', async () => {
      await messaging.sendViaTransport('ws-1', '5511', 'text', { channel: 'instagram' });

      expect(transports.send).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({ channel: 'instagram' }),
      );
    });

    it('resolves channel from sourceChannel fallback', async () => {
      await messaging.sendViaTransport('ws-1', '5511', 'text', { sourceChannel: 'messenger' });

      expect(transports.send).toHaveBeenCalledWith(
        'ws-1',
        expect.objectContaining({ channel: 'messenger' }),
      );
    });
  });
});
