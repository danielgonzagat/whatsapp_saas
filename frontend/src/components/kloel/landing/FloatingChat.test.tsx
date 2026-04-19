import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FloatingChat } from './FloatingChat';

vi.mock('@/components/kloel/KloelBrand', () => ({
  KloelMushroomVisual: () => <div data-testid="kloel-mushroom-visual" />,
}));

vi.mock('@/components/kloel/MessageActionBar', () => ({
  MessageActionBar: () => null,
}));

vi.mock('@/components/kloel/auth/auth-provider', () => ({
  useAuth: () => ({
    isAuthenticated: false,
  }),
}));

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>();
  return {
    ...actual,
    API_BASE: 'http://localhost:3001',
    apiUrl: (path: string) => path,
  };
});

vi.mock('@/lib/kloel-stream-events', () => ({
  parseKloelStreamPayload: () => [],
}));

describe('FloatingChat visitor session storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('migrates the legacy guest session key into the visitor key', async () => {
    localStorage.setItem('kloel:floating-chat:guest-session', 'visitor_legacy_session');

    render(<FloatingChat />);

    await waitFor(() => {
      expect(localStorage.getItem('kloel:floating-chat:visitor-session')).toBe(
        'visitor_legacy_session',
      );
    });

    expect(localStorage.getItem('kloel:floating-chat:guest-session')).toBeNull();
  });

  it('keeps the visitor key authoritative and removes the old guest key', async () => {
    localStorage.setItem('kloel:floating-chat:visitor-session', 'visitor_current_session');
    localStorage.setItem('kloel:floating-chat:guest-session', 'visitor_legacy_session');

    render(<FloatingChat />);

    await waitFor(() => {
      expect(localStorage.getItem('kloel:floating-chat:visitor-session')).toBe(
        'visitor_current_session',
      );
    });

    expect(localStorage.getItem('kloel:floating-chat:guest-session')).toBeNull();
  });

  it('creates a fresh visitor session key when there is no prior storage', async () => {
    render(<FloatingChat />);

    await waitFor(() => {
      expect(localStorage.getItem('kloel:floating-chat:visitor-session')).toMatch(
        /^visitor_\d+_[a-f0-9-]+$/i,
      );
    });

    expect(localStorage.getItem('kloel:floating-chat:guest-session')).toBeNull();
  });
});
