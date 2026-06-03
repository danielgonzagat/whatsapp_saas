import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type CheckoutRow = { id: string; name: string; [key: string]: unknown };
type CheckoutColumn = {
  key: string;
  render?: (value: unknown, row: CheckoutRow) => ReactNode;
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

vi.mock('@/components/products/useCheckoutFormState', () => ({
  useCheckoutFormState: () => ({
    form: { name: '', paymentMethods: ['PIX'], active: true },
    showModal: false,
    editingCheckoutId: null,
    setForm: vi.fn(),
    setShowModal: vi.fn(),
    setEditingCheckoutId: vi.fn(),
    resetForm: vi.fn(),
    clearDraft: vi.fn(),
  }),
}));

vi.mock('@/components/kloel/FormExtras', () => ({
  DataTable: ({
    columns,
    rows,
    emptyText,
  }: {
    columns: CheckoutColumn[];
    rows: CheckoutRow[];
    emptyText: string;
  }) => (
    <div data-testid="checkouts-table">
      {rows.length === 0 ? (
        <span>{emptyText}</span>
      ) : (
        rows.map((row) => (
          <div key={row.id}>
            <span>{row.name}</span>
            {columns.map((column, index) => (
              <div key={`${row.id}-${column.key}-${index}`}>
                {column.render ? column.render(row[column.key], row) : null}
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  ),
}));

import { ProductCheckoutsTab } from './ProductCheckoutsTab';

const checkout = {
  id: 'checkout-1',
  name: 'Checkout Real',
  code: 'CHKREAL1',
  config: { paymentMethods: ['PIX'] },
  uniqueVisits: 0,
  totalVisits: 0,
  abandonRate: 0,
  cancelRate: 0,
  conversionRate: 0,
  active: true,
};

beforeEach(() => {
  apiMocks.apiFetch.mockReset();
});

describe('ProductCheckoutsTab', () => {
  it('surfaces invalid checkout payloads instead of rendering a fake empty checkout list', async () => {
    apiMocks.apiFetch.mockResolvedValueOnce({ data: [] });

    render(<ProductCheckoutsTab productId="prod-1" />);

    await waitFor(() => expect(screen.queryByText('Carregando checkouts')).toBeNull());

    expect(screen.queryByText('Payload de checkouts invalido.')).not.toBeNull();
    expect(screen.queryByText('Nenhum checkout criado')).toBeNull();
  });

  it('keeps loaded checkouts visible when a post-delete refresh fails', async () => {
    apiMocks.apiFetch
      .mockResolvedValueOnce([checkout])
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('refresh failed'));

    render(<ProductCheckoutsTab productId="prod-1" />);

    expect(await screen.findByText('Checkout Real')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Excluir checkout'));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(screen.queryByText('refresh failed')).not.toBeNull());

    expect(screen.queryByText('Checkout Real')).not.toBeNull();
  });
});
