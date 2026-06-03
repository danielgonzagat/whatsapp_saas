import { renderHook } from '@testing-library/react';
import useSWR from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  default: vi.fn(),
}));

vi.mock('@/lib/fetcher', () => ({
  swrFetcher: vi.fn(),
}));

vi.mock('@/lib/api/pipeline', () => ({
  createSalesDeal: vi.fn(),
  moveSalesDeal: vi.fn(),
}));

import { useSalesPipeline } from './useSalesPipeline';

const mutateMock = vi.fn();

type SwrState = {
  data?: unknown;
  error?: Error;
  isLoading?: boolean;
};

const swrStates = new Map<unknown, SwrState>();

function setSwrState(key: unknown, state: SwrState) {
  swrStates.set(key, state);
}

beforeEach(() => {
  mutateMock.mockReset();
  swrStates.clear();
  vi.mocked(useSWR).mockImplementation((key: unknown) => {
    const state = swrStates.get(key) ?? {};
    return {
      data: state.data,
      error: state.error,
      isLoading: state.isLoading ?? false,
      mutate: mutateMock,
      isValidating: false,
    };
  });
});

describe('useSalesPipeline', () => {
  it('surfaces invalid pipeline payloads instead of rendering an empty CRM pipeline', () => {
    setSwrState('/crm/pipelines', { data: { pipelines: [] } });

    const { result } = renderHook(() => useSalesPipeline());

    expect(result.current.pipeline).toBeNull();
    expect(result.current.stages).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Invalid sales pipeline payload');
  });

  it('surfaces invalid deals payloads instead of rendering empty stage deals', () => {
    setSwrState('/crm/pipelines', {
      data: [{ id: 'pipe-1', stages: [{ id: 'stage-1', name: 'Novo' }] }],
    });
    setSwrState('/crm/deals?pipeline=pipe-1', { data: { deals: { id: 'deal-1' } } });

    const { result } = renderHook(() => useSalesPipeline());

    expect(result.current.stages).toHaveLength(1);
    expect(result.current.stages[0]?.deals).toEqual([]);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Invalid sales deals payload');
  });

  it('maps valid enveloped deals into their pipeline stages', () => {
    setSwrState('/crm/pipelines', {
      data: [{ id: 'pipe-1', stages: [{ id: 'stage-1', name: 'Novo' }] }],
    });
    setSwrState('/crm/deals?pipeline=pipe-1', {
      data: { deals: [{ id: 'deal-1', stageId: 'stage-1', value: 100 }] },
    });

    const { result } = renderHook(() => useSalesPipeline());

    expect(result.current.error).toBeUndefined();
    expect(result.current.stages).toHaveLength(1);
    expect(result.current.stages[0]?.deals).toEqual([
      { id: 'deal-1', stageId: 'stage-1', value: 100 },
    ]);
  });
});
