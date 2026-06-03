import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mutate } from 'swr';

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
  buildQuery: vi.fn((params: Record<string, string>) => `?${new URLSearchParams(params).toString()}`),
}));

import { apiFetch } from './core';
import { disconnectWhatsApp, getWhatsAppStatus, initiateWhatsAppConnection } from './whatsapp';

const apiFetchMock = vi.mocked(apiFetch);
const mutateMock = vi.mocked(mutate);

describe('Meta-only WhatsApp API', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    mutateMock.mockReset();
  });

  it('maps Meta auth status into the WhatsApp session contract', async () => {
    apiFetchMock.mockResolvedValue({
      data: {
        channels: {
          whatsapp: {
            connected: true,
            phoneNumberId: ' phone-1 ',
            whatsappBusinessId: 'biz-1',
            username: ' Loja Kloel ',
            displayPhoneNumber: ' +55 11 99999-0000 ',
          },
        },
      },
      status: 200,
    });

    await expect(getWhatsAppStatus('ws-1')).resolves.toEqual(
      expect.objectContaining({
        connected: true,
        status: 'connected',
        phone: '+55 11 99999-0000',
        pushName: 'Loja Kloel',
        phoneNumberId: 'phone-1',
        whatsappBusinessId: 'biz-1',
        provider: 'meta-cloud',
        workerHealthy: true,
      }),
    );
    expect(apiFetchMock).toHaveBeenCalledWith('/meta/auth/status');
  });

  it('marks expired Meta tokens as degraded and disconnected', async () => {
    apiFetchMock.mockResolvedValue({
      data: {
        tokenExpired: true,
        channels: { whatsapp: { connected: true, phoneNumberId: 'phone-1' } },
      },
      status: 200,
    });

    await expect(getWhatsAppStatus('ws-1')).resolves.toEqual(
      expect.objectContaining({
        connected: false,
        status: 'authorization_expired',
        workerError: 'meta_token_expired',
        degraded: true,
        degradedReason: 'meta_token_expired',
      }),
    );
  });

  it('requests the official Meta authorization URL for WhatsApp', async () => {
    apiFetchMock.mockResolvedValue({ data: { url: 'https://meta.test/auth' }, status: 200 });

    await expect(initiateWhatsAppConnection('ws-1')).resolves.toEqual({
      status: 'connect_required',
      authUrl: 'https://meta.test/auth',
      message: 'Abrindo autorizacao oficial da Meta.',
    });
    expect(apiFetchMock).toHaveBeenCalledWith(
      '/meta/auth/url?channel=whatsapp&returnTo=%2Fwhatsapp',
    );
  });

  it('invalidates WhatsApp cache after a confirmed disconnect', async () => {
    apiFetchMock.mockResolvedValue({ data: { disconnected: true }, status: 200 });

    await expect(disconnectWhatsApp('ws-1')).resolves.toEqual({ disconnected: true });
    expect(apiFetchMock).toHaveBeenCalledWith('/meta/auth/disconnect', { method: 'POST' });
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });

  it('does not invalidate cache when disconnect returns an error envelope', async () => {
    apiFetchMock.mockResolvedValue({ error: 'Denied', status: 403 });

    await expect(disconnectWhatsApp('ws-1')).rejects.toMatchObject({
      message: 'Denied',
      status: 403,
    });
    expect(mutateMock).not.toHaveBeenCalled();
  });
});
