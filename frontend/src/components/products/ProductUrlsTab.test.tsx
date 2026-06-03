import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ProductUrlRow = {
  id: string;
  description: string;
  url: string;
  [key: string]: unknown;
};

const apiMocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: apiMocks.apiFetch,
}));

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

vi.mock('./ProductUrlForm', () => ({
  ProductUrlForm: () => <div data-testid="product-url-form" />,
}));

vi.mock('./ProductUrlList', () => ({
  ProductUrlList: ({
    items,
    onDelete,
  }: {
    items: ProductUrlRow[];
    onDelete: (item: ProductUrlRow) => void;
  }) => (
    <div data-testid="product-url-list">
      {items.length === 0 ? (
        <span>Nenhuma URL cadastrada</span>
      ) : (
        items.map((item) => (
          <div key={item.id}>
            <span>{item.description}</span>
            <button type="button" aria-label="Excluir URL" onClick={() => onDelete(item)}>
              delete
            </button>
          </div>
        ))
      )}
    </div>
  ),
}));

vi.mock('./ProductUrlDeleteModal', () => ({
  ProductUrlDeleteModal: ({
    urlPendingDelete,
    onConfirm,
    onCancel,
  }: {
    urlPendingDelete: ProductUrlRow | null;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    urlPendingDelete ? (
      <div role="dialog">
        <span>{urlPendingDelete.url}</span>
        <button type="button" onClick={onConfirm}>
          Excluir
        </button>
        <button type="button" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    ) : null,
}));

import { ProductUrlsTab } from './ProductUrlsTab';

const productUrl = {
  id: 'url-1',
  description: 'URL Real',
  url: 'https://real.example.com',
  isPrivate: false,
  active: true,
  aiLearning: false,
  aiLearnStatus: null,
  chatEnabled: true,
  salesFromUrl: 0,
};

beforeEach(() => {
  apiMocks.apiFetch.mockReset();
});

describe('ProductUrlsTab', () => {
  it('surfaces invalid URL payloads instead of rendering a fake empty URL list', async () => {
    apiMocks.apiFetch.mockResolvedValueOnce({ data: [] });

    render(<ProductUrlsTab productId="prod-1" />);

    await waitFor(() => expect(screen.queryByText('Payload de URLs invalido.')).not.toBeNull());

    expect(screen.queryByText('Nenhuma URL cadastrada')).toBeNull();
  });

  it('keeps loaded URLs visible when a post-delete refresh fails', async () => {
    apiMocks.apiFetch
      .mockResolvedValueOnce([productUrl])
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('refresh failed'));

    render(<ProductUrlsTab productId="prod-1" />);

    expect(await screen.findByText('URL Real')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Excluir URL'));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(screen.queryByText('refresh failed')).not.toBeNull());

    expect(screen.queryByText('URL Real')).not.toBeNull();
  });
});
