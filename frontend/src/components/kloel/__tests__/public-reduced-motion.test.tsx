import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KloelBrandLockup } from '../KloelBrand';
import { KloelAuthScreen } from '../auth/kloel-auth-screen';
import KloelLanding from '../landing/KloelLanding';
import ThanosSection from '../landing/ThanosSection';

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
    signIn: vi.fn().mockResolvedValue({ success: true }),
    signUp: vi.fn().mockResolvedValue({ success: true }),
    signInWithGoogle: vi.fn().mockResolvedValue({ success: true }),
  }),
}));

vi.mock('@/lib/api', () => ({
  authApi: {
    checkEmail: vi.fn().mockResolvedValue({ data: { exists: false }, error: null }),
  },
}));

vi.mock('@/lib/subdomains', () => ({
  buildAuthUrl: vi.fn((path: string) => path),
  buildAppUrl: vi.fn((path: string) => path),
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
  beforeEach(() => {
    mockReducedMotion(true);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders static Kloel brand lockup when animation is disabled', () => {
    const { container } = render(
      <KloelBrandLockup animated={false} spores="none" markSize={48} fontSize={20} />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('keeps the auth screen deterministic under reduced motion', () => {
    const { container } = render(<KloelAuthScreen initialMode="register" />);

    expect(
      screen.getByText('O Marketing Digital não sabe o que você precisa,'),
    ).toBeInTheDocument();
    expect(screen.getByText('o Kloel sabe.')).toBeInTheDocument();
    expect(container.querySelector('img[src="/kloel-mushroom-animated.svg"]')).toBeNull();
    expect(document.getElementById('google-identity-services')).toBeNull();
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
});
