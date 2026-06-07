import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());
const pathnameMock = vi.hoisted(() => ({ value: '/carteira' }));
const walletMutateMock = vi.hoisted(() => vi.fn());
const addBankAccountMock = vi.hoisted(() => vi.fn());
const removeBankAccountMock = vi.hoisted(() => vi.fn());
const bankAccountsMock = vi.hoisted(() =>
  vi.fn(() => [
    {
      id: 'bank-1',
      bankName: 'Banco Teste',
      account: '12345678',
      accountType: 'PIX',
      pixKey: 'pix@test.local',
    },
  ]),
);

function restoreBankAccountsMock() {
  bankAccountsMock.mockReturnValue([
    {
      id: 'bank-1',
      bankName: 'Banco Teste',
      account: '12345678',
      accountType: 'PIX',
      pixKey: 'pix@test.local',
    },
  ]);
}

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));
vi.mock('@/lib/i18n/t', () => ({ kloelT: (s: string) => s }));
vi.mock('@/hooks/useWorkspaceId', () => ({ useWorkspaceId: () => 'ws-1' }));
vi.mock('@/hooks/useWallet', () => ({
  useBankAccounts: () => ({
    accounts: bankAccountsMock(),
    addBankAccount: addBankAccountMock,
    removeBankAccount: removeBankAccountMock,
  }),
  useWalletBalance: () => ({
    balance: { available: 0, pending: 0, blocked: 0, total: 0 },
    isLoading: false,
    mutate: walletMutateMock,
  }),
  useWalletTransactions: () => ({ transactions: [], mutate: walletMutateMock }),
  useWalletChart: () => ({ chart: [] }),
  useWalletMonthly: () => ({}),
  useWalletWithdrawals: () => ({ withdrawals: [], mutate: walletMutateMock }),
  useWalletAnticipations: () => ({ anticipations: [], totals: {} }),
}));
vi.mock('@/hooks/useResponsiveViewport', () => ({
  useResponsiveViewport: () => ({ isMobile: false }),
}));
vi.mock('next/navigation', () => ({ usePathname: () => pathnameMock.value }));
vi.mock('swr', () => ({ mutate: vi.fn() }));

import KloelCarteira from '../carteira';
import { CarteiraAntecipateModal } from './CarteiraAntecipateModal';
import CarteiraExtratoTable from './CarteiraExtratoTable';
import CarteiraSaque from './CarteiraSaque';
import { CarteiraWithdrawModal } from './CarteiraWithdrawModal';
import CarteiraSaldoCard from './CarteiraSaldoCard';
import { CarteiraTabAntecipacoes } from './CarteiraTabAntecipacoes';

describe('CarteiraExtratoTable', () => {
  it('gives the transaction search field a stable form identity', () => {
    render(
      <CarteiraExtratoTable
        txList={[]}
        filterType="todos"
        onFilterTypeChange={() => {}}
        search=""
        onSearchChange={() => {}}
      />,
    );

    const input = screen.getByLabelText('Buscar transacao') as HTMLInputElement;
    expect(input.id).toBe('wallet-transaction-search');
    expect(input.name).toBe('walletTransactionSearch');
  });
});

