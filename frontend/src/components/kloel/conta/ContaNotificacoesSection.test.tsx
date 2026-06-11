import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import NotificacoesSection from './ContaNotificacoesSection';

const mocks = vi.hoisted(() => ({
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}));

vi.mock('@/lib/api/notifications', () => ({
  getNotificationPreferences: mocks.getNotificationPreferences,
  updateNotificationPreferences: mocks.updateNotificationPreferences,
}));

describe('NotificacoesSection', () => {
  beforeEach(() => {
    mocks.getNotificationPreferences.mockResolvedValue({ emailTips: true });
    mocks.updateNotificationPreferences.mockResolvedValue({ emailTips: false });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('loads the persisted preferences and renders a real switch with the saved state', async () => {
    mocks.getNotificationPreferences.mockResolvedValue({ emailTips: false });

    render(<NotificacoesSection />);

    expect(screen.getByText('Carregando preferencias...')).toBeTruthy();

    const toggle = await screen.findByRole('switch', { name: /dicas e novidades/i });
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(mocks.getNotificationPreferences).toHaveBeenCalledTimes(1);
  });

  it('persists the toggle via the API and reflects the confirmed state', async () => {
    render(<NotificacoesSection />);

    const toggle = await screen.findByRole('switch', { name: /dicas e novidades/i });
    expect(toggle.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mocks.updateNotificationPreferences).toHaveBeenCalledWith({ emailTips: false });
    });
    expect((await screen.findByRole('switch', { name: /dicas e novidades/i })).getAttribute('aria-checked')).toBe(
      'false',
    );
    expect(await screen.findByText('Preferencia salva!')).toBeTruthy();
  });

  it('keeps the previous state and shows an honest error when saving fails', async () => {
    mocks.updateNotificationPreferences.mockRejectedValue(new Error('backend indisponivel'));

    render(<NotificacoesSection />);

    const toggle = await screen.findByRole('switch', { name: /dicas e novidades/i });
    fireEvent.click(toggle);

    expect(await screen.findByText('backend indisponivel')).toBeTruthy();
    expect(
      (await screen.findByRole('switch', { name: /dicas e novidades/i })).getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('shows a load error with retry instead of fake content when loading fails', async () => {
    mocks.getNotificationPreferences
      .mockRejectedValueOnce(new Error('sem conexao'))
      .mockResolvedValueOnce({ emailTips: true });

    render(<NotificacoesSection />);

    expect(await screen.findByText('sem conexao')).toBeTruthy();
    expect(screen.queryByRole('switch')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));

    expect(await screen.findByRole('switch', { name: /dicas e novidades/i })).toBeTruthy();
  });

  it('lists security and legal e-mails as always-on without a toggle', async () => {
    render(<NotificacoesSection />);

    await screen.findByRole('switch', { name: /dicas e novidades/i });

    expect(screen.getByText('E-mails de seguranca')).toBeTruthy();
    expect(screen.getByText('Confirmacoes legais e de privacidade')).toBeTruthy();
    expect(screen.getAllByRole('switch')).toHaveLength(1);
  });
});
