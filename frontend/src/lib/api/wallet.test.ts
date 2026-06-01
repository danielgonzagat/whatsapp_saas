import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from './core';
import { getWalletBalance, getWalletTransactions } from './wallet';

const apiFetchMock = vi.mocked(apiFetch);

describe('wallet API adapter', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  describe('getWalletBalance', () => {
    it('returns confirmed wallet balances', async () => {
      const balance = {
        available: 100,
        pending: 20,
        blocked: 0,
        total: 120,
        formattedAvailable: 'R$ 100,00',
        formattedPending: 'R$ 20,00',
        formattedTotal: 'R$ 120,00',
      };
      apiFetchMock.mockResolvedValue({ data: balance, status: 200 });

      await expect(getWalletBalance('workspace-1')).resolves.toEqual(balance);
    });

    it('rejects failed balance status without an error envelope', async () => {
      apiFetchMock.mockResolvedValue({
        data: {
          available: 0,
          pending: 0,
          blocked: 0,
          total: 0,
          formattedAvailable: 'R$ 0,00',
          formattedPending: 'R$ 0,00',
          formattedTotal: 'R$ 0,00',
        },
        status: 503,
      });

      await expect(getWalletBalance('workspace-1')).rejects.toThrow('Failed to load wallet balance');
    });

    it('rejects missing balance payloads instead of casting undefined as a real balance', async () => {
      apiFetchMock.mockResolvedValue({ data: undefined, status: 200 });

      await expect(getWalletBalance('workspace-1')).rejects.toThrow(
        'Wallet balance did not return a confirmed payload',
      );
    });
  });

  describe('getWalletTransactions', () => {
    it('returns direct transaction arrays', async () => {
      apiFetchMock.mockResolvedValue({
        data: [{ id: 'tx-1', type: 'sale', amount: 100, status: 'confirmed', createdAt: 'now' }],
        status: 200,
      });

      await expect(getWalletTransactions('workspace-1')).resolves.toEqual([
        { id: 'tx-1', type: 'sale', amount: 100, status: 'confirmed', createdAt: 'now' },
      ]);
    });

    it('returns transaction arrays from the backend envelope', async () => {
      apiFetchMock.mockResolvedValue({
        data: {
          transactions: [
            { id: 'tx-2', type: 'withdrawal', amount: 50, status: 'pending', createdAt: 'now' },
          ],
          total: 1,
        },
        status: 200,
      });

      await expect(getWalletTransactions('workspace-1')).resolves.toEqual([
        { id: 'tx-2', type: 'withdrawal', amount: 50, status: 'pending', createdAt: 'now' },
      ]);
    });

    it('rejects failed transaction status without an error envelope', async () => {
      apiFetchMock.mockResolvedValue({ data: { transactions: [] }, status: 503 });

      await expect(getWalletTransactions('workspace-1')).rejects.toThrow(
        'Failed to load wallet transactions',
      );
    });

    it('rejects missing transaction payloads instead of returning a fake empty statement', async () => {
      apiFetchMock.mockResolvedValue({ data: undefined, status: 200 });

      await expect(getWalletTransactions('workspace-1')).rejects.toThrow(
        'Wallet transactions did not return a confirmed payload',
      );
    });

    it('rejects malformed transaction envelopes', async () => {
      apiFetchMock.mockResolvedValue({ data: { transactions: null }, status: 200 });

      await expect(getWalletTransactions('workspace-1')).rejects.toThrow(
        'Wallet transactions did not return a confirmed payload',
      );
    });
  });
});
