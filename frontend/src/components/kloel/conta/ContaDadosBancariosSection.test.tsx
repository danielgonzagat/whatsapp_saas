import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import DadosBancariosSection from './ContaDadosBancariosSection';

const mocks = vi.hoisted(() => ({
  banks: [] as Array<{ code: number; fullName: string; ispb: string; name: string }>,
  mutate: vi.fn(),
  showToast: vi.fn(),
  updateBank: vi.fn(),
}));

vi.mock('@/hooks/useBrazilianBanks', () => ({
  POPULAR_BANK_CODES: new Set([260, 1]),
  formatBankCode: (code: number | string) => String(code).padStart(3, '0'),
  useBrazilianBanks: () => ({ banks: mocks.banks, error: null, isLoading: false }),
}));

vi.mock('@/hooks/useKyc', () => ({
  useBankMutations: () => ({ updateBank: mocks.updateBank }),
}));

vi.mock('@/components/kloel/ToastProvider', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

describe('DadosBancariosSection', () => {
  beforeEach(() => {
    mocks.banks = [
      { code: 260, fullName: 'Nu Pagamentos S.A.', ispb: '18236120', name: 'Nubank' },
      { code: 1, fullName: 'Banco do Brasil S.A.', ispb: '00000000', name: 'Banco do Brasil' },
    ];
    mocks.updateBank.mockResolvedValue({ ok: true });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      return setTimeout(() => callback(performance.now()), 0);
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('selects a Brazilian bank from the registry and persists account data', async () => {
    render(
      <DadosBancariosSection
        bankAccount={null}
        fiscal={{ cpf: '12345678900', type: 'PF' }}
        profile={{ name: 'Daniel Penin' }}
        mutate={mocks.mutate}
      />,
    );

    await waitFor(() => {
      expect((screen.getByLabelText('Titular da conta') as HTMLInputElement).value).toBe('Daniel Penin');
    });

    fireEvent.click(screen.getByRole('button', { name: /selecionar banco/i }));
    fireEvent.change(screen.getByLabelText(/buscar banco ou codigo/i), {
      target: { value: 'nubank' },
    });
    fireEvent.click(screen.getByRole('button', { name: /260Nu Pagamentos/i }));

    expect(screen.getByText(/260.*Nu Pagamentos/i).textContent).toContain('Nu Pagamentos');
    expect(
      screen.getByRole('button', { name: /Banco selecionado: 260 Nu Pagamentos S\.A\./i }),
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Agencia'), { target: { value: '0001' } });
    fireEvent.change(screen.getByLabelText('Conta'), { target: { value: '12345-6' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(mocks.updateBank).toHaveBeenCalledWith(
        expect.objectContaining({
          account: '12345-6',
          accountType: 'CHECKING',
          agency: '0001',
          bankCode: '260',
          bankName: 'Nu Pagamentos S.A.',
          holderDocument: '12345678900',
          holderName: 'Daniel Penin',
        }),
      );
    });
    expect(mocks.mutate).toHaveBeenCalled();
  });
});
