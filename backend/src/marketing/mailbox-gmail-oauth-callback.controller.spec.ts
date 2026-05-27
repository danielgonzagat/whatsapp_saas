import { MailboxGmailOAuthCallbackController } from './mailbox-gmail-oauth-callback.controller';

describe('MailboxGmailOAuthCallbackController', () => {
  const completeOAuthCallback = jest.fn();
  const configGet = jest.fn();

  let controller: MailboxGmailOAuthCallbackController;

  beforeEach(() => {
    jest.clearAllMocks();
    configGet.mockReturnValue(null);

    controller = new MailboxGmailOAuthCallbackController(
      { completeOAuthCallback } as never,
      { get: configGet } as never,
    );
  });

  describe('handleCallback', () => {
    const res = { redirect: jest.fn() } as never;

    it('redirects to returnTo with connected params when OAuth succeeds', async () => {
      completeOAuthCallback.mockResolvedValueOnce({
        connected: true,
        provider: 'gmail',
        status: 'connected',
        email: 'user@gmail.com',
        connectionId: 'conn-1',
        returnTo: '/marketing/email',
        expiresAt: new Date(),
      });

      await controller.handleCallback('auth-code-123', 'signed-state', undefined, res);

      expect(completeOAuthCallback).toHaveBeenCalledWith('auth-code-123', 'signed-state');
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/marketing/email?email=connected&provider=gmail',
      );
    });

    it('redirects with error reason when OAuth provider returns error query param', async () => {
      await controller.handleCallback(undefined, undefined, 'access_denied', res);

      expect(completeOAuthCallback).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/marketing/email?email=error&provider=gmail&reason=access_denied',
      );
    });

    it('redirects with missing_code_or_state when code or state is absent', async () => {
      await controller.handleCallback(undefined, 'signed-state', undefined, res);

      expect(completeOAuthCallback).not.toHaveBeenCalled();
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/marketing/email?email=error&provider=gmail&reason=missing_code_or_state',
      );
    });

    it('redirects with oauth_callback_failed when service throws', async () => {
      completeOAuthCallback.mockRejectedValueOnce(new Error('token exchange failed'));

      await controller.handleCallback('auth-code-123', 'signed-state', undefined, res);

      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/marketing/email?email=error&provider=gmail&reason=oauth_callback_failed',
      );
    });

    it('passes code and state query params to service correctly', async () => {
      completeOAuthCallback.mockResolvedValueOnce({
        connected: true,
        provider: 'gmail',
        status: 'connected',
        email: 'user@gmail.com',
        connectionId: 'conn-2',
        returnTo: '/dashboard',
        expiresAt: new Date(),
      });

      await controller.handleCallback('code-xyz', 'state-abc', undefined, res);

      expect(completeOAuthCallback).toHaveBeenCalledTimes(1);
      expect(completeOAuthCallback).toHaveBeenCalledWith('code-xyz', 'state-abc');
      expect(res.redirect).toHaveBeenCalledWith(
        'http://localhost:3000/dashboard?email=connected&provider=gmail',
      );
    });
  });
});
