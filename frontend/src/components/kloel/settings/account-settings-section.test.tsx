import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockedAuthChangePassword,
  mockedAuthGetMe,
  mockedAuthExportMyData,
  mockedAuthForgotPassword,
  mockedAuthListSessions,
  mockedAuthRevokeOtherSessions,
  mockedAuthRevokeSession,
  mockedAuthRequestDataDeletion,
  mockedAuthSignOut,
  mockedWorkspaceGetMe,
  mockedWorkspaceGetChannels,
  mockedWorkspaceSetProvider,
  mockedWorkspaceSetJitter,
  mockedWorkspaceUpdateChannels,
} = vi.hoisted(() => ({
  mockedAuthChangePassword: vi.fn(),
  mockedAuthGetMe: vi.fn(),
  mockedAuthExportMyData: vi.fn(),
  mockedAuthForgotPassword: vi.fn(),
  mockedAuthListSessions: vi.fn(),
  mockedAuthRevokeOtherSessions: vi.fn(),
  mockedAuthRevokeSession: vi.fn(),
  mockedAuthRequestDataDeletion: vi.fn(),
  mockedAuthSignOut: vi.fn(),
  mockedWorkspaceGetMe: vi.fn(),
  mockedWorkspaceGetChannels: vi.fn(),
  mockedWorkspaceSetProvider: vi.fn(),
  mockedWorkspaceSetJitter: vi.fn(),
  mockedWorkspaceUpdateChannels: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  authApi: {
    changePassword: mockedAuthChangePassword,
    getMe: mockedAuthGetMe,
    exportMyData: mockedAuthExportMyData,
    forgotPassword: mockedAuthForgotPassword,
    listSessions: mockedAuthListSessions,
    revokeOtherSessions: mockedAuthRevokeOtherSessions,
    revokeSession: mockedAuthRevokeSession,
    requestDataDeletion: mockedAuthRequestDataDeletion,
    signOut: mockedAuthSignOut,
  },
  workspaceApi: {
    getMe: mockedWorkspaceGetMe,
    getChannels: mockedWorkspaceGetChannels,
    updateAccount: vi.fn(),
    setProvider: mockedWorkspaceSetProvider,
    setJitter: mockedWorkspaceSetJitter,
    updateChannels: mockedWorkspaceUpdateChannels,
  },
}));

vi.mock('@/lib/subdomains', () => ({
  buildMarketingUrl: vi.fn((path: string) => `https://kloel.com${path}`),
}));

import { AccountSettingsSection } from './account-settings-section';

