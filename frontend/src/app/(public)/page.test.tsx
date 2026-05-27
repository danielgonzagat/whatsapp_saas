import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import LandingPage from './page';

vi.mock('@/components/kloel/landing/KloelLanding', () => ({
  default: () => <main data-testid="public-landing" />,
}));

vi.mock('@/components/kloel/landing/FloatingChat', () => ({
  FloatingChat: () => <aside data-testid="landing-floating-chat" />,
}));

vi.mock('@/components/kloel/home/HomeView', () => ({
  default: () => <section data-testid="dashboard-home" />,
}));

describe('public root page', () => {
  it('renders the public landing instead of the authenticated dashboard home', () => {
    render(<LandingPage />);

    expect(screen.getByTestId('public-landing')).toBeVisible();
    expect(screen.getByTestId('landing-floating-chat')).toBeVisible();
    expect(screen.queryByTestId('dashboard-home')).not.toBeInTheDocument();
  });
});
