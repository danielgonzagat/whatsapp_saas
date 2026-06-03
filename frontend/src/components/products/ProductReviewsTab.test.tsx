import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: apiMocks.apiFetch,
}));

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

import { ProductReviewsTab } from './ProductReviewsTab';

const review = {
  id: 'review-1',
  rating: 5,
  comment: 'Produto excelente',
  authorName: 'Cliente Real',
  verified: true,
  createdAt: '2026-01-15T12:00:00.000Z',
};

beforeEach(() => {
  apiMocks.apiFetch.mockReset();
});

describe('ProductReviewsTab', () => {
  it('surfaces invalid review payloads instead of rendering a fake empty review list', async () => {
    apiMocks.apiFetch.mockResolvedValueOnce({ data: [] });

    render(<ProductReviewsTab productId="prod-1" />);

    await waitFor(() =>
      expect(screen.queryByText('Payload de avaliacoes invalido.')).not.toBeNull(),
    );

    expect(screen.queryByText(/Nenhuma avalia/)).toBeNull();
  });

  it('keeps loaded reviews visible when a post-delete refresh fails', async () => {
    apiMocks.apiFetch
      .mockResolvedValueOnce([review])
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('refresh failed'));

    render(<ProductReviewsTab productId="prod-1" />);

    expect(await screen.findByText('Cliente Real')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Excluir avaliação'));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(screen.queryByText('refresh failed')).not.toBeNull());

    expect(screen.queryByText('Cliente Real')).not.toBeNull();
    expect(screen.queryByText('Produto excelente')).not.toBeNull();
  });
});
