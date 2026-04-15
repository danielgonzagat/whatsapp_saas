'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  adminIamApi,
  type AdminUserPermission,
  type AdminUserRecord,
} from '@/lib/api/admin-iam-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';
import { useAdminSession } from '@/lib/auth/admin-session-context';

const ROLE_VARIANT: Record<string, 'ember' | 'warning' | 'default'> = {
  OWNER: 'ember',
  MANAGER: 'warning',
  STAFF: 'default',
};

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  DEACTIVATED: 'danger',
};

function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

export default function ConfiguracoesPage() {
  const router = useRouter();
  const { admin } = useAdminSession();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (admin && admin.role !== 'OWNER') {
      router.replace('/');
    }
  }, [admin, router]);

  const {
    data: users,
    error,
    isLoading,
  } = useSWR<AdminUserRecord[]>(admin?.role === 'OWNER' ? 'admin/users' : null, () =>
    adminIamApi.listUsers(),
  );

  const { data: permissions } = useSWR<AdminUserPermission[]>(
    selected ? ['admin/users/permissions', selected] : null,
    () => adminIamApi.getUserPermissions(selected as string),
  );

  if (!admin || admin.role !== 'OWNER') return null;

  return (
    <section className="flex flex-1 flex-col gap-6 px-6 py-8 pb-24">
      <header className="flex flex-col gap-2">
        <Badge variant="ember" className="w-fit">
          SP-11
        </Badge>
        <h1 className="text-2xl font-semibold">Configurações — IAM</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Gestão de contas administrativas. Gateways, taxas globais, feature flags e webhooks chegam
          em SP-11 completo.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Administradores</CardTitle>
            <CardDescription>
              Todos os usuários com acesso ao painel. Owners têm acesso total; Managers operam o dia
              a dia; Staff tem acesso majoritariamente de leitura.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : error ? (
              <p
                role="alert"
                className="rounded-md border border-border bg-card px-4 py-3 text-sm text-muted-foreground"
              >
                {error instanceof AdminApiClientError
                  ? error.message
                  : 'Não foi possível carregar a lista de administradores.'}
              </p>
            ) : !users || users.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum administrador cadastrado.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-sm border border-border">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Nome</th>
                      <th className="px-4 py-3">Role</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">MFA</th>
                      <th className="px-4 py-3">Último login</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {users.map((u) => (
                      <tr
                        key={u.id}
                        onClick={() => setSelected(u.id)}
                        className={
                          'cursor-pointer hover:bg-accent/40 ' +
                          (selected === u.id ? 'bg-primary/10' : '')
                        }
                      >
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">{u.name}</span>
                            <span className="text-xs text-muted-foreground">{u.email}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={ROLE_VARIANT[u.role] ?? 'default'}>{u.role}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={STATUS_VARIANT[u.status] ?? 'default'}>{u.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {u.mfaEnabled ? (
                            <span className="text-emerald-400">Ativo</span>
                          ) : u.mfaPendingSetup ? (
                            <span className="text-amber-400">Pendente</span>
                          ) : (
                            <span className="text-muted-foreground">Desativado</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {formatDateTime(u.lastLoginAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Permissões granulares</CardTitle>
            <CardDescription>
              {selected
                ? 'Ajustes individuais além da matriz padrão do role.'
                : 'Selecione um administrador à esquerda para inspecionar suas permissões.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {!selected ? (
              <p className="py-8 text-center text-xs text-muted-foreground">Nenhum selecionado.</p>
            ) : !permissions ? (
              <Skeleton className="h-20 w-full" />
            ) : permissions.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                Usando a matriz padrão do role.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {permissions.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2 text-xs">
                    <span className="text-foreground">
                      {p.module}.{p.action}
                    </span>
                    <Badge variant={p.allowed ? 'success' : 'danger'}>
                      {p.allowed ? 'allow' : 'deny'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Próximos itens desta seção</CardTitle>
          <CardDescription>Tech debt explícito — evolui em SP-11 completo.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
          <p>• Criar / desativar administradores (formulário)</p>
          <p>• Sobrescrever matriz de permissões por administrador</p>
          <p>• Configurar gateways (Asaas, Mercado Pago, Stripe)</p>
          <p>• Taxas globais da plataforma</p>
          <p>• Feature flags e rollout gradual</p>
          <p>• Webhooks + domínios customizados</p>
        </CardContent>
      </Card>
    </section>
  );
}
