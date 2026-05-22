import { BadRequestException } from '@nestjs/common';
import { GoogleAdsAuthController } from './google-ads-auth.controller';
import type { AnunciosService } from '../anuncios/anuncios.service';

describe('GoogleAdsAuthController', () => {
  const getConnectUrl = jest.fn();
  const completeOAuth = jest.fn();
  const getPlatformStatuses = jest.fn();
  const disconnect = jest.fn();
  const anunciosService = {
    getConnectUrl,
    completeOAuth,
    getPlatformStatuses,
    disconnect,
  };
  const controller = new GoogleAdsAuthController(anunciosService as AnunciosService);

  const mockRequest = (workspaceId: string) =>
    ({ workspaceId }) as Parameters<(typeof controller)['workspaceId']>[0];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getConnectUrl', () => {
    it('returns auth URL for google platform', async () => {
      getConnectUrl.mockResolvedValue({
        authUrl: 'https://accounts.google.com/o/oauth2/v2/auth?...',
      });
      const result = await controller.getConnectUrl(mockRequest('ws-1'));
      expect(result.data.authUrl).toContain('accounts.google.com');
      expect(getConnectUrl).toHaveBeenCalledWith('ws-1', 'google');
    });
  });

  describe('oauthCallback', () => {
    it('returns error when oauth error param present', async () => {
      const result = await controller.oauthCallback(
        mockRequest('ws-1'),
        undefined,
        'access_denied',
      );
      expect(result.data.connected).toBe(false);
      expect(result.data.status).toBe('oauth_error');
    });

    it('throws BadRequestException when no code provided', async () => {
      await expect(
        controller.oauthCallback(mockRequest('ws-1'), undefined, undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('completes OAuth and returns result', async () => {
      completeOAuth.mockResolvedValue({ connected: true, status: 'connected' });
      const result = await controller.oauthCallback(
        mockRequest('ws-1'),
        'auth-code-123',
        undefined,
      );
      expect(result.data.connected).toBe(true);
      expect(completeOAuth).toHaveBeenCalledWith('ws-1', 'google', 'auth-code-123');
    });
  });

  describe('getStatus', () => {
    it('returns google platform status', async () => {
      getPlatformStatuses.mockResolvedValue([
        {
          platform: 'meta',
          connected: true,
          status: 'connected',
          accountId: '',
          clientConfigured: true,
        },
        {
          platform: 'google',
          connected: false,
          status: 'disconnected',
          accountId: '',
          clientConfigured: true,
        },
      ]);
      const result = await controller.getStatus(mockRequest('ws-1'));
      expect(result.data.platform).toBe('google');
      expect(result.data.connected).toBe(false);
    });

    it('returns default disconnected when google not in list', async () => {
      getPlatformStatuses.mockResolvedValue([]);
      const result = await controller.getStatus(mockRequest('ws-1'));
      expect(result.data.platform).toBe('google');
      expect(result.data.connected).toBe(false);
    });
  });

  describe('disconnect', () => {
    it('delegates to anunciosService.disconnect', async () => {
      disconnect.mockResolvedValue({ status: 'disconnected' });
      const result = await controller.disconnect(mockRequest('ws-1'));
      expect(result.data.status).toBe('disconnected');
      expect(disconnect).toHaveBeenCalledWith('ws-1', 'google');
    });
  });
});
