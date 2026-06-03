import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  listFlowExecutions: vi.fn(),
  retryFlowExecution: vi.fn(),
}));

import { listFlowExecutions, retryFlowExecution } from '@/lib/api';
import type { FlowExecutionSummary } from '@/lib/api/flows';

import { useFlowExecutions } from './useFlowExecutions';

const listFlowExecutionsMock = vi.mocked(listFlowExecutions);
const retryFlowExecutionMock = vi.mocked(retryFlowExecution);

function makeExecution(id = 'execution-1'): FlowExecutionSummary {
  return {
    id,
    status: 'COMPLETED',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  listFlowExecutionsMock.mockReset();
  retryFlowExecutionMock.mockReset();
});

describe('useFlowExecutions', () => {
  it('loads the real flow execution list from the backend client', async () => {
    const execution = makeExecution();
    listFlowExecutionsMock.mockResolvedValueOnce([execution]);

    const { result } = renderHook(() => useFlowExecutions('workspace-1'));

    await act(async () => {
      await result.current.fetchExecutions();
    });

    expect(listFlowExecutionsMock).toHaveBeenCalledWith('workspace-1', 50);
    expect(result.current.executions).toEqual([execution]);
    expect(result.current.error).toBeNull();
  });

  it('surfaces malformed flow execution payloads instead of showing a false empty history', async () => {
    listFlowExecutionsMock.mockResolvedValueOnce({ id: 'execution-1' } as unknown as FlowExecutionSummary[]);

    const { result } = renderHook(() => useFlowExecutions('workspace-1'));

    await act(async () => {
      await result.current.fetchExecutions();
    });

    expect(result.current.executions).toEqual([]);
    expect(result.current.error).toBe('Invalid flow executions payload');
  });
});
