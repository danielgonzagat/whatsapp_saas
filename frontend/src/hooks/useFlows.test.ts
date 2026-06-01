import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock('@/lib/api', () => ({
  api: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

import { useFlows } from './useFlows';

describe('useFlows', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockPost.mockReset();
  });

  it('returns empty flows array initially', () => {
    const { result } = renderHook(() => useFlows('ws-1'));
    expect(result.current.flows).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fetches flows on demand and populates state', async () => {
    mockGet.mockResolvedValueOnce({ data: [{ id: 'f1', name: 'Flow 1' }] });
    const { result } = renderHook(() => useFlows('ws-1'));

    await act(async () => {
      await result.current.fetchFlows();
    });

    expect(result.current.flows).toEqual([{ id: 'f1', name: 'Flow 1' }]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('surfaces malformed flow list payload instead of showing a false empty flow list', async () => {
    mockGet.mockResolvedValueOnce({ data: { id: 'f1', name: 'Flow 1' } });
    const { result } = renderHook(() => useFlows('ws-1'));

    await act(async () => {
      await result.current.fetchFlows();
    });

    expect(result.current.flows).toEqual([]);
    expect(result.current.error).toBe('Invalid flows payload');
  });

  it('sets error on fetch failure', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => useFlows('ws-1'));

    await act(async () => {
      await result.current.fetchFlows();
    });

    expect(result.current.error).toBe('Network error');
  });

  it('does nothing when workspaceId is not provided', async () => {
    mockGet.mockResolvedValueOnce({ data: [] });
    const { result } = renderHook(() => useFlows());

    await act(async () => {
      await result.current.fetchFlows();
    });

    expect(mockGet).not.toHaveBeenCalled();
    expect(result.current.flows).toEqual([]);
  });

  it('surfaces malformed execution list payload from embedded fetchExecutions', async () => {
    mockGet.mockResolvedValueOnce({ data: { id: 'execution-1' } });
    const { result } = renderHook(() => useFlows('ws-1'));

    let executions: unknown;
    await act(async () => {
      executions = await result.current.fetchExecutions();
    });

    expect(executions).toEqual([]);
    expect(result.current.error).toBe('Invalid flow executions payload');
  });

  it('fetchTemplates works without workspaceId', async () => {
    mockGet.mockResolvedValueOnce({ data: [{ id: 't1', name: 'Template' }] });
    const { result } = renderHook(() => useFlows());

    let templates: unknown;
    await act(async () => {
      templates = await result.current.fetchTemplates();
    });

    expect(templates).toEqual([{ id: 't1', name: 'Template' }]);
    expect(mockGet).toHaveBeenCalledWith('/flows/templates');
  });

  it('surfaces malformed template payload instead of showing no flow templates', async () => {
    mockGet.mockResolvedValueOnce({ data: { id: 't1', name: 'Template' } });
    const { result } = renderHook(() => useFlows());

    let templates: unknown;
    await act(async () => {
      templates = await result.current.fetchTemplates();
    });

    expect(templates).toEqual([]);
    expect(result.current.error).toBe('Invalid flow templates payload');
  });
});
