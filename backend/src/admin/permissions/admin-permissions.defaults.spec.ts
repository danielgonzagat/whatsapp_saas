import { AdminAction, AdminModule, AdminRole } from '@prisma/client';
import {
  ADMIN_PERMISSION_DEFAULTS,
  defaultAllows,
  flattenDefaults,
} from './admin-permissions.defaults';

describe('admin-permissions.defaults', () => {
  describe('defaultAllows — matrix probe', () => {
    it('OWNER is allowed every (module, action) combination', () => {
      for (const module of Object.values(AdminModule) as AdminModule[]) {
        for (const action of Object.values(AdminAction) as AdminAction[]) {
          expect(defaultAllows(AdminRole.OWNER, module, action)).toBe(true);
        }
      }
    });

    it('MANAGER cannot touch CONFIGURACOES or IAM', () => {
      for (const action of Object.values(AdminAction) as AdminAction[]) {
        expect(defaultAllows(AdminRole.MANAGER, AdminModule.CONFIGURACOES, action)).toBe(false);
        expect(defaultAllows(AdminRole.MANAGER, AdminModule.IAM, action)).toBe(false);
      }
    });

    it('STAFF has no access to CARTEIRA or COMPLIANCE', () => {
      for (const action of Object.values(AdminAction) as AdminAction[]) {
        expect(defaultAllows(AdminRole.STAFF, AdminModule.CARTEIRA, action)).toBe(false);
        expect(defaultAllows(AdminRole.STAFF, AdminModule.COMPLIANCE, action)).toBe(false);
      }
    });

    it('STAFF can VIEW and EXPORT RELATORIOS but not DELETE', () => {
      expect(defaultAllows(AdminRole.STAFF, AdminModule.RELATORIOS, AdminAction.VIEW)).toBe(true);
      expect(defaultAllows(AdminRole.STAFF, AdminModule.RELATORIOS, AdminAction.EXPORT)).toBe(true);
      expect(defaultAllows(AdminRole.STAFF, AdminModule.RELATORIOS, AdminAction.DELETE)).toBe(
        false,
      );
    });

    it('STAFF can VIEW and EDIT CONTAS (read + limited action)', () => {
      expect(defaultAllows(AdminRole.STAFF, AdminModule.CONTAS, AdminAction.VIEW)).toBe(true);
      expect(defaultAllows(AdminRole.STAFF, AdminModule.CONTAS, AdminAction.EDIT)).toBe(true);
      expect(defaultAllows(AdminRole.STAFF, AdminModule.CONTAS, AdminAction.DELETE)).toBe(false);
    });

    it('every role has full access to their own PERFIL', () => {
      for (const role of Object.values(AdminRole) as AdminRole[]) {
        for (const action of Object.values(AdminAction) as AdminAction[]) {
          expect(defaultAllows(role, AdminModule.PERFIL, action)).toBe(true);
        }
      }
    });

    it('matches the declarative matrix for every cell', () => {
      for (const role of [AdminRole.MANAGER, AdminRole.STAFF]) {
        for (const module of Object.values(AdminModule) as AdminModule[]) {
          const expected = ADMIN_PERMISSION_DEFAULTS[role][module];
          for (const action of Object.values(AdminAction) as AdminAction[]) {
            expect(defaultAllows(role, module, action)).toBe(expected.has(action));
          }
        }
      }
    });
  });

  describe('flattenDefaults', () => {
    it('returns [] for OWNER (OWNER bypasses the check entirely)', () => {
      expect(flattenDefaults(AdminRole.OWNER)).toHaveLength(0);
    });

    it('produces only allowed rows for MANAGER', () => {
      const rows = flattenDefaults(AdminRole.MANAGER);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.allowed).toBe(true);
      }
    });

    it('produces only allowed rows for STAFF', () => {
      const rows = flattenDefaults(AdminRole.STAFF);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.allowed).toBe(true);
      }
    });
  });
});
