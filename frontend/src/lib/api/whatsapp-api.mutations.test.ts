import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mutate } from 'swr';

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
  buildQuery: vi.fn(() => ''),
}));

import { apiFetch } from './core';
import { whatsappApi } from './whatsapp-api';

const apiFetchMock = vi.mocked(apiFetch);
const mutateMock = vi.mocked(mutate);

describe('whatsappApi mutating operations', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    mutateMock.mockReset();
  });

  it('does not invalidate WhatsApp cache when backlog start returns an API error envelope', async () => {
    apiFetchMock.mockResolvedValue({ error: 'Backlog rejected', status: 503 });

    await expect(whatsappApi.startBacklog('pause_autonomy')).rejects.toThrow('Backlog rejected');
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('invalidates WhatsApp cache after a confirmed backlog start', async () => {
    apiFetchMock.mockResolvedValue({ data: { queued: true, runId: 'run-1' }, status: 200 });

    await expect(whatsappApi.startBacklog('pause_autonomy')).resolves.toEqual({
      data: { queued: true, runId: 'run-1' },
      status: 200,
    });
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });

  it('does not invalidate WhatsApp cache when claim session returns an API error envelope', async () => {
    apiFetchMock.mockResolvedValue({ error: 'Session claim denied', status: 409 });

    await expect(whatsappApi.claimSession('workspace-source')).rejects.toThrow('Session claim denied');
    expect(mutateMock).not.toHaveBeenCalled();
  });
});
