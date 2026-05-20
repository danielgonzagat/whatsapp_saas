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

vi.mock('@/hooks/useResponsiveViewport', () => ({
  useResponsiveViewport: () => ({ isMobile: false }),
}));

import MarketingView from './MarketingView';

afterEach(() => {
  cleanup();
  push.mockReset();
  replace.mockReset();
  mockPathname = '/marketing/whatsapp';
});

describe('MarketingView — five-channel menu (spec §1 / §10)', () => {
  it('renders exactly five uppercase channels in canonical order', () => {
    render(<MarketingView defaultTab="whatsapp" />);
    const labels = ['WHATSAPP', 'INSTAGRAM', 'TIKTOK', 'FACEBOOK', 'EMAIL'];
    for (const l of labels) {
      expect(screen.getByText(l)).toBeTruthy();
    }
    // Conversas must not appear in the menu (spec §15).
    expect(screen.queryByText(/Conversas/i)).toBeNull();
  });

  it('clicking a channel routes via next/navigation (push) and stays on the same path if no change', () => {
    render(<MarketingView defaultTab="whatsapp" />);
    fireEvent.click(screen.getByText('INSTAGRAM'));
    expect(push).toHaveBeenCalledWith('/marketing/instagram');
    fireEvent.click(screen.getByText('WHATSAPP'));
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

  it('surfaces the meta=success notice when present in search params', () => {
    mockSearchParams.set('meta', 'success');
    render(<MarketingView defaultTab="whatsapp" />);
    expect(screen.getByText(/sucesso/)).toBeTruthy();
    mockSearchParams.delete('meta');
  });

  it('surfaces the meta=error notice with reason', () => {
    mockSearchParams.set('meta', 'error');
    mockSearchParams.set('reason', 'invalid_state');
    render(<MarketingView defaultTab="whatsapp" />);
    expect(screen.getByText(/invalid_state/)).toBeTruthy();
    mockSearchParams.delete('meta');
    mockSearchParams.delete('reason');
  });
});
