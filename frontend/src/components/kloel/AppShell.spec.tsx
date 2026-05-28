import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/marketing/whatsapp',
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useCommandPalette', () => ({
  default: () => ({ executeCommand: vi.fn(), open: vi.fn(), paletteProps: {} }),
}));

vi.mock('@/hooks/useKyc', () => ({
  useKycCompletion: () => ({ completion: { percentage: 0 } }),
  useKycStatus: () => ({ error: null, isLoading: false, status: { kycStatus: 'pending' } }),
}));

vi.mock('@/hooks/useResponsiveViewport', () => ({
  useResponsiveViewport: () => ({ isDesktop: false, isMobile: true }),
}));

vi.mock('./CommandPalette', () => ({
  CommandPalette: () => null,
}));

vi.mock('./ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('./sidebar/KloelSidebar', () => ({
  KloelSidebar: () => <aside>Sidebar</aside>,
}));

import { AppShell } from './AppShell';

afterEach(() => {
  cleanup();
});

describe('AppShell registration chrome', () => {
  it('does not render the incomplete registration prompt in the app shell', () => {
    render(
      <AppShell>
        <div>Marketing content</div>
      </AppShell>,
    );

    expect(screen.getByText('Marketing content')).toBeTruthy();
    expect(screen.queryByText('Cadastro incompleto')).toBeNull();
    expect(screen.queryByText('Completar cadastro')).toBeNull();
  });
});
