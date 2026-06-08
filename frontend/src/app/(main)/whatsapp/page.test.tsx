import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { apiFetchMock, getWhatsAppStatusMock, mutateMock } = vi.hoisted(() => ({
  apiFetchMock: vi.fn(),
  getWhatsAppStatusMock: vi.fn(),
  mutateMock: vi.fn(),
}));

vi.mock('@/lib/api/core', () => ({
  apiFetch: apiFetchMock,
}));

vi.mock('@/lib/api/whatsapp', () => ({
  getWhatsAppStatus: getWhatsAppStatusMock,
  mapMetaAuthStatusToWhatsAppStatus: (data: { channels?: { whatsapp?: { status?: string } } }) => {
    const status = data.channels?.whatsapp?.status || 'connection_incomplete';
    return {
      connected: status === 'connected',
      status,
      degraded: status === 'meta_oauth_configuration_missing',
      degradedReason: status === 'meta_oauth_configuration_missing' ? status : null,
      workerHealthy: status !== 'meta_oauth_configuration_missing',
    };
  },
}));

vi.mock('swr', () => ({
  mutate: mutateMock,
}));

import WhatsAppPage from './page';

afterEach(() => {
  cleanup();
  apiFetchMock.mockReset();
  getWhatsAppStatusMock.mockReset();
  mutateMock.mockReset();
});

describe('WhatsAppPage', () => {
  it('blocks Meta connect when OAuth configuration is unavailable', async () => {
    apiFetchMock.mockImplementation((path: string) => {
      if (path === '/meta/auth/status') {
        return Promise.resolve({
          data: {
            connected: false,
            channels: {
              whatsapp: {
                connected: false,
                status: 'meta_oauth_configuration_missing',
              },
            },
          },
          status: 200,
        });
      }

      return Promise.resolve({ data: { url: 'https://meta.test/auth' }, status: 200 });
    });
    getWhatsAppStatusMock.mockResolvedValue({
      connected: false,
      status: 'meta_oauth_configuration_missing',
      degraded: true,
      degradedReason: 'meta_oauth_configuration_missing',
      workerHealthy: false,
    });

    render(<WhatsAppPage />);

    expect(
      await screen.findByText('A autorizacao Meta ainda nao esta configurada no backend.'),
    ).toBeTruthy();

    const connectButton = screen.getByRole('button', { name: 'Conectar com Meta' });
    expect((connectButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(connectButton);

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    expect(getWhatsAppStatusMock).not.toHaveBeenCalled();
    expect(apiFetchMock).not.toHaveBeenCalledWith(
      '/meta/auth/url?channel=whatsapp&returnTo=/whatsapp',
    );
  });
});
