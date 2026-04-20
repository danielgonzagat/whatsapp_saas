'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AdminEmptyState,
  AdminHeroSplit,
  AdminMetricGrid,
  AdminPage,
  AdminPageIntro,
  AdminSectionHeader,
  AdminSurface,
} from '@/components/admin/admin-monitor-ui';
import { adminSessionsApi, type AdminSessionRecord } from '@/lib/api/admin-sessions-api';
import { adminUsersApi, type AdminUserRecord } from '@/lib/api/admin-users-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';

function formatDate(value: string | null): string {
  if (!value) {
    return '—';
  }
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
}

/** Perfil page. */
export default function PerfilPage() {
  const {
    data: me,
    error: meError,
    isLoading: meLoading,
  } = useSWR<AdminUserRecord>('admin/users/me', () => adminUsersApi.me());
  const {
    data: sessions,
    error: sessionsError,
    isLoading: sessionsLoading,
    mutate: refetchSessions,
  } = useSWR<AdminSessionRecord[]>('admin/sessions/me', () => adminSessionsApi.listMine());

  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  async function revoke(id: string) {
    setRevokeError(null);
    setRevoking(id);
    try {
      await adminSessionsApi.revoke(id);
      await refetchSessions();
    } catch (error) {
      if (error instanceof AdminApiClientError) {
        setRevokeError(error.message);
      } else {
        setRevokeError('Erro ao revogar sessão.');
      }
    } finally {
      setRevoking(null);
    }
  }

  return (
    <AdminPage>
      <AdminPageIntro
        eyebrow="PERFIL"
        title="Meu perfil"
        description="Leitura da conta administrativa, postura de segurança e sessões autenticadas."
      />

      <AdminHeroSplit
        label="Sessões ativas"
        value={sessions?.filter((session) => !session.revokedAt).length ?? null}
        kind="integer"
        description={
          me ? (
            <>
              Conta de{' '}
              <span className="font-semibold text-[var(--app-text-primary)]">{me.name}</span> em{' '}
              <span className="font-semibold text-[var(--app-text-primary)]">{me.email}</span>.
            </>
          ) : (
            'Carregando informações da conta.'
          )
        }
        compactCards={[
          {
            label: 'Sessões revogadas',
            value: sessions?.filter((session) => !!session.revokedAt).length ?? null,
            kind: 'integer',
            note: 'Histórico disponível',
          },
          {
            label: 'MFA',
            value: me?.mfaEnabled ? 1 : 0,
            kind: 'integer',
            note: me?.mfaEnabled ? 'Proteção ativa' : 'Configuração pendente',
          },
          {
            label: 'Mudança de senha',
            value: me?.passwordChangeRequired ? 1 : 0,
            kind: 'integer',
            note: me?.passwordChangeRequired ? 'Obrigatória' : 'Em dia',
          },
          {
            label: 'Status',
            value: me?.status === 'ACTIVE' ? 1 : 0,
            kind: 'integer',
            note: me?.status ?? 'Carregando',
          },
        ]}
      />

      <AdminMetricGrid
        items={[
          {
            label: 'Role',
            value: me ? 1 : null,
            kind: 'integer',
            detail: me?.role ?? 'Carregando',
          },
          {
            label: 'Último login',
            value: me?.lastLoginAt ? 1 : 0,
            kind: 'integer',
            detail: formatDate(me?.lastLoginAt ?? null),
          },
          {
            label: 'Conta criada',
            value: me?.createdAt ? 1 : 0,
            kind: 'integer',
            detail: formatDate(me?.createdAt ?? null),
          },
          {
            label: 'Conta atualizada',
            value: me?.updatedAt ? 1 : 0,
            kind: 'integer',
            detail: formatDate(me?.updatedAt ?? null),
          },
        ]}
      />

      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminSectionHeader
          title="Conta"
          description="Informações cadastrais e status atual de segurança."
        />
        {meLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-32" />
          </div>
        ) : meError ? (
          <p className="text-sm text-red-400">Não foi possível carregar os dados da conta.</p>
        ) : me ? (
          <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
            <ProfileField label="Nome" value={me.name} />
            <ProfileField label="Email" value={me.email} />
            <ProfileField label="Role" value={me.role} />
            <ProfileField label="Status" value={me.status} />
            <ProfileField label="Autenticação 2FA" value={me.mfaEnabled ? 'Ativa' : 'Pendente'} />
            <ProfileField label="Último login" value={formatDate(me.lastLoginAt)} />
            <ProfileField label="Criada em" value={formatDate(me.createdAt)} />
            <ProfileField label="Atualizada em" value={formatDate(me.updatedAt)} />
          </dl>
        ) : null}
      </AdminSurface>

      <AdminSurface className="px-5 py-5 lg:px-6">
        <AdminSectionHeader
          title="Sessões ativas"
          description="Cada linha representa um navegador ou dispositivo autenticado."
        />
        <div className="flex flex-col gap-3">
          {sessionsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : sessionsError ? (
            <p className="text-sm text-red-400">Erro ao carregar sessões.</p>
          ) : !sessions || sessions.length === 0 ? (
            <AdminEmptyState
              title="Nenhuma sessão encontrada"
              description="As próximas autenticações aparecerão aqui para revisão."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="flex flex-col gap-2 rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-card)] p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-xs text-[var(--app-text-secondary)]">
                      <span className="rounded-full border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-secondary)]">
                        {session.revokedAt ? 'Revogada' : 'Ativa'}
                      </span>
                      <span className="font-mono">{session.ip}</span>
                    </div>
                    <p className="truncate text-xs text-[var(--app-text-secondary)]">
                      {session.userAgent}
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-[var(--app-text-tertiary)]">
                      Expira: {formatDate(session.expiresAt)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!session.revokedAt || revoking === session.id}
                    onClick={() => revoke(session.id)}
                  >
                    {revoking === session.id ? 'Revogando...' : 'Revogar'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {revokeError ? <p className="text-xs text-red-400">{revokeError}</p> : null}
        </div>
      </AdminSurface>
    </AdminPage>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-[var(--app-text-tertiary)]">
        {label}
      </dt>
      <dd className="font-mono text-sm text-[var(--app-text-primary)]">{value}</dd>
    </div>
  );
}