describe('AccountSettingsSection privacy controls', () => {
  const originalLocation = window.location;
  const assignSpy = vi.fn();
  const createObjectUrlSpy = vi.fn(() => 'blob:export-url');
  const revokeObjectUrlSpy = vi.fn();
  const anchorClickSpy = vi.fn();

  beforeEach(() => {
    mockedWorkspaceGetMe.mockResolvedValue({
      data: {
        name: 'Kloel Workspace',
        providerSettings: {},
        jitterMin: 5,
        jitterMax: 15,
      },
    });
    mockedAuthGetMe.mockResolvedValue({
      data: {
        user: {
          id: 'agent-1',
          email: 'daniel@kloel.com',
        },
      },
    });
    mockedWorkspaceGetChannels.mockResolvedValue({
      data: {
        email: false,
      },
    });
    mockedAuthExportMyData.mockResolvedValue({
      data: {
        exportedAt: '2026-04-18T12:00:00.000Z',
        user: {
          id: 'agent-1',
          email: 'daniel@kloel.com',
        },
      },
    });
    mockedAuthChangePassword.mockReset();
    mockedAuthChangePassword.mockResolvedValue({
      data: {
        success: true,
      },
    });
    mockedAuthForgotPassword.mockReset();
    mockedAuthForgotPassword.mockResolvedValue({
      data: {
        ok: true,
      },
    });
    mockedAuthRequestDataDeletion.mockResolvedValue({
      data: {
        confirmationCode: 'CONFIRM123456789',
        status: 'completed',
      },
    });
    mockedAuthListSessions.mockResolvedValue({
      data: {
        sessions: [
          {
            id: 'session-current',
            isCurrent: true,
            device: 'Chrome em macOS',
            detail: 'Sessão atual neste dispositivo • America/Sao_Paulo',
            deviceType: 'desktop',
            createdAt: '2026-04-18T09:00:00.000Z',
            lastUsedAt: '2026-04-18T11:30:00.000Z',
            expiresAt: '2026-05-18T11:30:00.000Z',
            ipAddress: '203.0.113.10',
          },
          {
            id: 'session-iphone',
            isCurrent: false,
            device: 'Safari em iOS',
            detail: 'Último acesso em 18/04 às 08:15 • 198.51.100.22',
            deviceType: 'mobile',
            createdAt: '2026-04-17T08:00:00.000Z',
            lastUsedAt: '2026-04-18T08:15:00.000Z',
            expiresAt: '2026-05-17T08:15:00.000Z',
            ipAddress: '198.51.100.22',
          },
        ],
      },
    });
    mockedAuthRevokeOtherSessions.mockResolvedValue({ data: { success: true, revokedCount: 1 } });
    mockedAuthRevokeSession.mockResolvedValue({
      data: { success: true, revokedSessionId: 'session-iphone' },
    });
    mockedAuthSignOut.mockReset();
    mockedAuthSignOut.mockResolvedValue(undefined);
    mockedWorkspaceSetProvider.mockReset();
    mockedWorkspaceSetProvider.mockResolvedValue({ data: { ok: true } });
    mockedWorkspaceSetJitter.mockReset();
    mockedWorkspaceSetJitter.mockResolvedValue({ data: { ok: true } });
    mockedWorkspaceUpdateChannels.mockReset();
    mockedWorkspaceUpdateChannels.mockResolvedValue({ data: { ok: true } });
    assignSpy.mockReset();
    createObjectUrlSpy.mockClear();
    revokeObjectUrlSpy.mockClear();
    anchorClickSpy.mockClear();

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        host: 'app.kloel.com',
        href: 'https://app.kloel.com/settings',
        assign: assignSpy,
      },
    });

    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: createObjectUrlSpy,
        revokeObjectURL: revokeObjectUrlSpy,
      }),
    );
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(anchorClickSpy);
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
    vi.unstubAllGlobals();
  });

  it('exports the authenticated account data and surfaces a success notice', async () => {
    render(<AccountSettingsSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Exportar meus dados' }));

    await waitFor(() => {
      expect(mockedAuthExportMyData).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText('Exportação gerada com sucesso.')).toBeInTheDocument();
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);
  });

  it('requires explicit confirmation before requesting permanent account deletion', async () => {
    render(<AccountSettingsSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Excluir minha conta' }));

    const confirmButton = await screen.findByRole('button', {
      name: 'Confirmar exclusão permanente',
    });
    const confirmationInput = screen.getByLabelText('Digite EXCLUIR para continuar');
    const acknowledgement = screen.getByLabelText(
      'Entendo que meu acesso será revogado imediatamente.',
    );

    expect(confirmButton).toBeDisabled();

    fireEvent.change(confirmationInput, { target: { value: 'EXCLUIR' } });
    fireEvent.click(acknowledgement);

    await waitFor(() => {
      expect(confirmButton).toBeEnabled();
    });

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(mockedAuthRequestDataDeletion).toHaveBeenCalledTimes(1);
      expect(mockedAuthSignOut).toHaveBeenCalledTimes(1);
      expect(assignSpy).toHaveBeenCalledWith(
        'https://kloel.com/data-deletion/status/CONFIRM123456789',
      );
    });
  });

  it('signs out the current browser session from the security surface', async () => {
    render(<AccountSettingsSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Sair deste dispositivo' }));

    await waitFor(() => {
      expect(mockedAuthSignOut).toHaveBeenCalledTimes(1);
      expect(assignSpy).toHaveBeenCalledWith('https://kloel.com/login');
    });
  });

  it('renders remote active sessions and lets the user revoke another device', async () => {
    render(<AccountSettingsSection />);

    expect(await screen.findByText('Safari em iOS')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar sessão Safari em iOS' }));

    await waitFor(() => {
      expect(mockedAuthRevokeSession).toHaveBeenCalledWith('session-iphone');
    });
  });

  it('lets the user revoke every other active session in one action', async () => {
    render(<AccountSettingsSection />);

    expect(await screen.findByText('Safari em iOS')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Encerrar outras sessões' }));

    await waitFor(() => {
      expect(mockedAuthRevokeOtherSessions).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText('As outras sessões foram encerradas com sucesso.')).toBeInTheDocument();
  });

  it('sends a password reset link to the authenticated email from settings', async () => {
    render(<AccountSettingsSection />);

    const resetLinkButton = await screen.findByRole('button', {
      name: 'Enviar link de redefinição para meu e-mail',
    });

    await waitFor(() => {
      expect(resetLinkButton).toBeEnabled();
    });

    fireEvent.click(resetLinkButton);

    await waitFor(() => {
      expect(mockedAuthForgotPassword).toHaveBeenCalledWith('daniel@kloel.com');
    });

    expect(
      await screen.findByText('Enviamos um link de redefinição para daniel@kloel.com.'),
    ).toBeInTheDocument();
  });

  it('changes the password from the authenticated security form', async () => {
    render(<AccountSettingsSection />);

    fireEvent.change(await screen.findByLabelText('Senha atual'), {
      target: { value: 'SenhaAtual@123' },
    });
    fireEvent.change(screen.getByLabelText('Nova senha'), {
      target: { value: 'SenhaNova@123' },
    });
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), {
      target: { value: 'SenhaNova@123' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Atualizar senha' }));

    await waitFor(() => {
      expect(mockedAuthChangePassword).toHaveBeenCalledWith('SenhaAtual@123', 'SenhaNova@123');
    });

    expect(
      await screen.findByText(
        'Senha atualizada com sucesso. Outras sessões precisarão entrar novamente.',
      ),
    ).toBeInTheDocument();
  });

  it('normalizes a legacy WhatsApp provider back to Meta Cloud in the account settings select', async () => {
    mockedWorkspaceGetMe.mockResolvedValueOnce({
      data: {
        name: 'Kloel Workspace',
        providerSettings: {
          whatsappProvider: 'whatsapp-api',
        },
        jitterMin: 5,
        jitterMax: 15,
      },
    });

    render(<AccountSettingsSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Salvar canais e jitter' }));

    await waitFor(() => {
      expect(mockedWorkspaceSetProvider).toHaveBeenCalledWith('meta-cloud');
    });
  });
});
