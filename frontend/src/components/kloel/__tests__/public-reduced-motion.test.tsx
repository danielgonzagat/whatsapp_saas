import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KloelBrandLockup } from '../KloelBrand';
import { KloelAuthScreen } from '../auth/kloel-auth-screen';
import { CookieProvider } from '../cookies/CookieProvider';
import KloelLanding from '../landing/KloelLanding';
import ThanosSection from '../landing/ThanosSection';

const authMocks = {
  signIn: vi.fn(),
  signUp: vi.fn(),
  requestMagicLink: vi.fn(),
  signInWithGoogle: vi.fn(),
  signInWithFacebook: vi.fn(),
};

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={typeof href === 'string' ? href : '#'} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt = '', ...props }: React.ImgHTMLAttributes<HTMLImageElement>) => (
    <img src={typeof src === 'string' ? src : ''} alt={alt} {...props} />
  ),
}));

vi.mock('@/components/kloel/auth/auth-provider', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    signIn: authMocks.signIn,
    signUp: authMocks.signUp,
    requestMagicLink: authMocks.requestMagicLink,
    signInWithGoogle: authMocks.signInWithGoogle,
    signInWithFacebook: authMocks.signInWithFacebook,
  }),
}));

vi.mock('@/lib/api', () => ({
  authApi: {
    checkEmail: vi.fn().mockResolvedValue({ data: { exists: false }, error: null }),
  },
}));

vi.mock('@/lib/api/cookie-consent', () => ({
  cookieConsentApi: {
    get: vi.fn().mockResolvedValue({ data: { consent: null } }),
    save: vi.fn().mockResolvedValue({ data: { consent: null } }),
  },
}));

vi.mock('@/lib/subdomains', () => ({
  buildAuthUrl: vi.fn((path: string) => path),
  buildAppUrl: vi.fn((path: string) => path),
  getSharedCookieDomain: vi.fn(() => undefined),
  sanitizeNextPath: vi.fn((path: string | null | undefined) => path ?? '/dashboard'),
}));

function mockReducedMotion(matches = true) {
  const listeners = new Set<EventListenerOrEventListenerObject>();
  const mediaQuery = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn((_: string, listener: EventListenerOrEventListenerObject) => {
      listeners.add(listener);
    }),
    removeEventListener: vi.fn((_: string, listener: EventListenerOrEventListenerObject) => {
      listeners.delete(listener);
    }),
    addListener: vi.fn(
      (listener: ((this: MediaQueryList, ev: MediaQueryListEvent) => void) | null) => {
        if (!listener) return;
        listeners.add(listener as unknown as EventListener);
      },
    ),
    removeListener: vi.fn(
      (listener: ((this: MediaQueryList, ev: MediaQueryListEvent) => void) | null) => {
        if (!listener) return;
        listeners.delete(listener as unknown as EventListener);
      },
    ),
    dispatchEvent: vi.fn((event: Event) => {
      listeners.forEach((listener) => {
        if (typeof listener === 'function') {
          listener.call(mediaQuery, event);
          return;
        }

        listener.handleEvent(event);
      });
      return true;
    }),
  } satisfies MediaQueryList;

  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mediaQuery),
  );
}

