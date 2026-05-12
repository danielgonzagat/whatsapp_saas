import { act, renderHook, waitFor } from '@testing-library/react';
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
      expect(apiFetchMock).toHaveBeenCalledWith('/kloel/threads?limit=20');
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

  it('loads additional recent threads with cursor pagination', async () => {
    authState.isAuthenticated = true;
    apiFetchMock
      .mockResolvedValueOnce({
        data: {
          items: [
            { id: 'thread-old', title: 'Antiga', updatedAt: '2026-04-20T18:00:00.000Z' },
            { id: 'local_temp', title: 'Temporária', updatedAt: '2026-04-22T18:00:00.000Z' },
          ],
          total: 3,
          nextCursor: 'cursor-2',
          hasMore: true,
        },
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'thread-new',
            title: '  Mais recente  ',
            updatedAt: '2026-04-22T18:00:00.000Z',
            lastMessagePreview: '  preview  ',
          },
        ],
        total: 3,
        nextCursor: null,
        hasMore: false,
      });

    const { result } = renderHook(() => useConversationHistory(), { wrapper });

    await waitFor(() => {
      expect(result.current.hasMoreConversations).toBe(true);
    });

    await act(async () => {
      await result.current.loadMoreConversations();
    });

    expect(apiFetchMock).toHaveBeenLastCalledWith('/kloel/threads?limit=20&cursor=cursor-2');
    expect(result.current.conversations).toEqual([
      {
        id: 'thread-new',
        title: 'Mais recente',
        updatedAt: '2026-04-22T18:00:00.000Z',
        lastMessagePreview: 'preview',
      },
      {
        id: 'thread-old',
        title: 'Antiga',
        updatedAt: '2026-04-20T18:00:00.000Z',
        lastMessagePreview: '',
      },
    ]);
    expect(result.current.hasMoreConversations).toBe(false);
    expect(result.current.totalConversations).toBe(3);
  });

  it('loads every thread page for full export', async () => {
    authState.isAuthenticated = true;
    apiFetchMock
      .mockResolvedValueOnce({
        data: {
          items: [{ id: 'thread-initial', title: 'Inicial', updatedAt: '2026-04-20T18:00:00.000Z' }],
          total: 1,
          nextCursor: null,
          hasMore: false,
        },
      })
      .mockResolvedValueOnce({
        items: [{ id: 'thread-a', title: 'A', updatedAt: '2026-04-21T18:00:00.000Z' }],
        total: 2,
        nextCursor: 'cursor-b',
        hasMore: true,
      })
      .mockResolvedValueOnce({
        data: {
          items: [{ id: 'thread-b', title: 'B', updatedAt: '2026-04-22T18:00:00.000Z' }],
          total: 2,
          nextCursor: null,
          hasMore: false,
        },
      });

    const { result } = renderHook(() => useConversationHistory(), { wrapper });

    await waitFor(() => {
      expect(result.current.conversations).toHaveLength(1);
    });

    let exportedThreads: Awaited<ReturnType<typeof result.current.loadAllConversations>> = [];
    await act(async () => {
      exportedThreads = await result.current.loadAllConversations();
    });

    expect(apiFetchMock).toHaveBeenNthCalledWith(2, '/kloel/threads?limit=50');
    expect(apiFetchMock).toHaveBeenNthCalledWith(3, '/kloel/threads?limit=50&cursor=cursor-b');
    expect(exportedThreads.map((thread) => thread.id)).toEqual(['thread-a', 'thread-b']);
    expect(result.current.conversations.map((thread) => thread.id)).toEqual([
      'thread-b',
      'thread-a',
      'thread-initial',
    ]);
    expect(result.current.totalConversations).toBe(2);
  });
});
