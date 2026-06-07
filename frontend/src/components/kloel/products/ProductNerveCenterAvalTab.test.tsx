import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductNerveCenterAvalTab } from './ProductNerveCenterAvalTab';

const { handleDeleteReview, noop, testState } = vi.hoisted(() => ({
  handleDeleteReview: vi.fn(),
  noop: vi.fn(),
  testState: {
    reviews: [] as Record<string, unknown>[],
  },
}));

vi.mock('./product-nerve-center.context', () => ({
  useNerveCenterContext: () => ({ productId: 'prod-1' }),
}));

vi.mock('./ProductNerveCenterAvalTab.hooks', () => ({
  useProductReviews: () => ({
    reviews: testState.reviews,
    reviewsLoading: false,
    newRevName: '',
    setNewRevName: noop,
    newRevRating: 5,
    setNewRevRating: noop,
    newRevText: '',
    setNewRevText: noop,
    newRevVer: false,
    setNewRevVer: noop,
    showRevForm: false,
    setShowRevForm: noop,
    reviewError: '',
    setReviewError: noop,
    handleCreateReview: noop,
    handleDeleteReview,
  }),
}));

describe('ProductNerveCenterAvalTab', () => {
  beforeEach(() => {
    handleDeleteReview.mockReset();
    noop.mockReset();
    testState.reviews = [
      {
        id: 'rev-1',
        authorName: 'Cliente QA',
        comment: 'Produto validado no fluxo real.',
        rating: 5,
        verified: true,
      },
    ];
  });

  it('requires explicit confirmation before deleting a review', async () => {
    render(<ProductNerveCenterAvalTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(handleDeleteReview).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Confirmar exclusão' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('button', { name: 'Confirmar exclusão' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    });

    expect(handleDeleteReview).toHaveBeenCalledWith('rev-1');
  });
});
