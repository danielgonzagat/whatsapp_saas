import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/kloel/landing/KloelLanding', () => ({
  default: () => <main data-testid="public-landing">Marketing Artificial landing</main>,
}));

vi.mock('@/components/kloel/landing/FloatingChat', () => ({
  FloatingChat: () => <aside data-testid="public-floating-chat">Floating chat</aside>,
}));

vi.mock('@/components/kloel/home/HomeView', () => ({
  default: () => <main data-testid="dashboard-home">PAINEL OPERACIONAL</main>,
}));

import HomePage from './page';

afterEach(() => {
  cleanup();
});

describe('public home page', () => {
  it('renders the sales landing instead of the authenticated dashboard home', () => {
    render(<HomePage />);

    expect(screen.getByTestId('public-landing')).toBeTruthy();
    expect(screen.getByTestId('public-floating-chat')).toBeTruthy();
    expect(screen.queryByTestId('dashboard-home')).toBeNull();
  });
});
