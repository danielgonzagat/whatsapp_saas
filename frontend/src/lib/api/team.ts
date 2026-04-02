// Team API — wraps /team backend routes
import { mutate } from 'swr';
import { apiFetch } from './core';

const invalidateTeam = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/team'));

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  status: 'active' | 'invited' | 'suspended';
}

export interface TeamInvite {
  id: string;
  email: string;
  role: string;
  createdAt: string;
  expiresAt?: string;
  status: 'pending' | 'accepted' | 'revoked';
}

export interface TeamListResponse {
  members: TeamMember[];
  invites: TeamInvite[];
}

export async function listTeam(): Promise<TeamListResponse> {
  const res = await apiFetch<TeamListResponse>('/team');
  if (res.error) throw new Error(res.error || 'Erro ao listar equipe');
  return res.data ?? { members: [], invites: [] };
}

export async function inviteTeamMember(email: string, role: string): Promise<TeamInvite> {
  const res = await apiFetch<TeamInvite>('/team/invite', {
    method: 'POST',
    body: { email, role },
  });
  if (res.error) throw new Error(res.error || 'Erro ao enviar convite');
  invalidateTeam();
  return res.data as TeamInvite;
}

export async function revokeTeamInvite(id: string): Promise<void> {
  const res = await apiFetch<void>(`/team/invite/${id}`, { method: 'DELETE' });
  if (res.error) throw new Error(res.error || 'Erro ao cancelar convite');
  invalidateTeam();
}

export async function removeTeamMember(id: string): Promise<void> {
  const res = await apiFetch<void>(`/team/member/${id}`, { method: 'DELETE' });
  if (res.error) throw new Error(res.error || 'Erro ao remover membro');
  invalidateTeam();
}
