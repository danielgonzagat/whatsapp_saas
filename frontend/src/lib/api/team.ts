// Team API — wraps /team backend routes
import { mutate } from 'swr';
import { apiFetch } from './core';

const invalidateTeam = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/team'));

/** Team member shape (backend: agent). */
export interface TeamMember {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Email property. */
  email: string;
  /** Role property. */
  role: string;
  /** Is online property. */
  isOnline: boolean;
  /** Created at property. */
  createdAt: string;
}

/** Team invite shape. */
export interface TeamInvite {
  /** Id property. */
  id: string;
  /** Email property. */
  email: string;
  /** Role property. */
  role: string;
  /** Created at property. */
  createdAt: string;
  /** Expires at property. */
  expiresAt?: string;
}

/** Team list response shape. */
export interface TeamListResponse {
  /** Agents property. */
  agents: TeamMember[];
  /** Invitations property. */
  invitations: TeamInvite[];
}

/** List team. */
export async function listTeam(): Promise<TeamListResponse> {
  const res = await apiFetch<TeamListResponse>('/team');
  if (res.error) {
    throw new Error(res.error || 'Erro ao listar equipe');
  }
  return res.data ?? { agents: [], invitations: [] };
}

/** Invite team member. */
export async function inviteTeamMember(email: string, role: string): Promise<TeamInvite> {
  const res = await apiFetch<TeamInvite>('/team/invite', {
    method: 'POST',
    body: { email, role },
  });
  if (res.error) {
    throw new Error(res.error || 'Erro ao enviar convite');
  }
  invalidateTeam();
  return res.data as TeamInvite;
}

/** Revoke team invite. */
export async function revokeTeamInvite(id: string): Promise<void> {
  const res = await apiFetch<void>(`/team/invite/${id}`, { method: 'DELETE' });
  if (res.error) {
    throw new Error(res.error || 'Erro ao cancelar convite');
  }
  invalidateTeam();
}

/** Remove team member. */
export async function removeTeamMember(id: string): Promise<void> {
  const res = await apiFetch<void>(`/team/member/${id}`, { method: 'DELETE' });
  if (res.error) {
    throw new Error(res.error || 'Erro ao remover membro');
  }
  invalidateTeam();
}

/** Update team member role. */
export async function updateMemberRole(id: string, role: string): Promise<TeamMember> {
  const res = await apiFetch<TeamMember>(`/team/member/${id}/role`, {
    method: 'PATCH',
    body: { role },
  });
  if (res.error) {
    throw new Error(res.error || 'Erro ao atualizar cargo');
  }
  invalidateTeam();
  return res.data as TeamMember;
}

/** Accept invite. */
export async function acceptTeamInvite(
  token: string,
  name: string,
  password: string,
): Promise<TeamMember> {
  const res = await apiFetch<TeamMember>('/team/accept-invite', {
    method: 'POST',
    body: { token, name, password },
  });
  if (res.error) {
    throw new Error(res.error || 'Erro ao aceitar convite');
  }
  return res.data as TeamMember;
}
