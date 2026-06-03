import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from './core';
import { listObjectionScripts, saveObjectionScript } from './objections';

const apiFetchMock = vi.mocked(apiFetch);

describe('objection memory API truthfulness', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'));
  });

  it('saves objection scripts with the backend category contract', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: { status: 'saved', memory: { id: 'mem-1' } }, status: 201 });

    await expect(saveObjectionScript('workspace-1', 'Caro', 'Mostre ROI')).resolves.toEqual({
      success: true,
    });
    expect(apiFetchMock).toHaveBeenCalledWith('/kloel/memory/workspace-1/save', {
      method: 'POST',
      body: {
        key: 'objection_1780315200000',
        value: { objection: 'Caro', response: 'Mostre ROI' },
        category: 'objection_script',
        content: 'OBJEÇÃO: Caro\nRESPOSTA: Mostre ROI',
      },
    });
  });

  it('rejects unconfirmed objection script saves', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: { status: 'ignored' }, status: 200 });

    await expect(saveObjectionScript('workspace-1', 'Caro', 'Mostre ROI')).rejects.toThrow(
      'Objection script save was not confirmed',
    );
  });

  it('lists objection scripts from confirmed memory payloads', async () => {
    apiFetchMock.mockResolvedValueOnce({
      data: {
        memories: [
          { id: 'mem-1', value: { objection: 'Caro', response: 'Mostre ROI' } },
        ],
      },
      status: 200,
    });

    await expect(listObjectionScripts('workspace-1')).resolves.toEqual([
      { id: 'mem-1', objection: 'Caro', response: 'Mostre ROI' },
    ]);
  });

  it('rejects objection list API errors instead of returning a fake empty list', async () => {
    apiFetchMock.mockResolvedValueOnce({ error: 'Memory offline', status: 503 });

    await expect(listObjectionScripts('workspace-1')).rejects.toThrow('Memory offline');
  });

  it('rejects objection list responses without confirmed payload', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: undefined, status: 200 });

    await expect(listObjectionScripts('workspace-1')).rejects.toThrow(
      'Objection script list did not return a confirmed payload',
    );
  });
});
