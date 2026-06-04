import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DadosFiscaisSection from './ContaDadosFiscaisSection';

const mocks = vi.hoisted(() => ({
  lookupCep: vi.fn(),
  lookupCnpj: vi.fn(),
  mutate: vi.fn(),
  showToast: vi.fn(),
  updateFiscal: vi.fn(),
}));

vi.mock('@/hooks/useKyc', () => ({
  useFiscalMutations: () => ({ updateFiscal: mocks.updateFiscal }),
}));

vi.mock('@/lib/api/kyc', () => ({
  kycApi: {
    lookupCep: mocks.lookupCep,
    lookupCnpj: mocks.lookupCnpj,
  },
}));

vi.mock('@/components/kloel/ToastProvider', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

describe('DadosFiscaisSection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('auto-fills CNPJ and CEP data then persists fiscal payload', async () => {
    mocks.lookupCnpj.mockResolvedValueOnce({
      bairro: 'Centro',
      cep: '01001000',
      complemento: 'lado impar',
      logradouro: 'Praca da Se',
      municipio: 'Sao Paulo',
      nome_fantasia: 'ACME',
      numero: '100',
      qsa: [{ cnpj_cpf_do_socio: '12345678900', nome_socio: 'Daniel Penin' }],
      razao_social: 'ACME LTDA',
      uf: 'SP',
    });
    mocks.lookupCep.mockResolvedValueOnce({
      bairro: 'Se',
      complemento: '',
      localidade: 'Sao Paulo',
      logradouro: 'Praca da Se',
      uf: 'SP',
    });
    mocks.updateFiscal.mockResolvedValueOnce({ ok: true });

    render(<DadosFiscaisSection fiscal={null} mutate={mocks.mutate} />);

    fireEvent.click(screen.getByRole('button', { name: /Pessoa Juridica/i }));
    fireEvent.change(screen.getByLabelText('CNPJ'), { target: { value: '12345678000190' } });

    await waitFor(() => {
      expect(mocks.lookupCnpj).toHaveBeenCalledWith('12345678000190');
    });
    await waitFor(() => {
      expect((screen.getByLabelText('Razao social') as HTMLInputElement).value).toBe('ACME LTDA');
    });
    expect((screen.getByLabelText('Nome fantasia') as HTMLInputElement).value).toBe('ACME');
    expect((screen.getByLabelText('CPF do responsavel') as HTMLInputElement).value).toBe('12345678900');
    expect((screen.getByLabelText('Nome do responsavel') as HTMLInputElement).value).toBe('Daniel Penin');

    fireEvent.change(screen.getByLabelText('CEP'), { target: { value: '02002000' } });

    await waitFor(() => {
      expect(mocks.lookupCep).toHaveBeenCalledWith('02002000');
    });
    await waitFor(() => {
      expect((screen.getByLabelText('Bairro') as HTMLInputElement).value).toBe('Se');
    });

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(mocks.updateFiscal).toHaveBeenCalledWith(
        expect.objectContaining({
          cep: '02002000',
          city: 'Sao Paulo',
          cnpj: '12345678000190',
          complement: 'lado impar',
          neighborhood: 'Se',
          nomeFantasia: 'ACME',
          number: '100',
          razaoSocial: 'ACME LTDA',
          responsavelCpf: '12345678900',
          responsavelNome: 'Daniel Penin',
          state: 'SP',
          street: 'Praca da Se',
          type: 'PJ',
        }),
      );
    });
    expect(mocks.mutate).toHaveBeenCalled();
  });
});
