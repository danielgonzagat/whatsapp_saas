// Team API — wraps /team backend routes
import { mutate } from 'swr';
import { apiFetch } from './core';

const invalidateTeam = () =>
  mutate(
    (key: unknown) => typeof key === 'string' && (key === '/team' || key.endsWith(':/team')),
  );

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

type TeamApiEnvelope<T> = {
  data?: T | undefined;
  error?: string | undefined;
  status: number;
};

function confirmTeamPayload<T>(
  response: TeamApiEnvelope<T>,
  fallbackMessage: string,
  missingPayloadMessage: string,
): T {
  if (response.error || response.status >= 400) {
    throw new Error(response.error ?? fallbackMessage);
  }

  if (response.data === undefined || response.data === null) {
    throw new Error(missingPayloadMessage);
  }

  return response.data;
}

/** List team. */
export async function listTeam(): Promise<TeamListResponse> {
  const res = await apiFetch<TeamListResponse>('/team');
  return confirmTeamPayload(res, 'Erro ao listar equipe', 'Team list did not return a confirmed payload');
}

/** Invite team member. */
export async function inviteTeamMember(email: string, role: string): Promise<TeamInvite> {
  const res = await apiFetch<TeamInvite>('/team/invite', {
    method: 'POST',
    body: { email, role },
  });
  const invite = confirmTeamPayload(
    res,
    'Erro ao enviar convite',
    'Team invite did not return a confirmed payload',
  );
  invalidateTeam();
  return invite;
}

/** Revoke team invite. */
export async function revokeTeamInvite(id: string): Promise<void> {
  const res = await apiFetch<TeamInvite>(`/team/invite/${id}`, { method: 'DELETE' });
  confirmTeamPayload(
    res,
    'Erro ao cancelar convite',
    'Team invite revocation did not return a confirmed payload',
  );
  invalidateTeam();
}

/** Remove team member. */
export async function removeTeamMember(id: string): Promise<void> {
  const res = await apiFetch<TeamMember>(`/team/member/${id}`, { method: 'DELETE' });
  confirmTeamPayload(
    res,
    'Erro ao remover membro',
    'Team member removal did not return a confirmed payload',
  );
  invalidateTeam();
}

/** Update team member role. */
export async function updateMemberRole(id: string, role: string): Promise<TeamMember> {
  const res = await apiFetch<TeamMember>(`/team/member/${id}/role`, {
    method: 'PATCH',
    body: { role },
  });
  const member = confirmTeamPayload(
    res,
    'Erro ao atualizar cargo',
    'Team role update did not return a confirmed payload',
  );
  invalidateTeam();
  return member;
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
  return confirmTeamPayload(
    res,
    'Erro ao aceitar convite',
    'Team invite acceptance did not return a confirmed payload',
  );
}
