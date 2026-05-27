import { HttpException } from '@nestjs/common';
import { AuthController } from './auth.controller';

jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
  addBreadcrumb: jest.fn(),
}));

describe('AuthController', () => {
  const auth = {
    checkEmail: jest.fn(),
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    oauthLogin: jest.fn(),
    loginWithGoogleCredential: jest.fn(),
    loginWithFacebookAccessToken: jest.fn(),
    loginWithAppleCredential: jest.fn(),
    loginWithTikTokAccessToken: jest.fn(),
    loginWithTikTokAuthorizationCode: jest.fn(),
    requestMagicLink: jest.fn(),
    verifyMagicLink: jest.fn(),
    sendWhatsAppCode: jest.fn(),
    verifyWhatsAppCode: jest.fn(),
    createAnonymous: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    verifyEmail: jest.fn(),
    resendVerificationEmail: jest.fn(),
    sendVerificationEmail: jest.fn(),
    logout: jest.fn(),
    getMe: jest.fn(),
    completeOnboarding: jest.fn(),
  };

  let controller: AuthController;

  const mockReq = (overrides: Partial<{ ip: string; sub: string }> = {}) =>
    ({
      ip: overrides.ip ?? '127.0.0.1',
      user: { sub: overrides.sub ?? 'u-1' },
    }) as never;

  const mockRes = () =>
    ({
      cookie: jest.fn(),
    }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new AuthController(auth as never);
  });

  describe('checkEmail (POST)', () => {
    it('delegates to auth.checkEmail with the provided email', async () => {
      auth.checkEmail.mockResolvedValue({ exists: true });
      const result = await controller.checkEmail({ email: 'test@test.com' });
      expect(auth.checkEmail).toHaveBeenCalledWith('test@test.com');
      expect(result).toEqual({ exists: true });
    });
  });

  describe('checkEmailQuery (GET)', () => {
    it('returns exists:false when email is missing', async () => {
      const result = await controller.checkEmailQuery(undefined);
      expect(result).toEqual({ exists: false });
    });

    it('delegates to auth.checkEmail when email is provided', async () => {
      auth.checkEmail.mockResolvedValue({ exists: false });
      const result = await controller.checkEmailQuery('x@y.com');
      expect(auth.checkEmail).toHaveBeenCalledWith('x@y.com');
      expect(result).toEqual({ exists: false });
    });
  });

  describe('register', () => {
    it('delegates to auth.register with body + ip and sets cookie', async () => {
      auth.register.mockResolvedValue({ access_token: 'tok', user: { id: 'u-1' } });
      const res = mockRes();
      const result = await controller.register(
        mockReq(),
        res,
        { email: 'new@test.com', password: 'secret', name: 'Jane' } as never,
      );
      expect(auth.register).toHaveBeenCalled();
      expect((res as never as { cookie: jest.Mock }).cookie).toHaveBeenCalledWith(
        'kloel_token',
        'tok',
        expect.objectContaining({ httpOnly: true }),
      );
      expect(result).toHaveProperty('access_token', 'tok');
    });

    it('throws 409 when auth.register rejects with status 409', async () => {
      const err = { status: 409, message: 'conflict' };
      auth.register.mockRejectedValue(err);
      await expect(
        controller.register(mockReq(), mockRes(), {
          email: 'dup@test.com',
          password: 'x',
          name: 'X',
        } as never),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('login', () => {
    it('delegates to auth.login with body + ip and sets cookie on success', async () => {
      auth.login.mockResolvedValue({ access_token: 'tok', user: { id: 'u-1' } });
      const res = mockRes();
      const result = await controller.login(
        mockReq(),
        res,
        { email: 'u@test.com', password: 'pw' } as never,
      );
      expect(auth.login).toHaveBeenCalled();
      expect((res as never as { cookie: jest.Mock }).cookie).toHaveBeenCalled();
      expect(result).toHaveProperty('access_token', 'tok');
    });

    it('does not set cookie when auth.login returns no token', async () => {
      auth.login.mockResolvedValue({ error: 'invalid' });
      const res = mockRes();
      const result = await controller.login(
        mockReq(),
        res,
        { email: 'bad@test.com', password: 'x' } as never,
      );
      expect((res as never as { cookie: jest.Mock }).cookie).not.toHaveBeenCalled();
      expect(result).toEqual({ error: 'invalid' });
    });
  });

  describe('googleOAuthLogin', () => {
    it('delegates to auth.loginWithGoogleCredential', async () => {
      auth.loginWithGoogleCredential.mockResolvedValue({ access_token: 'tok' });
      const result = await controller.googleOAuthLogin(mockReq(), {
        credential: 'google-cred',
      } as never);
      expect(auth.loginWithGoogleCredential).toHaveBeenCalledWith({
        credential: 'google-cred',
        ip: '127.0.0.1',
      });
      expect(result).toEqual({ access_token: 'tok' });
    });
  });

  describe('facebookOAuthLogin', () => {
    it('delegates to auth.loginWithFacebookAccessToken', async () => {
      auth.loginWithFacebookAccessToken.mockResolvedValue({ access_token: 'tok' });
      const result = await controller.facebookOAuthLogin(mockReq(), {
        accessToken: 'fb-tok',
      } as never);
      expect(auth.loginWithFacebookAccessToken).toHaveBeenCalledWith({
        accessToken: 'fb-tok',
        ip: '127.0.0.1',
      });
      expect(result).toHaveProperty('access_token', 'tok');
    });
  });

  describe('appleOAuthLogin', () => {
    it('throws when identityToken is missing', async () => {
      await expect(
        controller.appleOAuthLogin(mockReq(), { identityToken: '' } as never),
      ).rejects.toThrow(HttpException);
    });

    it('delegates to auth.loginWithAppleCredential', async () => {
      auth.loginWithAppleCredential.mockResolvedValue({ access_token: 'tok' });
      const result = await controller.appleOAuthLogin(mockReq(), {
        identityToken: 'apple-id-tok',
      } as never);
      expect(auth.loginWithAppleCredential).toHaveBeenCalledWith(
        expect.objectContaining({ identityToken: 'apple-id-tok' }),
      );
      expect(result).toEqual({ access_token: 'tok' });
    });
  });

  describe('tikTokOAuthLogin', () => {
    it('delegates to accessToken path when accessToken provided', async () => {
      auth.loginWithTikTokAccessToken.mockResolvedValue({ access_token: 'tok' });
      const result = await controller.tikTokOAuthLogin(mockReq(), {
        accessToken: 'tt-tok',
      } as never);
      expect(auth.loginWithTikTokAccessToken).toHaveBeenCalled();
      expect(result).toEqual({ access_token: 'tok' });
    });

    it('delegates to authorizationCode path when no accessToken', async () => {
      auth.loginWithTikTokAuthorizationCode.mockResolvedValue({ access_token: 'tok' });
      const result = await controller.tikTokOAuthLogin(mockReq(), {
        code: 'auth-code',
      } as never);
      expect(auth.loginWithTikTokAuthorizationCode).toHaveBeenCalled();
      expect(result).toEqual({ access_token: 'tok' });
    });
  });

  describe('requestMagicLink', () => {
    it('delegates to auth.requestMagicLink', async () => {
      auth.requestMagicLink.mockResolvedValue({ success: true });
      const result = await controller.requestMagicLink(mockReq(), {
        email: 'u@test.com',
      } as never);
      expect(auth.requestMagicLink).toHaveBeenCalledWith({
        email: 'u@test.com',
        ip: '127.0.0.1',
      });
      expect(result).toEqual({ success: true });
    });
  });

  describe('verifyMagicLink', () => {
    it('delegates to auth.verifyMagicLink', async () => {
      auth.verifyMagicLink.mockResolvedValue({ access_token: 'tok' });
      const result = await controller.verifyMagicLink(mockReq(), {
        token: 'ml-tok',
      } as never);
      expect(auth.verifyMagicLink).toHaveBeenCalledWith('ml-tok', '127.0.0.1');
      expect(result).toEqual({ access_token: 'tok' });
    });
  });

  describe('sendWhatsAppCode', () => {
    it('delegates to auth.sendWhatsAppCode', async () => {
      auth.sendWhatsAppCode.mockResolvedValue({ success: true });
      const result = await controller.sendWhatsAppCode(mockReq(), {
        phone: '+5511999999999',
      } as never);
      expect(auth.sendWhatsAppCode).toHaveBeenCalledWith('+5511999999999', '127.0.0.1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('verifyWhatsAppCode', () => {
    it('delegates to auth.verifyWhatsAppCode', async () => {
      auth.verifyWhatsAppCode.mockResolvedValue({ access_token: 'tok' });
      const result = await controller.verifyWhatsAppCode(mockReq(), {
        phone: '+5511999999999',
        code: '123456',
      } as never);
      expect(auth.verifyWhatsAppCode).toHaveBeenCalledWith('+5511999999999', '123456', '127.0.0.1');
      expect(result).toEqual({ access_token: 'tok' });
    });
  });

  describe('createAnonymous', () => {
    it('delegates to auth.createAnonymous', async () => {
      auth.createAnonymous.mockResolvedValue({ access_token: 'anon-tok' });
      const result = await controller.createAnonymous(mockReq());
      expect(auth.createAnonymous).toHaveBeenCalledWith('127.0.0.1');
      expect(result).toEqual({ access_token: 'anon-tok' });
    });
  });

  describe('forgotPassword', () => {
    it('delegates to auth.forgotPassword', async () => {
      auth.forgotPassword.mockResolvedValue({ success: true });
      const result = await controller.forgotPassword(mockReq(), {
        email: 'u@test.com',
      } as never);
      expect(auth.forgotPassword).toHaveBeenCalledWith('u@test.com', '127.0.0.1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('resetPassword', () => {
    it('delegates to auth.resetPassword', async () => {
      auth.resetPassword.mockResolvedValue({ success: true });
      const result = await controller.resetPassword(mockReq(), {
        token: 'rst-tok',
        newPassword: 'new-pw',
      } as never);
      expect(auth.resetPassword).toHaveBeenCalledWith('rst-tok', 'new-pw', '127.0.0.1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('verifyEmail', () => {
    it('delegates to auth.verifyEmail', async () => {
      auth.verifyEmail.mockResolvedValue({ success: true });
      const result = await controller.verifyEmail(mockReq(), { token: 'v-tok' } as never);
      expect(auth.verifyEmail).toHaveBeenCalledWith('v-tok', '127.0.0.1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('resendVerificationEmail', () => {
    it('delegates to auth.resendVerificationEmail', async () => {
      auth.resendVerificationEmail.mockResolvedValue({ success: true });
      const result = await controller.resendVerificationEmail(mockReq(), {
        email: 'u@test.com',
      } as never);
      expect(auth.resendVerificationEmail).toHaveBeenCalledWith('u@test.com', '127.0.0.1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('sendVerificationEmail', () => {
    it('delegates to auth.sendVerificationEmail with agent sub', async () => {
      auth.sendVerificationEmail.mockResolvedValue({ success: true });
      const result = await controller.sendVerificationEmail(
        mockReq({ sub: 'agent-1' }),
      );
      expect(auth.sendVerificationEmail).toHaveBeenCalledWith('agent-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('logout', () => {
    it('delegates to auth.logout with agent claims', async () => {
      auth.logout.mockResolvedValue({ success: true });
      const req = {
        user: { sub: 'agent-1', jti: 'jti-1', exp: 9999999999 },
      } as never;
      const result = await controller.logout(req);
      expect(auth.logout).toHaveBeenCalledWith('agent-1', 'jti-1', 9999999999);
      expect(result).toEqual({ success: true });
    });
  });

  describe('getMe', () => {
    it('delegates to auth.getMe with agent sub', async () => {
      auth.getMe.mockResolvedValue({ id: 'agent-1', email: 'a@b.com' });
      const result = await controller.getMe(mockReq({ sub: 'agent-1' }));
      expect(auth.getMe).toHaveBeenCalledWith('agent-1');
      expect(result).toEqual({ id: 'agent-1', email: 'a@b.com' });
    });
  });

  describe('completeOnboarding', () => {
    it('delegates to auth.completeOnboarding with agent sub', async () => {
      auth.completeOnboarding.mockResolvedValue({ success: true });
      const result = await controller.completeOnboarding(mockReq({ sub: 'agent-1' }));
      expect(auth.completeOnboarding).toHaveBeenCalledWith('agent-1');
      expect(result).toEqual({ success: true });
    });
  });
});
