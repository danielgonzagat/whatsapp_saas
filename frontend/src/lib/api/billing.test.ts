import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mutate } from 'swr';

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
  tokenStorage: {
    getWorkspaceId: vi.fn(),
  },
}));

import { apiFetch, tokenStorage } from './core';
import { billingApi } from './billing';

const apiFetchMock = vi.mocked(apiFetch);
const getWorkspaceIdMock = vi.mocked(tokenStorage.getWorkspaceId);
const mutateMock = vi.mocked(mutate);

describe('billingApi mutation truthfulness', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    getWorkspaceIdMock.mockReset();
    mutateMock.mockReset();
    getWorkspaceIdMock.mockReturnValue('workspace-1');
  });

  it('does not invalidate billing when checkout creation returns an API error envelope', async () => {
    apiFetchMock.mockResolvedValue({ error: 'Stripe checkout unavailable', status: 502 });

    await expect(billingApi.createCheckoutSession('PRO')).rejects.toThrow('Stripe checkout unavailable');
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('invalidates billing after a confirmed checkout session creation', async () => {
    apiFetchMock.mockResolvedValue({ data: { url: 'https://checkout.kloel.com/session' }, status: 200 });

    await expect(billingApi.createCheckoutSession('PRO')).resolves.toEqual({
      data: { url: 'https://checkout.kloel.com/session' },
      status: 200,
    });
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });

  it('does not invalidate billing when default payment method update fails', async () => {
    apiFetchMock.mockResolvedValue({ error: 'Payment method rejected', status: 400 });

    await expect(billingApi.setDefaultPaymentMethod('pm_123')).rejects.toThrow('Payment method rejected');
    expect(mutateMock).not.toHaveBeenCalled();
  });
});
