import { BadRequestException } from '@nestjs/common';
import { InstagramController } from './instagram.controller';

describe('InstagramController', () => {
  const instagramService = {
    getProfile: jest.fn(),
    getMedia: jest.fn(),
    getAccountInsights: jest.fn(),
    publishPhoto: jest.fn(),
    getComments: jest.fn(),
    replyToComment: jest.fn(),
    sendMessage: jest.fn(),
  } as any;

  const metaWhatsApp = {
    resolveConnection: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the persisted workspace access token for profile reads', async () => {
    metaWhatsApp.resolveConnection.mockResolvedValue({
      accessToken: 'workspace-token',
      instagramAccountId: 'ig-1',
    });
    instagramService.getProfile.mockResolvedValue({ id: 'ig-1' });

    const controller = new InstagramController(instagramService, metaWhatsApp);

    await expect(
      controller.getProfile({ user: { workspaceId: 'ws-1' } } as any, ''),
    ).resolves.toEqual({ id: 'ig-1' });

    expect(instagramService.getProfile).toHaveBeenCalledWith('ig-1', 'workspace-token');
  });

  it('rejects Instagram operations when the workspace has no persisted token', async () => {
    metaWhatsApp.resolveConnection.mockResolvedValue({
      accessToken: '',
      instagramAccountId: 'ig-1',
    });

    const controller = new InstagramController(instagramService, metaWhatsApp);

    await expect(
      controller.getComments({ user: { workspaceId: 'ws-1' } } as any, 'media-1'),
    ).rejects.toThrow(BadRequestException);
  });
});
