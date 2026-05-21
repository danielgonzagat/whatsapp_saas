import { BadRequestException } from '@nestjs/common';
import { TeamController } from './team.controller';

describe('TeamController', () => {
  const listMembers = jest.fn();
  const inviteMember = jest.fn();
  const revokeInvite = jest.fn();
  const removeMember = jest.fn();
  const updateMemberRole = jest.fn();
  const acceptInvite = jest.fn();

  let controller: TeamController;

  const mockReq = (overrides: Partial<{ sub: string; workspaceId: string }> = {}) =>
    ({
      user: { sub: overrides.sub ?? 'u-1', workspaceId: overrides.workspaceId ?? 'ws-1' },
      headers: {},
    }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new TeamController({
      listMembers,
      inviteMember,
      revokeInvite,
      removeMember,
      updateMemberRole,
      acceptInvite,
    } as never);
  });

  describe('list', () => {
    it('delegates to service with workspaceId from request', async () => {
      const expected = { agents: [], invitations: [] };
      listMembers.mockResolvedValue(expected);

      const result = await controller.list(mockReq());

      expect(listMembers).toHaveBeenCalledWith('ws-1');
      expect(result).toBe(expected);
    });

    it('propagates service rejection', async () => {
      const error = new BadRequestException('workspace not found');
      listMembers.mockRejectedValueOnce(error);

      await expect(controller.list(mockReq())).rejects.toThrow(error);
    });
  });

  describe('invite', () => {
    it('delegates to service with workspaceId, email, role, and inviter sub', async () => {
      const body = { email: 'new@test.com', role: 'MEMBER' };
      const expected = { id: 'inv-1', email: 'new@test.com', role: 'MEMBER' };
      inviteMember.mockResolvedValue(expected);

      const result = await controller.invite(mockReq(), body);

      expect(inviteMember).toHaveBeenCalledWith('ws-1', 'new@test.com', 'MEMBER', 'u-1');
      expect(result).toBe(expected);
    });

    it('passes user sub as inviter identity', async () => {
      const body = { email: 'b@test.com', role: 'VIEWER' };
      inviteMember.mockResolvedValue({});

      await controller.invite(mockReq({ sub: 'agent-42' }), body);

      expect(inviteMember).toHaveBeenCalledWith('ws-1', 'b@test.com', 'VIEWER', 'agent-42');
    });
  });

  describe('revokeInvite', () => {
    it('delegates to service with workspaceId and invite id', async () => {
      const expected = { id: 'inv-1', workspaceId: 'ws-1' };
      revokeInvite.mockResolvedValue(expected);

      const result = await controller.revokeInvite(mockReq(), 'inv-1');

      expect(revokeInvite).toHaveBeenCalledWith('ws-1', 'inv-1');
      expect(result).toBe(expected);
    });
  });

  describe('removeMember', () => {
    it('delegates to service with workspaceId, memberId, and caller sub', async () => {
      const expected = { id: 'm-1', workspaceId: 'ws-1' };
      removeMember.mockResolvedValue(expected);

      const result = await controller.removeMember(mockReq(), 'm-1');

      expect(removeMember).toHaveBeenCalledWith('ws-1', 'm-1', 'u-1');
      expect(result).toBe(expected);
    });
  });

  describe('updateRole', () => {
    it('delegates to service with workspaceId, memberId, new role, and caller sub', async () => {
      const body = { role: 'ADMIN' };
      const expected = { id: 'm-1', email: 'user@test.com', role: 'ADMIN' };
      updateMemberRole.mockResolvedValue(expected);

      const result = await controller.updateRole(mockReq(), 'm-1', body);

      expect(updateMemberRole).toHaveBeenCalledWith('ws-1', 'm-1', 'ADMIN', 'u-1');
      expect(result).toBe(expected);
    });
  });

  describe('acceptInvite', () => {
    it('delegates to service with token, name, and password', async () => {
      const body = { token: 'tok-1', name: 'Jane', password: 'secret1234' };
      const expected = { id: 'agent-new', email: 'jane@test.com' };
      acceptInvite.mockResolvedValue(expected);

      const result = await controller.acceptInvite(body);

      expect(acceptInvite).toHaveBeenCalledWith('tok-1', 'Jane', 'secret1234');
      expect(result).toBe(expected);
    });

    it('propagates service rejection for invalid token', async () => {
      const error = new BadRequestException('Invalid or expired invitation');
      acceptInvite.mockRejectedValueOnce(error);

      await expect(
        controller.acceptInvite({ token: 'bad', name: 'X', password: '12345678' }),
      ).rejects.toThrow(error);
    });
  });
});
