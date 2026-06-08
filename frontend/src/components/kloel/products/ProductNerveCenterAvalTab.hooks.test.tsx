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

  it('blocks empty review creation before calling the backend', async () => {
    apiFetch.mockResolvedValueOnce({ data: [], status: 200 });

    const { result } = renderHook(() => useProductReviews('prod-1'));

    await waitFor(() => expect(result.current.reviewsLoading).toBe(false));

    await act(async () => {
      await result.current.handleCreateReview();
    });

    expect(result.current.reviewError).toBe('Informe o nome do autor da avaliação.');
    expect(showToast).toHaveBeenCalledWith('Informe o nome do autor da avaliação.', 'error');
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect(apiFetch).toHaveBeenCalledWith('/products/prod-1/reviews');
  });

  it('blocks review creation without text before calling the backend', async () => {
    apiFetch.mockResolvedValueOnce({ data: [], status: 200 });

    const { result } = renderHook(() => useProductReviews('prod-1'));

    await waitFor(() => expect(result.current.reviewsLoading).toBe(false));

    act(() => {
      result.current.setNewRevName('Ana');
    });

    await act(async () => {
      await result.current.handleCreateReview();
    });

    expect(result.current.reviewError).toBe('Informe o texto da avaliação.');
    expect(showToast).toHaveBeenCalledWith('Informe o texto da avaliação.', 'error');
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('creates a normalized review and resets the draft state', async () => {
    apiFetch
      .mockResolvedValueOnce({ data: [], status: 200 })
      .mockResolvedValueOnce({
        data: {
          id: 'rev-2',
          authorName: 'Ana',
          comment: 'Texto claro',
          rating: 4,
          verified: true,
        },
        status: 201,
      });

    const { result } = renderHook(() => useProductReviews('prod-1'));

    await waitFor(() => expect(result.current.reviewsLoading).toBe(false));

    act(() => {
      result.current.setNewRevName(' Ana ');
      result.current.setNewRevText(' Texto claro ');
      result.current.setNewRevRating(4);
      result.current.setNewRevVer(true);
    });

    await act(async () => {
      await result.current.handleCreateReview();
    });

    expect(apiFetch).toHaveBeenLastCalledWith('/products/prod-1/reviews', {
      method: 'POST',
      body: {
        authorName: 'Ana',
        rating: 4,
        comment: 'Texto claro',
        verified: true,
      },
    });
    expect(result.current.reviews).toEqual([
      { id: 'rev-2', authorName: 'Ana', comment: 'Texto claro', rating: 4, verified: true },
    ]);
    expect(result.current.reviewError).toBe('');
    expect(result.current.newRevName).toBe('');
    expect(result.current.newRevText).toBe('');
    expect(result.current.newRevRating).toBe(5);
    expect(result.current.newRevVer).toBe(false);
    expect(showToast).toHaveBeenCalledWith('Avaliação criada', 'success');
  });
});
