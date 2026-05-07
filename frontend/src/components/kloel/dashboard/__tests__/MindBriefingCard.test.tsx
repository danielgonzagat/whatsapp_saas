import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mockNarrate = vi.fn();

vi.mock('@/hooks/useMind', () => ({
  useMindNarrate: () => mockNarrate(),
  useMindBeliefs: vi.fn(() => ({ beliefs: [], isLoading: false, error: null, mutate: vi.fn() })),
  useMindLift: vi.fn(() => ({ lift: undefined, isLoading: false, error: null, mutate: vi.fn() })),
  useMindAllBeliefs: vi.fn(() => ({
    replyBeliefs: { beliefs: [], isLoading: false, error: null, mutate: vi.fn() },
    conversionBeliefs: { beliefs: [], isLoading: false, error: null, mutate: vi.fn() },
  })),
  useMindAllLifts: vi.fn(() => ({
    followup: { lift: undefined, isLoading: false, error: null, mutate: vi.fn() },
    sendWindow: { lift: undefined, isLoading: false, error: null, mutate: vi.fn() },
    offerDiscount: { lift: undefined, isLoading: false, error: null, mutate: vi.fn() },
  })),
  useMindTick: vi.fn(() => ({ tick: undefined, isLoading: false, error: null, trigger: vi.fn() })),
}));

import { MindBriefingCard } from '../MindBriefingCard';

describe('MindBriefingCard', () => {
  it('renders the MIND Briefing header', () => {
    mockNarrate.mockReturnValue({
      narrate: undefined,
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    });

    render(<MindBriefingCard />);
    expect(screen.getByText('MIND Briefing')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    mockNarrate.mockReturnValue({
      narrate: undefined,
      isLoading: true,
      error: null,
      mutate: vi.fn(),
    });

    render(<MindBriefingCard />);
    expect(screen.getByText('Analisando dados do workspace...')).toBeInTheDocument();
  });

  it('shows error state', () => {
    mockNarrate.mockReturnValue({
      narrate: undefined,
      isLoading: false,
      error: new Error('unavailable'),
      mutate: vi.fn(),
    });

    render(<MindBriefingCard />);
    expect(
      screen.getByText('MIND indisponivel no momento. O motor de crencas continua operando.'),
    ).toBeInTheDocument();
  });

  it('renders the briefing text when data is available', () => {
    mockNarrate.mockReturnValue({
      narrate: { briefing: 'Mente calibrada com 142 crencas ativas e 3 decisoes pendentes.' },
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    });

    render(<MindBriefingCard />);
    expect(
      screen.getByText('Mente calibrada com 142 crencas ativas e 3 decisoes pendentes.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
  });

  it('shows empty state when no briefing data', () => {
    mockNarrate.mockReturnValue({
      narrate: undefined,
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    });

    render(<MindBriefingCard />);
    expect(
      screen.getByText('Nenhum briefing disponivel. Execute um tick para calibrar a mente.'),
    ).toBeInTheDocument();
  });
});
