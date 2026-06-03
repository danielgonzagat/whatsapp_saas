import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const apiFetchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetchMock(...args),
}));
vi.mock('@/lib/i18n/t', () => ({ kloelT: (s: string) => s }));
vi.mock('@/hooks/useWorkspaceId', () => ({ useWorkspaceId: () => 'ws-1' }));
vi.mock('@/hooks/useWallet', () => ({ useBankAccounts: () => ({ accounts: [] }) }));
vi.mock('swr', () => ({ mutate: vi.fn() }));

import { CarteiraWithdrawModal } from './CarteiraWithdrawModal';

describe('CarteiraWithdrawModal', () => {
  afterEach(() => apiFetchMock.mockReset());

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
});
