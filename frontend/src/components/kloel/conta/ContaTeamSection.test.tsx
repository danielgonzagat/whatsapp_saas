import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TeamSection } from './ContaTeamSection';

const mocks = vi.hoisted(() => ({
  inviteTeamMember: vi.fn(),
  listTeam: vi.fn(),
  mutate: vi.fn(),
  removeTeamMember: vi.fn(),
  revokeTeamInvite: vi.fn(),
  teamData: {
    agents: [
      {
        id: 'agent-1',
        name: 'Ana Suporte',
        email: 'ana@kloel.com',
        role: 'MEMBER',
        isOnline: false,
        createdAt: '2026-06-01T10:00:00.000Z',
      },
    ],
    invitations: [] as Array<{ id: string; email: string; role: string; status?: string }>,
  },
  updateMemberRole: vi.fn(),
}));

vi.mock('swr', () => ({
  default: () => ({
    data: mocks.teamData,
    error: null,
    isLoading: false,
    mutate: mocks.mutate,
  }),
}));

vi.mock('@/hooks/useWorkspaceId', () => ({
  useWorkspaceId: () => 'ws-1',
}));

vi.mock('@/lib/api/team', () => ({
  inviteTeamMember: mocks.inviteTeamMember,
  listTeam: mocks.listTeam,
  removeTeamMember: mocks.removeTeamMember,
  revokeTeamInvite: mocks.revokeTeamInvite,
  updateMemberRole: mocks.updateMemberRole,
}));

describe('TeamSection', () => {
  beforeEach(() => {
    mocks.teamData = {
      agents: [
        {
          id: 'agent-1',
          name: 'Ana Suporte',
          email: 'ana@kloel.com',
          role: 'MEMBER',
          isOnline: false,
          createdAt: '2026-06-01T10:00:00.000Z',
        },
      ],
      invitations: [],
    };
    mocks.mutate.mockResolvedValue(undefined);
    mocks.updateMemberRole.mockResolvedValue({
      id: 'agent-1',
      name: 'Ana Suporte',
      email: 'ana@kloel.com',
      role: 'ADMIN',
      isOnline: true,
      createdAt: '2026-06-01T10:00:00.000Z',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows listed team agents as active members even when they are offline', () => {
    render(<TeamSection />);

    expect(screen.getByText('Ativo')).toBeTruthy();
    expect(screen.queryByText('Pendente')).toBeNull();
  });

  it('blocks invalid invite emails before calling the backend', () => {
    render(<TeamSection />);

    fireEvent.change(screen.getByLabelText(/email do convidado/i), {
      target: { value: 'email-invalido' },
    });

    expect(screen.getByRole('button', { name: /convidar/i }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Informe um email valido.')).toBeTruthy();
    expect(mocks.inviteTeamMember).not.toHaveBeenCalled();
  });

  it('updates an existing member role through the real team mutation', async () => {
    render(<TeamSection />);

    expect(screen.getByRole('combobox', { name: /funcao de ana suporte/i }).getAttribute('name')).toBe(
      'team-role-agent-1',
    );
    fireEvent.change(screen.getByRole('combobox', { name: /funcao de ana suporte/i }), {
      target: { value: 'ADMIN' },
    });

    await waitFor(() => {
      expect(mocks.updateMemberRole).toHaveBeenCalledWith('agent-1', 'ADMIN');
    });
    expect(mocks.mutate).toHaveBeenCalled();
  });

  it('names and executes member removal through the real team mutation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.removeTeamMember.mockResolvedValueOnce({ id: 'agent-1' });

    render(<TeamSection />);

    fireEvent.click(screen.getByRole('button', { name: /remover ana suporte/i }));

    await waitFor(() => {
      expect(mocks.removeTeamMember).toHaveBeenCalledWith('agent-1');
    });
    expect(mocks.mutate).toHaveBeenCalled();
  });

  it('replaces stale invite success after a pending invite is canceled', async () => {
    mocks.teamData = {
      agents: mocks.teamData.agents,
      invitations: [
        {
          id: 'invite-1',
          email: 'codex.audit.team@example.com',
          role: 'MEMBER',
          status: 'pending',
        },
      ],
    };
    mocks.inviteTeamMember.mockResolvedValueOnce({ id: 'invite-1' });
    mocks.revokeTeamInvite.mockResolvedValueOnce({ id: 'invite-1' });

    render(<TeamSection />);

    fireEvent.change(screen.getByLabelText(/email do convidado/i), {
      target: { value: 'codex.audit.team@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /convidar/i }));

    await waitFor(() => {
      expect(screen.getByText('Convite enviado para codex.audit.team@example.com')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /cancelar/i }));

    await waitFor(() => {
      expect(mocks.revokeTeamInvite).toHaveBeenCalledWith('invite-1');
    });
    expect(screen.queryByText('Convite enviado para codex.audit.team@example.com')).toBeNull();
    expect(screen.getByText('Convite cancelado.')).toBeTruthy();
  });
});
