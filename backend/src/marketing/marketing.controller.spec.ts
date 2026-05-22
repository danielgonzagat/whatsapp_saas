import { MarketingConnectController } from './marketing-connect.controller';

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
  let metaConnect: {
    getStatus: jest.Mock;
  };
  let emailConnect: {
    connect: jest.Mock;
    disconnect: jest.Mock;
    getStatus: jest.Mock;
    sendTest: jest.Mock;
  };
  let channelSetup: {
    completeSetup: jest.Mock;
    getSetup: jest.Mock;
    saveSetup: jest.Mock;
  };
  let whatsappSummary: {
    getSummary: jest.Mock;
  };
  let tiktokMarketing: {
    getStatus: jest.Mock;
  };
  let tiktokMode: {
    resolveMode: jest.Mock;
  };
  let gmailMailbox: { getPrimaryGmailStatus: jest.Mock };
  let microsoftMailbox: { getPrimaryMicrosoftStatus: jest.Mock };
  let imapSmtpMailbox: { getPrimaryImapSmtpStatus: jest.Mock };
  let controller: MarketingConnectController;

  beforeEach(() => {
    const whatsappStatus = {
      provider: 'whatsapp-api',
      connected: false,
      status: 'connecting',
      authUrl: null,
      phoneNumberId: null,
      whatsappBusinessId: null,
      phoneNumber: null,
      pushName: null,
      degradedReason: null,
    };

    metaConnect = {
      getStatus: jest.fn().mockResolvedValue({
        meta: { connected: false, authUrl: 'https://meta.test/signup' },
        whatsapp: whatsappStatus,
        instagram: { connected: false, status: 'disconnected' },
        facebook: { connected: false, status: 'disconnected' },
      }),
    };

    emailConnect = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      sendTest: jest.fn().mockResolvedValue({ success: true }),
      getStatus: jest.fn().mockResolvedValue({
        connected: false,
        status: 'disconnected',
        enabled: false,
        provider: 'log',
        providerAvailable: false,
        fromEmail: 'noreply@kloel.com',
        fromName: 'KLOEL',
        workspaceName: 'Workspace Teste',
      }),
    };

    channelSetup = {
      completeSetup: jest.fn(),
      getSetup: jest.fn(),
      saveSetup: jest.fn(),
    };
    whatsappSummary = { getSummary: jest.fn() };
    tiktokMode = { resolveMode: jest.fn() };
    gmailMailbox = { getPrimaryGmailStatus: jest.fn().mockResolvedValue(null) };
    microsoftMailbox = { getPrimaryMicrosoftStatus: jest.fn().mockResolvedValue(null) };
    imapSmtpMailbox = { getPrimaryImapSmtpStatus: jest.fn().mockResolvedValue(null) };

    tiktokMarketing = {
      getStatus: jest.fn().mockResolvedValue(mockTikTokStatus),
    };

    controller = new MarketingConnectController(
      metaConnect as never,
      emailConnect as never,
      channelSetup as never,
      whatsappSummary as never,
      tiktokMarketing as never,
      tiktokMode as never,
      gmailMailbox as never,
      microsoftMailbox as never,
      imapSmtpMailbox as never,
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

  it('delegates per-workspace email enablement to EmailConnectService', async () => {
    await controller.connectEmail({ user: { workspaceId: 'ws-1' } }, { enabled: true });

    expect(emailConnect.connect).toHaveBeenCalledWith('ws-1', true);
    expect(metaConnect.getStatus).toHaveBeenCalledWith('ws-1');
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
