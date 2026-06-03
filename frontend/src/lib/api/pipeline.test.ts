import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mutate } from 'swr';

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from './core';
import { createSalesDeal, moveSalesDeal, type PipelineDeal } from './pipeline';

const apiFetchMock = vi.mocked(apiFetch);
const mutateMock = vi.mocked(mutate);

function makeDeal(id = 'deal-1'): PipelineDeal {
  return {
    id,
    title: 'Venda consultiva',
    value: 990,
    stageId: 'stage-1',
    createdAt: '2026-06-01T00:00:00.000Z',
  };
}

describe('pipeline API mutation truthfulness', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    mutateMock.mockReset();
  });

  it('does not invalidate pipeline when create deal returns no confirmed deal payload', async () => {
    apiFetchMock.mockResolvedValue({ data: undefined, status: 200 });

    await expect(createSalesDeal({ title: 'Venda consultiva' })).rejects.toThrow(
      'Pipeline nao retornou deal confirmado.',
    );
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('invalidates pipeline after a confirmed deal create', async () => {
    const deal = makeDeal();
    apiFetchMock.mockResolvedValue({ data: deal, status: 201 });

    await expect(createSalesDeal({ title: deal.title, value: deal.value })).resolves.toEqual(deal);
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });

  it('does not invalidate pipeline when move deal returns no confirmed deal payload', async () => {
    apiFetchMock.mockResolvedValue({ data: undefined, status: 200 });

    await expect(moveSalesDeal('deal-1', 'stage-2')).rejects.toThrow(
      'Pipeline nao retornou deal confirmado.',
    );
    expect(mutateMock).not.toHaveBeenCalled();
  });
});
