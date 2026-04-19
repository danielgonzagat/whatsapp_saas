import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tokenStorage } from '@/lib/api';
import { parseAppleAuthState } from '@/lib/apple-auth-state';
import { useCheckoutSocialIdentity } from './useCheckoutSocialIdentity';

type GoogleAccounts = NonNullable<Window['google']>['accounts'];

const originalClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const originalPeopleFlag = process.env.NEXT_PUBLIC_GOOGLE_PEOPLE_SCOPES_ENABLED;
const originalPeoplePrefillFlag = process.env.NEXT_PUBLIC_KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL;
const originalMetaAppId = process.env.NEXT_PUBLIC_META_APP_ID;
const originalMetaGraphApiVersion = process.env.NEXT_PUBLIC_META_GRAPH_API_VERSION;
const originalAppleClientId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID;

function Harness() {
  const { googleButtonRef, facebookAvailable, appleAvailable, startAppleSignIn, socialIdentity } =
    useCheckoutSocialIdentity({
    slug: 'checkout-demo',
    checkoutCode: 'CHK-001',
    enabled: true,
    });

  return (
    <>
      <div ref={googleButtonRef} data-testid="google-button" />
      <div data-testid="facebook-available">{facebookAvailable ? 'yes' : 'no'}</div>
      <div data-testid="apple-available">{appleAvailable ? 'yes' : 'no'}</div>
      <button type="button" onClick={() => void startAppleSignIn()}>
        Apple checkout
      </button>
      <div data-testid="social-email">{socialIdentity?.email || ''}</div>
      <div data-testid="social-phone">{socialIdentity?.phone || ''}</div>
      <div data-testid="social-city">{socialIdentity?.city || ''}</div>
    </>
  );
}

function installGoogleSdkMocks() {
  type TokenClient = {
    callback: (response: {
      access_token?: string;
      error?: string;
      error_description?: string;
      scope?: string;
    }) => void;
    requestAccessToken: (options?: {
      prompt?: '' | 'consent' | 'select_account' | 'none';
      hint?: string;
      scope?: string;
    }) => void;
  };
  let initializeConfig: {
    callback?: (response: { credential?: string }) => Promise<void> | void;
  } | null = null;
  const initialize: GoogleAccounts['id']['initialize'] = vi.fn((config) => {
    initializeConfig = config;
  });
  const renderButton: GoogleAccounts['id']['renderButton'] = vi.fn();
  const requestAccessToken = vi.fn(
    (_options?: { prompt?: '' | 'consent' | 'select_account' | 'none'; hint?: string; scope?: string }) => {
      tokenClient.callback({
        access_token: 'google-people-access-token',
      });
    },
  );
  const tokenClient: TokenClient = {
    callback: () => undefined,
    requestAccessToken,
  };
  const initTokenClient = vi.fn<GoogleAccounts['oauth2']['initTokenClient']>(() => tokenClient);

  window.google = {
    accounts: {
      id: {
        initialize,
        renderButton,
      },
      oauth2: {
        initTokenClient,
      },
    },
  };

  return {
    initialize,
    renderButton,
    initTokenClient,
    tokenClient,
    requestAccessToken,
    emitCredential: async (credential = 'google-jwt-credential') => {
      await act(async () => {
        await initializeConfig?.callback?.({ credential });
      });
    },
  };
}

function installFacebookSdkMocks() {
  const init = vi.fn();
  const getLoginStatus = vi.fn((callback: (response: FacebookStatusResponse) => void) => {
    callback({ status: 'unknown' });
  });
  const login = vi.fn();

  window.FB = {
    init,
    getLoginStatus,
    login,
  };

  return { init, getLoginStatus, login };
}

