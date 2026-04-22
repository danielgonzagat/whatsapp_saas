import type { PrismaService } from '../prisma/prisma.service';
import type { MetaWhatsAppService } from '../meta/meta-whatsapp.service';
import type { WhatsAppProviderRegistry } from '../whatsapp/providers/provider-registry';
import { MarketingController } from './marketing.controller';

type MarketingPrismaMock = {
  workspace: {
    findUnique: jest.Mock;
  };
  metaConnection: {
    findUnique: jest.Mock;
  };
};

type MarketingRequest = {
  user: {
    workspaceId: string;
  };
};

describe('MarketingController', () => {
  let prisma: MarketingPrismaMock;
  let metaWhatsApp: {
    buildEmbeddedSignupUrl: jest.Mock;
  };
  let whatsappProviders: {
    getProviderType: jest.Mock;
    getSessionStatus: jest.Mock;
  };
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

    controller = new MarketingController(
      prisma as unknown as PrismaService,
      metaWhatsApp as unknown as MetaWhatsAppService,
      whatsappProviders as unknown as WhatsAppProviderRegistry,
    );
  });

  it('returns WAHA-driven WhatsApp status without leaking Meta authUrl into the QR flow', async () => {
    const request: MarketingRequest = {
      user: { workspaceId: 'ws-1' },
    };

    const result = await controller.getConnectStatus(request);

    expect(result.channels.whatsapp).toEqual({
      provider: 'whatsapp-api',
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
});
