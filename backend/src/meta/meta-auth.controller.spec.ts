import { MetaAuthController } from './meta-auth.controller';

type MetaSdkMock = {
  exchangeToken: jest.Mock;
  graphApiGet: jest.Mock;
  graphApiPost: jest.Mock;
  graphApiDelete: jest.Mock;
};

type MetaWhatsAppMock = {
  getOAuthRedirectUri: jest.Mock;
  discoverWhatsAppAssets: jest.Mock;
};

type PrismaMock = {
  metaConnection: {
    upsert: jest.Mock;
    findUnique: jest.Mock;
    delete: jest.Mock;
  };
};

describe('MetaAuthController', () => {
  let metaSdk: MetaSdkMock;
  let metaWhatsApp: MetaWhatsAppMock;
  let prisma: PrismaMock;
  let controller: MetaAuthController;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://www.kloel.com';
    process.env.META_APP_ID = 'meta-app-id';
    process.env.META_APP_SECRET = 'meta-app-secret';

    metaSdk = {
      exchangeToken: jest.fn(),
      graphApiGet: jest.fn(),
      graphApiPost: jest.fn(),
      graphApiDelete: jest.fn(),
    };
    metaWhatsApp = {
      getOAuthRedirectUri: jest.fn().mockReturnValue('https://api.kloel.com/meta/auth/callback'),
      discoverWhatsAppAssets: jest.fn().mockResolvedValue({
        whatsappPhoneNumberId: 'pnid-1',
        whatsappBusinessId: 'waba-1',
      }),
    };
    prisma = {
      metaConnection: {
        upsert: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };

    controller = new MetaAuthController(
      metaSdk as unknown as ConstructorParameters<typeof MetaAuthController>[0],
      metaWhatsApp as unknown as ConstructorParameters<typeof MetaAuthController>[1],
      prisma as unknown as ConstructorParameters<typeof MetaAuthController>[2],
    );
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({ access_token: 'short-lived-token' }),
    } as Response);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('subscribes the connected page to webhook fields during the official callback', async () => {
    metaSdk.exchangeToken.mockResolvedValue({
      access_token: 'long-lived-token',
      expires_in: 3600,
    });
    metaSdk.graphApiGet
      .mockResolvedValueOnce({
        data: [
          {
            id: 'page-1',
            name: 'Pagina Oficial',
            access_token: 'page-token',
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [{ id: 'act_1', name: 'Conta de Anuncio' }],
      });
    metaSdk.graphApiPost.mockResolvedValue({ success: true });

    const res = {
      redirect: jest.fn(),
    } as unknown as Parameters<MetaAuthController['handleCallback']>[2];

    await controller.handleCallback(
      'oauth-code',
      JSON.stringify({
        workspaceId: 'ws-1',
        channel: 'facebook',
        returnTo: '/marketing/facebook',
      }),
      res,
    );

    expect(metaSdk.graphApiPost).toHaveBeenCalledWith(
      'page-1/subscribed_apps',
      {
        subscribed_fields: 'messages,messaging_postbacks,message_reads,message_deliveries',
      },
      'page-token',
    );
    expect(prisma.metaConnection.upsert).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      'https://www.kloel.com/marketing/facebook?meta=success',
    );
  });

  it('surfaces page webhook subscription failures instead of storing a fake green connection', async () => {
    metaSdk.exchangeToken.mockResolvedValue({
      access_token: 'long-lived-token',
      expires_in: 3600,
    });
    metaSdk.graphApiGet
      .mockResolvedValueOnce({
        data: [
          {
            id: 'page-1',
            name: 'Pagina Oficial',
            access_token: 'page-token',
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [{ id: 'act_1', name: 'Conta de Anuncio' }],
      });
    metaSdk.graphApiPost.mockResolvedValue({ success: false });

    const res = {
      redirect: jest.fn(),
    } as unknown as Parameters<MetaAuthController['handleCallback']>[2];

    await controller.handleCallback(
      'oauth-code',
      JSON.stringify({
        workspaceId: 'ws-1',
        channel: 'facebook',
        returnTo: '/marketing/facebook',
      }),
      res,
    );

    expect(prisma.metaConnection.upsert).not.toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith(
      'https://www.kloel.com/marketing/facebook?meta=error&reason=page_subscription_failed',
    );
  });
});
