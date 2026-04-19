import { MarketingController } from './marketing.controller';

describe('MarketingController', () => {
  let prisma: any;
  let metaWhatsApp: any;
  let whatsappProviders: any;
  let controller: MarketingController;

  beforeEach(() => {
    prisma = {
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          providerSettings: {
            whatsappProvider: 'whatsapp-api',
            whatsappApiSession: {
              status: 'scan_qr_code',
              sessionName: 'ws-1',
            },
            email: { enabled: false },
          },
          name: 'Workspace Teste',
        }),
      },
      metaConnection: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    metaWhatsApp = {
      buildEmbeddedSignupUrl: jest.fn().mockReturnValue('https://meta.test/signup'),
    };

    whatsappProviders = {
      getProviderType: jest.fn().mockResolvedValue('whatsapp-api'),
      getSessionStatus: jest.fn().mockResolvedValue({
        connected: false,
        status: 'SCAN_QR_CODE',
        phoneNumber: null,
        pushName: null,
      }),
    };

    controller = new MarketingController(prisma, metaWhatsApp, whatsappProviders);
  });

  it('returns legacy-runtime WhatsApp status without leaking Meta authUrl into the legacy flow', async () => {
    const result = await controller.getConnectStatus({
      user: { workspaceId: 'ws-1' },
    } as any);

    expect(result.channels.whatsapp).toEqual({
      provider: 'legacy-runtime',
      connected: false,
      status: 'connecting',
      authUrl: null,
      phoneNumberId: null,
      whatsappBusinessId: null,
      phoneNumber: null,
      pushName: null,
      degradedReason: null,
    });
  });

  it('normalizes empty Meta auth URLs to null for disconnected social channels', async () => {
    metaWhatsApp.buildEmbeddedSignupUrl.mockReturnValue('');

    const result = await controller.getConnectStatus({
      user: { workspaceId: 'ws-1' },
    } as any);

    expect(result.channels.instagram.authUrl).toBeNull();
    expect(result.channels.facebook.authUrl).toBeNull();
  });
});
