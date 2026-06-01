import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mutate } from 'swr';
import {
  getFlowLogs,
  getFlowTemplates,
  listAllFlowTemplates,
  listFlowExecutions,
  listFlows,
  listFlowVersions,
  listPublicFlowTemplates,
  getFlow,
  runFlow,
  saveFlow,
  createFlowTemplate,
  type Flow,
} from './flows';

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
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
  if (input instanceof Request) {
    input.headers.forEach((v, k) => {
      headers[k] = v;
    });
  }
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

    it('rejects missing list payloads instead of returning a fake empty list', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => null,
      } as Response);

      await expect(listFlows('ws-1')).rejects.toThrow(
        'Flow list did not return a confirmed payload',
      );
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
      const flow: Flow = { id: 'f1' };
      await runFlow({ workspaceId: 'ws-1', flow, startNode: 'start', user: 'u1' });
      const { url, method } = lastFetch();
      expect(method).toBe('POST');
      expect(url).toContain('/flows/run');
    });

    it('rejects missing run confirmation without invalidating cache', async () => {
      const flow: Flow = { id: 'f1' };
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => null,
      } as Response);

      await expect(runFlow({ workspaceId: 'ws-1', flow, startNode: 'start', user: 'u1' })).rejects.toThrow(
        'Flow run did not return a confirmed payload',
      );
      expect(mutate).not.toHaveBeenCalled();
    });
  });

  describe('saveFlow', () => {
    it('rejects missing save confirmation without invalidating cache', async () => {
      const flow: Flow = { id: 'f1', name: 'Onboarding' };
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => null,
      } as Response);

      await expect(saveFlow('ws-1', 'f1', flow)).rejects.toThrow(
        'Flow save did not return a confirmed payload',
      );
      expect(mutate).not.toHaveBeenCalled();
    });
  });

  describe('createFlowTemplate', () => {
    it('rejects missing template confirmation without invalidating cache', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => null,
      } as Response);

      await expect(
        createFlowTemplate({ name: 'Template', category: 'sales', nodes: [], edges: [] }),
      ).rejects.toThrow('Flow template creation did not return a confirmed payload');
      expect(mutate).not.toHaveBeenCalled();
    });
  });

  describe('listFlowExecutions', () => {
    it('GETs /flows/:workspaceId/executions with limit', async () => {
      await listFlowExecutions('ws-1', 10);
      const { url } = lastFetch();
      expect(url).toContain('/flows/ws-1/executions');
      expect(url).toContain('limit=10');
    });

    it('rejects missing execution list payloads instead of returning a fake empty list', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => null,
      } as Response);

      await expect(listFlowExecutions('ws-1')).rejects.toThrow(
        'Flow executions did not return a confirmed payload',
      );
    });
  });

  describe('flow read lists', () => {
    it('rejects missing template payloads', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => null,
      } as Response);

      await expect(getFlowTemplates()).rejects.toThrow(
        'Flow templates did not return a confirmed payload',
      );
    });

    it('rejects missing log payloads', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => null,
      } as Response);

      await expect(getFlowLogs('ws-1', 'f1')).rejects.toThrow(
        'Flow logs did not return a confirmed payload',
      );
    });

    it('rejects missing version payloads', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => null,
      } as Response);

      await expect(listFlowVersions('ws-1', 'f1')).rejects.toThrow(
        'Flow versions did not return a confirmed payload',
      );
    });

    it('rejects malformed public template payloads', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ templates: [] }),
      } as Response);

      await expect(listPublicFlowTemplates()).rejects.toThrow(
        'Public flow templates did not return a confirmed payload',
      );
    });

    it('rejects missing admin template payloads', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => null,
      } as Response);

      await expect(listAllFlowTemplates()).rejects.toThrow(
        'Flow templates did not return a confirmed payload',
      );
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
