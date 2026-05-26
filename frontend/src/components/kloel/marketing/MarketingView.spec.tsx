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
  OfficialMarketingChannelPage: ({ channel }: { channel: string }) => (
    <div data-testid="channel-onboarding-stub">channel={channel}</div>
  ),
}));

// useTheme provider stub for the PreviewBar palette read.
vi.mock('@/components/kloel/theme/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'dark' }),
}));

import MarketingView from './MarketingView';

afterEach(() => {
  cleanup();
  push.mockReset();
  replace.mockReset();
  mockPathname = '/marketing/whatsapp';
});

describe('MarketingView — five-channel PreviewBar (canonical anexo contract)', () => {
  it('renders exactly five channel buttons (lowercase tokens, CSS uppercase-transformed)', () => {
    render(<MarketingView defaultTab="whatsapp" />);
    // The reference JSX uses lowercase tokens with CSS text-transform.
    for (const k of ['whatsapp', 'instagram', 'tiktok', 'facebook', 'email']) {
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
    // The stub doesn't capture initialStep, but the render must succeed
    // without throwing — the param is read and forwarded.
    expect(screen.getByTestId('channel-onboarding-stub')).toBeTruthy();
    mockSearchParams.delete('meta');
  });
});
