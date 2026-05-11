import { BadRequestException } from '@nestjs/common';
import { MarketingConnectController } from './marketing-connect.controller';

describe('MarketingConnectController channel setup', () => {
  const update = jest.fn();
  const findUnique = jest.fn();
  const prisma = {
    workspace: {
      findUnique,
      update,
    },
    metaConnection: {
      findUnique: jest.fn(),
    },
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
  };
  const controller = new MarketingConnectController(
    prisma as never,
    metaWhatsApp as never,
    whatsappProviders as never,
    gmailMailbox as never,
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

  it('triggers Gmail mailbox sync for the authenticated workspace', async () => {
    const result = await controller.syncGmailMailbox(req, { limit: 5 });

    expect(gmailMailbox.syncLatestInbox).toHaveBeenCalledWith('ws_1', 5);
    expect(result).toEqual(expect.objectContaining({ status: 'synced', imported: 1 }));
  });
});
