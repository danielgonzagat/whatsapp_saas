import { ChannelInboundHookService } from './channel-inbound-hook.service';
import type { NormalizedMessage } from '../inbox/omnichannel.helpers';

describe('ChannelInboundHookService', () => {
  const msg: NormalizedMessage = {
    workspaceId: 'ws-1',
    channel: 'INSTAGRAM',
    externalId: 'ig-msg-1',
    from: 'lead-1',
    content: 'Tenho uma duvida sobre o produto',
  };

  it('records a durable commercial event before processing inbound MIND perception', async () => {
    const mindEvents = {
      process: jest.fn().mockResolvedValue({
        predicted: 1,
        resolved: 0,
        surpriseTotal: 0.25,
        beliefsUpdated: 1,
      }),
    };
    const eventSpine = { recordCommercial: jest.fn().mockResolvedValue('event-1') };
    const service = new ChannelInboundHookService(mindEvents as never, eventSpine as never);

    await service.onMessageReceived(msg, 'contact-1', 'message-1');

    expect(eventSpine.recordCommercial).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        contactId: 'contact-1',
        subject: 'contact:contact-1',
        eventType: 'message.received',
        idempotencyKey: 'message.received:ws-1:message-1',
        payload: expect.objectContaining({
          channel: 'instagram',
          direction: 'INBOUND',
          messageId: 'message-1',
        }),
      }),
    );
    expect(mindEvents.process).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        kind: 'message.received',
        subject: 'contact:contact-1',
      }),
    );
  });

  it('retries transient MIND processing failures after the durable event is recorded', async () => {
    const mindEvents = {
      process: jest.fn().mockRejectedValueOnce(new Error('transient')).mockResolvedValueOnce({
        predicted: 1,
        resolved: 0,
        surpriseTotal: 0,
        beliefsUpdated: 0,
      }),
    };
    const eventSpine = { recordCommercial: jest.fn().mockResolvedValue('event-1') };
    const service = new ChannelInboundHookService(mindEvents as never, eventSpine as never);

    await service.onMessageReceived(msg, 'contact-1', 'message-1');

    expect(eventSpine.recordCommercial).toHaveBeenCalledTimes(1);
    expect(mindEvents.process).toHaveBeenCalledTimes(2);
  });

  it('records the durable event even when the immediate processor is unavailable', async () => {
    const eventSpine = { recordCommercial: jest.fn().mockResolvedValue('event-1') };
    const service = new ChannelInboundHookService(undefined, eventSpine as never);

    await service.onMessageReceived(msg, 'contact-1', 'message-1');

    expect(eventSpine.recordCommercial).toHaveBeenCalledTimes(1);
  });
});
