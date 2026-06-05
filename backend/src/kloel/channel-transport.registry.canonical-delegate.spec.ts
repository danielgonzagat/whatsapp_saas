/**
 * Tests for the OmniCore dispatch-registry collapse (census P1-1):
 * `ChannelTransportRegistry` DELEGATES the provider call to the canonical
 * `ChannelMessageDispatchService.sendMessage` when
 * `KLOEL_TRANSPORT_CANONICAL_DELEGATE === 'true'`, mapping the canonical
 * CONTRACT-B result back to the transport CONTRACT-A. Default OFF =
 * byte-identical existing provider-call path.
 *
 * @see backend/src/kloel/channel-transport.registry.ts
 * @see backend/src/kloel/channel-transport-canonical-delegate.flag.ts
 * @see backend/src/marketing/channel-message-dispatch.service.ts
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ChannelTransportRegistry } from './channel-transport.registry';
import { WhatsAppChannelTransport } from './channel-transport.providers';
import { ChannelMessageDispatchService } from '../marketing/channel-message-dispatch.service';
import { MetaWhatsAppService } from '../meta/meta-whatsapp.service';
import type { ChannelSendRequest } from './channel-transport.types';

class StubWhatsAppRegistry {
  sendMessage = jest.fn();
}

const FLAG = 'KLOEL_TRANSPORT_CANONICAL_DELEGATE';

function makeRequest(overrides: Partial<ChannelSendRequest> = {}): ChannelSendRequest {
  return {
    workspaceId: 'ws-1',
    channel: 'whatsapp',
    recipientId: 'recipient-1',
    content: 'Hello from KLOEL',
    ...overrides,
  };
}

describe('ChannelTransportRegistry — canonical delegate flag', () => {
  let stubWhatsAppRegistry: StubWhatsAppRegistry;
  let whatsAppProvider: WhatsAppChannelTransport;
  let canonicalDispatch: { sendMessage: jest.Mock };
  let priorFlag: string | undefined;

  beforeEach(() => {
    priorFlag = process.env[FLAG];
    stubWhatsAppRegistry = new StubWhatsAppRegistry();
    whatsAppProvider = new WhatsAppChannelTransport(stubWhatsAppRegistry as never);
    canonicalDispatch = { sendMessage: jest.fn() };
  });

  afterEach(() => {
    if (priorFlag === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = priorFlag;
    }
    jest.clearAllMocks();
  });

  function buildRegistry(): ChannelTransportRegistry {
    return new ChannelTransportRegistry(
      undefined, // instagram
      undefined, // messenger
      undefined, // tiktok
      undefined, // email
      whatsAppProvider, // whatsapp
      undefined, // guards
      undefined, // guardContextBuilder
      canonicalDispatch as never, // canonicalDispatch
      undefined, // metaConnection
    );
  }

  describe('flag OFF (default)', () => {
    it('runs the existing provider path and never touches the canonical service', async () => {
      delete process.env[FLAG];
      stubWhatsAppRegistry.sendMessage.mockResolvedValue({
        success: true,
        messageId: 'wa-provider-1',
      });
      const registry = buildRegistry();

      const result = await registry.send('ws-1', makeRequest());

      expect(result).toEqual({
        success: true,
        messageId: 'wa-provider-1',
        blocked: false,
      });
      expect(stubWhatsAppRegistry.sendMessage).toHaveBeenCalledTimes(1);
      expect(stubWhatsAppRegistry.sendMessage).toHaveBeenCalledWith(
        'ws-1',
        'recipient-1',
        'Hello from KLOEL',
        {},
      );
      expect(canonicalDispatch.sendMessage).not.toHaveBeenCalled();
    });

    it('treats a literal non-true flag value as OFF', async () => {
      process.env[FLAG] = 'false';
      stubWhatsAppRegistry.sendMessage.mockResolvedValue({ success: true });
      const registry = buildRegistry();

      await registry.send('ws-1', makeRequest());

      expect(stubWhatsAppRegistry.sendMessage).toHaveBeenCalledTimes(1);
      expect(canonicalDispatch.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('flag ON', () => {
    it('delegates a WhatsApp send to ChannelMessageDispatchService.sendMessage', async () => {
      process.env[FLAG] = 'true';
      canonicalDispatch.sendMessage.mockResolvedValue({
        success: true,
        messageId: 'canonical-wa-1',
        provider: 'whatsapp',
        delivery: 'direct',
      });
      const registry = buildRegistry();

      const result = await registry.send(
        'ws-1',
        makeRequest({ mediaUrl: 'https://x/y.png', mediaType: 'image' }),
      );

      // CONTRACT-B → CONTRACT-A mapping: blocked defaults to false on success,
      // messageId carried through, no canonical-only extra fields leak.
      expect(result).toEqual({
        success: true,
        messageId: 'canonical-wa-1',
        blocked: false,
      });
      // The legacy provider path is NOT used when delegating.
      expect(stubWhatsAppRegistry.sendMessage).not.toHaveBeenCalled();
      // Canonical received a fully-built WhatsApp ChannelSendInput.
      expect(canonicalDispatch.sendMessage).toHaveBeenCalledTimes(1);
      expect(canonicalDispatch.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          channelKind: 'whatsapp',
          workspaceId: 'ws-1',
          to: 'recipient-1',
          message: 'Hello from KLOEL',
          mediaUrl: 'https://x/y.png',
          mediaType: 'image',
        }),
      );
    });

    it('maps a canonical blocked result through to CONTRACT-A', async () => {
      process.env[FLAG] = 'true';
      canonicalDispatch.sendMessage.mockResolvedValue({
        success: false,
        error: 'channel_setup_required',
        blocked: true,
        blockedReason: 'channel_setup_required',
        provider: 'whatsapp',
      });
      const registry = buildRegistry();

      const result = await registry.send('ws-1', makeRequest());

      expect(result).toEqual({
        success: false,
        blocked: true,
        error: 'channel_setup_required',
        blockedReason: 'channel_setup_required',
      });
      expect(stubWhatsAppRegistry.sendMessage).not.toHaveBeenCalled();
    });

    it('maps a canonical failure (no blocked field) to blocked=false', async () => {
      process.env[FLAG] = 'true';
      canonicalDispatch.sendMessage.mockResolvedValue({
        success: false,
        error: 'session_disconnected',
        provider: 'whatsapp',
      });
      const registry = buildRegistry();

      const result = await registry.send('ws-1', makeRequest());

      expect(result).toEqual({
        success: false,
        blocked: false,
        error: 'session_disconnected',
      });
    });

    it('keeps EMAIL on the current provider path even when ON', async () => {
      process.env[FLAG] = 'true';
      // Email provider is not registered here, so the registry blocks at the
      // isConfigured() gate — proving email never reaches the canonical service.
      const registry = buildRegistry();

      const result = await registry.send('ws-1', makeRequest({ channel: 'email' }));

      expect(result.blocked).toBe(true);
      expect(result.blockedReason).toContain('Nenhum provider registrado');
      expect(canonicalDispatch.sendMessage).not.toHaveBeenCalled();
    });

    it('falls back to the provider path when the canonical service is not injected', async () => {
      process.env[FLAG] = 'true';
      stubWhatsAppRegistry.sendMessage.mockResolvedValue({
        success: true,
        messageId: 'wa-fallback-1',
      });
      const registry = new ChannelTransportRegistry(
        undefined,
        undefined,
        undefined,
        undefined,
        whatsAppProvider,
        undefined,
        undefined,
        undefined, // canonicalDispatch NOT injected
        undefined,
      );

      const result = await registry.send('ws-1', makeRequest());

      expect(result).toEqual({
        success: true,
        messageId: 'wa-fallback-1',
        blocked: false,
      });
      expect(stubWhatsAppRegistry.sendMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('boot smoke — module resolves without a DI cycle', () => {
    it('constructs ChannelTransportRegistry with the canonical service injected', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ChannelTransportRegistry,
          { provide: ChannelMessageDispatchService, useValue: { sendMessage: jest.fn() } },
          { provide: MetaWhatsAppService, useValue: { resolveConnection: jest.fn() } },
        ],
      }).compile();

      const registry = module.get<ChannelTransportRegistry>(ChannelTransportRegistry);
      expect(registry).toBeInstanceOf(ChannelTransportRegistry);
      await module.close();
    });
  });
});
