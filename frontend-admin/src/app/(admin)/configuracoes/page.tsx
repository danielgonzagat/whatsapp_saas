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
  AdminMetricGrid,
  AdminPage,
  AdminPageIntro,
  AdminSectionHeader,
  AdminSurface,
} from '@/components/admin/admin-monitor-ui';
import {
  adminIamApi,
  type AdminUserPermission,
  type AdminUserRecord,
  type PermissionSetEntry,
} from '@/lib/api/admin-iam-api';
import { adminConfigApi, type AdminConfigWorkspaceRow } from '@/lib/api/admin-config-api';
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

const CONFIG_PAGE_COPY = {
  pageTitle: 'Configurações',
  pageDescription:
    'Gestão de administradores, perfis de acesso e permissões granulares da operação.',
  newAdmin: 'Novo administrador',
  adminsTitle: 'Administradores',
  adminsDescription: 'Clique em uma linha para inspecionar e ajustar suas permissões granulares.',
  adminsLoadError: 'Não foi possível carregar a lista de administradores.',
  adminsEmpty: 'Nenhum administrador cadastrado.',
  headers: {
    name: 'Nome',
    role: 'Role',
    status: 'Status',
    mfa: 'MFA',
    lastLogin: 'Último login',
    module: 'Módulo',
    workspace: 'Workspace',
    domain: 'Domínio',
    guest: 'Guest',
    autopilot: 'Autopilot',
    auth: 'Auth',
    infra: 'Infra',
  },
  mfaState: {
    active: 'Ativo',
    pending: 'Pendente',
    disabled: 'Desativado',
  },
  permissionsTitle: 'Permissões granulares',
  permissionsSelect: 'Selecione um admin para editar.',
  permissionsEmpty: 'Nenhum selecionado.',
  governanceTitle: 'Governança de acesso',
  governanceDescription:
    'Somente contas OWNER alteram papéis e permissões. Toda modificação reflete no controle operacional imediatamente.',
  governanceNotes: [
    'Permissões são definidas por módulo e ação para reduzir acesso excessivo.',
    'Managers e staff seguem a matriz granular; owners mantêm acesso total.',
    'Use a tabela para revisar MFA, último login e distribuição de responsabilidades.',
  ],
  workspaceTitle: 'Workspace config',
  workspaceDescription:
    'Controles editáveis de domínio, guest mode, auth mode e autopilot por workspace.',
  workspaceSearchPlaceholder: 'Buscar workspace, domínio ou email',
  workspaceGuestOn: 'Ativo',
  workspaceGuestOff: 'Off',
  workspaceAutopilotOn: 'Ativo',
  workspaceAutopilotOff: 'Off',
  editWorkspaceTitle: 'Editar workspace',
  workspaceControlsDescription: 'Controles reais persistidos em `Workspace` e `providerSettings`.',
  customDomain: 'Custom domain',
  authMode: 'Auth mode',
  guestModeActive: 'Guest mode ativo',
  autopilotActive: 'Autopilot ativo',
  saveWorkspace: 'Salvar workspace',
  savingWorkspace: 'Salvando…',
  saveWorkspaceError: 'Erro inesperado ao salvar configuração.',
  createAdminDescription:
    'O novo admin recebe a senha temporária que você definir aqui. No primeiro login ele é obrigado a trocá-la e configurar MFA.',
  email: 'Email',
  temporaryPassword: 'Senha temporária',
  temporaryPasswordPlaceholder: 'Mínimo 12 caracteres',
  roleStaff: 'STAFF — leitura + ações limitadas',
  roleManager: 'MANAGER — operação do dia a dia',
  roleOwner: 'OWNER — acesso total',
  cancel: 'Cancelar',
  createAdmin: 'Criar admin',
  creatingAdmin: 'Criando…',
  createAdminError: 'Erro inesperado ao criar administrador.',
  permissionSaveError: 'Erro inesperado ao salvar permissões.',
  permissionOwnerBypass: 'OWNER ignora a matriz de permissões. Nada para editar aqui.',
  close: 'Fechar',
  saveOverrides: 'Salvar overrides',
  savingOverrides: 'Salvando…',
} as const;

