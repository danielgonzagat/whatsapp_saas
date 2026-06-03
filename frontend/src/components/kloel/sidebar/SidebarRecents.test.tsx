import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());
const loadAllConversationsMock = vi.hoisted(() => vi.fn());
const routerPushMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

vi.mock('@/lib/i18n/t', () => ({
  kloelT: (value: string) => value,
}));

vi.mock('@/hooks/useConversationHistory', () => ({
  useConversationHistory: () => ({
    conversations: [
      {
        id: 'thread-1',
        title: 'Conversa real',
        updatedAt: '2026-06-01T13:00:00.000Z',
        lastMessagePreview: 'preview',
      },
    ],
    setActiveConversation: vi.fn(),
    hasMoreConversations: false,
    isLoadingMoreConversations: false,
    loadMoreConversations: vi.fn(),
    loadAllConversations: loadAllConversationsMock,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPushMock }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

import { SidebarRecents } from './SidebarRecents';

describe('SidebarRecents', () => {
  const createObjectURLMock = vi.fn(() => 'blob:kloel-export');
  const revokeObjectURLMock = vi.fn();

  beforeEach(() => {
    apiFetchMock.mockReset();
    loadAllConversationsMock.mockReset();
    routerPushMock.mockReset();
    createObjectURLMock.mockClear();
    revokeObjectURLMock.mockClear();
    loadAllConversationsMock.mockResolvedValue([
      {
        id: 'thread-1',
        title: 'Conversa real',
        updatedAt: '2026-06-01T13:00:00.000Z',
        lastMessagePreview: 'preview',
      },
    ]);
    vi.stubGlobal('URL', {
      createObjectURL: createObjectURLMock,
      revokeObjectURL: revokeObjectURLMock,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not export a fake empty message list when the backend message payload is malformed', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: { items: [] }, status: 200 });

    render(<SidebarRecents expanded />);
    fireEvent.click(screen.getByTitle('Exportar todas as conversas'));

    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/kloel/threads/thread-1/messages');
    });
    await waitFor(() => {
      expect(screen.getByText('Invalid Kloel thread messages payload')).toBeTruthy();
    });
    expect(createObjectURLMock).not.toHaveBeenCalled();
  });
});
