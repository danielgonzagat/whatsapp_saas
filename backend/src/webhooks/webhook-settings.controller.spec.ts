import { WebhookSettingsController } from './webhook-settings.controller';

describe('WebhookSettingsController', () => {
  let prisma: any;
  let auditService: any;
  let controller: WebhookSettingsController;

  beforeEach(() => {
    process.env.ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    prisma = {
      webhookSubscription: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    controller = new WebhookSettingsController(prisma, auditService);
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it('masks secrets when listing subscriptions', async () => {
    prisma.webhookSubscription.findMany.mockResolvedValue([
      {
        id: 'hook-1',
        url: 'https://example.com/hook',
        events: ['sale.created'],
        secret: 'raw-webhook-secret',
        workspaceId: 'ws-1',
      },
    ]);

    await expect(controller.list({ user: { workspaceId: 'ws-1' } })).resolves.toEqual([
      {
        id: 'hook-1',
        url: 'https://example.com/hook',
        events: ['sale.created'],
        workspaceId: 'ws-1',
        hasSecret: true,
        secretPreview: '****cret',
      },
    ]);
  });

  it('returns the raw secret only on first create and masks idempotent retries', async () => {
    prisma.webhookSubscription.findFirst.mockResolvedValue({
      id: 'hook-1',
      url: 'https://example.com/hook',
      events: ['sale.created'],
      secret: 'existing-secret',
      workspaceId: 'ws-1',
    });
    prisma.webhookSubscription.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'hook-new',
      ...data,
    }));

    const created = (await controller.create(
      { user: { workspaceId: 'ws-1' } },
      { url: 'https://example.com/hook', events: ['sale.created'] },
      undefined,
    )) as any;

    expect(created.secret).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(created.secretPreview).toMatch(/^\*{4}[a-f0-9]{4}$/i);
    expect(prisma.webhookSubscription.create.mock.calls[0][0].data.secret).not.toBe(created.secret);

    await expect(
      controller.create(
        { user: { workspaceId: 'ws-1' } },
        { url: 'https://example.com/hook', events: ['sale.created'] },
        'idem-1',
      ),
    ).resolves.toEqual({
      id: 'hook-1',
      url: 'https://example.com/hook',
      events: ['sale.created'],
      workspaceId: 'ws-1',
      hasSecret: true,
      secretPreview: '****cret',
    });
  });
});