describe('public reduced-motion surfaces', () => {
  const originalGoogleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  const originalMetaAppId = process.env.NEXT_PUBLIC_META_APP_ID;
  const originalMetaGraphApiVersion = process.env.NEXT_PUBLIC_META_GRAPH_API_VERSION;
  const originalAppleClientId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID;
  const originalLocation = window.location;

  beforeEach(() => {
    mockReducedMotion(true);
    authMocks.signIn.mockResolvedValue({ success: true });
    authMocks.signUp.mockResolvedValue({ success: true });
    authMocks.requestMagicLink.mockResolvedValue({ success: true, message: 'ok' });
    authMocks.signInWithGoogle.mockResolvedValue({ success: true });
    authMocks.signInWithFacebook.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    if (originalGoogleClientId === undefined) {
      delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    } else {
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = originalGoogleClientId;
    }
    if (originalMetaAppId === undefined) {
      delete process.env.NEXT_PUBLIC_META_APP_ID;
    } else {
      process.env.NEXT_PUBLIC_META_APP_ID = originalMetaAppId;
    }
    if (originalMetaGraphApiVersion === undefined) {
      delete process.env.NEXT_PUBLIC_META_GRAPH_API_VERSION;
    } else {
      process.env.NEXT_PUBLIC_META_GRAPH_API_VERSION = originalMetaGraphApiVersion;
    }
    if (originalAppleClientId === undefined) {
      delete process.env.NEXT_PUBLIC_APPLE_CLIENT_ID;
    } else {
      process.env.NEXT_PUBLIC_APPLE_CLIENT_ID = originalAppleClientId;
    }
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('renders static Kloel brand lockup when animation is disabled', () => {
    const { container } = render(
      <KloelBrandLockup animated={false} spores="none" markSize={48} fontSize={20} />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('keeps the auth screen deterministic under reduced motion without disabling Google auth', async () => {
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = 'google-client-id';

    const initialize = vi.fn();
    const renderButton = vi.fn();
    vi.stubGlobal('google', {
      accounts: {
        id: {
          initialize,
          renderButton,
        },
      },
    });

    const { container } = render(<KloelAuthScreen initialMode="register" />);

    expect(
      screen.getByText('O Marketing Digital não sabe o que você precisa,'),
    ).toBeInTheDocument();
    expect(screen.getByText('o Kloel sabe.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajuda' })).toBeNull();
    expect(container.querySelector('img[src="/kloel-mushroom-animated.svg"]')).toBeNull();

    await waitFor(() => {
      expect(initialize).toHaveBeenCalledTimes(1);
      expect(renderButton).toHaveBeenCalledTimes(1);
    });

    expect(document.getElementById('google-identity-services')).toBeNull();
  });

  it('initializes Facebook SDK and keeps the Facebook action visible when configured', async () => {
    process.env.NEXT_PUBLIC_META_APP_ID = 'meta-app-id';
    process.env.NEXT_PUBLIC_META_GRAPH_API_VERSION = 'v21.0';

    const init = vi.fn();
    const getLoginStatus = vi.fn((callback: (response: { status: string }) => void) => {
      callback({ status: 'unknown' });
    });

    vi.stubGlobal('FB', {
      init,
      getLoginStatus,
      login: vi.fn(),
    });

    render(<KloelAuthScreen initialMode="login" />);

    expect(screen.getByRole('button', { name: 'Facebook' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Receber link mágico' })).toBeInTheDocument();

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

    expect(document.getElementById('facebook-jssdk')).toBeNull();
  });

  it('shows the account-link confirmation message after Facebook login requires email confirmation', async () => {
    process.env.NEXT_PUBLIC_META_APP_ID = 'meta-app-id';
    process.env.NEXT_PUBLIC_META_GRAPH_API_VERSION = 'v21.0';
    authMocks.signInWithFacebook.mockResolvedValue({
      success: false,
      error:
        'Já existe uma conta KLOEL com este email. Enviamos um link para confirmar a vinculação com Facebook.',
    });

    vi.stubGlobal('FB', {
      init: vi.fn(),
      getLoginStatus: vi.fn((callback: (response: { status: string }) => void) => {
        callback({ status: 'unknown' });
      }),
      login: vi.fn(
        (
          callback: (response: {
            status: string;
            authResponse?: { accessToken?: string };
          }) => void,
        ) => {
          callback({
            status: 'connected',
            authResponse: { accessToken: 'facebook-access-token' },
          });
        },
      ),
    });

    render(<KloelAuthScreen initialMode="login" />);

    fireEvent.click(screen.getByRole('button', { name: 'Facebook' }));

    await waitFor(() => {
      expect(authMocks.signInWithFacebook).toHaveBeenCalledWith('facebook-access-token');
    });

    expect(
      screen.getByText(
        'Já existe uma conta KLOEL com este email. Enviamos um link para confirmar a vinculação com Facebook.',
      ),
    ).toBeInTheDocument();
  });

  it('surfaces Apple callback errors when the provider redirects back with a failure code', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        host: 'auth.kloel.com',
        origin: 'https://auth.kloel.com',
        search: '?forceAuth=1&error=apple_oauth_failed',
      },
    });

    render(<KloelAuthScreen initialMode="login" />);

    expect(screen.getByText('Falha ao autenticar com Apple.')).toBeInTheDocument();
  });

  it('surfaces account-link notices when Apple redirects back after sending a confirmation email', () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        host: 'auth.kloel.com',
        origin: 'https://auth.kloel.com',
        search:
          '?forceAuth=1&error=apple_oauth_confirmation_required&notice=oauth_link_confirmation_required&provider=apple',
      },
    });

    render(<KloelAuthScreen initialMode="login" />);

    expect(
      screen.getByText(
        'Já existe uma conta KLOEL com este email. Enviamos um link para confirmar a vinculação com Apple.',
      ),
    ).toBeInTheDocument();
  });

  it('builds the Apple authorization redirect with the preserved next path', () => {
    process.env.NEXT_PUBLIC_APPLE_CLIENT_ID = 'com.kloel.web';
    const assign = vi.fn();

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        host: 'auth.kloel.com',
        origin: 'https://auth.kloel.com',
        search: '?forceAuth=1&next=%2Fbilling',
        assign,
      },
    });

    render(<KloelAuthScreen initialMode="login" />);

    fireEvent.click(screen.getByRole('button', { name: 'Apple' }));

    expect(assign).toHaveBeenCalledTimes(1);
    const redirectUrl = new URL(assign.mock.calls[0]?.[0]);
    expect(redirectUrl.origin).toBe('https://appleid.apple.com');
    expect(redirectUrl.pathname).toBe('/auth/authorize');
    expect(redirectUrl.searchParams.get('client_id')).toBe('com.kloel.web');
    expect(redirectUrl.searchParams.get('state')).toBe('/billing');
    expect(redirectUrl.searchParams.get('redirect_uri')).toBe(
      'https://auth.kloel.com/api/auth/callback/apple',
    );
  });

  it('keeps the landing page deterministic under reduced motion', () => {
    const { container } = render(<KloelLanding />);

    expect(screen.getByText('O Kloel escala.')).toBeInTheDocument();
    expect(screen.getByText('O Marketing Artificial começou.')).toBeInTheDocument();
    expect(container.querySelector('img[src="/kloel-mushroom-animated.svg"]')).toBeNull();
  });

  it('renders the thanos section in a static reveal state under reduced motion', () => {
    const { container } = render(<ThanosSection />);

    expect(screen.getByText('O Kloel escala.')).toBeInTheDocument();
    expect(container.querySelector('canvas')).toHaveStyle({ opacity: '0' });
  });

  it('disables cookie banner motion-specific chrome under reduced motion', async () => {
    render(
      <CookieProvider>
        <div>cookie child</div>
      </CookieProvider>,
    );

    expect(await screen.findByText('Nós usamos cookies')).toBeInTheDocument();

    const styles = Array.from(document.querySelectorAll('style'))
      .map((node) => node.textContent ?? '')
      .join('\n');

    expect(styles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(styles).toContain('animation: none !important;');
    expect(styles).toContain('appearance: none;');
  });
});
