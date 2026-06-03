import { act, renderHook, waitFor } from '@testing-library/react';
import { mutate } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '@/lib/api';

import type { CanvasDesign } from './useCanvasDesigns';
import { useCanvasDesigns } from './useCanvasDesigns';

const apiFetchMock = vi.mocked(apiFetch);
const mutateMock = vi.mocked(mutate);

function makeDesign(id = 'design-1'): CanvasDesign {
  return {
    id,
    workspaceId: 'workspace-1',
    name: 'Criativo',
    format: 'post',
    width: 1080,
    height: 1080,
    productId: null,
    elements: [],
    background: '#ffffff',
    thumbnailUrl: null,
    status: 'draft',
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  apiFetchMock.mockReset();
  mutateMock.mockReset();
});

describe('useCanvasDesigns', () => {
  it('surfaces malformed design list payload instead of showing an empty canvas library', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: { designs: { id: 'design-1' } }, status: 200 });

    const { result } = renderHook(() => useCanvasDesigns());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.designs).toEqual([]);
    expect(result.current.error).toBe('Invalid canvas designs payload');
  });

  it('keeps real canvas designs and reports invalid payload when refresh omits the design list', async () => {
    const design = makeDesign();
    apiFetchMock.mockResolvedValueOnce({ data: { designs: [design] }, status: 200 });

    const { result } = renderHook(() => useCanvasDesigns());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.designs).toEqual([design]);
    apiFetchMock.mockResolvedValueOnce({ data: {}, status: 200 });

    await act(async () => {
      await result.current.fetchDesigns();
    });

    expect(result.current.designs).toEqual([design]);
    expect(result.current.error).toBe('Invalid canvas designs payload');
  });

  it('does not remove a design or invalidate canvas cache when delete returns an API error envelope', async () => {
    const design = makeDesign();
    apiFetchMock.mockResolvedValueOnce({ data: { designs: [design] }, status: 200 });

    const { result } = renderHook(() => useCanvasDesigns());

    await waitFor(() => expect(result.current.loading).toBe(false));
    apiFetchMock.mockResolvedValueOnce({ error: 'delete denied', status: 403 });

    let deleteError: unknown;
    await act(async () => {
      try {
        await result.current.deleteDesign(design.id);
      } catch (error) {
        deleteError = error;
      }
    });

    expect(deleteError).toBeInstanceOf(Error);
    expect((deleteError as Error).message).toBe('delete denied');
    expect(result.current.designs).toEqual([design]);
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('does not add a duplicated design or invalidate canvas cache when duplicate creation fails', async () => {
    const design = makeDesign();
    apiFetchMock.mockResolvedValueOnce({ data: { designs: [design] }, status: 200 });

    const { result } = renderHook(() => useCanvasDesigns());

    await waitFor(() => expect(result.current.loading).toBe(false));
    apiFetchMock
      .mockResolvedValueOnce({ data: { design }, status: 200 })
      .mockResolvedValueOnce({ error: 'create failed', status: 500 });

    let duplicateError: unknown;
    await act(async () => {
      try {
        await result.current.duplicateDesign(design.id);
      } catch (error) {
        duplicateError = error;
      }
    });

    expect(duplicateError).toBeInstanceOf(Error);
    expect((duplicateError as Error).message).toBe('create failed');
    expect(result.current.designs).toEqual([design]);
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('adds a duplicated design and invalidates canvas cache after confirmed backend creation', async () => {
    const design = makeDesign('design-1');
    const duplicated = makeDesign('design-2');
    apiFetchMock.mockResolvedValueOnce({ data: { designs: [design] }, status: 200 });

    const { result } = renderHook(() => useCanvasDesigns());

    await waitFor(() => expect(result.current.loading).toBe(false));
    apiFetchMock
      .mockResolvedValueOnce({ data: { design }, status: 200 })
      .mockResolvedValueOnce({ data: { design: duplicated }, status: 201 });

    await act(async () => {
      await result.current.duplicateDesign(design.id);
    });
    await waitFor(() => expect(result.current.designs).toEqual([duplicated, design]));
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });
});
