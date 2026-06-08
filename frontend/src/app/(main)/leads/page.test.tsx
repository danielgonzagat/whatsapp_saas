import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LeadsPage from './page';

const state = vi.hoisted(() => ({
  getContacts: vi.fn(),
  openAuthModal: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => state.searchParams,
}));

vi.mock('@/components/kloel/auth/auth-provider', () => ({
  useAuth: () => ({
    isAuthenticated: true,
    isLoading: false,
    workspace: { id: 'workspace-1' },
    openAuthModal: state.openAuthModal,
  }),
}));

vi.mock('@/lib/api', () => ({
  getContacts: (...args: unknown[]) => state.getContacts(...args),
}));

async function advanceTimers(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('LeadsPage data loading', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    state.getContacts.mockReset();
    state.getContacts.mockResolvedValue([]);
    state.openAuthModal.mockReset();
    state.searchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loads once initially and once per debounced filter change', async () => {
    render(<LeadsPage />);

    await advanceTimers(350);

    expect(state.getContacts).toHaveBeenCalledTimes(1);
    expect(state.getContacts).toHaveBeenLastCalledWith('workspace-1', { limit: 200 });

    state.getContacts.mockClear();

    fireEvent.change(screen.getByLabelText('Buscar por nome, telefone ou email'), {
      target: { value: 'codex' },
    });
    fireEvent.change(screen.getByLabelText('Filtrar leads por status'), {
      target: { value: 'hot' },
    });

    await advanceTimers(349);
    expect(state.getContacts).not.toHaveBeenCalled();

    await advanceTimers(1);

    expect(state.getContacts).toHaveBeenCalledTimes(1);
    expect(state.getContacts).toHaveBeenLastCalledWith('workspace-1', {
      status: 'hot',
      search: 'codex',
      limit: 200,
    });
  });
});
