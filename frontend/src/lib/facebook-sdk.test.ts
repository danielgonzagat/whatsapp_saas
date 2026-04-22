import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestFacebookAccessTokenWithEmailScope } from './facebook-sdk';

type FacebookSdk = NonNullable<Window['FB']>;

function installFacebookSdkMock(overrides?: {
  currentStatus?: Parameters<Parameters<FacebookSdk['getLoginStatus']>[0]>[0];
  loginResponse?: Parameters<Parameters<FacebookSdk['login']>[0]>[0];
  permissionsQueue?: Array<{ data?: Array<{ permission?: string; status?: string }> }>;
}) {
  const permissionsQueue = [...(overrides?.permissionsQueue || [])];
  const getLoginStatus = vi.fn<FacebookSdk['getLoginStatus']>((callback) => {
    callback(
      overrides?.currentStatus || {
        status: 'unknown',
      },
    );
  });
  const login = vi.fn<FacebookSdk['login']>((callback) => {
    callback(
      overrides?.loginResponse || {
        status: 'connected',
        authResponse: {
          accessToken: 'fresh-facebook-token',
          userID: 'facebook-user-1',
        },
        grantedScopes: 'public_profile,email',
      },
    );
  });
  const api = vi.fn<FacebookSdk['api']>((_path, callback) => {
    callback(
      permissionsQueue.shift() || {
        data: [],
      },
    );
  });

  window.FB = {
    init: vi.fn(),
    getLoginStatus,
    login,
    api,
    AppEvents: {
      logPageView: vi.fn(),
    },
  };

  return {
    getLoginStatus,
    login,
    api,
  };
}

describe('requestFacebookAccessTokenWithEmailScope', () => {
  beforeEach(() => {
    delete window.FB;
  });

  it('reuses the current facebook session only when email permission is already granted', async () => {
    const { login, api } = installFacebookSdkMock({
      currentStatus: {
        status: 'connected',
        authResponse: {
          accessToken: 'existing-facebook-token',
          userID: 'facebook-user-1',
        },
      },
      permissionsQueue: [
        {
          data: [{ permission: 'email', status: 'granted' }],
        },
      ],
    });

    await expect(requestFacebookAccessTokenWithEmailScope()).resolves.toEqual({
      accessToken: 'existing-facebook-token',
      userId: 'facebook-user-1',
    });
    expect(login).not.toHaveBeenCalled();
    expect(api).toHaveBeenCalledTimes(1);
  });

  it('re-requests facebook consent when the active session is missing email permission', async () => {
    const { login } = installFacebookSdkMock({
      currentStatus: {
        status: 'connected',
        authResponse: {
          accessToken: 'stale-facebook-token',
          userID: 'facebook-user-2',
        },
      },
      loginResponse: {
        status: 'connected',
        authResponse: {
          accessToken: 'fresh-facebook-token',
          userID: 'facebook-user-2',
        },
      },
      permissionsQueue: [
        {
          data: [{ permission: 'public_profile', status: 'granted' }],
        },
        {
          data: [{ permission: 'email', status: 'granted' }],
        },
      ],
    });

    await expect(requestFacebookAccessTokenWithEmailScope()).resolves.toEqual({
      accessToken: 'fresh-facebook-token',
      userId: 'facebook-user-2',
    });
    expect(login).toHaveBeenCalledWith(expect.any(Function), {
      auth_type: 'rerequest',
      return_scopes: true,
      scope: 'public_profile,email',
    });
  });

  it('fails with a clear message when facebook still does not grant email permission', async () => {
    installFacebookSdkMock({
      currentStatus: {
        status: 'unknown',
      },
      loginResponse: {
        status: 'connected',
        authResponse: {
          accessToken: 'facebook-token-no-email',
          userID: 'facebook-user-3',
        },
      },
      permissionsQueue: [
        {
          data: [{ permission: 'public_profile', status: 'granted' }],
        },
      ],
    });

    await expect(requestFacebookAccessTokenWithEmailScope()).rejects.toThrow(
      'O Facebook precisa liberar a permissão de email para continuar. Revise as permissões e tente novamente.',
    );
  });
});
