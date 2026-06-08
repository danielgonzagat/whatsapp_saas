import { renderHook, act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCiaApi } = vi.hoisted(() => ({
  mockCiaApi: {
    getAccountRuntime: vi.fn(),
    getAccountApprovals: vi.fn(),
    getAccountInputSessions: vi.fn(),
    getAccountWorkItems: vi.fn(),
    getAccountProof: vi.fn(),
    getCycleProof: vi.fn(),
    getCapabilityRegistry: vi.fn(),
    getConversationActionRegistry: vi.fn(),
  },
}));

vi.mock('@/lib/api', () => ({
  ciaApi: mockCiaApi,
}));

import { useCiaAdvanced } from './useCiaAdvanced';

describe('useCiaAdvanced', () => {
  beforeEach(() => {
    Object.values(mockCiaApi).forEach((fn) => {
      fn.mockReset();
      fn.mockResolvedValue({ data: undefined });
    });
  });

  it('returns null initial state', () => {
    const { result } = renderHook(() => useCiaAdvanced('ws-1'));
    expect(result.current.accountRuntime).toBeNull();
    expect(result.current.approvals).toEqual([]);
    expect(result.current.inputSessions).toEqual([]);
    expect(result.current.workItems).toEqual([]);
    expect(result.current.accountProof).toBeNull();
    expect(result.current.cycleProof).toBeNull();
    expect(result.current.capabilityRegistry).toBeNull();
    expect(result.current.openApprovals).toEqual([]);
    expect(result.current.pendingSessions).toEqual([]);
    expect(result.current.activeWorkItems).toEqual([]);
  });

  it('loads advanced data and populates state', async () => {
    mockCiaApi.getAccountRuntime.mockResolvedValue({ data: { mode: 'LIVE' } });
    mockCiaApi.getAccountApprovals.mockResolvedValue({
      data: [{ id: 'a1', status: 'OPEN' }],
    });

    const { result } = renderHook(() => useCiaAdvanced('ws-1'));

    await waitFor(() => {
      expect(result.current.accountRuntime).toEqual({ mode: 'LIVE' });
    });
    expect(result.current.approvals).toEqual([{ id: 'a1', status: 'OPEN' }]);
  });

  it('filters open approvals and pending sessions via useMemo', async () => {
    mockCiaApi.getAccountApprovals.mockResolvedValue({
      data: [
        { id: 'a1', status: 'OPEN' },
        { id: 'a2', status: 'CLOSED' },
      ],
    });
    mockCiaApi.getAccountInputSessions.mockResolvedValue({
      data: [
        { id: 's1', status: 'COMPLETED' },
        { id: 's2', status: 'PENDING' },
      ],
    });

    const { result } = renderHook(() => useCiaAdvanced('ws-1'));

    await waitFor(() => {
      expect(result.current.openApprovals).toEqual([{ id: 'a1', status: 'OPEN' }]);
    });
    expect(result.current.pendingSessions).toEqual([{ id: 's2', status: 'PENDING' }]);
  });

  it('surfaces malformed approvals payloads instead of treating them as an empty CIA queue', async () => {
    mockCiaApi.getAccountApprovals.mockResolvedValue({
      data: { id: 'a1', status: 'OPEN' },
    });

    const { result } = renderHook(() => useCiaAdvanced('ws-1'));

    await waitFor(() => {
      expect((result.current as { advancedError?: string | null }).advancedError).toBe(
        'Invalid CIA approvals payload',
      );
    });
    expect(result.current.approvals).toEqual([]);
  });

  it('lists work items only after runtime materialization resolves', async () => {
    const callOrder: string[] = [];
    let resolveRuntime: ((value: { data: unknown }) => void) | undefined;
    mockCiaApi.getAccountRuntime.mockImplementation(() => {
      callOrder.push('runtime');
      return new Promise<{ data: unknown }>((resolve) => {
        resolveRuntime = resolve;
      });
    });
    mockCiaApi.getAccountWorkItems.mockImplementation(() => {
      callOrder.push('workItems');
      return Promise.resolve({ data: [] });
    });

    renderHook(() => useCiaAdvanced('ws-1'));

    // Runtime is in flight; work items must NOT have been requested yet.
    await waitFor(() => {
      expect(callOrder).toContain('runtime');
    });
    expect(mockCiaApi.getAccountWorkItems).not.toHaveBeenCalled();

    // Once runtime (and its server-side materialization) resolves, work items load.
    resolveRuntime?.({ data: { mode: 'LIVE' } });
    await waitFor(() => {
      expect(mockCiaApi.getAccountWorkItems).toHaveBeenCalled();
    });
    expect(callOrder).toEqual(['runtime', 'workItems']);
  });

  it('does not load when workspaceId is empty', async () => {
    const { result } = renderHook(() => useCiaAdvanced(''));

    // wait a tick to ensure no async work starts
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockCiaApi.getAccountRuntime).not.toHaveBeenCalled();
    expect(result.current.accountRuntime).toBeNull();
  });
});
