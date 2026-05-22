import { BadRequestException } from '@nestjs/common';
import { MarketingConnectController } from './marketing-connect.controller';
import { MetaConnectService } from './marketing-connect/meta-connect.service';
import { EmailConnectService } from './marketing-connect/email-connect.service';
import { ChannelSetupService } from './marketing-connect/channel-setup.service';
import { WhatsAppSummaryService } from './marketing-connect/whatsapp-summary.service';
describe('MarketingConnectController channel setup', () => {
  const metaConnect = {
    getStatus: jest.fn(async () => ({
      meta: {
        connected: true,
        tokenExpired: false,
        pageId: 'page_1',
        pageName: 'Kloel Page',
        instagramUsername: 'kloel_ig',
        updatedAt: '2026-05-11T12:00:00.000Z',
      },
      whatsapp: {
        provider: 'meta-cloud',
        connected: false,
        status: 'disconnected',
        authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
        phoneNumberId: null,
        whatsappBusinessId: null,
        phoneNumber: null,
        pushName: null,
        degradedReason: 'not connected',
      },
      instagram: {
        connected: false,
        status: 'disconnected',
        authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
        instagramAccountId: null,
        username: null,
        pageName: null,
      },
      facebook: {
        connected: false,
        status: 'disconnected',
        authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
        pageId: null,
        pageName: null,
      },
    })),
  };
  const emailConnect = {
    getStatus: jest.fn(async () => ({
      connected: false,
      status: 'unavailable',
      enabled: false,
      provider: 'log',
      providerAvailable: false,
      fromEmail: 'noreply@kloel.com',
      fromName: 'KLOEL',
      mailboxConnectionId: null,
      mailboxProvider: null,
      mailboxStatus: null,
      lastSyncAt: null,
      lastErrorAt: null,
      lastError: null,
      workspaceName: 'Workspace Teste',
    })),
    connect: jest.fn(async () => undefined),
    disconnect: jest.fn(async () => undefined),
    sendTest: jest.fn(async () => ({
      success: true,
      workspaceId: 'ws_1',
      toEmail: 'owner@kloel.test',
      provider: 'resend',
    })),
  };
  const channelSetup = {
    getSetup: jest.fn(),
    saveSetup: jest.fn(),
    completeSetup: jest.fn(),
  };
  const whatsappSummary = {
    getSummary: jest.fn(),
  };
  const tiktokMarketing = {
    getConnectionStatus: jest.fn(async () => ({ connected: false })),
    getStatus: jest.fn(async () => ({ connected: false, status: 'disconnected' })),
  };
  const tiktokMode = {
    resolveMode: jest.fn(async () => ({
      mode: 'listen',
      details: {
        clientConfigured: true,
        secretConfigured: true,
        outboundApproved: false,
        tokenValid: true,
        recentOutbound: false,
        missingVariables: [],
        requiredSteps: [],
      },
    })),
  };
  const gmailMailbox = {
    buildAuthUrl: jest.fn(() => ({
      provider: 'gmail',
      status: 'pending_oauth',
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    })),
    completeOAuth: jest.fn(async () => ({
      connected: true,
      provider: 'gmail',
      status: 'connected',
      email: 'owner@kloel.test',
    })),
    syncLatestInbox: jest.fn(async () => ({
      provider: 'gmail',
      status: 'synced',
      imported: 1,
    })),
    sendMessageFromMailbox: jest.fn(async () => ({
      provider: 'gmail',
      status: 'sent',
      sent: true,
      messageId: 'gmail-send-1',
    })),
  };
  const microsoftMailbox = {
    buildAuthUrl: jest.fn(() => ({
      provider: 'microsoft',
      status: 'pending_oauth',
      authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    })),
    completeOAuth: jest.fn(async () => ({
      connected: true,
      provider: 'microsoft',
      status: 'connected',
      email: 'owner@kloel.test',
    })),
  };
  const imapSmtpMailbox = {
    connectMailbox: jest.fn(async () => ({
      connected: true,
      provider: 'imap_smtp',
      status: 'connected',
      email: 'owner@kloel.test',
    })),
  };
  const controller = new MarketingConnectController(
    metaConnect as MetaConnectService,
    emailConnect as EmailConnectService,
    channelSetup as ChannelSetupService,
    whatsappSummary as WhatsAppSummaryService,
    tiktokMarketing as never,
    tiktokMode as never,
    gmailMailbox as never,
    microsoftMailbox as never,
    imapSmtpMailbox as never,
  );
  const req = { user: { workspaceId: 'ws_1', email: 'owner@kloel.test' } };
  beforeEach(() => {
    jest.clearAllMocks();
  });
  it('persists a four-step setup under the selected channel key', async () => {
    channelSetup.saveSetup.mockResolvedValueOnce({
      channel: 'email',
      setup: {
        currentStep: 3,
        selectedProductIds: ['prod_1', 'prod_2'],
        arsenal: ['FAQ principal', 'Garantia de 7 dias'],
        config: {
          tone: 'consultivo',
          aggressiveness: 'moderado',
          followUpEnabled: true,
          proactiveDailyLimit: 25,
        },
        updatedAt: '2026-05-11T12:00:00.000Z',
      },
    });
    const result = await controller.saveChannelSetup(req, {
      channel: 'email',
      currentStep: 3,
      selectedProductIds: ['prod_1', 'prod_2', ''],
      arsenal: ['FAQ principal', 'Garantia de 7 dias'],
      config: {
        tone: 'consultivo',
        aggressiveness: 'moderado',
        followUpEnabled: true,
        proactiveDailyLimit: 25,
      },
    });
    expect(result.channel).toBe('email');
    expect(result.setup.currentStep).toBe(3);
    expect(result.setup.selectedProductIds).toEqual(['prod_1', 'prod_2']);
    expect(result.setup.arsenal).toEqual(['FAQ principal', 'Garantia de 7 dias']);
    expect(result.setup.config).toMatchObject({
      tone: 'consultivo',
      aggressiveness: 'moderado',
      followUpEnabled: true,
      proactiveDailyLimit: 25,
    });
    expect(channelSetup.saveSetup).toHaveBeenCalledWith(
      'ws_1',
      expect.objectContaining({
        channel: 'email',
        currentStep: 3,
      }),
    );
  });
  it('returns default setup when the channel has no persisted setup', async () => {
    channelSetup.getSetup.mockResolvedValueOnce({
      channel: 'instagram',
      setup: {
        currentStep: 0,
        selectedProductIds: [],
        arsenal: [],
        config: {},
      },
      completedAt: null,
    });
    const result = await controller.getChannelSetup(req, 'instagram');
    expect(result).toEqual({
      channel: 'instagram',
      setup: {
        currentStep: 0,
        selectedProductIds: [],
        arsenal: [],
        config: {},
      },
      completedAt: null,
    });
  });

  it('rejects invalid channel names', async () => {
    channelSetup.getSetup.mockRejectedValueOnce(
      new BadRequestException('invalid_marketing_channel'),
    );

    await expect(controller.getChannelSetup(req, 'sms')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns Gmail mailbox auth URL for the authenticated workspace', () => {
    const result = controller.getGmailAuthUrl(req, '/marketing/email');

    expect(gmailMailbox.buildAuthUrl).toHaveBeenCalledWith('ws_1', '/marketing/email');
    expect(result.provider).toBe('gmail');
    expect(result.status).toBe('pending_oauth');
    expect(result.authUrl).toContain('accounts.google.com');
  });

  it('completes Gmail OAuth through encrypted mailbox storage service', async () => {
    const result = await controller.completeGmailOAuth(req, {
      code: 'auth-code',
      state: 'signed-state',
    });

    expect(gmailMailbox.completeOAuth).toHaveBeenCalledWith('ws_1', 'auth-code', 'signed-state');
    expect(result).toEqual(expect.objectContaining({ connected: true, provider: 'gmail' }));
  });

  it('returns Microsoft mailbox auth URL for the authenticated workspace', () => {
    const result = controller.getMicrosoftAuthUrl(req, '/marketing/email');

    expect(microsoftMailbox.buildAuthUrl).toHaveBeenCalledWith('ws_1', '/marketing/email');
    expect(result.provider).toBe('microsoft');
    expect(result.status).toBe('pending_oauth');
    expect(result.authUrl).toContain('login.microsoftonline.com');
  });

  it('completes Microsoft OAuth through encrypted mailbox storage service', async () => {
    const result = await controller.completeMicrosoftOAuth(req, {
      code: 'auth-code',
      state: 'signed-state',
    });

    expect(microsoftMailbox.completeOAuth).toHaveBeenCalledWith(
      'ws_1',
      'auth-code',
      'signed-state',
    );
    expect(result).toEqual(expect.objectContaining({ connected: true, provider: 'microsoft' }));
  });

  it('uses Microsoft mailbox status in the Email channel overlay when connected', async () => {
    metaConnect.getStatus.mockResolvedValueOnce({
      meta: {
        connected: false,
        tokenExpired: false,
        pageId: null,
        pageName: null,
        instagramUsername: null,
        updatedAt: null,
      },
      whatsapp: {
        provider: 'meta-cloud',
        connected: false,
        status: 'disconnected',
        authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
        phoneNumberId: null,
        whatsappBusinessId: null,
        phoneNumber: null,
        pushName: null,
        degradedReason: null,
      },
      instagram: {
        connected: false,
        status: 'disconnected',
        authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
        instagramAccountId: null,
        username: null,
        pageName: null,
      },
      facebook: {
        connected: false,
        status: 'disconnected',
        authUrl: 'https://www.facebook.com/v21.0/dialog/oauth',
        pageId: null,
        pageName: null,
      },
    });
    emailConnect.getStatus.mockResolvedValueOnce({
      connected: true,
      status: 'connected',
      enabled: false,
      provider: 'microsoft',
      providerAvailable: true,
      fromEmail: 'owner@kloel.test',
      fromName: 'KLOEL',
      mailboxConnectionId: 'mailbox-ms-1',
      mailboxProvider: 'MICROSOFT',
      mailboxStatus: 'ACTIVE',
      lastSyncAt: '2026-05-11T12:05:00.000Z',
      lastErrorAt: null,
      lastError: null,
      workspaceName: 'Workspace Teste',
    });

    const result = await controller.getConnectStatus(req);

    expect(result.channels.email).toEqual(
      expect.objectContaining({
        connected: true,
        status: 'connected',
        provider: 'microsoft',
        fromEmail: 'owner@kloel.test',
        mailboxConnectionId: 'mailbox-ms-1',
        mailboxProvider: 'MICROSOFT',
        mailboxStatus: 'ACTIVE',
      }),
    );
  });

  it('connects IMAP+SMTP mailbox credentials through the mailbox service', async () => {
    const body = {
      email: 'owner@kloel.test',
      imapHost: 'imap.kloel.test',
      imapPassword: 'imap-password',
      smtpHost: 'smtp.kloel.test',
      smtpPassword: 'smtp-password',
    };

    const result = await controller.connectImapSmtpMailbox(req, body);

    expect(imapSmtpMailbox.connectMailbox).toHaveBeenCalledWith('ws_1', body);
    expect(result).toEqual(expect.objectContaining({ connected: true, provider: 'imap_smtp' }));
  });

  it('triggers Gmail mailbox sync for the authenticated workspace', async () => {
    const result = await controller.syncGmailMailbox(req, { limit: 5 });

    expect(gmailMailbox.syncLatestInbox).toHaveBeenCalledWith('ws_1', 5);
    expect(result).toEqual(expect.objectContaining({ status: 'synced', imported: 1 }));
  });

  it('sends a Gmail mailbox test message from the connected customer mailbox', async () => {
    const result = await controller.sendGmailMailboxTest(req, {
      toEmail: 'lead@example.com',
      subject: 'Teste',
      html: '<p>Teste</p>',
    });

    expect(gmailMailbox.sendMessageFromMailbox).toHaveBeenCalledWith('ws_1', {
      toEmail: 'lead@example.com',
      subject: 'Teste',
      html: '<p>Teste</p>',
      proactive: true,
    });
    expect(result).toEqual(expect.objectContaining({ status: 'sent', sent: true }));
  });
});
