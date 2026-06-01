import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() })),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api';
import useSWR from 'swr';

import {
  useOrderAlerts,
  useOrderPipeline,
  useOrders,
  useOrderStats,
  useReturnOrder,
  useSales,
  useSalesChart,
  useSalesStats,
  useSubscriptionStats,
  useSubscriptions,
} from './useSales';

type ApiFetchResult = Awaited<ReturnType<typeof apiFetch>>;
type MutatingApiFetchResult = ApiFetchResult & { success?: boolean };

const apiFetchMock = vi.mocked(apiFetch);
const useSWRMock = vi.mocked(useSWR);

beforeEach(() => {
  apiFetchMock.mockReset();
});

describe('useSales', () => {
  beforeEach(() => {
    useSWRMock.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
  });

  it('returns empty sales and isLoading while loading', () => {
    const { result } = renderHook(() => useSales());
    expect(result.current.sales).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.total).toBe(0);
  });

  it('returns sales from data.sales', () => {
    const items = [{ id: 's1', amount: 100 }];
    useSWRMock.mockReturnValue({
      data: { sales: items, count: 1 },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useSales());
    expect(result.current.sales).toEqual(items);
    expect(result.current.total).toBe(1);
    expect(result.current.isLoading).toBe(false);
  });

  it('surfaces malformed sales payload instead of a fake empty list', () => {
    useSWRMock.mockReturnValue({
      data: {},
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useSales());

    expect(result.current.sales).toEqual([]);
    expect(result.current.total).toBe(0);
    expect((result.current.error as Error).message).toBe('Invalid sales payload');
  });

  it('returns error on SWR failure', () => {
    const err = new Error('fail');
    useSWRMock.mockReturnValue({
      data: undefined,
      error: err,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useSales());
    expect(result.current.error).toBe(err);
  });
});

describe('useSalesStats', () => {
  it('returns empty stats object while loading', () => {
    useSWRMock.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useSalesStats());
    expect(result.current.stats).toEqual({});
    expect(result.current.isLoading).toBe(true);
  });

  it('returns stats data when loaded', () => {
    useSWRMock.mockReturnValue({
      data: {
        totalRevenue: 5000,
        totalTransactions: 42,
        totalPending: 250,
        pendingCount: 3,
        avgTicket: 119,
        revenueTrend: 12,
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useSalesStats());
    expect(result.current.stats.totalRevenue).toBe(5000);
  });

  it('surfaces malformed sales stats payload instead of fake empty stats', () => {
    useSWRMock.mockReturnValue({
      data: {},
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useSalesStats());
    const current = result.current as typeof result.current & { error?: Error };

    expect(result.current.stats).toEqual({});
    expect(current.error?.message).toBe('Invalid sales stats payload');
  });
});

describe('useSalesChart', () => {
  it('returns empty chart while loading', () => {
    useSWRMock.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useSalesChart());
    expect(result.current.chart).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('returns chart array when loaded', () => {
    useSWRMock.mockReturnValue({
      data: { chart: [10, 20, 30] },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useSalesChart());
    expect(result.current.chart).toEqual([10, 20, 30]);
  });

  it('surfaces malformed sales chart payload instead of a fake empty chart', () => {
    useSWRMock.mockReturnValue({
      data: { chart: ['bad'] },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useSalesChart());
    const current = result.current as typeof result.current & { error?: Error };

    expect(result.current.chart).toEqual([]);
    expect(current.error?.message).toBe('Invalid sales chart payload');
  });
});

describe('useSubscriptions', () => {
  it('surfaces malformed subscription payload instead of a fake empty list', () => {
    useSWRMock.mockReturnValue({
      data: {},
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useSubscriptions());
    const current = result.current as typeof result.current & { error?: Error };

    expect(result.current.subscriptions).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(current.error?.message).toBe('Invalid subscriptions payload');
  });
});

describe('useSubscriptionStats', () => {
  it('returns subscription stats when loaded', () => {
    useSWRMock.mockReturnValue({
      data: {
        mrr: 1000,
        arr: 12000,
        activeCount: 7,
        totalCount: 9,
        churnRate: 2.5,
        avgLtv: 500,
        lifecycle: { active: 7 },
      },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useSubscriptionStats());

    expect(result.current.stats.mrr).toBe(1000);
  });

  it('surfaces malformed subscription stats payload instead of fake empty stats', () => {
    useSWRMock.mockReturnValue({
      data: {},
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useSubscriptionStats());
    const current = result.current as typeof result.current & { error?: Error };

    expect(result.current.stats).toEqual({});
    expect(current.error?.message).toBe('Invalid subscription stats payload');
  });
});

describe('useOrders', () => {
  it('surfaces malformed order payload instead of a fake empty list', () => {
    useSWRMock.mockReturnValue({
      data: {},
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useOrders());
    const current = result.current as typeof result.current & { error?: Error };

    expect(result.current.orders).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(current.error?.message).toBe('Invalid orders payload');
  });
});

describe('useOrderStats', () => {
  it('surfaces malformed order stats payload instead of fake empty stats', () => {
    useSWRMock.mockReturnValue({
      data: {},
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useOrderStats());
    const current = result.current as typeof result.current & { error?: Error };

    expect(result.current.stats).toEqual({});
    expect(current.error?.message).toBe('Invalid order stats payload');
  });
});

describe('useOrderPipeline', () => {
  it('surfaces malformed order pipeline payload instead of fake empty pipeline', () => {
    useSWRMock.mockReturnValue({
      data: {},
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useOrderPipeline());
    const current = result.current as typeof result.current & { error?: Error };

    expect(result.current.pipeline).toEqual({});
    expect(current.error?.message).toBe('Invalid order pipeline payload');
  });
});

describe('useOrderAlerts', () => {
  it('returns empty alerts while loading', () => {
    useSWRMock.mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useOrderAlerts());
    expect(result.current.alerts).toEqual([]);
    expect(result.current.counts).toEqual({});
    expect(result.current.isLoading).toBe(true);
  });

  it('returns alerts and counts when loaded', () => {
    useSWRMock.mockReturnValue({
      data: { alerts: [{ id: 'a1', severity: 'high' }], counts: { high: 1 } },
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });
    const { result } = renderHook(() => useOrderAlerts());
    expect(result.current.alerts).toHaveLength(1);
    expect(result.current.counts).toEqual({ high: 1 });
  });

  it('surfaces malformed order alerts payload instead of fake empty alerts', () => {
    useSWRMock.mockReturnValue({
      data: {},
      error: undefined,
      isLoading: false,
      mutate: vi.fn(),
      isValidating: false,
    });

    const { result } = renderHook(() => useOrderAlerts());
    const current = result.current as typeof result.current & { error?: Error };

    expect(result.current.alerts).toEqual([]);
    expect(result.current.counts).toEqual({});
    expect(current.error?.message).toBe('Invalid order alerts payload');
  });

  it('does not refresh generated alerts when the backend returns an error', async () => {
    const mutate = vi.fn();
    useSWRMock.mockReturnValue({
      data: { alerts: [], counts: {} },
      error: undefined,
      isLoading: false,
      mutate,
      isValidating: false,
    });
    apiFetchMock.mockResolvedValue({ error: 'provider offline', status: 502 });

    const { result } = renderHook(() => useOrderAlerts());

    await expect(result.current.generateAlerts()).rejects.toThrow('provider offline');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('does not refresh resolved alerts when the backend rejects success', async () => {
    const mutate = vi.fn();
    const failedResponse: MutatingApiFetchResult = { status: 200, success: false };
    useSWRMock.mockReturnValue({
      data: { alerts: [], counts: {} },
      error: undefined,
      isLoading: false,
      mutate,
      isValidating: false,
    });
    apiFetchMock.mockResolvedValue(failedResponse);

    const { result } = renderHook(() => useOrderAlerts());

    await expect(result.current.resolveAlert('a1')).rejects.toThrow(
      'Não foi possível resolver o alerta de pedido.',
    );
    expect(mutate).not.toHaveBeenCalled();
  });

  it('refreshes alerts after a confirmed resolve mutation', async () => {
    const mutate = vi.fn();
    const okResponse: MutatingApiFetchResult = { status: 200, success: true };
    useSWRMock.mockReturnValue({
      data: { alerts: [], counts: {} },
      error: undefined,
      isLoading: false,
      mutate,
      isValidating: false,
    });
    apiFetchMock.mockResolvedValue(okResponse);

    const { result } = renderHook(() => useOrderAlerts());

    await expect(result.current.resolveAlert('a1')).resolves.toBe(okResponse);
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});

describe('useReturnOrder', () => {
  it('rejects failed physical return mutations', async () => {
    const failedResponse: MutatingApiFetchResult = { status: 200, success: false };
    apiFetchMock.mockResolvedValue(failedResponse);

    const { result } = renderHook(() => useReturnOrder());

    await expect(result.current.returnOrder('order-1')).rejects.toThrow(
      'Não foi possível solicitar devolução do pedido.',
    );
  });
});
