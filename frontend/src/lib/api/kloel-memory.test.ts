import { mutate } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from './core';
import { kloelMemoryApi } from './kloel-memory';

const apiFetchMock = vi.mocked(apiFetch);
const mutateMock = vi.mocked(mutate);

describe('kloelMemoryApi truthfulness', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    mutateMock.mockReset();
  });

  it('saves memory through the workspace-scoped backend route', async () => {
    const envelope = { data: { status: 'saved', memory: { id: 'mem-1' } }, status: 201 };
    apiFetchMock.mockResolvedValueOnce(envelope);

    await expect(kloelMemoryApi.save('workspace-1', 'key-1', { ok: true }, 'general')).resolves.toEqual(
      envelope,
    );
    expect(apiFetchMock).toHaveBeenCalledWith('/kloel/memory/workspace-1/save', {
      method: 'POST',
      body: { key: 'key-1', value: { ok: true }, category: 'general', content: undefined },
    });
  });

  it('rejects memory save responses without saved confirmation', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: { status: 'ignored' }, status: 200 });

    await expect(kloelMemoryApi.save('workspace-1', 'key-1', { ok: true })).rejects.toThrow(
      'Memory save did not return a saved confirmation',
    );
  });

  it('does not invalidate memory cache after failed delete status', async () => {
    apiFetchMock.mockResolvedValueOnce({ error: 'Memory not found', status: 404 });

    await expect(kloelMemoryApi.delete('workspace-1', 'key-1')).rejects.toThrow('Memory not found');
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('does not invalidate memory cache when delete returns not_found', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: { status: 'not_found', key: 'key-1' }, status: 200 });

    await expect(kloelMemoryApi.delete('workspace-1', 'key-1')).rejects.toThrow(
      'Memory delete was not confirmed',
    );
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('invalidates memory cache after confirmed delete', async () => {
    const envelope = { data: { status: 'deleted', key: 'key-1' }, status: 200 };
    apiFetchMock.mockResolvedValueOnce(envelope);

    await expect(kloelMemoryApi.delete('workspace-1', 'key-1')).resolves.toEqual(envelope);
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });
});
