import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(() => ({ data: undefined, error: undefined, isLoading: true, mutate: vi.fn() })),
  useSWRConfig: vi.fn(() => ({ mutate: vi.fn() })),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

vi.mock('@/lib/api/core', () => ({
  apiFetch: vi.fn(),
}));

import useSWR from 'swr';

import {
  useAdSpends,
  useAfterPay,
  useAssinaturas,
  useChurn,
  useNps,
  useVendas,
  useVendasDaily,
} from './useDetailedReports';

function mockSWR(data: unknown, isLoading = false, error: Error | undefined = undefined) {
  vi.mocked(useSWR).mockReturnValue({
    data,
    error,
    isLoading,
    mutate: vi.fn(),
    isValidating: false,
  });
}

describe('useDetailedReports payload adapters', () => {
  beforeEach(() => {
    vi.mocked(useSWR).mockReturnValue({
      data: undefined,
      error: undefined,
      isLoading: true,
      mutate: vi.fn(),
      isValidating: false,
    });
  });

  it('returns vendas from the backend paginated reports contract', () => {
    const rows = [{ id: 'sale-1', totalInCents: 1500 }];
    mockSWR({ data: rows, total: 1, page: 1 });

    const { result } = renderHook(() => useVendas());
    const current = result.current as typeof result.current & { error?: Error };

    expect(result.current.vendas).toEqual(rows);
    expect(result.current.total).toBe(1);
    expect(current.error).toBeUndefined();
  });

  it('surfaces malformed vendas payload instead of a fake empty list', () => {
    mockSWR({ vendas: [] });

    const { result } = renderHook(() => useVendas());
    const current = result.current as typeof result.current & { error?: Error };

    expect(result.current.vendas).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(current.error?.message).toBe('Invalid vendas payload');
  });

  it('surfaces malformed direct-array daily payload instead of a fake empty list', () => {
    mockSWR({ data: [] });

    const { result } = renderHook(() => useVendasDaily());
    const current = result.current as typeof result.current & { error?: Error };

    expect(result.current.daily).toEqual([]);
    expect(current.error?.message).toBe('Invalid vendas daily payload');
  });

  it('surfaces malformed afterpay payload instead of a fake empty list', () => {
    mockSWR({ data: [], count: 0 });

    const { result } = renderHook(() => useAfterPay());
    const current = result.current as typeof result.current & { error?: Error };

    expect(result.current.afterpay).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(current.error?.message).toBe('Invalid afterpay payload');
  });

  it('surfaces malformed churn payload instead of a synthetic zero report', () => {
    mockSWR({ total: 0, data: [] });

    const { result } = renderHook(() => useChurn());
    const current = result.current as typeof result.current & { error?: Error };

    expect(result.current.churn).toEqual({ total: 0, data: [], monthly: [] });
    expect(current.error?.message).toBe('Invalid churn payload');
  });

  it('surfaces malformed assinaturas payload instead of fake empty rows', () => {
    mockSWR({ data: [], total: 0, summary: {} });

    const { result } = renderHook(() => useAssinaturas());
    const current = result.current as typeof result.current & { error?: Error };

    expect(result.current.assinaturas).toEqual([]);
    expect(result.current.total).toBe(0);
    expect(result.current.summary).toEqual([]);
    expect(current.error?.message).toBe('Invalid assinaturas payload');
  });

  it('normalizes backend ad-spend data rows into the report shape expected by the UI', () => {
    const rows = [
      { id: 'ad-1', amount: 120, platform: 'Meta', date: '2026-05-01' },
      { id: 'ad-2', amount: 80, platform: 'Google', date: '2026-05-02' },
      { id: 'ad-3', amount: 20, platform: 'Meta', date: '2026-05-03' },
    ];
    mockSWR({ data: rows, total: 3, page: 1 });

    const { result } = renderHook(() => useAdSpends());
    const current = result.current as typeof result.current & { error?: Error };

    expect(result.current.adSpend.entries).toEqual(rows);
    expect(result.current.adSpend.total).toBe(3);
    expect(result.current.adSpend.byPlatform).toEqual({ Google: 80, Meta: 140 });
    expect(current.error).toBeUndefined();
  });

  it('surfaces malformed ad-spend payload instead of a synthetic zero report', () => {
    mockSWR({ entries: [] });

    const { result } = renderHook(() => useAdSpends());
    const current = result.current as typeof result.current & { error?: Error };

    expect(result.current.adSpend).toEqual({ total: 0, byPlatform: {}, entries: [] });
    expect(current.error?.message).toBe('Invalid ad spend payload');
  });

  it('surfaces malformed NPS payload instead of a synthetic zero report', () => {
    mockSWR({ nps: 0, total: 0, responses: [] });

    const { result } = renderHook(() => useNps());
    const current = result.current as typeof result.current & { error?: Error };

    expect(result.current.nps).toEqual({ nps: 0, avg: '0.0', total: 0, responses: [] });
    expect(current.error?.message).toBe('Invalid NPS payload');
  });
});
