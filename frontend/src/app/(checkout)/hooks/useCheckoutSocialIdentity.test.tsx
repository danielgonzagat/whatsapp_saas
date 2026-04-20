import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCheckoutSocialIdentity } from './useCheckoutSocialIdentity';

type GoogleAccounts = NonNullable<Window['google']>['accounts'];

const originalClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const originalPeopleFlag = process.env.NEXT_PUBLIC_GOOGLE_PEOPLE_SCOPES_ENABLED;

function Harness() {
  const { googleButtonRef } = useCheckoutSocialIdentity({
    slug: 'checkout-demo',
    checkoutCode: 'CHK-001',
    enabled: true,
  });

  return <div ref={googleButtonRef} data-testid="google-button" />;
}

function installGoogleSdkMocks() {
  const initialize: GoogleAccounts['id']['initialize'] = vi.fn();
  const renderButton: GoogleAccounts['id']['renderButton'] = vi.fn();
  const initTokenClient = vi.fn<GoogleAccounts['oauth2']['initTokenClient']>(() => ({
    callback: () => undefined,
    requestAccessToken: () => undefined,
  }));

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

  return { initialize, renderButton, initTokenClient };
}

describe('useCheckoutSocialIdentity', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'google-client-id.apps.googleusercontent.com';
    delete process.env.NEXT_PUBLIC_GOOGLE_PEOPLE_SCOPES_ENABLED;
    window.localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response('', { status: 404, headers: { 'Content-Type': 'text/plain' } }),
      ),
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
    process.env.NEXT_PUBLIC_GOOGLE_PEOPLE_SCOPES_ENABLED = 'true';
    const { initTokenClient } = installGoogleSdkMocks();

    render(<Harness />);

    await waitFor(() => {
      expect(initTokenClient).toHaveBeenCalledTimes(1);
    });

    expect(initTokenClient).toHaveBeenCalledWith(
      expect.objectContaining({
        scope:
          'https://www.googleapis.com/auth/user.phonenumbers.read https://www.googleapis.com/auth/user.addresses.read',
      }),
    );
  });
});
