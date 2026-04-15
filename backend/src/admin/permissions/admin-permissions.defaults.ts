import { AdminAction, AdminModule, AdminRole } from '@prisma/client';

/**
 * Declarative permission matrix. Each cell is the set of actions allowed for
 * the (role, module) pair. OWNER is intentionally absent from this map — the
 * permission guard short-circuits for OWNER (invariant I-ADMIN-7), so seeding
 * rows for OWNER would be noise.
 *
 * A unit test iterates every (role, module, action) triple and asserts that
 * the matrix matches the behavior of AdminPermissionsService.getAllowed.
 */

type ActionSet = ReadonlySet<AdminAction>;

const ALL: ActionSet = new Set<AdminAction>(Object.values(AdminAction) as AdminAction[]);
const VIEW: ActionSet = new Set<AdminAction>([AdminAction.VIEW]);
const VIEW_EXPORT: ActionSet = new Set<AdminAction>([AdminAction.VIEW, AdminAction.EXPORT]);
const VIEW_EDIT: ActionSet = new Set<AdminAction>([AdminAction.VIEW, AdminAction.EDIT]);
const NONE: ActionSet = new Set<AdminAction>();

type PerModule = Readonly<Record<AdminModule, ActionSet>>;

const MANAGER_DEFAULTS: PerModule = {
  [AdminModule.HOME]: ALL,
  [AdminModule.PRODUTOS]: ALL,
  [AdminModule.MARKETING]: ALL,
  [AdminModule.VENDAS]: ALL,
  [AdminModule.CARTEIRA]: ALL,
  [AdminModule.RELATORIOS]: ALL,
  [AdminModule.CONTAS]: ALL,
  [AdminModule.COMPLIANCE]: ALL,
  [AdminModule.CLIENTES]: VIEW,
  [AdminModule.CONFIGURACOES]: NONE,
  [AdminModule.IAM]: NONE,
  [AdminModule.PERFIL]: ALL,
  [AdminModule.AUDIT_LOG]: VIEW,
};

const STAFF_DEFAULTS: PerModule = {
  [AdminModule.HOME]: VIEW,
  [AdminModule.PRODUTOS]: VIEW,
  [AdminModule.MARKETING]: VIEW,
  [AdminModule.VENDAS]: VIEW,
  [AdminModule.CARTEIRA]: NONE,
  [AdminModule.RELATORIOS]: VIEW_EXPORT,
  [AdminModule.CONTAS]: VIEW_EDIT,
  [AdminModule.COMPLIANCE]: NONE,
  [AdminModule.CLIENTES]: NONE,
  [AdminModule.CONFIGURACOES]: NONE,
  [AdminModule.IAM]: NONE,
  [AdminModule.PERFIL]: ALL,
  [AdminModule.AUDIT_LOG]: VIEW,
};

const OWNER_DEFAULTS: PerModule = Object.fromEntries(
  (Object.values(AdminModule) as AdminModule[]).map((m) => [m, ALL]),
) as PerModule;

export const ADMIN_PERMISSION_DEFAULTS: Readonly<Record<AdminRole, PerModule>> = {
  [AdminRole.OWNER]: OWNER_DEFAULTS,
  [AdminRole.MANAGER]: MANAGER_DEFAULTS,
  [AdminRole.STAFF]: STAFF_DEFAULTS,
};

export interface FlatPermission {
  module: AdminModule;
  action: AdminAction;
  allowed: boolean;
}

/**
 * Expands the default matrix for a given role into the flat list of
 * (module, action, allowed) rows that will be seeded into admin_permissions
 * when a new user is created. For OWNER this returns an empty array — OWNER
 * bypasses the guard and doesn't need rows.
 */
export function flattenDefaults(role: AdminRole): FlatPermission[] {
  if (role === AdminRole.OWNER) return [];
  const matrix = ADMIN_PERMISSION_DEFAULTS[role];
  const out: FlatPermission[] = [];
  for (const module of Object.values(AdminModule) as AdminModule[]) {
    const allowed = matrix[module];
    for (const action of Object.values(AdminAction) as AdminAction[]) {
      if (allowed.has(action)) {
        out.push({ module, action, allowed: true });
      }
    }
  }
  return out;
}

export function defaultAllows(role: AdminRole, module: AdminModule, action: AdminAction): boolean {
  if (role === AdminRole.OWNER) return true;
  return ADMIN_PERMISSION_DEFAULTS[role][module].has(action);
}
