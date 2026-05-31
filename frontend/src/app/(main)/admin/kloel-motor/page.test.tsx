import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));

import KloelMotorPage from './page';

afterEach(() => {
  cleanup();
  apiFetchMock.mockReset();
});const healthyMotor = {
  status: 'healthy' as const,
  provider: 'deepseek' as const,
  hasPrimaryKey: true,
  hasAnthropicFallback: true,
  notes: [] as string[],
};

const degradedMotor = {
  status: 'degraded' as const,
  provider: null,
  hasPrimaryKey: false,
  hasAnthropicFallback: true,
  notes: [
    'Nenhuma chave LLM primaria encontrada (DEEPSEEK_API_KEY / LLM_API_KEY / OPENAI_API_KEY).',
  ],
};

const healthyFullDiag = {
  deploy: {
    gitSha: 'abc1234',
    buildTimestamp: '2026-05-28T10:00:00Z',
    nodeEnv: 'production',
  },
  database: { connected: true, latencyMs: 3 },
};describe('KloelMotorPage', () => {
  it('renders loading state initially', () => {
    apiFetchMock.mockImplementation(() => new Promise(() => {}));
    render(<KloelMotorPage />);
    expect(screen.getByText('Carregando...')).toBeTruthy();
  });

  it('renders healthy motor status', async () => {
    apiFetchMock
      .mockResolvedValueOnce({ data: healthyMotor, error: null })
      .mockResolvedValueOnce({ data: healthyFullDiag, error: null });

    render(<KloelMotorPage />);

    expect(await screen.findByText('HEALTHY')).toBeTruthy();
    expect(screen.getByText('deepseek')).toBeTruthy();
    // both hasPrimaryKey and hasAnthropicFallback are true -> two 'yes'
    expect(screen.getAllByText('yes')).toHaveLength(2);
    expect(screen.getByText('abc1234')).toBeTruthy();
    expect(screen.getByText('production')).toBeTruthy();
    expect(screen.getByText('connected (3ms)')).toBeTruthy();
  });

  it('renders degraded motor status with notes', async () => {
    apiFetchMock
      .mockResolvedValueOnce({ data: degradedMotor, error: null })
      .mockResolvedValueOnce({ data: null, error: 'unreachable' });

    render(<KloelMotorPage />);

    expect(await screen.findByText('DEGRADED')).toBeTruthy();
    expect(screen.getByText('none')).toBeTruthy();
    // hasPrimaryKey=false shows 'no', hasAnthropicFallback=true shows 'yes'
    expect(screen.getByText('no')).toBeTruthy();
    expect(screen.getByText('yes')).toBeTruthy();
    expect(screen.getByText(/Nenhuma chave LLM primaria/)).toBeTruthy();
  });

  it('renders error state when fetch fails entirely', async () => {
    apiFetchMock
      .mockResolvedValueOnce({ data: null, error: 'Falha de rede' })
      .mockResolvedValueOnce({ data: null, error: 'timeout' });

    render(<KloelMotorPage />);

    expect(await screen.findByText('Falha de rede')).toBeTruthy();
  });
});
