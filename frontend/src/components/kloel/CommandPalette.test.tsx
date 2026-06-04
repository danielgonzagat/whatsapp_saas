import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CommandPalette } from './CommandPalette';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  setQuery: vi.fn(),
  setSelectedIndex: vi.fn(),
  setActiveConversation: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock('./CommandPalette.hooks', () => ({
  useCommandPaletteKeyboard: () => vi.fn(),
}));

vi.mock('./search/use-command-palette', () => ({
  useCommandPalette: () => ({
    groupedResults: [],
    inputRef: { current: null },
    isSearching: false,
    itemRefsRef: { current: [] },
    query: '',
    results: [],
    searchError: null,
    selectedIndex: 0,
    setActiveConversation: mocks.setActiveConversation,
    setQuery: mocks.setQuery,
    setSelectedIndex: mocks.setSelectedIndex,
  }),
}));

describe('CommandPalette', () => {
  it('keeps the search input identifiable for browser auditing', () => {
    render(<CommandPalette open onClose={vi.fn()} onSelect={vi.fn()} mode="conversations" />);

    const input = screen.getByPlaceholderText('Buscar no conteúdo das conversas...');

    expect(input.getAttribute('id')).toBe('kloel-command-palette-search');
    expect(input.getAttribute('name')).toBe('kloelCommandPaletteSearch');
  });
});
