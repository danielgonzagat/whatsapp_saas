import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TeamSection } from './ContaTeamSection';

const mocks = vi.hoisted(() => ({
  inviteTeamMember: vi.fn(),
  listTeam: vi.fn(),
  mutate: vi.fn(),
  removeTeamMember: vi.fn(),
  revokeTeamInvite: vi.fn(),
  updateMemberRole: vi.fn(),
}));

vi.mock('swr', () => ({
  default: () => ({
    data: {
      agents: [
        {
          id: 'agent-1',
          name: 'Ana Suporte',
          email: 'ana@kloel.com',
          role: 'MEMBER',
          isOnline: true,
          createdAt: '2026-06-01T10:00:00.000Z',
        },
      ],
      invitations: [],
    },
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
});