const CONFIG_METRIC_COPY = {
  admins: { label: 'Administradores', detail: 'Base cadastrada' },
  owners: { label: 'Owners', detail: 'Acesso total' },
  mfaEnabled: { label: 'MFA ativo', detail: 'Proteção já habilitada' },
  pendingSetup: { label: 'Setup pendente', detail: 'Precisam concluir segurança' },
  workspaces: { label: 'Workspaces', detail: 'Escopo atual da busca' },
  activeDomains: { label: 'Domínios ativos', detail: 'Custom domains configurados' },
  apiKeys: { label: 'API keys', detail: 'Chaves públicas ativas' },
  autopilotOn: { label: 'Autopilot on', detail: 'Workspaces com automação ativa' },
} as const;

type WorkspaceConfigEditorProps = {
  workspace: AdminConfigWorkspaceRow | null;
  onSaved: (workspace: AdminConfigWorkspaceRow) => Promise<void> | void;
};

type CreateUserDialogProps = {
  onClose: () => void;
  onCreated: () => Promise<void> | void;
};

type PermissionEditorProps = {
  user: AdminUserRecord | null;
  permissions: AdminUserPermission[] | null;
  onSaved: () => Promise<void> | void;
  onCancel: () => void;
};

type UserAccessSectionProps = {
  error: unknown;
  isLoading: boolean;
  permissions: AdminUserPermission[] | null;
  selectedUserId: string | null;
  users: AdminUserRecord[];
  onPermissionsSaved: () => Promise<void> | void;
  onSelectUser: (userId: string | null) => void;
};

type ConfigOverviewData = Awaited<ReturnType<typeof adminConfigApi.overview>>;

type WorkspaceConfigSectionProps = {
  configOverview: ConfigOverviewData | undefined;
  configSearch: string;
  selectedWorkspace: AdminConfigWorkspaceRow | null;
  onConfigSearchChange: (value: string) => void;
  onSelectWorkspace: (workspace: AdminConfigWorkspaceRow) => void;
  onWorkspaceSaved: (workspace: AdminConfigWorkspaceRow) => Promise<void> | void;
};

function describePermissionEditorUser(user: AdminUserRecord): string {
  return `${user.role} • ${user.email}. OWNER bypassa o guard — overrides têm efeito para MANAGER e STAFF.`;
}

