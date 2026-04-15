'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { adminSessionsApi, type AdminSessionRecord } from '@/lib/api/admin-sessions-api';
import { adminUsersApi, type AdminUserRecord } from '@/lib/api/admin-users-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';

function formatDate(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('pt-BR');
  } catch {
    return value;
  }
}

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
    } catch (err) {
      if (err instanceof AdminApiClientError) {
        setRevokeError(err.message);
      } else {
        setRevokeError('Erro ao revogar sessão.');
      }
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 px-6 py-8 pb-24">
      <header className="flex flex-col gap-2">
        <Badge variant="ember" className="w-fit">
          SP-2
        </Badge>
        <h1 className="text-2xl font-semibold">Meu perfil</h1>
        <p className="text-sm text-muted-foreground">
          Dados da sua conta administrativa e sessões ativas. Sessões revogadas desconectam o
          dispositivo no próximo request.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Conta</CardTitle>
          <CardDescription>Informações cadastrais e status de segurança.</CardDescription>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Sessões ativas</CardTitle>
          <CardDescription>
            Cada linha representa um dispositivo/navegador autenticado. Revogue qualquer um que não
            reconheça.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {sessionsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : sessionsError ? (
            <p className="text-sm text-red-400">Erro ao carregar sessões.</p>
          ) : !sessions || sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma sessão ativa encontrada.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="flex flex-col gap-2 rounded-sm border border-border p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant={session.revokedAt ? 'default' : 'ember'}>
                        {session.revokedAt ? 'Revogada' : 'Ativa'}
                      </Badge>
                      <span className="font-mono">{session.ip}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{session.userAgent}</p>
                    <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                      Expira: {formatDate(session.expiresAt)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!session.revokedAt || revoking === session.id}
                    onClick={() => revoke(session.id)}
                  >
                    {revoking === session.id ? 'Revogando…' : 'Revogar'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {revokeError ? <p className="text-xs text-red-400">{revokeError}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm text-foreground">{value}</dd>
    </div>
  );
}
