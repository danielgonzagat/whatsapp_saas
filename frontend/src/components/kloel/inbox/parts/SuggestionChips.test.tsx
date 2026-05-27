import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-copilot-suggestions', () => ({
  useCopilotSuggestions: vi.fn(),
}));

vi.mock('@/hooks/useSocket', () => ({
  useSocket: vi.fn(() => ({ isConnected: false, subscribe: vi.fn() })),
}));

import { useCopilotSuggestions } from '@/hooks/use-copilot-suggestions';
import { SuggestionChips } from './SuggestionChips';

describe('SuggestionChips', () => {
  const onSelectSuggestion = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCopilotSuggestions).mockReturnValue({
      suggestions: [],
      context: undefined,
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });
  });

  it('renders nothing when no contactId is provided', () => {
    const { container } = render(
      <SuggestionChips
        workspaceId="ws-1"
        contactId={null}
        onSelectSuggestion={onSelectSuggestion}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders suggestions as clickable chips', () => {
    vi.mocked(useCopilotSuggestions).mockReturnValue({
      suggestions: ['Olá! Como posso ajudar?', 'Quer ver nossos produtos?', 'Fechamos agora?'],
      context: 'geral',
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });

    render(
      <SuggestionChips
        workspaceId="ws-1"
        contactId="c-1"
        onSelectSuggestion={onSelectSuggestion}
      />,
    );

    expect(screen.getByText('Olá! Como posso ajudar?')).toBeInTheDocument();
    expect(screen.getByText('Quer ver nossos produtos?')).toBeInTheDocument();
    expect(screen.getByText('Fechamos agora?')).toBeInTheDocument();
  });

  it('calls onSelectSuggestion when a chip is clicked', () => {
    vi.mocked(useCopilotSuggestions).mockReturnValue({
      suggestions: ['Olá! Como posso ajudar?'],
      context: 'geral',
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });

    render(
      <SuggestionChips
        workspaceId="ws-1"
        contactId="c-1"
        onSelectSuggestion={onSelectSuggestion}
      />,
    );

    fireEvent.click(screen.getByText('Olá! Como posso ajudar?'));
    expect(onSelectSuggestion).toHaveBeenCalledWith('Olá! Como posso ajudar?');
  });

  it('shows loading state when loading and no suggestions yet', () => {
    vi.mocked(useCopilotSuggestions).mockReturnValue({
      suggestions: [],
      context: undefined,
      isLoading: true,
      error: undefined,
      mutate: vi.fn(),
    });

    render(
      <SuggestionChips
        workspaceId="ws-1"
        contactId="c-1"
        onSelectSuggestion={onSelectSuggestion}
      />,
    );

    expect(screen.getByText('Gerando sugestões...')).toBeInTheDocument();
  });

  it('renders nothing when suggestions array is empty and not loading', () => {
    vi.mocked(useCopilotSuggestions).mockReturnValue({
      suggestions: [],
      context: undefined,
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });

    const { container } = render(
      <SuggestionChips
        workspaceId="ws-1"
        contactId="c-1"
        onSelectSuggestion={onSelectSuggestion}
      />,
    );

    expect(container.firstChild).toBeNull();
  });
});
