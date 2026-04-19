import { encryptString } from '../lib/crypto';

const add = jest.fn();

jest.mock('../queue/queue', () => ({
  webhookQueue: {
    add: (...args: unknown[]) => add(...args),
  },
}));

import { WebhookDispatcherService } from './webhook-dispatcher.service';

describe('WebhookDispatcherService', () => {
  let prisma: any;
  let service: WebhookDispatcherService;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    prisma = {
      webhookSubscription: {
        findMany: jest.fn(),
      },
    };
    add.mockReset();
    service = new WebhookDispatcherService(prisma);
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('decrypts stored webhook secrets before enqueuing delivery jobs', async () => {
    prisma.webhookSubscription.findMany.mockResolvedValue([
      {
        id: 'hook-1',
        url: 'https://example.com/hook',
        secret: encryptString('raw-webhook-secret', process.env.ENCRYPTION_KEY!),
        events: ['sale.created'],
      },
    ]);

    await service.dispatch('ws-1', 'sale.created', { saleId: 'sale-1' });

    expect(add).toHaveBeenCalledWith(
      'send-webhook',
      expect.objectContaining({
        url: 'https://example.com/hook',
        secret: 'raw-webhook-secret',
        event: 'sale.created',
        payload: { saleId: 'sale-1' },
      }),
      expect.objectContaining({
        attempts: 5,
      }),
    );
  });
});
