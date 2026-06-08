import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PerfilPublicoSection from './ContaPerfilPublicoSection';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  showToast: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('@/hooks/useKyc', () => ({
  useProfileMutations: () => ({ updateProfile: mocks.updateProfile }),
}));

vi.mock('@/hooks/useProducts', () => ({
  useProducts: () => ({ total: 0, isLoading: false, error: null }),
}));

vi.mock('@/components/kloel/ToastProvider', () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

vi.mock('@/hooks/usePersistentImagePreview', () => ({
  usePersistentImagePreview: () => ({ previewUrl: null }),
}));

describe('PerfilPublicoSection', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('blocks saving an empty required public name', async () => {
    render(
      <PerfilPublicoSection
        profile={{ name: 'Codex Audit', publicName: 'Codex Audit' }}
        mutate={mocks.mutate}
      />,
    );

    await waitFor(() => {
      expect((screen.getByLabelText('Nome publico') as HTMLInputElement).value).toBe('Codex Audit');
    });

    fireEvent.change(screen.getByLabelText('Nome publico'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));

    expect(await screen.findByText('Informe o nome publico.')).toBeTruthy();
    expect(mocks.showToast).toHaveBeenCalledWith('Informe o nome publico.', 'error');
    expect(mocks.updateProfile).not.toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
});
