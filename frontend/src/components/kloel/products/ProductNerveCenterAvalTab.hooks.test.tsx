import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProductReviews } from './ProductNerveCenterAvalTab.hooks';

const { apiFetch, showToast } = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiFetch,
}));

vi.mock('@/components/kloel/ToastProvider', () => ({
  useToast: () => ({ showToast }),
}));

describe('useProductReviews', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    showToast.mockReset();
  });

  it('keeps the persisted review visible when backend delete fails', async () => {
    apiFetch
      .mockResolvedValueOnce({ data: [{ id: 'rev-1', authorName: 'Ana' }], status: 200 })
      .mockResolvedValueOnce({ error: 'Review not found', status: 404 });

    const { result } = renderHook(() => useProductReviews('prod-1'));

    await waitFor(() => expect(result.current.reviews).toHaveLength(1));

    await act(async () => {
      await result.current.handleDeleteReview('rev-1');
    });

    expect(result.current.reviews).toEqual([{ id: 'rev-1', authorName: 'Ana' }]);
    expect(showToast).toHaveBeenCalledWith('Review not found', 'error');
    expect(showToast).not.toHaveBeenCalledWith('Avaliação removida', 'success');
  });

  it('surfaces malformed review lists instead of silently showing empty reviews', async () => {
    apiFetch.mockResolvedValueOnce({ data: { reviews: [] }, status: 200 });

    const { result } = renderHook(() => useProductReviews('prod-1'));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('Invalid product reviews payload', 'error');
    });
    expect(result.current.reviews).toEqual([]);
  });
});
