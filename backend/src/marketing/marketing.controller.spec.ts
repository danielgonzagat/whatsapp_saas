import type { PrismaService } from '../prisma/prisma.service';
import { MarketingConnectController } from './marketing-connect.controller';

type MarketingPrismaMock = {
  workspace: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  metaConnection: {
    findUnique: jest.Mock;
  };
  channelConfig: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
  };
  $transaction: jest.Mock;
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
  let emailCampaign: {
    sendSingleEmail: jest.Mock;
  };
  let controller: MarketingConnectController;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.ENCRYPTION_KEY;
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
        update: jest.fn().mockResolvedValue({}),
      },
      metaConnection: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      channelConfig: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest
        .fn()
        .mockImplementation(async (queries: unknown[]) => Promise.all(queries)),
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
    emailCampaign = {
      sendSingleEmail: jest.fn().mockResolvedValue(true),
    };

    controller = new MarketingConnectController(
      prisma as never as PrismaService,
      metaWhatsApp as never,
      whatsappProviders as never,
      tiktokMarketing as never,
      emailCampaign as never,
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
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

  it('stores per-workspace email provider credentials encrypted in ChannelConfig', async () => {
    process.env.ENCRYPTION_KEY = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

    await controller.connectEmail(
      { user: { workspaceId: 'ws-1' } },
      {
        enabled: true,
        provider: 'resend',
        fromEmail: 'vendas@example.com',
        fromName: 'Vendas Example',
        apiKey: 're_workspace_secret',
      },
    );

    expect(prisma.channelConfig.upsert).toHaveBeenCalledTimes(1);
    const call = prisma.channelConfig.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ workspaceId_channel: { workspaceId: 'ws-1', channel: 'email' } });
    expect(call.create.transferCriteria.emailDelivery).toEqual(
      expect.objectContaining({
        provider: 'resend',
        fromEmail: 'vendas@example.com',
        fromName: 'Vendas Example',
      }),
    );
    expect(call.create.transferCriteria.emailDelivery.apiKeyEncrypted).not.toBe(
      're_workspace_secret',
    );
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
