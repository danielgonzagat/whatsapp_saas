import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeScreen } from './HomeScreen';

vi.mock('@/components/kloel/KloelBrand', () => ({
  KloelMushroomVisual: () => <div data-testid="kloel-mushroom-visual" />,
}));

vi.mock('@/components/kloel/auth/auth-provider', () => ({
  useAuth: () => ({
    userName: 'Visitante',
  }),
}));

vi.mock('@/hooks/useConversationHistory', () => ({
  useConversationHistory: () => ({
    conversations: [],
    setActiveConversation: vi.fn(),
    upsertConversation: vi.fn(),
    refreshConversations: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  tokenStorage: {
    getToken: () => null,
    getWorkspaceId: () => null,
  },
}));

vi.mock('@/lib/http', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/http')>();
  return {
    ...actual,
    API_BASE: 'http://localhost:3001',
    apiUrl: (path: string) => path,
  };
});

vi.mock('@/lib/kloel-conversations', () => ({
  loadKloelThreadMessages: vi.fn(),
  sendAuthenticatedKloelMessage: vi.fn(),
}));

describe('HomeScreen visitor session storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('migrates the legacy guest key into the visitor key on mount', async () => {
    localStorage.setItem('kloel:home-chat:guest-session', 'visitor_legacy_home_session');

    render(<HomeScreen />);

    await waitFor(() => {
      expect(localStorage.getItem('kloel:home-chat:visitor-session')).toBe(
        'visitor_legacy_home_session',
      );
    });

    expect(localStorage.getItem('kloel:home-chat:guest-session')).toBeNull();
  });

  it('creates a fresh visitor session key when there is no stored session', async () => {
    render(<HomeScreen />);

    await waitFor(() => {
      expect(localStorage.getItem('kloel:home-chat:visitor-session')).toMatch(
        /^visitor_\d+_[a-f0-9-]+$/i,
      );
    });
  });
});
