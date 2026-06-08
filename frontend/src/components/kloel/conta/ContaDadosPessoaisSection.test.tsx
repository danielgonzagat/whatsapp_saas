import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DadosPessoaisSection from './ContaDadosPessoaisSection';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  showToast: vi.fn(),
  updateProfile: vi.fn(),
  uploadAvatar: vi.fn(),
}));

vi.mock('@/hooks/useKyc', () => ({
  useProfileMutations: () => ({
    updateProfile: mocks.updateProfile,
    uploadAvatar: mocks.uploadAvatar,
  }),
}));

vi.mock('@/components/kloel/ToastProvider', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

vi.mock('@/hooks/usePersistentImagePreview', () => ({
  usePersistentImagePreview: () => ({
    previewUrl: null,
    setPreviewUrl: vi.fn(),
  }),
}));

describe('DadosPessoaisSection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('selects birth date through the day/month/year pop-up and persists it', async () => {
    mocks.updateProfile.mockResolvedValueOnce({ ok: true });

    render(
      <DadosPessoaisSection
        profile={{
          name: 'Daniel Penin',
          email: 'daniel@example.com',
          phone: '(64) 99999-0000',
          birthDate: '1990-05-14T03:00:00.000Z',
        }}
        mutate={mocks.mutate}
      />,
    );

    const pickerButton = await screen.findByRole('button', { name: /data de nascimento/i });
    const birthDateLabel = screen.getByText(/data de nascimento/i).closest('label');

    expect(birthDateLabel?.control).toBe(pickerButton);
    expect(pickerButton.textContent?.trim()).toBe('14/05/1990');
    expect(
      screen.getByRole('button', { name: 'Data de nascimento: 14/05/1990' }),
    ).toBe(pickerButton);

    fireEvent.click(pickerButton);
    expect(screen.getByRole('dialog', { name: /selecionar data de nascimento/i })).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Dia'), { target: { value: '9' } });
    fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Ano'), { target: { value: '1988' } });
    fireEvent.click(screen.getByRole('button', { name: /aplicar data/i }));

    expect(pickerButton.textContent).toContain('09/08/1988');
    expect(
      screen.getByRole('button', { name: 'Data de nascimento: 09/08/1988' }),
    ).toBe(pickerButton);

    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    await waitFor(() => {
      expect(mocks.updateProfile).toHaveBeenCalledWith({
        name: 'Daniel Penin',
        phone: '(64) 99999-0000',
        birthDate: '1988-08-09',
      });
    });
    expect(mocks.mutate).toHaveBeenCalled();
  });

  it('exposes browser form names for the personal text fields', async () => {
    render(
      <DadosPessoaisSection
        profile={{
          name: 'Codex Audit',
          email: 'codex.audit@example.test',
          phone: '(11) 97777-0001',
          birthDate: '1988-08-09',
        }}
        mutate={mocks.mutate}
      />,
    );

    expect((await screen.findByRole('textbox', { name: 'Nome completo' })).getAttribute('name')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'E-mail' }).getAttribute('name')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Celular' }).getAttribute('name')).toBeTruthy();
  });

  it('blocks saving when required personal fields are empty', async () => {
    render(
      <DadosPessoaisSection
        profile={{
          name: 'Codex Audit',
          email: 'codex.audit@example.test',
          phone: '',
          birthDate: '',
        }}
        mutate={mocks.mutate}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: /salvar/i }));

    expect(await screen.findByText('Informe um celular valido com DDD.')).toBeTruthy();
    expect(mocks.showToast).toHaveBeenCalledWith('Informe um celular valido com DDD.', 'error');
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
