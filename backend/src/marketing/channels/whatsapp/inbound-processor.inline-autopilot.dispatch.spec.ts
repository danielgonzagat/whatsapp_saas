/**
 * Proves the canonical-dispatch routing of the inline-autopilot reply path
 * ({@link sendInlineReply}): when a dispatch service is present the reply goes
 * through `dispatch(workspaceId, 'whatsapp', to, text, opts)`, and it fails
 * OPEN to the raw `whatsappService.sendMessage` path when dispatch is absent or
 * throws — never dropping the customer reply (P0 OmniCore Wave 21 migration).
 */
import { sendInlineReply } from './inbound-processor.inline-autopilot';

const WS = 'ws-1';
const PHONE = '5511999999999';
const TEXT = 'olá';
const OPTS = { externalId: 'inline:1', complianceMode: 'reactive' as const };

describe('sendInlineReply (canonical dispatch routing)', () => {
  it('routes through ChannelMessageDispatchService.dispatch when present', async () => {
    const dispatch = jest.fn().mockResolvedValue({ success: true, messageId: 'm-1' });
    const sendMessage = jest.fn().mockResolvedValue({ ok: true });

    const result = await sendInlineReply(
      { whatsappService: { sendMessage }, dispatchService: { dispatch } },
      WS,
      PHONE,
      TEXT,
      OPTS,
    );

    expect(dispatch).toHaveBeenCalledWith(WS, 'whatsapp', PHONE, TEXT, OPTS);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, messageId: 'm-1' });
  });

  it('falls open to the raw WhatsApp path when no dispatch service is injected', async () => {
    const sendMessage = jest.fn().mockResolvedValue({ ok: true });

    await sendInlineReply({ whatsappService: { sendMessage } }, WS, PHONE, TEXT, OPTS);

    expect(sendMessage).toHaveBeenCalledWith(WS, PHONE, TEXT, OPTS);
  });

  it('falls open to the raw WhatsApp path when dispatch throws', async () => {
    const dispatch = jest.fn().mockRejectedValue(new Error('dispatch_down'));
    const sendMessage = jest.fn().mockResolvedValue({ ok: true });

    await sendInlineReply(
      { whatsappService: { sendMessage }, dispatchService: { dispatch } },
      WS,
      PHONE,
      TEXT,
      OPTS,
    );

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(WS, PHONE, TEXT, OPTS);
  });
});
