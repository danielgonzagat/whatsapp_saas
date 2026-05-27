import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listFlows, getFlow, runFlow, listFlowExecutions } from './flows';

beforeEach(() => {
  document.cookie = 'kloel_access_token=test-token; path=/';
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => [{ id: 'f1', name: 'Onboarding' }],
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

describe('Flows API', () => {
  describe('listFlows', () => {
    it('GETs /flows/:workspaceId', async () => {
      await listFlows('ws-1');
      const { url, method } = lastFetch();
      expect(method).toBe('GET');
      expect(url).toContain('/flows/ws-1');
    });

    it('sends Authorization header', async () => {
      await listFlows('ws-1');
      expect(lastFetch().headers.authorization).toBe('Bearer test-token');
    });

    it('returns data array', async () => {
      const res = await listFlows('ws-1');
      expect(Array.isArray(res)).toBe(true);
    });
  });

  describe('getFlow', () => {
    it('GETs /flows/:workspaceId/:flowId', async () => {
      await getFlow('ws-1', 'f1');
      const { url, method } = lastFetch();
      expect(method).toBe('GET');
      expect(url).toContain('/flows/ws-1/f1');
    });
  });

  describe('runFlow', () => {
    it('POSTs to /flows/run', async () => {
      await runFlow({ workspaceId: 'ws-1', flow: { id: 'f1' } as any, startNode: 'start', user: 'u1' });
      const { url, method } = lastFetch();
      expect(method).toBe('POST');
      expect(url).toContain('/flows/run');
    });
  });

  describe('listFlowExecutions', () => {
    it('GETs /flows/:workspaceId/executions with limit', async () => {
      await listFlowExecutions('ws-1', 10);
      const { url } = lastFetch();
      expect(url).toContain('/flows/ws-1/executions');
      expect(url).toContain('limit=10');
    });
  });

  describe('error handling', () => {
    it('throws on network failure', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Offline'));
      await expect(listFlows('ws-1')).rejects.toThrow('Offline');
    });

    it('throws on error response', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      } as Response);
      await expect(listFlows('ws-1')).rejects.toThrow('Server error');
    });
  });
});
