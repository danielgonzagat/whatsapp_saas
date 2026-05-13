import { MetaConnectionStateService } from './meta-connection-state.service';

describe('MetaConnectionStateService', () => {
  let service: MetaConnectionStateService;
  let findMany: jest.Mock;

  beforeEach(() => {
    findMany = jest.fn();
    service = new MetaConnectionStateService({
      metaConnection: { findMany },
    } as never);
  });

  const futureDate = new Date(Date.now() + 86400000);
  const pastDate = new Date(Date.now() - 86400000);

  it('returns disconnected for all channels when no MetaConnection exists', async () => {
    findMany.mockResolvedValue([]);

    const state = await service.forWorkspace('ws-1');

    expect(state).toEqual({
      instagram: { connected: false, accountId: null, pageId: null, expiresAt: null },
      facebook: { connected: false, pageId: null, expiresAt: null },
      whatsapp: { connected: false, phoneNumberId: null, businessId: null, expiresAt: null },
      metaConnected: false,
      channel: null,
    });
  });

  it('returns instagram as connected when instagram channel row has valid token and account', async () => {
    findMany.mockResolvedValue([{
      channel: 'instagram',
      accessToken: 'valid-token',
      tokenExpiresAt: futureDate,
      pageId: null,
      instagramAccountId: 'ig-1',
      whatsappPhoneNumberId: null,
      whatsappBusinessId: null,
    }]);

    const state = await service.forWorkspace('ws-1');

    expect(state.instagram).toEqual({
      connected: true,
      accountId: 'ig-1',
      pageId: null,
      expiresAt: futureDate.toISOString(),
    });
    expect(state.facebook).toEqual({
      connected: false,
      pageId: null,
      expiresAt: null,
    });
    expect(state.whatsapp).toEqual({
      connected: false,
      phoneNumberId: null,
      businessId: null,
      expiresAt: null,
    });
    expect(state.metaConnected).toBe(true);
    expect(state.channel).toBe('instagram');
  });

  it('returns facebook as connected when facebook channel row has valid token and pageId', async () => {
    findMany.mockResolvedValue([{
      channel: 'facebook',
      accessToken: 'valid-token',
      tokenExpiresAt: futureDate,
      pageId: 'page-1',
      instagramAccountId: null,
      whatsappPhoneNumberId: null,
      whatsappBusinessId: null,
    }]);

    const state = await service.forWorkspace('ws-1');

    expect(state.facebook).toEqual({
      connected: true,
      pageId: 'page-1',
      expiresAt: futureDate.toISOString(),
    });
    expect(state.instagram).toEqual({
      connected: false,
      accountId: null,
      pageId: null,
      expiresAt: null,
    });
    expect(state.metaConnected).toBe(true);
    expect(state.channel).toBe('facebook');
  });

  it('returns whatsapp as connected when whatsapp channel row has valid token and phoneNumberId', async () => {
    findMany.mockResolvedValue([{
      channel: 'whatsapp',
      accessToken: 'valid-token',
      tokenExpiresAt: futureDate,
      pageId: 'page-1',
      instagramAccountId: null,
      whatsappPhoneNumberId: 'pn-1',
      whatsappBusinessId: 'waba-1',
    }]);

    const state = await service.forWorkspace('ws-1');

    expect(state.whatsapp).toEqual({
      connected: true,
      phoneNumberId: 'pn-1',
      businessId: 'waba-1',
      expiresAt: futureDate.toISOString(),
    });
    expect(state.metaConnected).toBe(true);
    expect(state.channel).toBe('whatsapp');
  });

  it('returns all disconnected when token is expired', async () => {
    findMany.mockResolvedValue([{
      channel: 'whatsapp',
      accessToken: 'valid-token',
      tokenExpiresAt: pastDate,
      pageId: 'page-1',
      instagramAccountId: 'ig-1',
      whatsappPhoneNumberId: 'pn-1',
      whatsappBusinessId: 'waba-1',
    }]);

    const state = await service.forWorkspace('ws-1');

    expect(state.instagram.connected).toBe(false);
    expect(state.facebook.connected).toBe(false);
    expect(state.whatsapp.connected).toBe(false);
    expect(state.metaConnected).toBe(false);
  });

  it('returns channel-specific disconnected when assets are missing', async () => {
    findMany.mockResolvedValue([{
      channel: 'whatsapp',
      accessToken: 'valid-token',
      tokenExpiresAt: futureDate,
      pageId: null,
      instagramAccountId: null,
      whatsappPhoneNumberId: null,
      whatsappBusinessId: null,
    }]);

    const state = await service.forWorkspace('ws-1');

    expect(state.instagram.connected).toBe(false);
    expect(state.facebook.connected).toBe(false);
    expect(state.whatsapp.connected).toBe(false);
    expect(state.metaConnected).toBe(true);
  });

  it('aggregates multiple per-channel rows correctly', async () => {
    findMany.mockResolvedValue([
      {
        channel: 'whatsapp',
        accessToken: 'wa-token',
        tokenExpiresAt: futureDate,
        pageId: null,
        instagramAccountId: null,
        whatsappPhoneNumberId: 'pn-1',
        whatsappBusinessId: 'waba-1',
      },
      {
        channel: 'instagram',
        accessToken: 'ig-token',
        tokenExpiresAt: futureDate,
        pageId: null,
        instagramAccountId: 'ig-1',
        whatsappPhoneNumberId: null,
        whatsappBusinessId: null,
      },
      {
        channel: 'facebook',
        accessToken: 'fb-token',
        tokenExpiresAt: futureDate,
        pageId: 'page-1',
        instagramAccountId: null,
        whatsappPhoneNumberId: null,
        whatsappBusinessId: null,
      },
    ]);

    const state = await service.forWorkspace('ws-1');

    expect(state.whatsapp).toEqual({
      connected: true,
      phoneNumberId: 'pn-1',
      businessId: 'waba-1',
      expiresAt: futureDate.toISOString(),
    });
    expect(state.instagram).toEqual({
      connected: true,
      accountId: 'ig-1',
      pageId: null,
      expiresAt: futureDate.toISOString(),
    });
    expect(state.facebook).toEqual({
      connected: true,
      pageId: 'page-1',
      expiresAt: futureDate.toISOString(),
    });
    expect(state.metaConnected).toBe(true);
  });
});
