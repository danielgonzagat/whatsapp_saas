import { beforeEach, describe, expect, it, vi } from 'vitest';
import { launchApi } from './launch';

const { apiFetch } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('./core', () => ({
  apiFetch,
}));

describe('launchApi', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the confirmed launcher envelope on success', async () => {
    const envelope = {
      data: { id: 'launcher-1', name: 'Lancamento', createdAt: '2026-06-01T00:00:00.000Z' },
      status: 201,
    };
    apiFetch.mockResolvedValueOnce(envelope);

    await expect(launchApi.createLauncher({ name: 'Lancamento' })).resolves.toEqual(envelope);
  });

  it('rejects launcher creation without confirmed payload', async () => {
    apiFetch.mockResolvedValueOnce({ data: undefined, status: 201 });

    await expect(launchApi.createLauncher({ name: 'Lancamento' })).rejects.toThrow(
      'Launcher creation did not return a confirmed payload',
    );
  });

  it('rejects group addition without confirmed payload', async () => {
    apiFetch.mockResolvedValueOnce({ data: undefined, status: 200 });

    await expect(launchApi.addGroups('launcher-1', { groupLink: 'https://chat.whatsapp.com/abc' })).rejects.toThrow(
      'Launcher group addition did not return a confirmed payload',
    );
  });

  it('rejects list errors instead of returning a fake list envelope', async () => {
    apiFetch.mockResolvedValueOnce({ error: 'Launchpad offline', status: 503 });

    await expect(launchApi.listLaunchers()).rejects.toThrow('Launchpad offline');
  });
});
