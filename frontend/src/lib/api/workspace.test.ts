import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listApiKeys, createApiKey, deleteApiKey, getWorkspace, saveWorkspaceSettings } from './workspace';

beforeEach(() => {
  document.cookie = 'kloel_access_token=test-token; path=/';
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: { id: 'k1', name: 'Default', key: 'sk-xxx', createdAt: '2025-01-01' } }),
  } as Response);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function lastFetch(): { url: string; method: string; headers: Record<string, string> } {
  const call = vi.mocked(globalThis.fetch).mock.calls.at(-1);
  const input = call?.[0];
  const url = input instanceof Request ? input.url : String(input ?? '');
  const method = input instanceof Request ? input.method : 'GET';
  const headers: Record<string, string> = {};
  if (input instanceof Request) input.headers.forEach((v, k) => { headers[k] = v; });
  return { url, method, headers };
}

describe('Workspace API (non-payment)', () => {
  describe('listApiKeys', () => {
    it('GETs /settings/api-keys', async () => {
      await listApiKeys();
      const { url, method } = lastFetch();
      expect(method).toBe('GET');
      expect(url).toContain('/settings/api-keys');
    });

    it('sends Authorization header', async () => {
      await listApiKeys();
      expect(lastFetch().headers.authorization).toBe('Bearer test-token');
    });
  });

  describe('createApiKey', () => {
    it('POSTs to /settings/api-keys with name', async () => {
      await createApiKey('My Key');
      const { url, method } = lastFetch();
      expect(method).toBe('POST');
      expect(url).toContain('/settings/api-keys');
    });
  });

  describe('deleteApiKey', () => {
    it('DELETEs /settings/api-keys/:id', async () => {
      await deleteApiKey('k1');
      const { url, method } = lastFetch();
      expect(method).toBe('DELETE');
      expect(url).toContain('/settings/api-keys/k1');
    });
  });

  describe('getWorkspace', () => {
    it('GETs /workspace/:workspaceId', async () => {
      await getWorkspace('ws-1');
      const { url, method } = lastFetch();
      expect(method).toBe('GET');
      expect(url).toContain('/workspace/ws-1');
    });
  });

  describe('saveWorkspaceSettings', () => {
    it('POSTs to /workspace/:workspaceId/account', async () => {
      await saveWorkspaceSettings('ws-1', { name: 'New Name' });
      const { url, method } = lastFetch();
      expect(method).toBe('POST');
      expect(url).toContain('/workspace/ws-1/account');
    });
  });

  describe('error handling', () => {
    it('listApiKeys throws on error response', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      } as Response);
      await expect(listApiKeys()).rejects.toThrow();
    });

    it('createApiKey throws on network error', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Offline'));
      await expect(createApiKey('key')).rejects.toThrow('Offline');
    });

    it('getWorkspace throws on failure', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      } as Response);
      await expect(getWorkspace('ws-1')).rejects.toThrow();
    });
  });
});
