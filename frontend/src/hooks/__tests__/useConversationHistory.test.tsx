import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
const authState = { isAuthenticated: false, isLoading: false };

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('@/components/kloel/auth/auth-provider', () => ({
  useAuth: () => authState,
}));

import { ConversationHistoryProvider, useConversationHistory } from '../useConversationHistory';

const page = (items: unknown[], total: number, nextCursor: unknown, hasMore: boolean) => ({
  data: { items, total, nextCursor, hasMore },
});

const makeThread = (id: string, title: string, updatedAt: string, lastMessagePreview?: string) => ({
  id,
  title,
  updatedAt,
  lastMessagePreview,
});

const mockCursorPages = () => {
  apiFetchMock.mockResolvedValueOnce(
    page([
      makeThread('thread-old', 'Antiga', '2026-04-20T18:00:00.000Z'),
      makeThread('local_temp', 'Temporária', '2026-04-22T18:00:00.000Z'),
    ], 3, 'cursor-2', true),
  );
  apiFetchMock.mockResolvedValueOnce(
    page([makeThread('thread-new', '  Mais recente  ', '2026-04-22T18:00:00.000Z', '  preview  ')], 3, null, false),
  );
};

const mockExportPages = () => {
  apiFetchMock.mockResolvedValueOnce(
    page([makeThread('thread-initial', 'Inicial', '2026-04-20T18:00:00.000Z')], 1, null, false),
  );
  apiFetchMock.mockResolvedValueOnce(
    page([makeThread('thread-a', 'A', '2026-04-21T18:00:00.000Z')], 2, 'cursor-b', true),
  );
  apiFetchMock.mockResolvedValueOnce(
    page([makeThread('thread-b', 'B', '2026-04-22T18:00:00.000Z')], 2, null, false),
  );
};

beforeEach(() => {
  authState.isAuthenticated = false;
  authState.isLoading = false;
  apiFetchMock.mockReset();
  localStorage.clear();
});

it('does not request threads for anonymous sessions', async () => {
  renderHook(() => useConversationHistory(), { wrapper: ConversationHistoryProvider });

  await waitFor(() => {
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

it('loads threads after auth bootstrap completes', async () => {
  authState.isAuthenticated = true;
  apiFetchMock.mockResolvedValue({
    data: [{ id: 'thread-1', title: 'Nova conversa', updatedAt: '2026-04-21T18:00:00.000Z' }],
  });

  const { result } = renderHook(() => useConversationHistory(), { wrapper: ConversationHistoryProvider });

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
  mockCursorPages();
  const { result } = renderHook(() => useConversationHistory(), { wrapper: ConversationHistoryProvider });

  await waitFor(() => {
    expect(result.current.hasMoreConversations).toBe(true);
  });

  await act(async () => {
    await result.current.loadMoreConversations();
  });

  expect(apiFetchMock).toHaveBeenLastCalledWith('/kloel/threads?limit=20&cursor=cursor-2');
  expect(result.current.conversations.map((threadItem) => threadItem.id)).toEqual([
    'thread-new',
    'thread-old',
  ]);
  expect(result.current.conversations[0]?.title).toBe('Mais recente');
  expect(result.current.conversations[0]?.lastMessagePreview).toBe('preview');
  expect(result.current.hasMoreConversations).toBe(false);
  expect(result.current.totalConversations).toBe(3);
});

it('loads every thread page for full export', async () => {
  authState.isAuthenticated = true;
  mockExportPages();
  const { result } = renderHook(() => useConversationHistory(), { wrapper: ConversationHistoryProvider });

  await waitFor(() => {
    expect(result.current.conversations).toHaveLength(1);
  });

  let exportedThreads: Awaited<ReturnType<typeof result.current.loadAllConversations>> = [];
  await act(async () => {
    exportedThreads = await result.current.loadAllConversations();
  });

  expect(apiFetchMock).toHaveBeenNthCalledWith(2, '/kloel/threads?limit=50');
  expect(apiFetchMock).toHaveBeenNthCalledWith(3, '/kloel/threads?limit=50&cursor=cursor-b');
  expect(exportedThreads.map((threadItem) => threadItem.id)).toEqual(['thread-a', 'thread-b']);
  expect(result.current.conversations.map((threadItem) => threadItem.id)).toEqual([
    'thread-b',
    'thread-a',
    'thread-initial',
  ]);
});
