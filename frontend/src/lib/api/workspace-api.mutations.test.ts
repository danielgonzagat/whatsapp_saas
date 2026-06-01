import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mutate } from 'swr';

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
  tokenStorage: {
    getWorkspaceId: vi.fn(),
  },
}));

import { apiFetch, tokenStorage } from './core';
import {
  createApiKey,
  deleteApiKey,
  getWorkspace,
  listApiKeys,
  saveWorkspaceSettings,
  workspaceApi,
} from './workspace';

const apiFetchMock = vi.mocked(apiFetch);
const getWorkspaceIdMock = vi.mocked(tokenStorage.getWorkspaceId);
const mutateMock = vi.mocked(mutate);

describe('workspaceApi mutating operations', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    getWorkspaceIdMock.mockReset();
    mutateMock.mockReset();
    getWorkspaceIdMock.mockReturnValue('workspace-1');
  });

  it('does not invalidate workspace when account update returns an API error envelope', async () => {
    apiFetchMock.mockResolvedValue({ error: 'Workspace update rejected', status: 400 });

    await expect(workspaceApi.updateAccount({ name: 'Conta' })).rejects.toThrow(
      'Workspace update rejected',
    );
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('invalidates workspace after a confirmed account update', async () => {
    apiFetchMock.mockResolvedValue({ data: { ok: true }, status: 200 });

    await expect(workspaceApi.updateAccount({ name: 'Conta' })).resolves.toEqual({
      data: { ok: true },
      status: 200,
    });
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });

  it('does not invalidate workspace when channel update returns an API error envelope', async () => {
    apiFetchMock.mockResolvedValue({ error: 'Channel update rejected', status: 409 });

    await expect(workspaceApi.updateChannels({ email: true })).rejects.toThrow(
      'Channel update rejected',
    );
    expect(mutateMock).not.toHaveBeenCalled();
  });
});

describe('workspace top-level API functions', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    mutateMock.mockReset();
  });

  it('rejects missing API-key list payloads instead of returning a fake empty list', async () => {
    apiFetchMock.mockResolvedValue({ data: undefined, status: 200 });

    await expect(listApiKeys()).rejects.toThrow(
      'API key list did not return a confirmed payload',
    );
  });

  it('rejects failed API-key list status without an error envelope', async () => {
    apiFetchMock.mockResolvedValue({ data: [], status: 503 });

    await expect(listApiKeys()).rejects.toThrow('Failed to list API keys');
  });

  it('rejects missing API-key creation confirmations', async () => {
    apiFetchMock.mockResolvedValue({ data: undefined, status: 200 });

    await expect(createApiKey('Graph key')).rejects.toThrow(
      'API key creation did not return a confirmed payload',
    );
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('rejects failed API-key deletion confirmations', async () => {
    apiFetchMock.mockResolvedValue({ data: { ok: false }, status: 200 });

    await expect(deleteApiKey('key-1')).rejects.toThrow(
      'API key deletion did not return confirmed success',
    );
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('rejects missing workspace payloads', async () => {
    apiFetchMock.mockResolvedValue({ data: undefined, status: 200 });

    await expect(getWorkspace('workspace-1')).rejects.toThrow(
      'Workspace did not return a confirmed payload',
    );
  });

  it('rejects missing saved workspace settings payloads without invalidating cache', async () => {
    apiFetchMock.mockResolvedValue({ data: undefined, status: 200 });

    await expect(saveWorkspaceSettings('workspace-1', { name: 'Conta' })).rejects.toThrow(
      'Workspace settings save did not return a confirmed payload',
    );
    expect(mutateMock).not.toHaveBeenCalled();
  });
});
