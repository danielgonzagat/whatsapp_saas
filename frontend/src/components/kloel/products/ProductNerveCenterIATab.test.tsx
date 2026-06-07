import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProductNerveCenterIATab } from './ProductNerveCenterIATab';
import { AI_CONFIG_OBJECTION_ERROR } from './ProductNerveCenterIATab.hooks';

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

vi.mock('./product-nerve-center.context', () => ({
  useNerveCenterContext: () => ({ productId: 'prod-1' }),
}));

describe('ProductNerveCenterIATab', () => {
  beforeEach(() => {
    apiFetch.mockReset();
    showToast.mockReset();
  });

  it('saves the visible objection response even when the textarea DOM value has not reached React state', async () => {
    apiFetch
      .mockResolvedValueOnce({ data: {}, status: 200 })
      .mockResolvedValueOnce({ data: {}, status: 200 });

    render(<ProductNerveCenterIATab />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '+ Adicionar objeção' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: '+ Adicionar objeção' }));
    fireEvent.change(screen.getByPlaceholderText('Objeção'), {
      target: { value: 'Preco' },
    });

    const responseInput = screen.getByPlaceholderText('Resposta da IA...') as HTMLTextAreaElement;
    responseInput.value = 'Parcelamos em ate 12x e aplicamos cupom quando fizer sentido.';

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Salvar config da IA' }));
    });

    expect(showToast).not.toHaveBeenCalledWith(AI_CONFIG_OBJECTION_ERROR, 'error');
    expect(apiFetch).toHaveBeenLastCalledWith('/products/prod-1/ai-config', {
      method: 'PUT',
      body: expect.objectContaining({
        objections: [
          {
            label: 'Preco',
            response: 'Parcelamos em ate 12x e aplicamos cupom quando fizer sentido.',
          },
        ],
      }),
    });
  });
});
