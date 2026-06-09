import { InstagramController } from './instagram.controller';
import type { InstagramService } from './instagram.service';
import type { MetaWhatsAppService } from '../../../meta/meta-whatsapp.service';
import type { ChannelMessageDispatchService } from '../../channel-message-dispatch.service';

/**
 * P2 wiring test: the Instagram CONTROLLER DM send
 * (`POST /meta/instagram/messages/send`) must route through the canonical
 * {@link ChannelMessageDispatchService.dispatch} when
 * `KLOEL_INSTAGRAM_CONTROLLER_CANONICAL_DISPATCH='true'` and the service is
 * injected, falling back to the raw {@link InstagramService.sendMessage} path
 * otherwise (flag OFF, no service, or canonical blocked/failed/throw).
 */
const FLAG = 'KLOEL_INSTAGRAM_CONTROLLER_CANONICAL_DISPATCH';

function makeMetaWhatsApp() {
  return {
    resolveConnection: jest.fn().mockResolvedValue({
      instagramAccountId: 'ig-1',
      accessToken: 'tok-1',
    }),
  } as unknown as MetaWhatsAppService;
}

describe('InstagramController.sendMessage canonical dispatch routing', () => {
  const prev = process.env[FLAG];
  const sendMessage = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env[FLAG];
  });

  afterEach(() => {
    if (prev === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = prev;
    }
  });

  const req = { user: { workspaceId: 'ws-1' }, headers: {} } as never;
  const body = { igAccountId: '', recipientId: 'recip-1', text: 'oi', accessToken: '' };

  it('flag OFF (default): uses the raw instagramService.sendMessage path', async () => {
    const dispatch = jest.fn();
    sendMessage.mockResolvedValueOnce({ message_id: 'm-raw' });
    const controller = new InstagramController(
      { sendMessage } as unknown as InstagramService,
      makeMetaWhatsApp(),
      { dispatch } as unknown as ChannelMessageDispatchService,
    );

    const result = await controller.sendMessage(req, body);

    expect(dispatch).not.toHaveBeenCalled();
    expect(sendMessage).toHaveBeenCalledWith('ig-1', 'recip-1', 'oi', 'tok-1');
    expect(result).toEqual({ message_id: 'm-raw' });
  });

  it('flag ON + dispatch success: routes through canonical dispatch and maps message_id', async () => {
    process.env[FLAG] = 'true';
    const dispatch = jest.fn().mockResolvedValue({ success: true, messageId: 'm-canon' });
    const controller = new InstagramController(
      { sendMessage } as unknown as InstagramService,
      makeMetaWhatsApp(),
      { dispatch } as unknown as ChannelMessageDispatchService,
    );

    const result = await controller.sendMessage(req, body);

    expect(dispatch).toHaveBeenCalledWith('ws-1', 'instagram', 'recip-1', 'oi', {
      igAccountId: 'ig-1',
      accessToken: 'tok-1',
    });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(result).toEqual({ message_id: 'm-canon' });
  });

  it('flag ON + dispatch blocked/failed: falls back to the raw path', async () => {
    process.env[FLAG] = 'true';
    const dispatch = jest
      .fn()
      .mockResolvedValue({ success: false, blocked: true, blockedReason: 'x' });
    sendMessage.mockResolvedValueOnce({ message_id: 'm-raw' });
    const controller = new InstagramController(
      { sendMessage } as unknown as InstagramService,
      makeMetaWhatsApp(),
      { dispatch } as unknown as ChannelMessageDispatchService,
    );

    const result = await controller.sendMessage(req, body);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith('ig-1', 'recip-1', 'oi', 'tok-1');
    expect(result).toEqual({ message_id: 'm-raw' });
  });

  it('flag ON + dispatch throws: falls back to the raw path', async () => {
    process.env[FLAG] = 'true';
    const dispatch = jest.fn().mockRejectedValue(new Error('di boom'));
    sendMessage.mockResolvedValueOnce({ message_id: 'm-raw' });
    const controller = new InstagramController(
      { sendMessage } as unknown as InstagramService,
      makeMetaWhatsApp(),
      { dispatch } as unknown as ChannelMessageDispatchService,
    );

    const result = await controller.sendMessage(req, body);

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith('ig-1', 'recip-1', 'oi', 'tok-1');
    expect(result).toEqual({ message_id: 'm-raw' });
  });

  it('flag ON + canonical service NOT injected: uses the raw path', async () => {
    process.env[FLAG] = 'true';
    sendMessage.mockResolvedValueOnce({ message_id: 'm-raw' });
    const controller = new InstagramController(
      { sendMessage } as unknown as InstagramService,
      makeMetaWhatsApp(),
    );

    const result = await controller.sendMessage(req, body);

    expect(sendMessage).toHaveBeenCalledWith('ig-1', 'recip-1', 'oi', 'tok-1');
    expect(result).toEqual({ message_id: 'm-raw' });
  });
});
