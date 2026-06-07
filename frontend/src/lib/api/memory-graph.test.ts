import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from './core';
import { getMemoryGraph } from './memory-graph';

const apiFetchMock = vi.mocked(apiFetch);

describe('memory graph API truthfulness', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('returns confirmed memory graph payloads without browser cache revalidation', async () => {
    const payload = {
      nodes: [{ id: 'you', label: 'Voce', group: 'core' }],
      edges: [],
    };
    apiFetchMock.mockResolvedValueOnce({ data: payload, status: 200 });

    await expect(getMemoryGraph()).resolves.toEqual(payload);
    expect(apiFetchMock).toHaveBeenCalledWith('/kloel/memory/graph', { cache: 'no-store' });
  });

  it('rejects API errors instead of returning a fake empty graph', async () => {
    apiFetchMock.mockResolvedValueOnce({ error: 'HTTP 304', status: 304 });

    await expect(getMemoryGraph()).rejects.toThrow('HTTP 304');
  });

  it('rejects missing graph payloads instead of returning a fake empty graph', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: undefined, status: 200 });

    await expect(getMemoryGraph()).rejects.toThrow('Memory graph did not return a confirmed payload');
  });
});
