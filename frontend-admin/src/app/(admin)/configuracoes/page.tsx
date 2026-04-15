'use client';

import { type FormEvent, useEffect, useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  adminIamApi,
  type AdminUserPermission,
  type AdminUserRecord,
  type PermissionSetEntry,
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

const ALL_MODULES = [
  'HOME',
  'PRODUTOS',
  'MARKETING',
  'VENDAS',
  'CARTEIRA',
  'RELATORIOS',
  'CONTAS',
  'COMPLIANCE',
  'CLIENTES',
  'CONFIGURACOES',
  'IAM',
  'PERFIL',
  'AUDIT_LOG',
] as const;

const ALL_ACTIONS = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT'] as const;

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
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (admin && admin.role !== 'OWNER') {
      router.replace('/');
    }
  }, [admin, router]);

  const {
    data: users,
    error,
    isLoading,
    mutate: refetchUsers,
  } = useSWR<AdminUserRecord[]>(admin?.role === 'OWNER' ? 'admin/users' : null, () =>
    adminIamApi.listUsers(),
  );

  const { data: permissions, mutate: refetchPermissions } = useSWR<AdminUserPermission[]>(
    selected ? ['admin/users/permissions', selected] : null,
    () => adminIamApi.getUserPermissions(selected as string),
  );

  if (!admin || admin.role !== 'OWNER') return null;

  return (
    <section className="flex flex-1 flex-col gap-6 px-6 py-8 pb-24">
      <header className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Badge variant="ember" className="w-fit">
            SP-11
          </Badge>
          <h1 className="text-2xl font-semibold">Configurações — IAM</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Criar e revisar contas administrativas. Gateways, taxas globais, feature flags e
            webhooks chegam em SP-11 completo.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>Novo administrador</Button>
      </header>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Administradores</CardTitle>
            <CardDescription>
              Clique em uma linha para inspecionar e ajustar suas permissões granulares.
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

        {selected ? (
          <PermissionEditor
            key={selected}
            user={users?.find((u) => u.id === selected) ?? null}
            permissions={permissions ?? null}
            onSaved={async () => {
              await refetchPermissions();
            }}
            onCancel={() => setSelected(null)}
          />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Permissões granulares</CardTitle>
              <CardDescription>Selecione um admin para editar.</CardDescription>
            </CardHeader>
            <CardContent className="py-8 text-center text-xs text-muted-foreground">
              Nenhum selecionado.
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Próximos itens desta seção</CardTitle>
          <CardDescription>Tech debt explícito — evolui em SP-11 completo.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
          <p>• Suspender / reativar / desativar administradores</p>
          <p>• Configurar gateways (Asaas, Mercado Pago, Stripe)</p>
          <p>• Taxas globais da plataforma</p>
          <p>• Feature flags e rollout gradual</p>
          <p>• Webhooks + domínios customizados</p>
        </CardContent>
      </Card>

      {showCreate ? (
        <CreateUserDialog
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            await refetchUsers();
          }}
        />
      ) : null}
    </section>
  );
}

function CreateUserDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => Promise<void> | void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [role, setRole] = useState<'OWNER' | 'MANAGER' | 'STAFF'>('STAFF');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const roleId = useId();

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await adminIamApi.createUser({ name, email, temporaryPassword, role });
      await onCreated();
    } catch (err) {
      setError(
        err instanceof AdminApiClientError
          ? err.message
          : 'Erro inesperado ao criar administrador.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-40 flex items-center justify-center bg-background/70 p-6"
    >
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-sm">Novo administrador</CardTitle>
          <CardDescription>
            O novo admin recebe a senha temporária que você definir aqui. No primeiro login ele é
            obrigado a trocá-la e configurar MFA.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={onSubmit} noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor={nameId}>Nome</Label>
              <Input
                id={nameId}
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
                required
                minLength={2}
                maxLength={120}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={emailId}>Email</Label>
              <Input
                id={emailId}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={passwordId}>Senha temporária</Label>
              <Input
                id={passwordId}
                type="password"
                value={temporaryPassword}
                onChange={(e) => setTemporaryPassword(e.currentTarget.value)}
                minLength={12}
                maxLength={128}
                required
                placeholder="Mínimo 12 caracteres"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={roleId}>Role</Label>
              <select
                id={roleId}
                value={role}
                onChange={(e) => setRole(e.currentTarget.value as 'OWNER' | 'MANAGER' | 'STAFF')}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="STAFF">STAFF — leitura + ações limitadas</option>
                <option value="MANAGER">MANAGER — operação do dia a dia</option>
                <option value="OWNER">OWNER — acesso total</option>
              </select>
            </div>
            {error ? <p className="text-xs text-red-400">{error}</p> : null}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? 'Criando…' : 'Criar admin'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function PermissionEditor({
  user,
  permissions,
  onSaved,
  onCancel,
}: {
  user: AdminUserRecord | null;
  permissions: AdminUserPermission[] | null;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
}) {
  // Build a map of the current overrides for quick lookup.
  const initialMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const p of permissions ?? []) {
      map.set(`${p.module}.${p.action}`, p.allowed);
    }
    return map;
  }, [permissions]);

  const [overrides, setOverrides] = useState<Map<string, boolean>>(() => new Map(initialMap));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed overrides when permissions reload from the server.
  useEffect(() => {
    setOverrides(new Map(initialMap));
  }, [initialMap]);

  function toggle(moduleName: string, action: string) {
    const key = `${moduleName}.${action}`;
    setOverrides((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        if (next.get(key) === true) {
          next.set(key, false);
        } else {
          next.delete(key);
        }
      } else {
        next.set(key, true);
      }
      return next;
    });
  }

  async function save() {
    if (!user) return;
    setError(null);
    setBusy(true);
    try {
      const entries: PermissionSetEntry[] = Array.from(overrides.entries()).map(
        ([key, allowed]) => {
          const [module, action] = key.split('.');
          return { module, action, allowed };
        },
      );
      await adminIamApi.setPermissions(user.id, entries);
      await onSaved();
    } catch (err) {
      setError(
        err instanceof AdminApiClientError ? err.message : 'Erro inesperado ao salvar permissões.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{user.name}</CardTitle>
        <CardDescription>
          {user.role} • {user.email}. OWNER bypassa o guard — overrides têm efeito para MANAGER e
          STAFF.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex max-h-[480px] flex-col gap-2 overflow-y-auto">
        {user.role === 'OWNER' ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            OWNER ignora a matriz de permissões. Nada para editar aqui.
          </p>
        ) : (
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-card">
              <tr className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="py-2 pr-2">Módulo</th>
                {ALL_ACTIONS.map((a) => (
                  <th key={a} className="px-1 py-2 text-center">
                    {a.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ALL_MODULES.map((m) => (
                <tr key={m}>
                  <td className="py-2 pr-2 font-medium">{m}</td>
                  {ALL_ACTIONS.map((a) => {
                    const key = `${m}.${a}`;
                    const active = overrides.get(key);
                    return (
                      <td key={a} className="px-1 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => toggle(m, a)}
                          className={
                            'h-5 w-5 rounded-sm border text-[9px] ' +
                            (active === true
                              ? 'border-primary bg-primary/20 text-primary'
                              : active === false
                                ? 'border-red-400 bg-red-400/10 text-red-400'
                                : 'border-border text-muted-foreground')
                          }
                          title={`${m}.${a}`}
                        >
                          {active === true ? '✓' : active === false ? '×' : '·'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
      <CardContent className="flex items-center justify-end gap-2">
        {error ? <p className="mr-auto text-xs text-red-400">{error}</p> : null}
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
          Fechar
        </Button>
        {user.role !== 'OWNER' ? (
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar overrides'}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
