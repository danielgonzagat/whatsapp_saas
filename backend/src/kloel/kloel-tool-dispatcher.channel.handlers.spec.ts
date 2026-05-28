import type { RiskGateService } from './risk-class/risk-gate.service';
import type { ChannelTransportRegistry } from './channel-transport.registry';
import type { ChannelSendResult } from './channel-transport.types';
import {
  dispatchChannelTool,
  isChannelTool,
  CHANNEL_TOOL_NAMES,
} from './kloel-tool-dispatcher.channel.handlers';
import type { ChannelToolDeps } from './kloel-tool-dispatcher.channel.handlers';type StubRiskGate = {
  gateMessageSend: jest.Mock;
};

type StubTransports = {
  send: jest.Mock;
};const mockGateMessageSend = (
  verdict: 'allow' | 'warn' | 'block' = 'allow',
): jest.Mock =>
  jest.fn().mockReturnValue({
    classification: { class: 'R1', autonomyMode: 'allowed_alone', requiredEvidenceLevel: 'N1', rollback: [] },
    verdict,
    reason: verdict === 'block' ? 'R4: forbidden' : 'R1: allowed',
  });const makeStubDeps = (
  gateVerdict: 'allow' | 'warn' | 'block' = 'allow',
  sendResult: ChannelSendResult = { success: true, blocked: false },
): { riskGate: StubRiskGate; transports: StubTransports; deps: ChannelToolDeps } => {
  const riskGate: StubRiskGate = {
    gateMessageSend: mockGateMessageSend(gateVerdict),
  };
  const transports: StubTransports = {
    send: jest.fn().mockResolvedValue(sendResult),
  };
  const deps: ChannelToolDeps = {
    transports: transports as unknown as ChannelTransportRegistry,
    riskGate: riskGate as unknown as RiskGateService,
  };
  return { riskGate, transports, deps };
};describe('kloel-tool-dispatcher.channel.handlers', () => {
  describe('isChannelTool', () => {
    it('recognises every channel-send tool name', () => {
      for (const name of CHANNEL_TOOL_NAMES) {
        expect(isChannelTool(name)).toBe(true);
      }
    });

    it('returns false for unrelated tools (WhatsApp, products, etc.)', () => {
      expect(isChannelTool('send_whatsapp_message')).toBe(false);
      expect(isChannelTool('list_products')).toBe(false);
      expect(isChannelTool('create_payment_link')).toBe(false);
      expect(isChannelTool('foo')).toBe(false);
    });
  });

  describe('dispatchChannelTool', () => {
    it('returns null for unrelated tool names', async () => {
      const { deps } = makeStubDeps();
      expect(await dispatchChannelTool(deps, 'ws1', 'unrelated', {})).toBeNull();
    });

    // ── send_email ──    describe('send_email', () => {
      it('blocks when RiskGate verdict is block', async () => {
        const { deps, riskGate } = makeStubDeps('block');
        const result = await dispatchChannelTool(deps, 'ws1', 'send_email', {
          email: 'user@test.com',
          message: 'Hello',
        });
        expect(result).toEqual({ success: false, error: 'R4: forbidden' });
        expect(riskGate.gateMessageSend).toHaveBeenCalledWith({ target: 'lead' });
      });

      it('allows when RiskGate verdict is allow and transport succeeds', async () => {
        const { deps, transports, riskGate } = makeStubDeps('allow', {
          success: true,
          blocked: false,
        });
        const result = await dispatchChannelTool(deps, 'ws1', 'send_email', {
          email: 'user@test.com',
          message: 'Hello',
        });
        expect(result).toEqual({ success: true });
        expect(riskGate.gateMessageSend).toHaveBeenCalledWith({ target: 'lead' });
        expect(transports.send).toHaveBeenCalledWith('ws1', {
          workspaceId: 'ws1',
          channel: 'email',
          recipientId: 'user@test.com',
          content: 'Hello',
        });
      });

      it('allows when RiskGate verdict is warn (still dispatched)', async () => {
        const { deps, transports } = makeStubDeps('warn', {
          success: true,
          blocked: false,
        });
        const result = await dispatchChannelTool(deps, 'ws1', 'send_email', {
          email: 'user@test.com',
          message: 'Hello',
        });
        expect(result).toEqual({ success: true });
        expect(transports.send).toHaveBeenCalled();
      });

      it('returns transport failure shape', async () => {
        const { deps } = makeStubDeps('allow', {
          success: false,
          blocked: false,
          error: 'email_send_failed',
        });
        const result = await dispatchChannelTool(deps, 'ws1', 'send_email', {
          email: 'user@test.com',
          message: 'Hello',
        });
        expect(result).toEqual({ success: false, error: 'email_send_failed' });
      });

      it('returns error when email is missing', async () => {
        const { deps } = makeStubDeps();
        const result = await dispatchChannelTool(deps, 'ws1', 'send_email', {
          message: 'Hello',
        });
        expect(result).toEqual({ success: false, error: 'email_required' });
      });

      it('returns error when message is missing', async () => {
        const { deps } = makeStubDeps();
        const result = await dispatchChannelTool(deps, 'ws1', 'send_email', {
          email: 'user@test.com',
        });
        expect(result).toEqual({ success: false, error: 'message_required' });
      });

      it('accepts "to" as fallback key for email', async () => {
        const { deps, transports } = makeStubDeps();
        await dispatchChannelTool(deps, 'ws1', 'send_email', {
          to: 'fallback@test.com',
          message: 'Hello',
        });
        expect(transports.send).toHaveBeenCalledWith('ws1', expect.objectContaining({
          recipientId: 'fallback@test.com',
        }));
      });

      it('prefers "email" over "to" when both present', async () => {
        const { deps, transports } = makeStubDeps();
        await dispatchChannelTool(deps, 'ws1', 'send_email', {
          email: 'primary@test.com',
          to: 'fallback@test.com',
          message: 'Hello',
        });
        expect(transports.send).toHaveBeenCalledWith('ws1', expect.objectContaining({
          recipientId: 'primary@test.com',
        }));
      });

      it('accepts "body" as fallback key for message', async () => {
        const { deps, transports } = makeStubDeps();
        await dispatchChannelTool(deps, 'ws1', 'send_email', {
          email: 'user@test.com',
          body: 'Email body',
        });
        expect(transports.send).toHaveBeenCalledWith('ws1', expect.objectContaining({
          content: 'Email body',
        }));
      });
    });

    // ── send_instagram_dm ──    describe('send_instagram_dm', () => {
      it('blocks when RiskGate verdict is block', async () => {
        const { deps } = makeStubDeps('block');
        const result = await dispatchChannelTool(deps, 'ws1', 'send_instagram_dm', {
          handle: 'user_handle',
          message: 'Hello',
        });
        expect(result).toEqual({ success: false, error: 'R4: forbidden' });
      });

      it('dispatches with handle and message to instagram channel', async () => {
        const { deps, transports, riskGate } = makeStubDeps('allow');
        const result = await dispatchChannelTool(deps, 'ws1', 'send_instagram_dm', {
          handle: 'user_handle',
          message: 'Hello',
        });
        expect(result).toEqual({ success: true });
        expect(riskGate.gateMessageSend).toHaveBeenCalledWith({ target: 'lead' });
        expect(transports.send).toHaveBeenCalledWith('ws1', {
          workspaceId: 'ws1',
          channel: 'instagram',
          recipientId: 'user_handle',
          content: 'Hello',
        });
      });

      it('accepts instagramUserId as fallback key for handle', async () => {
        const { deps, transports } = makeStubDeps();
        await dispatchChannelTool(deps, 'ws1', 'send_instagram_dm', {
          instagramUserId: 'ig_123',
          message: 'Hello',
        });
        expect(transports.send).toHaveBeenCalledWith('ws1', expect.objectContaining({
          recipientId: 'ig_123',
        }));
      });

      it('returns error when handle is missing', async () => {
        const { deps } = makeStubDeps();
        const result = await dispatchChannelTool(deps, 'ws1', 'send_instagram_dm', {
          message: 'Hello',
        });
        expect(result).toEqual({ success: false, error: 'instagram_handle_required' });
      });

      it('returns error when message is missing', async () => {
        const { deps } = makeStubDeps();
        const result = await dispatchChannelTool(deps, 'ws1', 'send_instagram_dm', {
          handle: 'user_handle',
        });
        expect(result).toEqual({ success: false, error: 'message_required' });
      });
    });

    // ── send_messenger_message ──    describe('send_messenger_message', () => {
      it('blocks when RiskGate verdict is block', async () => {
        const { deps } = makeStubDeps('block');
        const result = await dispatchChannelTool(deps, 'ws1', 'send_messenger_message', {
          recipientId: 'fb_123',
          message: 'Hello',
        });
        expect(result).toEqual({ success: false, error: 'R4: forbidden' });
      });

      it('dispatches with recipientId and message to messenger channel', async () => {
        const { deps, transports, riskGate } = makeStubDeps('allow');
        const result = await dispatchChannelTool(deps, 'ws1', 'send_messenger_message', {
          recipientId: 'fb_123',
          message: 'Hello',
        });
        expect(result).toEqual({ success: true });
        expect(riskGate.gateMessageSend).toHaveBeenCalledWith({ target: 'lead' });
        expect(transports.send).toHaveBeenCalledWith('ws1', {
          workspaceId: 'ws1',
          channel: 'messenger',
          recipientId: 'fb_123',
          content: 'Hello',
        });
      });

      it('returns transport failure with messageId on partial success', async () => {
        const { deps } = makeStubDeps('allow', {
          success: true,
          blocked: false,
          messageId: 'mid_abc',
        });
        const result = await dispatchChannelTool(deps, 'ws1', 'send_messenger_message', {
          recipientId: 'fb_123',
          message: 'Hello',
        });
        expect(result).toEqual({ success: true, messageId: 'mid_abc' });
      });

      it('returns error when recipientId is missing', async () => {
        const { deps } = makeStubDeps();
        const result = await dispatchChannelTool(deps, 'ws1', 'send_messenger_message', {
          message: 'Hello',
        });
        expect(result).toEqual({ success: false, error: 'recipient_id_required' });
      });

      it('returns error when message is missing', async () => {
        const { deps } = makeStubDeps();
        const result = await dispatchChannelTool(deps, 'ws1', 'send_messenger_message', {
          recipientId: 'fb_123',
        });
        expect(result).toEqual({ success: false, error: 'message_required' });
      });
    });
  });
});