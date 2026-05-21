import { type AdminUserRecord } from '@/lib/api/admin-iam-api';
import { type AdminConfigWorkspaceRow } from '@/lib/api/admin-config-api';

export function describePermissionEditorUser(user: AdminUserRecord): string {
  return `${user.role} • ${user.email}. OWNER bypassa o guard — overrides têm efeito para MANAGER e STAFF.`;
}

export function formatWorkspaceInfraSummary(workspace: AdminConfigWorkspaceRow): string {
  return `${workspace.apiKeysCount} keys • ${workspace.webhookSubscriptionsCount} webhooks`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

export const ROLE_VARIANT: Record<string, 'ember' | 'warning' | 'default'> = {
  OWNER: 'ember',
  MANAGER: 'warning',
  STAFF: 'default',
};

export const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  DEACTIVATED: 'danger',
};

export const ALL_MODULES = [
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

export const ALL_ACTIONS = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'APPROVE', 'EXPORT'] as const;

export const CONFIG_PAGE_COPY = {
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

export const CONFIG_METRIC_COPY = {
  admins: { label: 'Administradores', detail: 'Base cadastrada' },
  owners: { label: 'Owners', detail: 'Acesso total' },
  mfaEnabled: { label: 'MFA ativo', detail: 'Proteção já habilitada' },
  pendingSetup: { label: 'Setup pendente', detail: 'Precisam concluir segurança' },
  workspaces: { label: 'Workspaces', detail: 'Escopo atual da busca' },
  activeDomains: { label: 'Domínios ativos', detail: 'Custom domains configurados' },
  apiKeys: { label: 'API keys', detail: 'Chaves públicas ativas' },
  autopilotOn: { label: 'Autopilot on', detail: 'Workspaces com automação ativa' },
} as const;
