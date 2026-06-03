import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCommandPalette } from './use-command-palette';

const conversationHistory = vi.hoisted(() => ({
  conversations: [] as Array<{
    id: string;
    title: string;
    updatedAt?: string | undefined;
    lastMessagePreview?: string | undefined;
  }>,
  loadAllConversations: vi.fn(),
  setActiveConversation: vi.fn(),
}));

vi.mock('@/hooks/useConversationHistory', () => ({
  useConversationHistory: () => conversationHistory,
}));

vi.mock('@/lib/api/kloel-search', () => ({
  searchKloelGlobal: vi.fn(),
}));

vi.mock('@/lib/kloel-conversations', () => ({
  searchKloelThreads: vi.fn(),
}));

describe('useCommandPalette', () => {
  beforeEach(() => {
    conversationHistory.conversations = [];
    conversationHistory.loadAllConversations.mockReset();
    conversationHistory.setActiveConversation.mockReset();
  });

  it('surfaces conversation history load failures instead of showing an empty recents palette', async () => {
    conversationHistory.loadAllConversations.mockRejectedValueOnce(
      new Error('Invalid Kloel thread payload'),
    );

    const { result } = renderHook(() =>
      useCommandPalette({ open: true, mode: 'conversations' }),
    );

    await waitFor(() => {
      expect(result.current.searchError).toBe('Invalid Kloel thread payload');
    });
  });
});