describe('KloelCarteira', () => {
  afterEach(() => {
    pathnameMock.value = '/carteira';
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('switches internal wallet tabs with native history instead of App Router navigation', () => {
    pathnameMock.value = '/carteira';
    const pushState = vi.spyOn(window.history, 'pushState');

    render(<KloelCarteira defaultTab="saldo" />);
    fireEvent.click(screen.getByRole('button', { name: 'Extrato' }));

    expect(pushState).toHaveBeenCalledWith(null, '', '/carteira/extrato');
    expect(screen.getByLabelText('Buscar transacao')).toBeTruthy();
  });

  it('treats legacy movimentacoes intent as the Extrato transaction view', () => {
    pathnameMock.value = '/carteira';

    render(<KloelCarteira defaultTab="movimentacoes" />);

    expect(screen.getByLabelText('Buscar transacao')).toBeTruthy();
  });
});

describe('CarteiraSaque', () => {
  afterEach(() => {
    addBankAccountMock.mockReset();
    removeBankAccountMock.mockReset();
    bankAccountsMock.mockReset();
    restoreBankAccountsMock();
  });

  it('sends only AddBankAccountDto fields when saving a bank account', async () => {
    bankAccountsMock.mockReturnValue([]);
    addBankAccountMock.mockResolvedValue({ data: { success: true }, error: null });

    render(<CarteiraSaque available={0} onOpenWithdraw={() => {}} withdrawals={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /Adicionar conta/ }));
    fireEvent.change(screen.getByLabelText('Banco'), {
      target: { value: 'Banco Codex QA' },
    });
    fireEvent.change(screen.getByLabelText('Chave PIX'), {
      target: { value: 'codex-audit-wallet@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Agencia'), { target: { value: '0001' } });
    fireEvent.change(screen.getByLabelText('Conta bancaria'), {
      target: { value: '123456-7' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar conta' }));

    await waitFor(() => expect(addBankAccountMock).toHaveBeenCalled());
    const payload = addBankAccountMock.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toEqual({
      bankName: 'Banco Codex QA',
      pixKey: 'codex-audit-wallet@example.com',
      bankCode: '',
      agency: '0001',
      account: '123456-7',
    });
    expect('accountType' in payload).toBe(false);
  });
});

describe('CarteiraWithdrawModal', () => {
  afterEach(() => {
    apiFetchMock.mockReset();
    bankAccountsMock.mockReset();
    restoreBankAccountsMock();
  });

  it('exposes a named dialog and close button', () => {
    render(
      <CarteiraWithdrawModal
        open
        onClose={() => {}}
        available={0}
        withdrawAmount=""
        onWithdrawAmountChange={() => {}}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Solicitar saque' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fechar modal de saque' })).toBeTruthy();
    const amountInput = screen.getByLabelText('Valor do saque') as HTMLInputElement;
    expect(amountInput.id).toBe('wallet-withdraw-amount');
    expect(amountInput.name).toBe('walletWithdrawAmount');
  });

  it('sends the withdrawal amount in Reais, not cents', async () => {
    apiFetchMock.mockResolvedValue({ data: { success: true }, error: null });
    render(
      <CarteiraWithdrawModal
        open
        onClose={() => {}}
        available={100}
        withdrawAmount="10"
        onWithdrawAmountChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Solicitar saque/ }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    const opts = apiFetchMock.mock.calls[0][1] as { body: { amount: number } };
    // The backend expects Reais; sending 1000 (cents) was the bug.
    expect(opts.body.amount).toBe(10);
  });

  it('shows a 200 { success:false } failure instead of faking success', async () => {
    const onSuccess = vi.fn();
    apiFetchMock.mockResolvedValue({
      data: { success: false, message: 'Saldo insuficiente' },
      error: null,
    });
    render(
      <CarteiraWithdrawModal
        open
        onClose={() => {}}
        available={100}
        withdrawAmount="10"
        onWithdrawAmountChange={() => {}}
        onSuccess={onSuccess}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Solicitar saque/ }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalled());
    expect(onSuccess).not.toHaveBeenCalled();
    expect(await screen.findByText('Saldo insuficiente')).toBeTruthy();
  });

  it('blocks zero-balance withdrawals before calling the API', () => {
    render(
      <CarteiraWithdrawModal
        open
        onClose={() => {}}
        available={0}
        withdrawAmount="10"
        onWithdrawAmountChange={() => {}}
      />,
    );

    const submit = screen.getByRole('button', { name: /Solicitar saque/ }) as HTMLButtonElement;
    expect(screen.getByText('Nao ha saldo disponivel para saque.')).toBeTruthy();
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('keeps the submit disabled without a destination account', () => {
    bankAccountsMock.mockReturnValue([]);
    render(
      <CarteiraWithdrawModal
        open
        onClose={() => {}}
        available={100}
        withdrawAmount="10"
        onWithdrawAmountChange={() => {}}
      />,
    );

    const submit = screen.getByRole('button', { name: /Solicitar saque/ }) as HTMLButtonElement;
    expect(screen.getByText(/Nenhuma conta cadastrada/)).toBeTruthy();
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(apiFetchMock).not.toHaveBeenCalled();
  });
});

describe('CarteiraAntecipateModal', () => {
  it('exposes a named dialog, close button, and honest disabled action', () => {
    render(<CarteiraAntecipateModal open onClose={() => {}} pending={0} />);

    expect(screen.getByRole('dialog', { name: 'Antecipar recebiveis' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fechar modal de antecipacao' })).toBeTruthy();
    const submit = screen.getByRole('button', { name: 'Antecipar agora' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
  });
});


describe('CarteiraTabAntecipacoes', () => {
  it('does not expose anticipation as available when pending balance is zero', () => {
    const onOpenAntecipate = vi.fn();

    render(
      <CarteiraTabAntecipacoes
        pending={0}
        onOpenAntecipate={onOpenAntecipate}
        anticipations={[]}
        antTotals={{}}
      />,
    );

    const anticipate = screen.getByRole('button', { name: /Antecipar agora/ }) as HTMLButtonElement;
    expect(anticipate.disabled).toBe(true);
    expect(anticipate.title).toBe('Sem saldo a receber para antecipar');
    fireEvent.click(anticipate);
    expect(onOpenAntecipate).not.toHaveBeenCalled();
  });
});
describe('CarteiraSaldoCard', () => {
  it('does not expose zero-balance wallet actions as available', () => {
    const onOpenWithdraw = vi.fn();
    const onOpenAntecipate = vi.fn();
    render(
      <CarteiraSaldoCard
        bal={{ available: 0, pending: 0, blocked: 0, total: 0 }}
        revenueChart={[]}
        txList={[]}
        onOpenWithdraw={onOpenWithdraw}
        onOpenAntecipate={onOpenAntecipate}
        onNavigateExtrato={() => {}}
      />,
    );

    const withdraw = screen.getByRole('button', { name: /Sacar/ }) as HTMLButtonElement;
    const anticipate = screen.getByRole('button', { name: /Antecipar/ }) as HTMLButtonElement;
    expect(screen.getByText('Sem saldo disponivel')).toBeTruthy();
    expect(withdraw.disabled).toBe(true);
    expect(anticipate.disabled).toBe(true);
    fireEvent.click(withdraw);
    fireEvent.click(anticipate);
    expect(onOpenWithdraw).not.toHaveBeenCalled();
    expect(onOpenAntecipate).not.toHaveBeenCalled();
  });
});
