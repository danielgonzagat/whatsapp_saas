import { MetaWhatsAppService } from './meta-whatsapp.service';

describe('MetaWhatsAppService', () => {
  let prisma: any;
  let metaSdk: { graphApiGet: jest.Mock };
  let service: MetaWhatsAppService;

  beforeEach(() => {
    prisma = {
      metaConnection: {
        findUnique: jest.fn(),
      },
      workspace: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
      },
    };
    metaSdk = {
      graphApiGet: jest.fn(),
    };

    service = new MetaWhatsAppService(prisma, metaSdk as any);
  });

  it('falls back to connected when webhook heartbeat sees malformed persisted status', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        whatsappApiSession: {
          status: { broken: true },
          phoneNumber: '5511999999999',
        },
      },
    });

    await service.touchWebhookHeartbeat('ws-1');

    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws-1' },
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            connectionStatus: 'connected',
            whatsappApiSession: expect.objectContaining({
              phoneNumber: '5511999999999',
              provider: 'meta-cloud',
              lastWebhookAt: expect.any(String),
            }),
          }),
        }),
      }),
    );
  });

  it('ignores malformed heartbeat patches instead of persisting object status values', async () => {
    prisma.workspace.findUnique.mockResolvedValue({
      providerSettings: {
        whatsappApiSession: {
          status: 'connected',
        },
      },
    });

    await service.touchWebhookHeartbeat('ws-1', {
      status: { broken: true },
      phoneNumber: '5511888888888',
    });

    expect(prisma.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerSettings: expect.objectContaining({
            connectionStatus: 'connected',
            whatsappApiSession: expect.objectContaining({
              status: 'connected',
              phoneNumber: '5511888888888',
            }),
          }),
        }),
      }),
    );
  });

  it('ignores malformed Meta phone details instead of stringifying objects', async () => {
    prisma.metaConnection.findUnique.mockResolvedValue({
      accessToken: 'meta-token',
      tokenExpiresAt: null,
      pageId: 'page-1',
      pageName: 'Pagina Teste',
      pageAccessToken: null,
      instagramAccountId: null,
      instagramUsername: null,
      whatsappPhoneNumberId: 'pnid-1',
      whatsappBusinessId: 'waba-1',
    });
    metaSdk.graphApiGet.mockResolvedValue({
      display_phone_number: { broken: true },
      verified_name: { broken: true },
    });

    const result = await service.getPhoneNumberDetails('ws-1');

    expect(result).toEqual(
      expect.objectContaining({
        connected: true,
        status: 'CONNECTED',
        phoneNumber: null,
        pushName: 'Pagina Teste',
        selfIds: [],
      }),
    );
  });

  it('discovers the first real WhatsApp asset across nested business data', async () => {
    metaSdk.graphApiGet.mockResolvedValue({
      data: [
        {
          id: 'business-empty',
          name: 'Sem WABA',
          owned_whatsapp_business_accounts: { data: [] },
        },
        {
          id: 'business-real',
          name: 'Kloel CIA',
          owned_whatsapp_business_accounts: {
            data: [
              {
                id: 'waba-test',
                name: 'Test WhatsApp Business Account',
                phone_numbers: {
                  data: [
                    {
                      id: 'pnid-test',
                      display_phone_number: '+1 555-634-5954',
                      verified_name: 'Test Number',
                    },
                  ],
                },
              },
              {
                id: 'waba-real',
                name: 'atendimento',
                phone_numbers: {
                  data: [
                    {
                      id: 'pnid-real',
                      display_phone_number: '+55 62 8294-4223',
                      verified_name: 'atendimento',
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    });

    const result = await service.discoverWhatsAppAssets('user-token');

    expect(result).toEqual({
      whatsappBusinessId: 'waba-real',
      whatsappPhoneNumberId: 'pnid-real',
      displayPhoneNumber: '+55 62 8294-4223',
      verifiedName: 'atendimento',
    });
  });
});
