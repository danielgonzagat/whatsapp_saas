'use client';
import { colors } from '@/lib/design-tokens';
import { useAuth } from '@/components/kloel/auth/auth-provider';

import { kloelT } from '@/lib/i18n/t';
import { useState, useId } from 'react';
import useSWR from 'swr';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import type { TeamListResponse } from '@/lib/api/team';
import {
  inviteTeamMember,
  listTeam,
  removeTeamMember,
  revokeTeamInvite,
  updateMemberRole,
} from '@/lib/api/team';
import Icons from './ContaIcons';
import { SORA, EMBER } from './ContaConstants';
import { getErrorMessage } from './ContaHelpers';
import { SectionCard } from './ContaShared';
import { TeamMember, TeamInvite } from './ContaTypes';

const INVITE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVALID_INVITE_EMAIL_MESSAGE = 'Informe um email valido.';

export function TeamSection() {
  const fid = useId();
  const wsId = useWorkspaceId();
  const { userEmail } = useAuth();
  const currentUserEmail = userEmail?.trim().toLowerCase() || '';
  const {
    data,
    error: listError,
    isLoading,
    mutate,
  } = useSWR<TeamListResponse>(wsId ? `${wsId}:/team` : null, () => listTeam(), {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  // Backend returns { agents, invitations }. Agents are active workspace members;
  // pending status belongs to invitations that have not been accepted yet.
  const members: TeamMember[] = (data?.agents ?? []).map((agent) => ({
    id: agent.id,
    name: agent.name,
    email: agent.email,
    role: agent.role,
    status: 'active',
  }));
  const invites: TeamInvite[] = (data?.invitations ?? []).map((inv) => ({
    id: inv.id,
    email: inv.email,
    role: inv.role,
    status: 'pending',
  }));

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('MEMBER');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [teamActionError, setTeamActionError] = useState('');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [updatingRoleId, setUpdatingRoleId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const trimmedInviteEmail = inviteEmail.trim();
  const inviteEmailInvalid = !!trimmedInviteEmail && !INVITE_EMAIL_RE.test(trimmedInviteEmail);
  const inviteValidationError = inviteEmailInvalid ? INVALID_INVITE_EMAIL_MESSAGE : '';
  const inviteButtonDisabled = inviting || !trimmedInviteEmail || inviteEmailInvalid;

  const handleInvite = async () => {
    if (!trimmedInviteEmail) {
      return;
    }
    if (inviteEmailInvalid) {
      setInviteError(INVALID_INVITE_EMAIL_MESSAGE);
      setInviteSuccess('');
      return;
    }
    setInviting(true);
    setInviteError('');
    setInviteSuccess('');
    setTeamActionError('');
    try {
      await inviteTeamMember(trimmedInviteEmail, inviteRole);
      setInviteEmail('');
      setInviteSuccess(`Convite enviado para ${trimmedInviteEmail}`);
      await mutate();
    } catch (e) {
      setInviteError(getErrorMessage(e) || 'Erro ao enviar convite');
    } finally {
      setInviting(false);
    }
  };


  const handleRevoke = async (id: string) => {
    setRevokingId(id);
    setTeamActionError('');
    setInviteError('');
    setInviteSuccess('');
    try {
      await revokeTeamInvite(id);
      setInviteSuccess('Convite cancelado.');
      await mutate();
    } catch (e) {
      setTeamActionError(getErrorMessage(e) || 'Erro ao cancelar convite');
    } finally {
      setRevokingId(null);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm('Remover este membro da equipe?')) {
      return;
    }
    setRemovingId(id);
    setTeamActionError('');
    try {
      await removeTeamMember(id);
      await mutate();
    } catch (e) {
      setTeamActionError(getErrorMessage(e) || 'Erro ao remover membro');
    } finally {
      setRemovingId(null);
    }
  };

  const handleRoleChange = async (memberId: string, currentRole: string, nextRole: string) => {
    if (!nextRole || nextRole === currentRole) {
      return;
    }
    setUpdatingRoleId(memberId);
    setTeamActionError('');
    try {
      await updateMemberRole(memberId, nextRole);
      await mutate();
    } catch (e) {
      setTeamActionError(getErrorMessage(e) || 'Erro ao atualizar cargo');
    } finally {
      setUpdatingRoleId(null);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    background: 'var(--app-bg-card)',
    border: '1px solid var(--app-border-primary)',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: SORA,
    color: 'var(--app-text-primary)',
    boxSizing: 'border-box' as const,
    outline: 'none',
  };

  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

  const ROLES: Record<string, string> = {
    ADMIN: 'Administrador',
    MEMBER: 'Membro',
    VIEWER: 'Visualizador',
  };

  return (
    <div>
      <h2
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--app-text-primary)',
          margin: '0 0 16px',
          fontFamily: SORA,
        }}
      >
        {kloelT(`Equipe`)}
      </h2>

      {(listError || teamActionError) && (
        <p
          style={{
            fontSize: 11,
            color: colors.semantic.error,
            margin: '0 0 12px',
            fontFamily: SORA,
          }}
        >
          {teamActionError || getErrorMessage(listError) || 'Erro ao carregar equipe'}
        </p>
      )}

      <SectionCard
        title={kloelT(`Convidar membro`)}
        subtitle={kloelT(`Envie um convite por email para adicionar alguem a sua equipe`)}
      >
        <div
          style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' as const }}
        >
          <div style={{ flex: 2, minWidth: 200 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--app-text-secondary)',
                display: 'block',
                marginBottom: 6,
                fontFamily: SORA,
              }}
              htmlFor={`${fid}-email`}
            >
              {kloelT(`Email`)}
            </label>
            <input
              aria-label="Email do convidado"
              aria-invalid={inviteEmailInvalid}
              type="email"
              value={inviteEmail}
              onChange={(e) => {
                setInviteEmail(e.target.value);
                setInviteError('');
                setInviteSuccess('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleInvite();
                }
              }}
              placeholder={kloelT(`email@exemplo.com`)}
              style={inputStyle}
              id={`${fid}-email`}
            />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--app-text-secondary)',
                display: 'block',
                marginBottom: 6,
                fontFamily: SORA,
              }}
              htmlFor={`${fid}-funcao`}
            >
              {kloelT(`Funcao`)}
            </label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              style={selectStyle}
              id={`${fid}-funcao`}
            >
              {Object.entries(ROLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={handleInvite}
            disabled={inviteButtonDisabled}
            style={{
              padding: '11px 20px',
              background: inviteButtonDisabled ? 'var(--app-text-placeholder)' : EMBER,
              border: 'none',
              borderRadius: 6,
              color: colors.text.silver,
              fontSize: 12,
              fontWeight: 600,
              cursor: inviteButtonDisabled ? 'not-allowed' : 'pointer',
              fontFamily: SORA,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {Icons.plus(12)} {inviting ? 'Enviando...' : 'Convidar'}
          </button>
        </div>
        {(inviteError || inviteValidationError) && (
          <p style={{ fontSize: 11, color: colors.semantic.error, margin: '8px 0 0', fontFamily: SORA }}>
            {inviteError || inviteValidationError}
          </p>
        )}
        {inviteSuccess && (
          <p style={{ fontSize: 11, color: colors.semantic.success, margin: '8px 0 0', fontFamily: SORA }}>
            {inviteSuccess}
          </p>
        )}
      </SectionCard>

      <SectionCard title={kloelT(`Membros ativos`)}>
        {isLoading ? (
          <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)', fontFamily: SORA }}>
            {kloelT(`Carregando...`)}
          </span>
        ) : members.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center' as const }}>
            <span style={{ color: 'var(--app-text-tertiary)' }}>{Icons.users(28)}</span>
            <p
              style={{
                fontSize: 12,
                color: 'var(--app-text-tertiary)',
                margin: '8px 0 0',
                fontFamily: SORA,
              }}
            >
              {kloelT(`Nenhum membro na equipe ainda`)}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
            {members.map((m) => {
              const memberEmail = m.email.trim().toLowerCase();
              const isCurrentUser = !!currentUserEmail && memberEmail === currentUserEmail;
              const roleSelectDisabled = updatingRoleId === m.id || isCurrentUser;

              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 0',
                    borderBottom: '1px solid var(--app-border-subtle)',
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: '16%',
                      background: 'var(--app-bg-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--app-text-secondary)',
                    }}
                  >
                    {Icons.user(14)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: 'var(--app-text-primary)',
                        display: 'block',
                        fontFamily: SORA,
                      }}
                    >
                      {m.name || m.email}
                    </span>
                    <span
                      style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}
                    >
                      {m.email}
                    </span>
                  </div>
                  <select
                    id={`${fid}-team-role-${m.id}`}
                    name={`team-role-${m.id}`}
                    aria-label={kloelT(`Funcao de ${m.name || m.email}`)}
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.id, m.role, e.target.value)}
                    disabled={roleSelectDisabled}
                    style={{
                      ...selectStyle,
                      width: 132,
                      padding: '6px 8px',
                      fontSize: 11,
                      opacity: roleSelectDisabled ? 0.58 : 1,
                    }}
                    title={
                      isCurrentUser
                        ? kloelT(`Seu cargo precisa ser alterado por outro administrador`)
                        : kloelT(`Alterar cargo de ${m.name || m.email}`)
                    }
                  >
                    {Object.entries(ROLES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontFamily: SORA,
                      color: m.status === 'active' ? colors.semantic.success : colors.semantic.warning,
                      background:
                        m.status === 'active' ? 'rgba(16,185,129,.08)' : 'rgba(245,158,11,.08)',
                    }}
                  >
                    {m.status === 'active' ? 'Ativo' : 'Pendente'}
                  </span>
                  {isCurrentUser ? (
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: '5px 8px',
                        borderRadius: 4,
                        color: 'var(--app-text-tertiary)',
                        border: '1px solid var(--app-border-primary)',
                        fontFamily: SORA,
                      }}
                      title={kloelT(`Voce nao pode remover a si mesmo da equipe`)}
                    >
                      {kloelT(`Voce`)}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRemove(m.id)}
                      disabled={removingId === m.id}
                      style={{
                        padding: '5px 8px',
                        background: 'none',
                        border: '1px solid var(--app-border-primary)',
                        borderRadius: 4,
                        color: colors.semantic.error,
                        cursor: 'pointer',
                        display: 'flex',
                        opacity: removingId === m.id ? 0.5 : 1,
                      }}
                      aria-label={kloelT(`Remover ${m.name || m.email}`)}
                      title={kloelT(`Remover ${m.name || m.email}`)}
                    >
                      {Icons.trash(12)}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {invites.filter((inv) => inv.status === 'pending').length > 0 && (
        <SectionCard title={kloelT(`Convites pendentes`)}>
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 2 }}>
            {invites
              .filter((inv) => inv.status === 'pending')
              .map((inv) => (
                <div
                  key={inv.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 0',
                    borderBottom: '1px solid var(--app-border-subtle)',
                  }}
                >
                  <span style={{ color: 'var(--app-text-tertiary)' }}>{Icons.mail(16)}</span>
                  <div style={{ flex: 1 }}>
                    <span
                      style={{
                        fontSize: 13,
                        color: 'var(--app-text-primary)',
                        display: 'block',
                        fontFamily: SORA,
                      }}
                    >
                      {inv.email}
                    </span>
                    <span
                      style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}
                    >
                      {ROLES[inv.role] || inv.role} {kloelT(`· Aguardando aceite`)}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 4,
                      color: colors.semantic.warning,
                      background: 'rgba(245,158,11,.08)',
                      fontFamily: SORA,
                    }}
                  >
                    {kloelT(`Pendente`)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRevoke(inv.id)}
                    disabled={revokingId === inv.id}
                    style={{
                      padding: '5px 10px',
                      background: 'none',
                      border: '1px solid var(--app-border-primary)',
                      borderRadius: 4,
                      color: 'var(--app-text-secondary)',
                      fontSize: 10,
                      cursor: 'pointer',
                      fontFamily: SORA,
                      opacity: revokingId === inv.id ? 0.5 : 1,
                    }}
                  >
                    {kloelT(`Cancelar`)}
                  </button>
                </div>
              ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
