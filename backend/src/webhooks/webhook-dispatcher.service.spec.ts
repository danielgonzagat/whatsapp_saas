const mockWebhookQueueAdd = jest.fn();

jest.mock('../queue/queue', () => ({
  webhookQueue: { add: (...args: unknown[]) => mockWebhookQueueAdd(...args) },
}));

import { correlationStore } from '../common/observability/correlation-store';
import { WebhookDispatcherService } from './webhook-dispatcher.service';

describe('WebhookDispatcherService', () => {
  let service: WebhookDispatcherService;
  let prisma: {
    webhookSubscription: { findMany: jest.Mock };
  };

  beforeEach(() => {
    mockWebhookQueueAdd.mockReset().mockResolvedValue({ id: 'job-1' });
    prisma = {
      webhookSubscription: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'sub-1',
            url: 'https://example.com/hook',
            secret: 'secret-1',
            events: ['order.paid'],
          },
        ]),
      },
    };
    service = new WebhookDispatcherService(prisma as never);
  });

  it('propagates the current request correlation id into outbound webhook jobs', async () => {
    await correlationStore.run(
      { correlationId: 'corr-dispatch-1', requestId: 'corr-dispatch-1' },
      async () => {
        await service.dispatch('ws-1', 'order.paid', { orderId: 'order-1' });
      },
    );

    expect(prisma.webhookSubscription.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: 'ws-1', events: { has: 'order.paid' } }),
      }),
    );
    expect(mockWebhookQueueAdd).toHaveBeenCalledWith(
      'send-webhook',
      expect.objectContaining({
        url: 'https://example.com/hook',
        secret: 'secret-1',
        event: 'order.paid',
        payload: { orderId: 'order-1' },
        correlationId: 'corr-dispatch-1',
      }),
      expect.objectContaining({
        attempts: 5,
        backoff: { type: 'exponential', delay: 5000 },
      }),
    );
  });
});
