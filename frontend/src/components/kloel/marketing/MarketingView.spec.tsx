import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// next/navigation: stable mocks for client routing.
const push = vi.fn();
const replace = vi.fn();
let mockPathname = '/marketing/whatsapp';
const mockSearchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => mockPathname,
  useSearchParams: () => mockSearchParams,
}));

// Heavy hook chain swallowed by the canonical screen — we just need a stub.
vi.mock('./OfficialMarketingChannelPage', () => ({
  OfficialMarketingChannelPage: ({
    channel,
    initialStep,
  }: {
    channel: string;
    initialStep?: number;
  }) => (
    <div
      data-testid="channel-onboarding-stub"
      data-initial-step={initialStep === undefined ? 'none' : String(initialStep)}
    >
      channel={channel}
    </div>
  ),
}));

// useTheme provider stub for the PreviewBar palette read.
vi.mock('@/components/kloel/theme/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'dark' }),
}));

import { NAV } from '../sidebar/sidebar-config';
import MarketingView from './MarketingView';

afterEach(() => {
  cleanup();
  push.mockReset();
  replace.mockReset();
  mockPathname = '/marketing/whatsapp';
});

describe('MarketingView — six-channel PreviewBar (canonical anexo contract)', () => {
  it('keeps Marketing as one sidebar entry without redundant channel subitems', () => {
    const marketingItem = NAV.find((item) => item.key === 'marketing');
    expect(marketingItem?.label).toBe('Marketing');
    expect(marketingItem?.sub).toEqual([]);
  });

  it('renders exactly six channel buttons (lowercase tokens, CSS uppercase-transformed)', () => {
    render(<MarketingView defaultTab="whatsapp" />);
    // The reference JSX uses lowercase tokens with CSS text-transform.
    for (const k of ['whatsapp', 'instagram', 'tiktok', 'google-ads', 'facebook', 'email']) {
      expect(screen.getByText(k)).toBeTruthy();
    }
    // Conversas must not appear (spec §15).
    expect(screen.queryByText(/Conversas/i)).toBeNull();
  });

  it('clicking a channel routes via next/navigation (push) and stays on the same path if no change', () => {
    render(<MarketingView defaultTab="whatsapp" />);
    fireEvent.click(screen.getByText('instagram'));
    expect(push).toHaveBeenCalledWith('/marketing/instagram');
    fireEvent.click(screen.getByText('whatsapp'));
    // Active route already; push should not re-fire.
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('renders the canonical ChannelOnboarding for the active channel', () => {
    mockPathname = '/marketing/email';
    render(<MarketingView defaultTab="email" />);
    expect(screen.getByTestId('channel-onboarding-stub').textContent).toContain('channel=email');
  });

  it('centers the floating channel selector inside the app content rail', () => {
    render(<MarketingView defaultTab="whatsapp" />);
    const bar = screen.getByText('whatsapp').parentElement;
    expect(bar).toBeInstanceOf(HTMLElement);
    expect((bar as HTMLElement).style.left).toBe(
      'calc(var(--kloel-main-rail-width, 0px) + ((100vw - var(--kloel-main-rail-width, 0px)) / 2))',
    );
    expect((bar as HTMLElement).style.transform).toBe('translateX(-50%)');
  });

  it('keeps the channel selector below the global Graph navigation hitbox', () => {
    render(<MarketingView defaultTab="whatsapp" />);
    const bar = screen.getByText('whatsapp').parentElement;
    expect(bar).toBeInstanceOf(HTMLElement);
    expect((bar as HTMLElement).style.top).toBe('72px');
  });

  it('redirects /marketing/conversas to /inbox and /marketing to /marketing/whatsapp', () => {
    mockPathname = '/marketing/conversas';
    render(<MarketingView defaultTab="whatsapp" />);
    expect(replace).toHaveBeenCalledWith('/inbox');
    cleanup();
    replace.mockReset();
    mockPathname = '/marketing';
    render(<MarketingView defaultTab="whatsapp" />);
    expect(replace).toHaveBeenCalledWith('/marketing/whatsapp');
  });

  it('advances to step 1 when meta=success returns from OAuth', () => {
    mockSearchParams.set('meta', 'success');
    render(<MarketingView defaultTab="whatsapp" />);
    // The param is read and forwarded as initialStep=1.
    expect(
      screen.getByTestId('channel-onboarding-stub').getAttribute('data-initial-step'),
    ).toBe('1');
    mockSearchParams.delete('meta');
  });

  it('forwards initialStep for known capability deep-link modes (broadcast / templates)', () => {
    mockSearchParams.set('mode', 'broadcast');
    const { rerender } = render(<MarketingView defaultTab="whatsapp" />);
    expect(
      screen.getByTestId('channel-onboarding-stub').getAttribute('data-initial-step'),
    ).toBe('1');

    mockSearchParams.set('mode', 'templates');
    mockPathname = '/marketing/email';
    rerender(<MarketingView defaultTab="email" />);
    expect(
      screen.getByTestId('channel-onboarding-stub').getAttribute('data-initial-step'),
    ).toBe('1');
    mockSearchParams.delete('mode');
  });

  it('keeps default behavior (no initialStep) when no meta/mode param is present', () => {
    render(<MarketingView defaultTab="whatsapp" />);
    expect(
      screen.getByTestId('channel-onboarding-stub').getAttribute('data-initial-step'),
    ).toBe('none');
  });

  it('ignores an unknown mode value (default behavior preserved)', () => {
    mockSearchParams.set('mode', 'totally-unknown');
    render(<MarketingView defaultTab="whatsapp" />);
    expect(
      screen.getByTestId('channel-onboarding-stub').getAttribute('data-initial-step'),
    ).toBe('none');
    mockSearchParams.delete('mode');
  });
});
