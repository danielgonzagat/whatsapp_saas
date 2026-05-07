import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/useWorkspaceId', () => ({
  useWorkspaceId: () => 'test-ws',
}));

vi.mock('@/hooks/useMind', () => ({
  useMindNarrate: () => ({
    narrate: { briefing: 'Mente calibrada.' },
    isLoading: false,
    error: null,
    mutate: vi.fn(),
  }),
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

import { MindChat } from '../MindChat';

describe('MindChat', () => {
  it('renders the MIND Chat header', () => {
    render(<MindChat />);
    expect(screen.getByText('MIND Chat')).toBeInTheDocument();
  });

  it('shows setup-required state when endpoint is unavailable', () => {
    render(<MindChat />);
    expect(screen.getByText('Endpoint MIND Chat necessario')).toBeInTheDocument();
    expect(
      screen.getByText(/O backend ainda nao expoe POST \/mind\/:workspaceId\/chat/),
    ).toBeInTheDocument();
  });

  it('shows current MIND briefing context in setup-required state', () => {
    render(<MindChat />);
    expect(screen.getByText('Contexto atual do MIND')).toBeInTheDocument();
    expect(screen.getByText('Mente calibrada.')).toBeInTheDocument();
  });
});