describe('useCheckoutSocialIdentity', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'google-client-id.apps.googleusercontent.com';
    delete process.env.NEXT_PUBLIC_GOOGLE_PEOPLE_SCOPES_ENABLED;
    delete process.env.NEXT_PUBLIC_KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL;
    window.localStorage.clear();
    tokenStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404, headers: { 'Content-Type': 'text/plain' } })),
    );
  });

  afterEach(() => {
    cleanup();
    delete window.google;
    vi.unstubAllGlobals();

    if (typeof originalClientId === 'string') {
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = originalClientId;
    } else {
      delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    }

    if (typeof originalPeopleFlag === 'string') {
      process.env.NEXT_PUBLIC_GOOGLE_PEOPLE_SCOPES_ENABLED = originalPeopleFlag;
    } else {
      delete process.env.NEXT_PUBLIC_GOOGLE_PEOPLE_SCOPES_ENABLED;
    }

    if (typeof originalPeoplePrefillFlag === 'string') {
      process.env.NEXT_PUBLIC_KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL = originalPeoplePrefillFlag;
    } else {
      delete process.env.NEXT_PUBLIC_KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL;
    }

    if (typeof originalMetaAppId === 'string') {
      process.env.NEXT_PUBLIC_META_APP_ID = originalMetaAppId;
    } else {
      delete process.env.NEXT_PUBLIC_META_APP_ID;
    }

    if (typeof originalMetaGraphApiVersion === 'string') {
      process.env.NEXT_PUBLIC_META_GRAPH_API_VERSION = originalMetaGraphApiVersion;
    } else {
      delete process.env.NEXT_PUBLIC_META_GRAPH_API_VERSION;
    }

    if (typeof originalAppleClientId === 'string') {
      process.env.NEXT_PUBLIC_APPLE_CLIENT_ID = originalAppleClientId;
    } else {
      delete process.env.NEXT_PUBLIC_APPLE_CLIENT_ID;
    }
  });

  it('does not initialize the Google token client when people scopes are not enabled', async () => {
    const { initialize, renderButton, initTokenClient } = installGoogleSdkMocks();

    render(<Harness />);

    await waitFor(() => {
      expect(initialize).toHaveBeenCalledTimes(1);
      expect(renderButton).toHaveBeenCalledTimes(1);
    });

    expect(initTokenClient).not.toHaveBeenCalled();
  });

  it('initializes the Google token client only when people scopes opt-in is enabled', async () => {
    process.env.NEXT_PUBLIC_KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL = 'true';
    const { initTokenClient } = installGoogleSdkMocks();

    render(<Harness />);

    await waitFor(() => {
      expect(initTokenClient).toHaveBeenCalledTimes(1);
    });

    expect(initTokenClient).toHaveBeenCalledWith(
      expect.objectContaining({
        scope:
          'https://www.googleapis.com/auth/user.phonenumbers.read https://www.googleapis.com/auth/user.addresses.read https://www.googleapis.com/auth/user.birthday.read',
      }),
    );
  });

  it('keeps supporting the legacy public people-scope flag while environments are migrated', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_PEOPLE_SCOPES_ENABLED = 'true';
    const { initTokenClient } = installGoogleSdkMocks();

    render(<Harness />);

    await waitFor(() => {
      expect(initTokenClient).toHaveBeenCalledTimes(1);
    });
  });

  it('enables Facebook checkout auth and initializes the Meta SDK when configured', async () => {
    process.env.NEXT_PUBLIC_META_APP_ID = 'meta-app-id';
    process.env.NEXT_PUBLIC_META_GRAPH_API_VERSION = 'v21.0';
    installGoogleSdkMocks();
    const { init, getLoginStatus } = installFacebookSdkMocks();

    const { getByTestId } = render(<Harness />);

    expect(getByTestId('facebook-available')).toHaveTextContent('yes');

    await waitFor(() => {
      expect(init).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: 'meta-app-id',
          cookie: true,
          xfbml: true,
          version: 'v21.0',
        }),
      );
      expect(getLoginStatus).toHaveBeenCalledTimes(1);
    });
  });

  it('builds the Apple checkout authorization redirect with a structured checkout state payload', async () => {
    process.env.NEXT_PUBLIC_APPLE_CLIENT_ID = 'com.kloel.web';
    installGoogleSdkMocks();
    const assignSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        assign: assignSpy,
        origin: 'https://pay.kloel.com',
        pathname: '/checkout-demo',
        search: '?coupon=VIP',
        href: 'https://pay.kloel.com/checkout-demo?coupon=VIP',
      },
    });

    try {
      const { getByRole, getByTestId } = render(<Harness />);

      expect(getByTestId('apple-available')).toHaveTextContent('yes');

      await act(async () => {
        getByRole('button', { name: 'Apple checkout' }).click();
      });

      expect(assignSpy).toHaveBeenCalledTimes(1);
      const redirectUrl = new URL(assignSpy.mock.calls[0]?.[0] as string);
      expect(redirectUrl.origin).toBe('https://appleid.apple.com');
      expect(redirectUrl.pathname).toBe('/auth/authorize');
      expect(redirectUrl.searchParams.get('client_id')).toBe('com.kloel.web');
      expect(redirectUrl.searchParams.get('redirect_uri')).toBe(
        'https://pay.kloel.com/api/auth/callback/apple',
      );

      const parsedState = parseAppleAuthState(redirectUrl.searchParams.get('state'));
      expect(parsedState.checkout).toMatchObject({
        flow: 'checkout',
        slug: 'checkout-demo',
        checkoutCode: 'CHK-001',
        returnPath: '/checkout-demo?coupon=VIP',
      });
      expect(parsedState.checkout?.deviceFingerprint).toBeTruthy();
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it('hydrates checkout identity from the authenticated Google extended-profile route before falling back to the public lead path', async () => {
    process.env.NEXT_PUBLIC_KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL = 'true';
    tokenStorage.setToken(
      createTestJwt({
        sub: 'agent-1',
        email: 'daniel@kloel.com',
        workspaceId: 'ws-1',
        name: 'Daniel',
      }),
    );

    const google = installGoogleSdkMocks();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.includes('/checkout/public/social-capture/prefill')) {
        return new Response('', { status: 404 });
      }

      if (url.includes('/checkout/public/social-capture') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            leadId: 'lead_123',
            provider: 'google',
            name: 'Daniel',
            email: 'daniel@kloel.com',
            deviceFingerprint: 'device_123',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url === '/api/user/google-profile-extended') {
        return new Response(
          JSON.stringify({
            provider: 'google',
            email: 'daniel@kloel.com',
            phone: '+5562999990000',
            birthday: '1994-04-18',
            address: {
              street: 'Rua 1',
              city: 'Caldas Novas',
              state: 'GO',
              postalCode: '75694-720',
              countryCode: 'BR',
              formattedValue: 'Rua 1, Caldas Novas - GO',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      if (url.includes('/checkout/public/social-capture/lead_123') && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response('', { status: 404 });
    });

    const { getByTestId } = render(<Harness />);

    await waitFor(() => {
      expect(google.initTokenClient).toHaveBeenCalledTimes(1);
    });

    await google.emitCredential();

    await waitFor(() => {
      expect(getByTestId('social-email')).toHaveTextContent('daniel@kloel.com');
      expect(getByTestId('social-phone')).toHaveTextContent('+5562999990000');
      expect(getByTestId('social-city')).toHaveTextContent('Caldas Novas');
    });

    expect(google.requestAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/user/google-profile-extended',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Bearer'),
          'X-Google-Access-Token': 'google-people-access-token',
        }),
      }),
    );
  });
});

function createTestJwt(payload: Record<string, unknown>) {
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `header.${encoded}.signature`;
}
