import { WhatsAppChannelTransport } from './channel-transport-whatsapp.provider';
import type { ChannelSendRequest } from './channel-transport.types';

/**
 * P0-B — WhatsApp outbound compliance/billing leak.
 *
 * Proves the KLOEL_COMPLIANT_WHATSAPP_SEND flag gate on the transport:
 *   - flag OFF (default) → raw provider registry send, dispatcher NOT called
 *   - flag ON            → canonical dispatcher send, provider NOT called,
 *                          dispatcher result mapped back onto ChannelSendResult.
 */
describe('WhatsAppChannelTransport — compliant-send flag', () => {
  const FLAG = 'KLOEL_COMPLIANT_WHATSAPP_SEND';
  let originalFlag: string | undefined;

  let registry: { sendMessage: jest.Mock };
  let dispatcher: { sendMessage: jest.Mock };

  function makeRequest(overrides: Partial<ChannelSendRequest> = {}): ChannelSendRequest {
    return {
      workspaceId: 'ws-1',
      channel: 'whatsapp',
      recipientId: '+5511999999999',
      content: 'Olá do KLOEL',
      ...overrides,
    };
  }

  beforeEach(() => {
    originalFlag = process.env[FLAG];
    registry = {
      sendMessage: jest.fn().mockResolvedValue({ success: true, messageId: 'prov-msg-1' }),
    };
    dispatcher = {
      sendMessage: jest
        .fn()
        .mockResolvedValue({ ok: true, direct: true, delivery: 'sent', messageId: 'disp-msg-1' }),
    };
  });

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = originalFlag;
    }
    jest.clearAllMocks();
  });

  describe('flag OFF (default)', () => {
    beforeEach(() => {
      delete process.env[FLAG];
    });

    it('sends directly via the provider registry and does NOT call the dispatcher', async () => {
      const transport = new WhatsAppChannelTransport(registry as never, dispatcher as never);

      const result = await transport.send('ws-1', makeRequest());

      expect(registry.sendMessage).toHaveBeenCalledTimes(1);
      expect(registry.sendMessage).toHaveBeenCalledWith(
        'ws-1',
        '+5511999999999',
        'Olá do KLOEL',
        {},
      );
      expect(dispatcher.sendMessage).not.toHaveBeenCalled();
      expect(result).toEqual({ success: true, messageId: 'prov-msg-1', blocked: false });
    });

    it('treats the literal string "false" as OFF', async () => {
      process.env[FLAG] = 'false';
      const transport = new WhatsAppChannelTransport(registry as never, dispatcher as never);

      await transport.send('ws-1', makeRequest());

      expect(registry.sendMessage).toHaveBeenCalledTimes(1);
      expect(dispatcher.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('flag ON', () => {
    beforeEach(() => {
      process.env[FLAG] = 'true';
    });

    it('routes through the compliant dispatcher and does NOT call the provider registry directly', async () => {
      const transport = new WhatsAppChannelTransport(registry as never, dispatcher as never);

      const result = await transport.send('ws-1', makeRequest());

      expect(dispatcher.sendMessage).toHaveBeenCalledTimes(1);
      expect(dispatcher.sendMessage).toHaveBeenCalledWith(
        'ws-1',
        '+5511999999999',
        'Olá do KLOEL',
        {},
      );
      expect(registry.sendMessage).not.toHaveBeenCalled();
      // dispatcher result mapped back onto the transport's ChannelSendResult
      expect(result).toEqual({ success: true, messageId: 'disp-msg-1', blocked: false });
    });

    it('forwards media + quoted options to the dispatcher', async () => {
      const transport = new WhatsAppChannelTransport(registry as never, dispatcher as never);

      await transport.send(
        'ws-1',
        makeRequest({
          mediaUrl: 'https://cdn/x.jpg',
          mediaType: 'image',
          caption: 'legenda',
          quotedMessageId: 'q-1',
        }),
      );

      expect(dispatcher.sendMessage).toHaveBeenCalledWith(
        'ws-1',
        '+5511999999999',
        'Olá do KLOEL',
        {
          mediaUrl: 'https://cdn/x.jpg',
          mediaType: 'image',
          caption: 'legenda',
          quotedMessageId: 'q-1',
        },
      );
      expect(registry.sendMessage).not.toHaveBeenCalled();
    });

    it('maps a dispatcher compliance block ({ error, message }) to a soft failure', async () => {
      dispatcher.sendMessage.mockResolvedValue({
        error: true,
        message: 'Contato sem opt-in para WhatsApp',
      });
      const transport = new WhatsAppChannelTransport(registry as never, dispatcher as never);

      const result = await transport.send('ws-1', makeRequest());

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(false);
      expect(result.error).toBe('Contato sem opt-in para WhatsApp');
      expect(registry.sendMessage).not.toHaveBeenCalled();
    });

    it('maps a queued dispatcher result to success', async () => {
      dispatcher.sendMessage.mockResolvedValue({ ok: true, queued: true, delivery: 'queued' });
      const transport = new WhatsAppChannelTransport(registry as never, dispatcher as never);

      const result = await transport.send('ws-1', makeRequest());

      expect(result).toEqual({ success: true, blocked: false });
    });

    it('falls back to the direct provider path when no dispatcher is injected', async () => {
      const transport = new WhatsAppChannelTransport(registry as never);

      const result = await transport.send('ws-1', makeRequest());

      expect(registry.sendMessage).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ success: true, messageId: 'prov-msg-1', blocked: false });
    });
  });
});
