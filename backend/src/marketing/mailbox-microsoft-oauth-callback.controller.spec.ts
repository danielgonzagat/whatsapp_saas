import { MailboxMicrosoftOAuthCallbackController } from './mailbox-microsoft-oauth-callback.controller';

describe('MailboxMicrosoftOAuthCallbackController', () => {
  const completeOAuthCallback = jest.fn();
  const configGet = jest.fn();

  const redirect = jest.fn();

  let controller: MailboxMicrosoftOAuthCallbackController;

  beforeEach(() => {
    jest.clearAllMocks();
    configGet.mockReturnValue(undefined);

    controller = new MailboxMicrosoftOAuthCallbackController(
      { completeOAuthCallback } as never,
      { get: configGet } as never,
    );

    redirect.mockReturnValue(undefined);
  });

  describe('handleCallback', () => {
    it('completes oauth and redirects on success', async () => {
      completeOAuthCallback.mockResolvedValueOnce({ returnTo: '/marketing/email' });

      await controller.handleCallback(
        'auth-code-123',
        'signed-state-abc',
        undefined,
        { redirect } as never,
      );

      expect(completeOAuthCallback).toHaveBeenCalledWith('auth-code-123', 'signed-state-abc');
      expect(redirect).toHaveBeenCalledTimes(1);
      const redirectUrl = redirect.mock.calls[0][0] as string;
      expect(redirectUrl).toContain('email=connected');
      expect(redirectUrl).toContain('provider=microsoft');
      expect(redirectUrl).toContain('/marketing/email');
    });

    it('redirects with error when oauth provider sends error query param', async () => {
      await controller.handleCallback(
        undefined,
        'signed-state-abc',
        'access_denied',
        { redirect } as never,
      );

      expect(completeOAuthCallback).not.toHaveBeenCalled();
      expect(redirect).toHaveBeenCalledTimes(1);
      const redirectUrl = redirect.mock.calls[0][0] as string;
      expect(redirectUrl).toContain('email=error');
      expect(redirectUrl).toContain('provider=microsoft');
      expect(redirectUrl).toContain('reason=access_denied');
    });

    it('redirects with error when code or state is missing', async () => {
      await controller.handleCallback(
        undefined,
        undefined,
        undefined,
        { redirect } as never,
      );

      expect(completeOAuthCallback).not.toHaveBeenCalled();
      expect(redirect).toHaveBeenCalledTimes(1);
      const redirectUrl = redirect.mock.calls[0][0] as string;
      expect(redirectUrl).toContain('email=error');
      expect(redirectUrl).toContain('provider=microsoft');
      expect(redirectUrl).toContain('reason=missing_code_or_state');
    });

    it('redirects with error when service throws', async () => {
      completeOAuthCallback.mockRejectedValueOnce(new Error('token exchange failed'));

      await controller.handleCallback(
        'auth-code-456',
        'signed-state-def',
        undefined,
        { redirect } as never,
      );

      expect(completeOAuthCallback).toHaveBeenCalledWith('auth-code-456', 'signed-state-def');
      expect(redirect).toHaveBeenCalledTimes(1);
      const redirectUrl = redirect.mock.calls[0][0] as string;
      expect(redirectUrl).toContain('email=error');
      expect(redirectUrl).toContain('provider=microsoft');
      expect(redirectUrl).toContain('reason=oauth_callback_failed');
    });

    it('coerces code and state to strings before calling service', async () => {
      completeOAuthCallback.mockResolvedValueOnce({ returnTo: '/' });

      await controller.handleCallback(
        42 as never,
        true as never,
        undefined,
        { redirect } as never,
      );

      expect(completeOAuthCallback).toHaveBeenCalledWith('42', 'true');
    });
  });
});
