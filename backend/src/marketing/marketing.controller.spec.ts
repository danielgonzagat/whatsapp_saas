import type { PrismaService } from '../prisma/prisma.service';
import { MarketingConnectController } from './marketing-connect.controller';

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

const mockTikTokStatus = {
  connected: false,
  status: 'disconnected',
  kind: null,
  openId: null,
  advertiserIds: [],
  expiresAt: null,
  expired: false,
  clientConfigured: false,
  secretConfigured: false,
  configReady: false,
};

describe('MarketingConnectController', () => {
  let prisma: MarketingPrismaMock;
  let metaWhatsApp: {
    buildEmbeddedSignupUrl: jest.Mock;
  };
  let whatsappProviders: {
    getProviderType: jest.Mock;
    getSessionStatus: jest.Mock;
  };
  let tiktokMarketing: {
    getStatus: jest.Mock;
  };
  let controller: MarketingConnectController;

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

    tiktokMarketing = {
      getStatus: jest.fn().mockResolvedValue(mockTikTokStatus),
    };

    controller = new MarketingConnectController(
      prisma as never as PrismaService,
      metaWhatsApp as never,
      whatsappProviders as never,
      tiktokMarketing as never,
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

  it('includes TikTok channel in the aggregate connect status', async () => {
    const expiresAt = new Date(Date.now() + 86400000).toISOString();
    tiktokMarketing.getStatus.mockResolvedValue({
      connected: true,
      status: 'connected',
      kind: 'creator',
      openId: 'op-123',
      advertiserIds: ['ad-456'],
      expiresAt,
      expired: false,
      clientConfigured: true,
      secretConfigured: true,
      configReady: true,
    });

    const request: MarketingRequest = {
      user: { workspaceId: 'ws-1' },
    };

    const result = await controller.getConnectStatus(request);

    expect(result.channels.tiktok).toEqual({
      connected: true,
      status: 'connected',
      kind: 'creator',
      openId: 'op-123',
      advertiserIds: ['ad-456'],
      expiresAt,
      expired: false,
      clientConfigured: true,
      secretConfigured: true,
      configReady: true,
    });
  });

  it('exposes email status without leaking provider secrets', async () => {
    const result = await controller.getEmailStatus({ user: { workspaceId: 'ws-1' } });

    expect(typeof result.connected).toBe('boolean');
    expect(typeof result.status).toBe('string');
    expect(typeof result.enabled).toBe('boolean');
    expect(typeof result.provider).toBe('string');
    expect(typeof result.providerAvailable).toBe('boolean');
    expect(typeof result.fromEmail).toBe('string');
    expect(typeof result.fromName).toBe('string');
    expect(typeof result.workspaceName).toBe('string');
    expect(result).not.toHaveProperty('apiKey');
    expect(result).not.toHaveProperty('secret');
  });

  it('exposes TikTok connect status without leaking secrets', async () => {
    const request: MarketingRequest = {
      user: { workspaceId: 'ws-1' },
    };
    const result = await controller.getConnectStatus(request);

    expect(result.channels.tiktok).toBeDefined();
    const tiktok = result.channels.tiktok;
    expect(tiktok).toHaveProperty('connected');
    expect(tiktok).toHaveProperty('configReady');
    expect(tiktok).not.toHaveProperty('accessToken');
    expect(tiktok).not.toHaveProperty('refreshToken');
    expect(tiktok).not.toHaveProperty('clientKey');
    expect(tiktok).not.toHaveProperty('clientSecret');
  });
});
