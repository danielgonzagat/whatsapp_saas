import { assertWorkspaceAccess } from './workspace-access';

describe('workspace-access', () => {
  const originalAuthOptional = process.env.AUTH_OPTIONAL;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.AUTH_OPTIONAL = originalAuthOptional;
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('AUTH_OPTIONAL production guard', () => {
    it('should throw when AUTH_OPTIONAL=true in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.AUTH_OPTIONAL = 'true';

      expect(() => assertWorkspaceAccess('ws-1', { workspaceId: 'ws-1' })).toThrow(
        'AUTH_OPTIONAL=true is forbidden in production',
      );
    });

    it('should throw when AUTH_OPTIONAL=TRUE (case-insensitive) in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.AUTH_OPTIONAL = 'TRUE';

      expect(() => assertWorkspaceAccess('ws-1', { workspaceId: 'ws-1' })).toThrow(
        'AUTH_OPTIONAL=true is forbidden in production',
      );
    });

    it('should not throw when AUTH_OPTIONAL=false in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.AUTH_OPTIONAL = 'false';

      expect(() => assertWorkspaceAccess('ws-1', { workspaceId: 'ws-1' })).not.toThrow();
    });

    it('should not throw when AUTH_OPTIONAL is unset in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.AUTH_OPTIONAL;

      expect(() => assertWorkspaceAccess('ws-1', { workspaceId: 'ws-1' })).not.toThrow();
    });

    it('should not throw when AUTH_OPTIONAL=true in development', () => {
      process.env.NODE_ENV = 'development';
      process.env.AUTH_OPTIONAL = 'true';

      expect(() => assertWorkspaceAccess('ws-1', undefined)).not.toThrow();
    });
  });
});
