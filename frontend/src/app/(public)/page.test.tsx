import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const headersMock = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({
  headers: headersMock,
}));

vi.mock('@/components/kloel/landing/KloelLanding', () => ({
  default: ({ initialHost }: { initialHost?: string | null }) => (
    <main data-initial-host={initialHost ?? ''} data-testid="public-landing">
      Marketing Artificial landing
    </main>
  ),
}));

vi.mock('@/components/kloel/landing/FloatingChat', () => ({
  FloatingChat: () => <aside data-testid="public-floating-chat">Floating chat</aside>,
}));

vi.mock('@/components/kloel/home/HomeView', () => ({
  default: () => <main data-testid="dashboard-home">PAINEL OPERACIONAL</main>,
}));

import HomePage from './page';

beforeEach(() => {
  headersMock.mockResolvedValue(new Headers({ host: 'localhost:3000' }));
});

afterEach(() => {
  cleanup();
  headersMock.mockReset();
});

describe('public home page', () => {
  it('renders the sales landing instead of the authenticated dashboard home', async () => {
    render(await HomePage());

    expect(screen.getByTestId('public-landing').getAttribute('data-initial-host')).toBe(
      'localhost:3000',
    );
    expect(screen.getByTestId('public-floating-chat')).toBeTruthy();
    expect(screen.queryByTestId('dashboard-home')).toBeNull();
  });

  it('prefers the forwarded host so hydrated auth links match the request host', async () => {
    headersMock.mockResolvedValue(
      new Headers({
        host: 'localhost:3000',
        'x-forwarded-host': 'app.root.localhost:3000, proxy.local',
      }),
    );

    render(await HomePage());

    expect(screen.getByTestId('public-landing').getAttribute('data-initial-host')).toBe(
      'app.root.localhost:3000',
    );
  });
});
