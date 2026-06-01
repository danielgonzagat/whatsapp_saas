import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from './core';
import { getMemoryList, getMemoryStats, saveProduct, searchMemory } from './memory';

const apiFetchMock = vi.mocked(apiFetch);

const memoryItem = {
  id: 'mem-1',
  key: 'k',
  value: { ok: true },
  type: 'general',
  createdAt: '2026-06-01T00:00:00.000Z',
};

describe('memory API truthfulness', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('returns confirmed memory stats', async () => {
    const stats = { totalItems: 3, products: 1, knowledge: 2 };
    apiFetchMock.mockResolvedValueOnce({ data: stats, status: 200 });

    await expect(getMemoryStats('workspace-1')).resolves.toEqual(stats);
  });

  it('rejects memory stats without confirmed payload', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: undefined, status: 200 });

    await expect(getMemoryStats('workspace-1')).rejects.toThrow(
      'Memory stats did not return a confirmed payload',
    );
  });

  it('returns confirmed memory list payloads', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: { memories: [memoryItem] }, status: 200 });

    await expect(getMemoryList('workspace-1')).resolves.toEqual([memoryItem]);
  });

  it('rejects missing memory list payloads instead of returning a fake empty list', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: undefined, status: 200 });

    await expect(getMemoryList('workspace-1')).rejects.toThrow(
      'Memory list did not return a confirmed payload',
    );
  });

  it('saves products through the real product memory contract', async () => {
    const response = { status: 'saved', memory: { id: 'product-1' } };
    apiFetchMock.mockResolvedValueOnce({ data: response, status: 201 });

    await expect(
      saveProduct('workspace-1', {
        productId: 'product-1',
        name: 'Produto',
        description: 'Descricao',
        price: 100,
      }),
    ).resolves.toEqual(response);
  });

  it('rejects unconfirmed product saves', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: { status: 'ignored' }, status: 200 });

    await expect(
      saveProduct('workspace-1', {
        productId: 'product-1',
        name: 'Produto',
        description: 'Descricao',
        price: 100,
      }),
    ).rejects.toThrow('Product memory save was not confirmed');
  });

  it('returns confirmed memory search payloads', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: { memories: [memoryItem] }, status: 200 });

    await expect(searchMemory('workspace-1', 'produto')).resolves.toEqual([memoryItem]);
  });

  it('rejects missing search payloads instead of returning a fake empty list', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: undefined, status: 200 });

    await expect(searchMemory('workspace-1', 'produto')).rejects.toThrow(
      'Memory search did not return a confirmed payload',
    );
  });
});
