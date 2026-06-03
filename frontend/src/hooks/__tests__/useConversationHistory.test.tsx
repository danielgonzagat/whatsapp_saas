import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();
const swrMutateMock = vi.fn();
const authState = { isAuthenticated: false, isLoading: false };

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('swr', () => ({
  mutate: (...args: unknown[]) => swrMutateMock(...args),
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
    page(
      [
        makeThread('thread-old', 'Antiga', '2026-04-20T18:00:00.000Z'),
        makeThread('local_temp', 'Temporária', '2026-04-22T18:00:00.000Z'),
      ],
      3,
      'cursor-2',
      true,
    ),
  );
  apiFetchMock.mockResolvedValueOnce(
    page(
      [makeThread('thread-new', '  Mais recente  ', '2026-04-22T18:00:00.000Z', '  preview  ')],
      3,
      null,
      false,
    ),
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
  swrMutateMock.mockReset();
  localStorage.clear();
});

it('does not request threads for anonymous sessions', async () => {
  renderHook(() => useConversationHistory(), { wrapper: ConversationHistoryProvider });

  await act(async () => {
    await Promise.resolve();
  });
  expect(apiFetchMock).not.toHaveBeenCalled();
});

it('loads threads after auth bootstrap completes', async () => {
  authState.isAuthenticated = true;
  apiFetchMock.mockResolvedValue({
    data: [{ id: 'thread-1', title: 'Nova conversa', updatedAt: '2026-04-21T18:00:00.000Z' }],
  });

  const { result } = renderHook(() => useConversationHistory(), {
    wrapper: ConversationHistoryProvider,
  });

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
  const { result } = renderHook(() => useConversationHistory(), {
    wrapper: ConversationHistoryProvider,
  });

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
  const { result } = renderHook(() => useConversationHistory(), {
    wrapper: ConversationHistoryProvider,
  });

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

it('keeps current recent threads and exposes an error when full export payload is malformed', async () => {
  authState.isAuthenticated = true;
  apiFetchMock
    .mockResolvedValueOnce(
      page([makeThread('thread-1', 'Original', '2026-04-21T18:00:00.000Z')], 1, null, false),
    )
    .mockResolvedValueOnce({
      data: { items: 'not-real-threads', total: 1, nextCursor: null, hasMore: false },
    });
  const { result } = renderHook(() => useConversationHistory(), {
    wrapper: ConversationHistoryProvider,
  });

  await waitFor(() => {
    expect(result.current.conversations).toHaveLength(1);
  });

  await act(async () => {
    await expect(result.current.loadAllConversations()).rejects.toThrow(
      'Invalid Kloel thread payload',
    );
  });

  expect(result.current.conversations.map((threadItem) => threadItem.id)).toEqual(['thread-1']);
  expect(Reflect.get(result.current, 'lastError')).toMatchObject({
    message: expect.stringContaining('Invalid Kloel thread payload'),
  });
});

it('keeps current recent threads when refresh returns an API error envelope', async () => {
  authState.isAuthenticated = true;
  apiFetchMock.mockResolvedValueOnce(
    page([makeThread('thread-1', 'Original', '2026-04-21T18:00:00.000Z')], 1, null, false),
  );
  const { result } = renderHook(() => useConversationHistory(), {
    wrapper: ConversationHistoryProvider,
  });

  await waitFor(() => {
    expect(result.current.conversations).toHaveLength(1);
  });

  apiFetchMock.mockResolvedValueOnce({ error: 'Threads unavailable', status: 503 });

  await act(async () => {
    await result.current.refreshConversations();
  });

  expect(result.current.conversations.map((threadItem) => threadItem.id)).toEqual(['thread-1']);
  expect(Reflect.get(result.current, 'lastError')).toMatchObject({
    message: expect.stringContaining('Threads unavailable'),
  });
});

it('exposes a contract error when the initial recent threads payload is malformed', async () => {
  authState.isAuthenticated = true;
  apiFetchMock.mockResolvedValueOnce({
    data: { items: { id: 'not-an-array' }, total: '1', nextCursor: null, hasMore: false },
  });

  const { result } = renderHook(() => useConversationHistory(), {
    wrapper: ConversationHistoryProvider,
  });

  await waitFor(() => {
    expect(Reflect.get(result.current, 'lastError')).toMatchObject({
      message: expect.stringContaining('Invalid Kloel thread payload'),
    });
  });

  expect(result.current.conversations).toEqual([]);
  expect(result.current.totalConversations).toBeNull();
});

it('exposes a contract error when recent thread items are malformed instead of dropping them', async () => {
  authState.isAuthenticated = true;
  apiFetchMock.mockResolvedValueOnce({
    data: {
      items: [{ id: 42, title: 'Sem id real' }],
      total: 1,
      nextCursor: null,
      hasMore: false,
    },
  });

  const { result } = renderHook(() => useConversationHistory(), {
    wrapper: ConversationHistoryProvider,
  });

  await waitFor(() => {
    expect(Reflect.get(result.current, 'lastError')).toMatchObject({
      message: expect.stringContaining('Invalid Kloel thread payload'),
    });
  });

  expect(result.current.conversations).toEqual([]);
  expect(result.current.totalConversations).toBeNull();
});

it('keeps current recent threads and exposes an error when refresh returns malformed payload', async () => {
  authState.isAuthenticated = true;
  apiFetchMock.mockResolvedValueOnce(
    page([makeThread('thread-1', 'Original', '2026-04-21T18:00:00.000Z')], 1, null, false),
  );
  const { result } = renderHook(() => useConversationHistory(), {
    wrapper: ConversationHistoryProvider,
  });

  await waitFor(() => {
    expect(result.current.conversations).toHaveLength(1);
  });

  apiFetchMock.mockResolvedValueOnce({
    data: { items: 'not-real-threads', total: 1, nextCursor: null, hasMore: false },
  });

  await act(async () => {
    await result.current.refreshConversations();
  });

  expect(result.current.conversations.map((threadItem) => threadItem.id)).toEqual(['thread-1']);
  expect(Reflect.get(result.current, 'lastError')).toMatchObject({
    message: expect.stringContaining('Invalid Kloel thread payload'),
  });
});

it('keeps current recent threads and stops loading when pagination payload is malformed', async () => {
  authState.isAuthenticated = true;
  apiFetchMock
    .mockResolvedValueOnce(
      page([makeThread('thread-1', 'Original', '2026-04-21T18:00:00.000Z')], 2, 'cursor-2', true),
    )
    .mockResolvedValueOnce({
      data: { items: 'not-real-threads', total: 2, nextCursor: null, hasMore: false },
    });
  const { result } = renderHook(() => useConversationHistory(), {
    wrapper: ConversationHistoryProvider,
  });

  await waitFor(() => {
    expect(result.current.hasMoreConversations).toBe(true);
  });

  await act(async () => {
    await result.current.loadMoreConversations();
  });

  expect(result.current.conversations.map((threadItem) => threadItem.id)).toEqual(['thread-1']);
  expect(result.current.isLoadingMoreConversations).toBe(false);
  expect(Reflect.get(result.current, 'lastError')).toMatchObject({
    message: expect.stringContaining('Invalid Kloel thread payload'),
  });
});

it('updates a thread title only after backend success', async () => {
  authState.isAuthenticated = true;
  apiFetchMock
    .mockResolvedValueOnce(
      page([makeThread('thread-1', 'Original', '2026-04-21T18:00:00.000Z')], 1, null, false),
    )
    .mockResolvedValueOnce({ data: { id: 'thread-1', title: 'Renamed' }, status: 200 });
  const { result } = renderHook(() => useConversationHistory(), {
    wrapper: ConversationHistoryProvider,
  });

  await waitFor(() => {
    expect(result.current.conversations[0]?.title).toBe('Original');
  });

  act(() => {
    result.current.updateConversationTitle('thread-1', 'Renamed');
  });

  await waitFor(() => {
    expect(result.current.conversations[0]?.title).toBe('Renamed');
  });
  expect(swrMutateMock).toHaveBeenCalledWith(expect.any(Function));
});

it('does not update a thread title when backend returns an API error envelope', async () => {
  authState.isAuthenticated = true;
  apiFetchMock
    .mockResolvedValueOnce(
      page([makeThread('thread-1', 'Original', '2026-04-21T18:00:00.000Z')], 1, null, false),
    )
    .mockResolvedValueOnce({ error: 'Rename failed', status: 409 });
  const { result } = renderHook(() => useConversationHistory(), {
    wrapper: ConversationHistoryProvider,
  });

  await waitFor(() => {
    expect(result.current.conversations[0]?.title).toBe('Original');
  });

  act(() => {
    result.current.updateConversationTitle('thread-1', 'Renamed');
  });

  await waitFor(() => {
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });
  expect(result.current.conversations[0]?.title).toBe('Original');
  await waitFor(() => {
    expect(Reflect.get(result.current, 'lastError')).toMatchObject({ message: 'Rename failed' });
  });
  expect(swrMutateMock).not.toHaveBeenCalled();
});

it('does not remove a thread when backend returns an API error envelope', async () => {
  authState.isAuthenticated = true;
  apiFetchMock
    .mockResolvedValueOnce(
      page([makeThread('thread-1', 'Original', '2026-04-21T18:00:00.000Z')], 1, null, false),
    )
    .mockResolvedValueOnce({ error: 'Delete failed', status: 409 });
  const { result } = renderHook(() => useConversationHistory(), {
    wrapper: ConversationHistoryProvider,
  });

  await waitFor(() => {
    expect(result.current.conversations).toHaveLength(1);
  });

  act(() => {
    result.current.deleteConversation('thread-1');
  });

  await waitFor(() => {
    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });
  expect(result.current.conversations.map((threadItem) => threadItem.id)).toEqual(['thread-1']);
  await waitFor(() => {
    expect(Reflect.get(result.current, 'lastError')).toMatchObject({ message: 'Delete failed' });
  });
  expect(swrMutateMock).not.toHaveBeenCalled();
});
