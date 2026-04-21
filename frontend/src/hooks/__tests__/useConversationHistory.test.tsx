import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
const authState = {
  isAuthenticated: false,
  isLoading: false,
};

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('@/components/kloel/auth/auth-provider', () => ({
  useAuth: () => authState,
}));

import { ConversationHistoryProvider, useConversationHistory } from '../useConversationHistory';

function wrapper({ children }: { children: ReactNode }) {
  return <ConversationHistoryProvider>{children}</ConversationHistoryProvider>;
}

describe('ConversationHistoryProvider', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.isLoading = false;
    apiFetchMock.mockReset();
    localStorage.clear();
  });

  it('does not request threads for anonymous sessions', async () => {
    renderHook(() => useConversationHistory(), { wrapper });

    await waitFor(() => {
      expect(apiFetchMock).not.toHaveBeenCalled();
    });
  });

  it('loads threads after auth bootstrap completes', async () => {
    authState.isAuthenticated = true;
    apiFetchMock.mockResolvedValue({
      data: [{ id: 'thread-1', title: 'Nova conversa', updatedAt: '2026-04-21T18:00:00.000Z' }],
    });

    const { result } = renderHook(() => useConversationHistory(), { wrapper });

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/kloel/threads');
    });

    await waitFor(() => {
      expect(result.current.conversations).toEqual([
        {
          id: 'thread-1',
          title: 'Nova conversa',
          updatedAt: '2026-04-21T18:00:00.000Z',
          lastMessagePreview: '',
        },
      ]);
    });
  });
});
