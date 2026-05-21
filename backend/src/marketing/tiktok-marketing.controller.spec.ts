import { TikTokMarketingController } from './tiktok-marketing.controller';

describe('TikTokMarketingController', () => {
  const getStatus = jest.fn();
  const generateAuthUrl = jest.fn();
  const completeOAuth = jest.fn();
  const disconnect = jest.fn();

  let controller: TikTokMarketingController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TikTokMarketingController({
      getStatus,
      generateAuthUrl,
      completeOAuth,
      disconnect,
    } as never);
  });

  describe('GET status', () => {
    it('calls getStatus with workspaceId from req.user', async () => {
      const req = { user: { workspaceId: 'ws-1' }, headers: {} } as never;
      getStatus.mockResolvedValueOnce({ connected: true, status: 'connected' });

      const result = await controller.status(req);

      expect(getStatus).toHaveBeenCalledWith('ws-1');
      expect(result).toEqual({ connected: true, status: 'connected' });
    });
  });

  describe('GET url', () => {
    it('calls generateAuthUrl with workspaceId and kind', async () => {
      const req = { user: { workspaceId: 'ws-1' }, headers: {} } as never;
      generateAuthUrl.mockResolvedValueOnce({ url: 'https://tiktok.com/auth?x=1', kind: 'creator' });

      const result = await controller.url(req, 'creator');

      expect(generateAuthUrl).toHaveBeenCalledWith('ws-1', 'creator');
      expect(result.url).toBe('https://tiktok.com/auth?x=1');
    });

    it('calls generateAuthUrl without kind (undefined)', async () => {
      const req = { user: { workspaceId: 'ws-2' }, headers: {} } as never;
      generateAuthUrl.mockResolvedValueOnce({ url: 'https://tiktok.com/auth', kind: 'creator' });

      await controller.url(req);

      expect(generateAuthUrl).toHaveBeenCalledWith('ws-2', undefined);
    });
  });

  describe('POST complete', () => {
    it('calls completeOAuth with workspaceId and body', async () => {
      const req = { user: { workspaceId: 'ws-1' }, headers: {} } as never;
      const body = { code: 'auth-code-123', kind: 'creator' as const };
      completeOAuth.mockResolvedValueOnce({ connected: true, status: 'connected' });

      const result = await controller.complete(req, body);

      expect(completeOAuth).toHaveBeenCalledWith('ws-1', body);
      expect(result.connected).toBe(true);
    });
  });

  describe('POST disconnect', () => {
    it('calls disconnect with workspaceId from req.user', async () => {
      const req = { user: { workspaceId: 'ws-3' }, headers: {} } as never;
      disconnect.mockResolvedValueOnce({ status: 'disconnected' });

      const result = await controller.disconnect(req);

      expect(disconnect).toHaveBeenCalledWith('ws-3');
      expect(result).toEqual({ status: 'disconnected' });
    });
  });

  describe('error propagation', () => {
    it('rejects when getStatus throws', async () => {
      const req = { user: { workspaceId: 'ws-1' }, headers: {} } as never;
      getStatus.mockRejectedValueOnce(new Error('TikTok API unreachable'));

      await expect(controller.status(req)).rejects.toThrow('TikTok API unreachable');
    });

    it('rejects when completeOAuth throws', async () => {
      const req = { user: { workspaceId: 'ws-1' }, headers: {} } as never;
      const body = { code: 'bad-code', kind: 'creator' as const };
      completeOAuth.mockRejectedValueOnce(new Error('token exchange failed'));

      await expect(controller.complete(req, body)).rejects.toThrow('token exchange failed');
    });
  });
});
