import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SegurancaSection from './ContaSegurancaSection';

const mocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
  disableMfa: vi.fn(),
  mutate: vi.fn(),
  revokeSession: vi.fn(),
  security: { mfa: { enabled: false, pendingSetup: false } } as {
    mfa: { enabled: boolean; pendingSetup: boolean };
    sessions?: Array<{ id: string; createdAt: string; expiresAt: string }>;
  },
  startMfaSetup: vi.fn(),
  verifyMfaSetup: vi.fn(),
}));

vi.mock('@/hooks/useKyc', () => ({
  useSecurityMutations: () => ({
    changePassword: mocks.changePassword,
    disableMfa: mocks.disableMfa,
    revokeSession: mocks.revokeSession,
    startMfaSetup: mocks.startMfaSetup,
    verifyMfaSetup: mocks.verifyMfaSetup,
  }),
  useSecurityState: () => ({
    error: null,
    isLoading: false,
    mutate: mocks.mutate,
    security: mocks.security,
  }),
}));

describe('SegurancaSection', () => {
  beforeEach(() => {
    mocks.mutate.mockResolvedValue(undefined);
    mocks.security = { mfa: { enabled: false, pendingSetup: false } };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts MFA setup, renders QR code, and verifies the six-digit code', async () => {
    mocks.startMfaSetup.mockResolvedValueOnce({ qrDataUrl: 'data:image/png;base64,ZmFrZQ==' });
    mocks.verifyMfaSetup.mockResolvedValueOnce({ mfa: { enabled: true, pendingSetup: false } });

    render(<SegurancaSection />);

    fireEvent.click(screen.getByRole('button', { name: /configurar 2fa/i }));

    await waitFor(() => {
      expect(mocks.startMfaSetup).toHaveBeenCalled();
    });
    expect(await screen.findByAltText('QR code 2FA')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Codigo 2FA'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /confirmar 2fa/i }));

    await waitFor(() => {
      expect(mocks.verifyMfaSetup).toHaveBeenCalledWith('123456');
    });
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
  });

  it('cancels a pending MFA setup without requiring an authenticator code', async () => {
    mocks.security = { mfa: { enabled: false, pendingSetup: true } };
    mocks.disableMfa.mockResolvedValueOnce({ mfa: { enabled: false, pendingSetup: false } });

    render(<SegurancaSection />);

    fireEvent.click(screen.getByRole('button', { name: /cancelar configuracao 2fa/i }));

    await waitFor(() => {
      expect(mocks.disableMfa).toHaveBeenCalledWith();
    });
    expect(mocks.mutate).toHaveBeenCalled();
  });

  it('renders real active auth sessions and revokes one through the backend mutation', async () => {
    mocks.security = {
      mfa: { enabled: false, pendingSetup: false },
      sessions: [
        {
          id: 'rt-1',
          createdAt: '2026-06-01T10:00:00.000Z',
          expiresAt: '2026-07-01T10:00:00.000Z',
        },
      ],
    };
    mocks.revokeSession.mockResolvedValueOnce({ success: true });

    render(<SegurancaSection />);

    expect(screen.queryByText(/visao unificada ainda nao disponivel/i)).toBeNull();
    expect(screen.getByText(/sessao autenticada/i)).toBeTruthy();
    expect(screen.getByText(/expira em/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /revogar sessao/i }));

    await waitFor(() => {
      expect(mocks.revokeSession).toHaveBeenCalledWith('rt-1');
    });
    expect(mocks.mutate).toHaveBeenCalled();
  });
});
