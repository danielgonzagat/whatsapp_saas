import { InstagramController } from './instagram.controller';

describe('InstagramController', () => {
  let instagramService: {
    getProfile: jest.Mock;
    getAccountInsights: jest.Mock;
  };
  let metaWhatsApp: {
    resolveConnection: jest.Mock;
  };
  let controller: InstagramController;

  beforeEach(() => {
    instagramService = {
      getProfile: jest.fn().mockResolvedValue({ id: 'ig-1' }),
      getAccountInsights: jest.fn().mockResolvedValue({ data: [] }),
    };

    metaWhatsApp = {
      resolveConnection: jest.fn().mockResolvedValue({
        instagramAccountId: 'ig-1',
        pageAccessToken: 'page-token',
        accessToken: 'user-token',
      }),
    };

    controller = new InstagramController(instagramService as never, metaWhatsApp as never);
  });

  it('falls back to page access token when no explicit Instagram token is provided', async () => {
    await controller.getProfile(
      {
        user: { workspaceId: 'ws-1' },
      } as never,
      '',
      '',
    );

    expect(instagramService.getProfile).toHaveBeenCalledWith('ig-1', 'page-token');
  });

  it('uses Meta-safe default account insight metrics', async () => {
    await controller.getAccountInsights(
      {
        user: { workspaceId: 'ws-1' },
      } as never,
      '',
      '',
      '',
      '',
    );

    expect(instagramService.getAccountInsights).toHaveBeenCalledWith(
      'ig-1',
      ['reach', 'follower_count'],
      'day',
      'page-token',
    );
  });
});