function formatWorkspaceInfraSummary(workspace: AdminConfigWorkspaceRow): string {
  return `${workspace.apiKeysCount} keys • ${workspace.webhookSubscriptionsCount} webhooks`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

/** Configuracoes page. */
export default function ConfiguracoesPage() {
  const router = useRouter();
  const { admin } = useAdminSession();
  const [selected, setSelected] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [configSearch, setConfigSearch] = useState('');
  const [selectedWorkspace, setSelectedWorkspace] = useState<AdminConfigWorkspaceRow | null>(null);

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
  const { data: configOverview, mutate: refetchConfigOverview } = useSWR(
    ['admin/config/overview', configSearch],
    () => adminConfigApi.overview(configSearch || undefined),
  );

  if (!admin || admin.role !== 'OWNER') {
    return null;
  }
  const userList = users ?? [];
  const handleUserCreated = async () => {
    setShowCreate(false);
    await refetchUsers();
  };
  const handleWorkspaceSaved = async (updated: AdminConfigWorkspaceRow) => {
    setSelectedWorkspace(updated);
    await refetchConfigOverview();
  };

  return (
    <AdminPage>
      <AdminPageIntro
        eyebrow="IAM"
        title={CONFIG_PAGE_COPY.pageTitle}
        description={CONFIG_PAGE_COPY.pageDescription}
        actions={<Button onClick={() => setShowCreate(true)}>{CONFIG_PAGE_COPY.newAdmin}</Button>}
      />

      <AdminMetricGrid
        items={[
          {
            label: CONFIG_METRIC_COPY.admins.label,
            value: userList.length,
            kind: 'integer',
            detail: CONFIG_METRIC_COPY.admins.detail,
          },
          {
            label: CONFIG_METRIC_COPY.owners.label,
            value: userList.filter((user) => user.role === 'OWNER').length,
            kind: 'integer',
            detail: CONFIG_METRIC_COPY.owners.detail,
          },
          {
            label: CONFIG_METRIC_COPY.mfaEnabled.label,
            value: userList.filter((user) => user.mfaEnabled).length,
            kind: 'integer',
            detail: CONFIG_METRIC_COPY.mfaEnabled.detail,
          },
          {
            label: CONFIG_METRIC_COPY.pendingSetup.label,
            value: userList.filter((user) => user.mfaPendingSetup).length,
            kind: 'integer',
            detail: CONFIG_METRIC_COPY.pendingSetup.detail,
          },
        ]}
      />

      <UserAccessSection
        error={error}
        isLoading={isLoading}
        permissions={permissions ?? null}
        selectedUserId={selected}
        users={userList}
        onPermissionsSaved={async () => {
          await refetchPermissions();
        }}
        onSelectUser={setSelected}
      />

      <GovernanceNotesSection />

      <WorkspaceConfigSection
        configOverview={configOverview}
        configSearch={configSearch}
        selectedWorkspace={selectedWorkspace}
        onConfigSearchChange={setConfigSearch}
        onSelectWorkspace={setSelectedWorkspace}
        onWorkspaceSaved={handleWorkspaceSaved}
      />

      {showCreate ? (
        <CreateUserDialog onClose={() => setShowCreate(false)} onCreated={handleUserCreated} />
      ) : null}
    </AdminPage>
  );
}

function UserAccessSection(props: UserAccessSectionProps) {
  const { error, isLoading, permissions, selectedUserId, users, onPermissionsSaved, onSelectUser } =
    props;

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{CONFIG_PAGE_COPY.adminsTitle}</CardTitle>
          <CardDescription>{CONFIG_PAGE_COPY.adminsDescription}</CardDescription>
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
                : CONFIG_PAGE_COPY.adminsLoadError}
            </p>
          ) : users.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {CONFIG_PAGE_COPY.adminsEmpty}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-sm border border-border">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.name}</th>
                    <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.role}</th>
                    <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.status}</th>
                    <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.mfa}</th>
                    <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.lastLogin}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      onClick={() => onSelectUser(user.id)}
                      className={
                        'cursor-pointer hover:bg-accent/40 ' +
                        (selectedUserId === user.id ? 'bg-primary/10' : '')
                      }
                    >
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{user.name}</span>
                          <span className="text-xs text-muted-foreground">{user.email}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={ROLE_VARIANT[user.role] ?? 'default'}>{user.role}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[user.status] ?? 'default'}>
                          {user.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {user.mfaEnabled ? (
                          <span className="text-emerald-400">
                            {CONFIG_PAGE_COPY.mfaState.active}
                          </span>
                        ) : user.mfaPendingSetup ? (
                          <span className="text-amber-400">
                            {CONFIG_PAGE_COPY.mfaState.pending}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            {CONFIG_PAGE_COPY.mfaState.disabled}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDateTime(user.lastLoginAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedUserId ? (
        <PermissionEditor
          key={selectedUserId}
          user={users.find((user) => user.id === selectedUserId) ?? null}
          permissions={permissions}
          onSaved={onPermissionsSaved}
          onCancel={() => onSelectUser(null)}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{CONFIG_PAGE_COPY.permissionsTitle}</CardTitle>
            <CardDescription>{CONFIG_PAGE_COPY.permissionsSelect}</CardDescription>
          </CardHeader>
          <CardContent className="py-8 text-center text-xs text-muted-foreground">
            {CONFIG_PAGE_COPY.permissionsEmpty}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function GovernanceNotesSection() {
  return (
    <AdminSurface className="px-5 py-5 lg:px-6">
      <AdminSectionHeader
        title={CONFIG_PAGE_COPY.governanceTitle}
        description={CONFIG_PAGE_COPY.governanceDescription}
      />
      <div className="grid gap-3 text-[13px] text-[var(--app-text-secondary)] lg:grid-cols-3">
        {CONFIG_PAGE_COPY.governanceNotes.map((note) => (
          <div
            key={note}
            className="rounded-md border border-[var(--app-border-primary)] bg-[var(--app-bg-secondary)] px-4 py-3"
          >
            {note}
          </div>
        ))}
      </div>
    </AdminSurface>
  );
}

function WorkspaceConfigSection(props: WorkspaceConfigSectionProps) {
  const {
    configOverview,
    configSearch,
    selectedWorkspace,
    onConfigSearchChange,
    onSelectWorkspace,
    onWorkspaceSaved,
  } = props;

  return (
    <AdminSurface className="px-5 py-5 lg:px-6">
      <AdminSectionHeader
        title={CONFIG_PAGE_COPY.workspaceTitle}
        description={CONFIG_PAGE_COPY.workspaceDescription}
      />
      <div className="mb-4 flex flex-col gap-3 lg:flex-row">
        <Input
          value={configSearch}
          onChange={(event) => onConfigSearchChange(event.currentTarget.value)}
          placeholder={CONFIG_PAGE_COPY.workspaceSearchPlaceholder}
          className="max-w-xl"
        />
      </div>
      <AdminMetricGrid
        items={[
          {
            label: CONFIG_METRIC_COPY.workspaces.label,
            value: configOverview?.metrics.totalWorkspaces ?? null,
            kind: 'integer',
            detail: CONFIG_METRIC_COPY.workspaces.detail,
          },
          {
            label: CONFIG_METRIC_COPY.activeDomains.label,
            value: configOverview?.metrics.customDomainsActive ?? null,
            kind: 'integer',
            detail: CONFIG_METRIC_COPY.activeDomains.detail,
          },
          {
            label: CONFIG_METRIC_COPY.apiKeys.label,
            value: configOverview?.metrics.apiKeysActive ?? null,
            kind: 'integer',
            detail: CONFIG_METRIC_COPY.apiKeys.detail,
          },
          {
            label: CONFIG_METRIC_COPY.autopilotOn.label,
            value: configOverview?.metrics.autopilotEnabled ?? null,
            kind: 'integer',
            detail: CONFIG_METRIC_COPY.autopilotOn.detail,
          },
        ]}
      />
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="overflow-x-auto rounded-sm border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.workspace}</th>
                <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.domain}</th>
                <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.guest}</th>
                <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.autopilot}</th>
                <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.auth}</th>
                <th className="px-4 py-3">{CONFIG_PAGE_COPY.headers.infra}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(configOverview?.workspaces ?? []).map((workspace) => (
                <tr
                  key={workspace.workspaceId}
                  className={
                    'cursor-pointer hover:bg-accent/40 ' +
                    (selectedWorkspace?.workspaceId === workspace.workspaceId
                      ? 'bg-primary/10'
                      : '')
                  }
                  onClick={() => onSelectWorkspace(workspace)}
                >
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{workspace.name}</span>
                      <span className="text-xs text-muted-foreground">{workspace.workspaceId}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {workspace.customDomain || '—'}
                  </td>
                  <td className="px-4 py-3">
                    {workspace.guestMode
                      ? CONFIG_PAGE_COPY.workspaceGuestOn
                      : CONFIG_PAGE_COPY.workspaceGuestOff}
                  </td>
                  <td className="px-4 py-3">
                    {workspace.autopilotEnabled
                      ? CONFIG_PAGE_COPY.workspaceAutopilotOn
                      : CONFIG_PAGE_COPY.workspaceAutopilotOff}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {workspace.authMode || '—'}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatWorkspaceInfraSummary(workspace)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <WorkspaceConfigEditor workspace={selectedWorkspace} onSaved={onWorkspaceSaved} />
      </div>
    </AdminSurface>
  );
}

function WorkspaceConfigEditor(props: WorkspaceConfigEditorProps) {
  const { workspace, onSaved } = props;
  const [customDomain, setCustomDomain] = useState('');
  const [guestMode, setGuestMode] = useState(false);
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [authMode, setAuthMode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCustomDomain(workspace?.customDomain ?? '');
    setGuestMode(workspace?.guestMode ?? false);
    setAutopilotEnabled(workspace?.autopilotEnabled ?? false);
    setAuthMode(workspace?.authMode ?? '');
    setError(null);
  }, [workspace]);

  async function handleSaveWorkspace() {
    if (!workspace) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await adminConfigApi.updateWorkspace(workspace.workspaceId, {
        customDomain,
        guestMode,
        autopilotEnabled,
        authMode,
      });
      await onSaved(updated);
    } catch (err) {
      setError(
        err instanceof AdminApiClientError ? err.message : CONFIG_PAGE_COPY.saveWorkspaceError,
      );
    } finally {
      setBusy(false);
    }
  }

  if (!workspace) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{CONFIG_PAGE_COPY.editWorkspaceTitle}</CardTitle>
          <CardDescription>{CONFIG_PAGE_COPY.permissionsSelect}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{workspace.name}</CardTitle>
        <CardDescription>{CONFIG_PAGE_COPY.workspaceControlsDescription}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-2">
          <Label>{CONFIG_PAGE_COPY.customDomain}</Label>
          <Input
            value={customDomain}
            onChange={(event) => setCustomDomain(event.currentTarget.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label>{CONFIG_PAGE_COPY.authMode}</Label>
          <Input value={authMode} onChange={(event) => setAuthMode(event.currentTarget.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={guestMode}
            onChange={(event) => setGuestMode(event.currentTarget.checked)}
          />
          {CONFIG_PAGE_COPY.guestModeActive}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autopilotEnabled}
            onChange={(event) => setAutopilotEnabled(event.currentTarget.checked)}
          />
          {CONFIG_PAGE_COPY.autopilotActive}
        </label>
        {error ? <p className="text-xs text-red-400">{error}</p> : null}
        <div className="flex justify-end">
          <Button size="sm" disabled={busy} onClick={handleSaveWorkspace}>
            {busy ? CONFIG_PAGE_COPY.savingWorkspace : CONFIG_PAGE_COPY.saveWorkspace}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateUserDialog(props: CreateUserDialogProps) {
  const { onClose, onCreated } = props;
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
        err instanceof AdminApiClientError ? err.message : CONFIG_PAGE_COPY.createAdminError,
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
          <CardTitle className="text-sm">{CONFIG_PAGE_COPY.newAdmin}</CardTitle>
          <CardDescription>{CONFIG_PAGE_COPY.createAdminDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-3" onSubmit={onSubmit} noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor={nameId}>{CONFIG_PAGE_COPY.headers.name}</Label>
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
              <Label htmlFor={emailId}>{CONFIG_PAGE_COPY.email}</Label>
              <Input
                id={emailId}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={passwordId}>{CONFIG_PAGE_COPY.temporaryPassword}</Label>
              <Input
                id={passwordId}
                type="password"
                value={temporaryPassword}
                onChange={(e) => setTemporaryPassword(e.currentTarget.value)}
                minLength={12}
                maxLength={128}
                required
                placeholder={CONFIG_PAGE_COPY.temporaryPasswordPlaceholder}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={roleId}>{CONFIG_PAGE_COPY.headers.role}</Label>
              <select
                id={roleId}
                value={role}
                onChange={(e) => setRole(e.currentTarget.value as 'OWNER' | 'MANAGER' | 'STAFF')}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
              >
                <option value="STAFF">{CONFIG_PAGE_COPY.roleStaff}</option>
                <option value="MANAGER">{CONFIG_PAGE_COPY.roleManager}</option>
                <option value="OWNER">{CONFIG_PAGE_COPY.roleOwner}</option>
              </select>
            </div>
            {error ? <p className="text-xs text-red-400">{error}</p> : null}
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
                {CONFIG_PAGE_COPY.cancel}
              </Button>
              <Button type="submit" size="sm" disabled={busy}>
                {busy ? CONFIG_PAGE_COPY.creatingAdmin : CONFIG_PAGE_COPY.createAdmin}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function PermissionEditor(props: PermissionEditorProps) {
  const { user, permissions, onSaved, onCancel } = props;
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
    if (!user) {
      return;
    }
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
        err instanceof AdminApiClientError ? err.message : CONFIG_PAGE_COPY.permissionSaveError,
      );
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{user.name}</CardTitle>
        <CardDescription>{describePermissionEditorUser(user)}</CardDescription>
      </CardHeader>
      <CardContent className="flex max-h-[480px] flex-col gap-2 overflow-y-auto">
        {user.role === 'OWNER' ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {CONFIG_PAGE_COPY.permissionOwnerBypass}
          </p>
        ) : (
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-card">
              <tr className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <th className="py-2 pr-2">{CONFIG_PAGE_COPY.headers.module}</th>
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
          {CONFIG_PAGE_COPY.close}
        </Button>
        {user.role !== 'OWNER' ? (
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? CONFIG_PAGE_COPY.savingOverrides : CONFIG_PAGE_COPY.saveOverrides}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
