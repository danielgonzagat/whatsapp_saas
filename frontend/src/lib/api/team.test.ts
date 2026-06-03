import { mutate } from 'swr';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('swr', () => ({
  mutate: vi.fn(),
}));

vi.mock('./core', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from './core';
import {
  acceptTeamInvite,
  inviteTeamMember,
  listTeam,
  removeTeamMember,
  revokeTeamInvite,
  updateMemberRole,
} from './team';

const apiFetchMock = vi.mocked(apiFetch);
const mutateMock = vi.mocked(mutate);

describe('team API truthfulness', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
    mutateMock.mockReset();
  });

  it('rejects team list failed status instead of returning a fake empty team', async () => {
    apiFetchMock.mockResolvedValueOnce({ status: 503 });

    await expect(listTeam()).rejects.toThrow('Erro ao listar equipe');
  });

  it('rejects team list without confirmed payload instead of returning a fake empty team', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: undefined, status: 200 });

    await expect(listTeam()).rejects.toThrow('Team list did not return a confirmed payload');
  });

  it('does not invalidate team after an unconfirmed invite', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: undefined, status: 201 });

    await expect(inviteTeamMember('ana@example.com', 'MEMBER')).rejects.toThrow(
      'Team invite did not return a confirmed payload',
    );
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('does not invalidate team after a failed invite revocation status', async () => {
    apiFetchMock.mockResolvedValueOnce({ status: 500 });

    await expect(revokeTeamInvite('invite-1')).rejects.toThrow('Erro ao cancelar convite');
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('does not invalidate team after an unconfirmed member removal', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: undefined, status: 200 });

    await expect(removeTeamMember('member-1')).rejects.toThrow(
      'Team member removal did not return a confirmed payload',
    );
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('does not invalidate team after an unconfirmed role update', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: undefined, status: 200 });

    await expect(updateMemberRole('member-1', 'ADMIN')).rejects.toThrow(
      'Team role update did not return a confirmed payload',
    );
    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('rejects invite acceptance without confirmed member payload', async () => {
    apiFetchMock.mockResolvedValueOnce({ data: undefined, status: 200 });

    await expect(acceptTeamInvite('token', 'Ana', 'password123')).rejects.toThrow(
      'Team invite acceptance did not return a confirmed payload',
    );
  });

  it('invalidates team after a confirmed invite', async () => {
    const invite = {
      id: 'invite-1',
      email: 'ana@example.com',
      role: 'MEMBER',
      createdAt: '2026-06-01T00:00:00.000Z',
    };
    apiFetchMock.mockResolvedValueOnce({ data: invite, status: 201 });

    await expect(inviteTeamMember('ana@example.com', 'MEMBER')).resolves.toEqual(invite);
    expect(mutateMock).toHaveBeenCalledTimes(1);
  });
});
