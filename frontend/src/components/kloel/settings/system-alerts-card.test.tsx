import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SystemHealthSnapshot } from './system-alerts';

const { mockUseSWR } = vi.hoisted(() => ({
  mockUseSWR: vi.fn(),
}));

vi.mock('swr', () => ({
  default: (...args: unknown[]) => mockUseSWR(...args),
}));

import { SystemAlertsCard } from './system-alerts-card';

describe('SystemAlertsCard', () => {
  it('shows a loading state while runtime health is being fetched', () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
    });

    render(<SystemAlertsCard />);

    expect(
      screen.getByText('Carregando saúde consolidada do backend, worker e integrações críticas.'),
    ).toBeInTheDocument();
  });

  it('renders summary pills and healthy runtime status from /health/system', () => {
    const snapshot: SystemHealthSnapshot = {
      status: 'UP',
      details: {
        database: { status: 'UP' },
        redis: { status: 'UP' },
        whatsapp: { status: 'UP', connectedWorkspaces: 1 },
        worker: { status: 'UP' },
        storage: { status: 'UP', driver: 'r2' },
        config: { status: 'CONFIGURED', missing: [] },
        openai: { status: 'CONFIGURED' },
        anthropic: { status: 'CONFIGURED' },
        stripe: { status: 'CONFIGURED' },
        googleAuth: { status: 'CONFIGURED' },
        timestamp: '2026-04-18T16:20:00.000Z',
      },
    };

    mockUseSWR.mockReturnValue({
      data: snapshot,
      error: undefined,
      isLoading: false,
    });

    render(<SystemAlertsCard />);

    expect(screen.getByText('Todos os serviços críticos estão operacionais.')).toBeInTheDocument();
    expect(screen.getByText('Banco')).toBeInTheDocument();
    expect(screen.getByText('Redis')).toBeInTheDocument();
    expect(screen.getByText('Meta')).toBeInTheDocument();
  });

  it('surfaces a runtime fetch error as an operator-visible alert', () => {
    mockUseSWR.mockReturnValue({
      data: undefined,
      error: new Error('HTTP 503'),
      isLoading: false,
    });

    render(<SystemAlertsCard />);

    expect(screen.getByText('Não foi possível carregar a saúde do sistema.')).toBeInTheDocument();
    expect(screen.getByText('Ver como resolver')).toBeInTheDocument();
  });
});
