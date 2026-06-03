import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getDashboardStats,
  DashboardStatsResponse,
} from './dashboard';

const { apiFetch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('./core', () => ({
  apiFetch,
  buildQuery: vi.fn((params: Record<string, string | number | undefined | null>) => {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return qs ? `?${qs}` : '';
  }),
}));

const baseStats: DashboardStatsResponse = {
  contacts: 42,
  campaigns: 5,
  flows: 12,
  messages: 300,
  deliveryRate: 0.95,
  readRate: 0.87,
  errorRate: 0.02,
  activeConversations: 8,
  healthScore: 92,
  avgLatency: 120,
  flowCompleted: 10,
  flowRunning: 1,
  flowFailed: 1,
  billingSuspended: false,
};

describe('getDashboardStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns stats on success', async () => {
    apiFetch.mockResolvedValueOnce({ data: baseStats, status: 200 });

    const result = await getDashboardStats();
    expect(result).toEqual(baseStats);
    expect(apiFetch).toHaveBeenCalledWith('/dashboard/stats');
  });

  it('throws when the API returns an error', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Service Unavailable', status: 503 });

    await expect(getDashboardStats()).rejects.toThrow('Service Unavailable');
  });

  it('throws when the backend does not confirm a stats payload', async () => {
    apiFetch.mockResolvedValueOnce({ data: undefined, status: 200 });

    await expect(getDashboardStats()).rejects.toThrow(
      'Dashboard stats did not return a confirmed payload',
    );
  });

  it('throws on failed status even when the envelope omits an error message', async () => {
    apiFetch.mockResolvedValueOnce({ data: baseStats, status: 503 });

    await expect(getDashboardStats()).rejects.toThrow('Erro ao carregar dashboard');
  });
});
