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

  it('preserves spaces between highlighted command palette title tokens', async () => {
    const [{ render, screen }, { CommandPaletteItem }] = await Promise.all([
      import('@testing-library/react'),
      import('./CommandPaletteItem'),
    ]);

    render(
      <CommandPaletteItem
        item={{
          id: 'product_1',
          type: 'product',
          title: 'E2E Smoke Product (edited)',
          matchedContent: 'Produto - DRAFT',
          href: '/products/product_1',
        }}
        isSelected={false}
        hasQuery={true}
        query="E2E Smoke"
        groupLabel="2 JUN"
        onHover={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    const result = screen.getByRole('button', { name: /E2E Smoke Product \(edited\)/ });

    expect(result.textContent).toContain('E2E Smoke Product (edited)');
  });
});
