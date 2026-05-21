import { AdminAuthController } from './admin-auth.controller';
import type { AuthenticatedAdmin } from './admin-token.types';

describe('AdminAuthController', () => {
  describe('POST /admin/auth/login', () => {
    it('passes credentials and extracted IP to service, returns service result', async () => {
      const login = jest.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
      const controller = new AdminAuthController({ login } as never);

      const dto = { email: 'admin@kloel.com', password: 'secret123' };
      const req = { headers: { 'user-agent': 'kloel-e2e' }, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } as never;

      const result = await controller.login(dto, req);

      expect(login).toHaveBeenCalledWith('admin@kloel.com', 'secret123', '127.0.0.1', 'kloel-e2e');
      expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt' });
    });

    it('extracts IP from x-forwarded-for when present, using it over req.ip', async () => {
      const login = jest.fn().mockResolvedValue({ accessToken: 'at' });
      const controller = new AdminAuthController({ login } as never);

      const dto = { email: 'admin@kloel.com', password: 'secret123' };
      const req = { headers: { 'x-forwarded-for': '203.0.113.5', 'user-agent': 'kloel-e2e' }, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } as never;

      await controller.login(dto, req);

      expect(login).toHaveBeenCalledWith('admin@kloel.com', 'secret123', '203.0.113.5', 'kloel-e2e');
    });
  });

  describe('POST /admin/auth/refresh', () => {
    it('invokes service with refresh token and returns access token', async () => {
      const refresh = jest.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
      const controller = new AdminAuthController({ refresh } as never);

      const dto = { refreshToken: 'refresh-token-abc' };
      const req = { headers: { 'user-agent': 'kloel-e2e' }, ip: '10.0.0.1', socket: { remoteAddress: '10.0.0.1' } } as never;

      const result = await controller.refresh(dto, req);

      expect(refresh).toHaveBeenCalledWith('refresh-token-abc', '10.0.0.1', 'kloel-e2e');
      expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt' });
    });
  });

  describe('POST /admin/auth/mfa/verify', () => {
    it('passes admin context and MFA code to service', async () => {
      const verifyMfa = jest.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
      const controller = new AdminAuthController({ verifyMfa } as never);

      const admin: AuthenticatedAdmin = { id: 'admin-1', email: 'admin@kloel.com', name: 'Admin', role: 'OWNER', sessionId: 'sess-1', scope: 'mfa_verify' } as never;
      const dto = { code: '123456' };
      const req = { headers: { 'user-agent': 'kloel-e2e' }, ip: '10.0.0.1', socket: { remoteAddress: '10.0.0.1' } } as never;

      const result = await controller.mfaVerify(admin, dto, req);

      expect(verifyMfa).toHaveBeenCalledWith(admin, '123456', '10.0.0.1', 'kloel-e2e');
      expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt' });
    });
  });

  describe('POST /admin/auth/change-password', () => {
    it('passes admin id and new password to service', async () => {
      const changePassword = jest.fn().mockResolvedValue({ accessToken: 'at', refreshToken: 'rt' });
      const controller = new AdminAuthController({ changePassword } as never);

      const admin: AuthenticatedAdmin = { id: 'admin-1', email: 'admin@kloel.com', name: 'Admin', role: 'OWNER', sessionId: 'sess-1', scope: 'password_change' } as never;
      const dto = { newPassword: 'NewP@ssw0rd!' };
      const req = { headers: { 'user-agent': 'kloel-e2e' }, ip: '10.0.0.1', socket: { remoteAddress: '10.0.0.1' } } as never;

      const result = await controller.changePassword(admin, dto, req);

      expect(changePassword).toHaveBeenCalledWith(admin, 'NewP@ssw0rd!', '10.0.0.1', 'kloel-e2e');
      expect(result).toEqual({ accessToken: 'at', refreshToken: 'rt' });
    });
  });
});
