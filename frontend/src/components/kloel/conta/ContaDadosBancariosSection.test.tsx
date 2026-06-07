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

  it('matches common bank aliases when the registry only exposes the official name', async () => {
    mocks.banks = [
      {
        code: 260,
        fullName: 'NU PAGAMENTOS S.A. - INSTITUICAO DE PAGAMENTO',
        ispb: '18236120',
        name: 'NU PAGAMENTOS S.A.',
      },
    ];

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

    expect(screen.getByRole('button', { name: /260NU PAGAMENTOS/i })).toBeTruthy();
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

  it('blocks saving a selected bank without agency and account data', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: /001Banco do Brasil/i }));
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    expect(await screen.findByText('Informe a agencia.')).toBeTruthy();
    expect(mocks.showToast).toHaveBeenCalledWith('Informe a agencia.', 'error');
    expect(mocks.updateBank).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it('infers a missing PIX key type from an existing email key before saving', async () => {
    render(
      <DadosBancariosSection
        bankAccount={{
          bankName: 'Banco do Brasil S.A.',
          bankCode: '001',
          agency: '0001',
          account: '1234567-8',
          accountType: 'CHECKING',
          pixKey: 'codex.audit.pix@example.com',
          pixKeyType: null,
          holderName: 'Codex Audit QA',
          holderDocument: '93541134780',
        }}
        fiscal={{ cpf: '93541134780', type: 'PF' }}
        profile={{ name: 'Codex Audit QA' }}
        mutate={mocks.mutate}
      />,
    );

    await waitFor(() => {
      expect((screen.getByLabelText('Tipo da chave') as HTMLSelectElement).value).toBe('EMAIL');
    });

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(mocks.updateBank).toHaveBeenCalledWith(
        expect.objectContaining({
          pixKey: 'codex.audit.pix@example.com',
          pixKeyType: 'EMAIL',
        }),
      );
    });
  });
});
