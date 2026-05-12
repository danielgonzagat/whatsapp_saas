import { BadRequestException } from '@nestjs/common';
import { MarketingConnectController } from './marketing-connect.controller';

describe('MarketingConnectController channel setup', () => {
  const update = jest.fn();
  const findUnique = jest.fn();
  const channelSetupFindUnique = jest.fn();
  const channelSetupUpsert = jest.fn();
  const prisma = {
    workspace: {
      findUnique,
      update,
    },
    metaConnection: {
      findUnique: jest.fn(),
    },
    channelSetup: {
      findUnique: channelSetupFindUnique,
      upsert: channelSetupUpsert,
    },
    channelConfig: {
      findUnique: jest.fn(async () => null),
    },
    channelProduct: {
      findMany: jest.fn(async () => []),
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
    channelArsenal: {
      findMany: jest.fn(async () => []),
    },
    product: {
      findMany: jest.fn(async () => []),
    },
    $transaction: jest.fn(async (operations: unknown) => {
      if (typeof operations === 'function') {
        return (operations as (tx: typeof prisma) => Promise<unknown>)(prisma);
      }
      return Promise.all(operations as Promise<unknown>[]);
    }),
  };
  const metaWhatsApp = {
    buildEmbeddedSignupUrl: jest.fn(() => 'https://www.facebook.com/v21.0/dialog/oauth'),
  };
  const whatsappProviders = {
    getProviderType: jest.fn(async () => 'meta-cloud'),
    getSessionStatus: jest.fn(async () => null),
  };
  const gmailMailbox = {
    getPrimaryGmailStatus: jest.fn(async () => null),
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
    getPrimaryMicrosoftStatus: jest.fn(async () => null),
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
    getPrimaryImapSmtpStatus: jest.fn(async () => null),
    connectMailbox: jest.fn(async () => ({
      connected: true,
      provider: 'imap_smtp',
      status: 'connected',
      email: 'owner@kloel.test',
    })),
  };
  const emailCampaign = {
    sendTestEmail: jest.fn(async () => ({ sent: true, messageId: 'em-1' })),
  };
  const tiktokMarketing = {
    getConnectionStatus: jest.fn(async () => ({ connected: false })),
    getStatus: jest.fn(async () => ({ connected: false, status: 'disconnected' })),
  };
  const controller = new MarketingConnectController(
    prisma as never,
    metaWhatsApp as never,
    whatsappProviders as never,
    gmailMailbox as never,
    microsoftMailbox as never,
    imapSmtpMailbox as never,
    emailCampaign as never,
    tiktokMarketing as never,
  );
  const req = { user: { workspaceId: 'ws_1', email: 'owner@kloel.test' } };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists a four-step setup under the selected channel key', async () => {
    findUnique.mockResolvedValueOnce({
      providerSettings: {
        marketingChannelSetup: {
          whatsapp: { currentStep: 1, selectedProductIds: ['old'] },
        },
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
    expect(result.setup).toEqual(
      expect.objectContaining({
        currentStep: 3,
        selectedProductIds: ['prod_1', 'prod_2'],
        arsenal: ['FAQ principal', 'Garantia de 7 dias'],
        config: expect.objectContaining({
          tone: 'consultivo',
          aggressiveness: 'moderado',
          followUpEnabled: true,
          proactiveDailyLimit: 25,
        }),
      }),
    );
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'ws_1' },
        data: {
          providerSettings: expect.objectContaining({
            marketingChannelSetup: expect.objectContaining({
              whatsapp: { currentStep: 1, selectedProductIds: ['old'] },
              email: expect.objectContaining({ currentStep: 3 }),
            }),
          }),
        },
      }),
    );
  });

  it('returns default setup when the channel has no persisted setup', async () => {
    findUnique.mockResolvedValueOnce({ providerSettings: {} });

    const result = await controller.getChannelSetup(req, 'instagram');

    expect(result).toEqual({
      channel: 'instagram',
      setup: {
        currentStep: 0,
        selectedProductIds: [],
        arsenal: [],
        config: {},
      },
      // P1.2 wire-wizard: getChannelSetup now also returns completedAt from
      // ChannelSetup table so the frontend can gate the operational dashboard.
      completedAt: null,
    });
  });

  it('rejects invalid channel names', async () => {
    await expect(controller.getChannelSetup(req, 'sms')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns Gmail mailbox auth URL for the authenticated workspace', () => {
    const result = controller.getGmailAuthUrl(req, '/marketing/email');

    expect(gmailMailbox.buildAuthUrl).toHaveBeenCalledWith('ws_1', '/marketing/email');
    expect(result).toEqual(
      expect.objectContaining({
        provider: 'gmail',
        status: 'pending_oauth',
        authUrl: expect.stringContaining('accounts.google.com'),
      }),
    );
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
    expect(result).toEqual(
      expect.objectContaining({
        provider: 'microsoft',
        status: 'pending_oauth',
        authUrl: expect.stringContaining('login.microsoftonline.com'),
      }),
    );
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
    findUnique.mockResolvedValueOnce({
      providerSettings: { email: { enabled: false } },
      name: 'Workspace Teste',
    });
    prisma.metaConnection.findUnique.mockResolvedValueOnce(null);
    microsoftMailbox.getPrimaryMicrosoftStatus.mockResolvedValueOnce({
      id: 'mailbox-ms-1',
      email: 'owner@kloel.test',
      provider: 'MICROSOFT',
      status: 'ACTIVE',
      connectedAt: new Date('2026-05-11T12:00:00.000Z'),
      lastSyncAt: new Date('2026-05-11T12:05:00.000Z'),
      lastErrorAt: null,
      lastError: null,
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
