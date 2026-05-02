import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../auth/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamService } from './team.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-pw'),
}));

jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('invite-token-uuid'),
}));

describe('TeamService', () => {
  let service: TeamService;
  let prisma: {
    agent: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    invitation: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    workspace: { findUnique: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  let configService: { get: jest.Mock };
  let emailService: { sendTeamInviteEmail: jest.Mock };
  let auditService: { log: jest.Mock };

  const wsId = 'ws-1';

  beforeEach(async () => {
    prisma = {
      agent: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      invitation: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      workspace: { findUnique: jest.fn() },
      auditLog: { create: jest.fn() },
    };

    configService = { get: jest.fn().mockReturnValue('http://localhost:3000') };
    emailService = { sendTeamInviteEmail: jest.fn().mockResolvedValue(undefined) };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: configService },
        { provide: EmailService, useValue: emailService },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<TeamService>(TeamService);
  });

  describe('listMembers', () => {
    it('returns agents and invitations for the workspace', async () => {
      const agents = [
        {
          id: 'a-1',
          name: 'Alice',
          email: 'a@x.com',
          role: 'ADMIN',
          isOnline: true,
          createdAt: new Date(),
        },
      ];
      const invitations = [
        {
          id: 'i-1',
          email: 'b@x.com',
          role: 'MEMBER',
          createdAt: new Date(),
          expiresAt: new Date(),
        },
      ];
      prisma.agent.findMany.mockResolvedValue(agents);
      prisma.invitation.findMany.mockResolvedValue(invitations);

      const result = await service.listMembers(wsId);

      expect(result).toEqual({ agents, invitations });
      expect(prisma.agent.findMany).toHaveBeenCalledWith({
        where: { workspaceId: wsId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isOnline: true,
          createdAt: true,
        },
        take: 100,
      });
      expect(prisma.invitation.findMany).toHaveBeenCalledWith({
        where: { workspaceId: wsId },
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          expiresAt: true,
        },
        take: 100,
      });
    });

    it('returns empty arrays when no members exist', async () => {
      prisma.agent.findMany.mockResolvedValue([]);
      prisma.invitation.findMany.mockResolvedValue([]);

      const result = await service.listMembers(wsId);

      expect(result).toEqual({ agents: [], invitations: [] });
    });
  });

  describe('inviteMember', () => {
    const email = 'new@x.com';
    const role = 'MEMBER';

    beforeEach(() => {
      prisma.workspace.findUnique.mockResolvedValue({ name: 'Test Workspace' });
    });

    it('creates invitation and sends email when user is not yet a member', async () => {
      prisma.agent.findUnique.mockResolvedValue(null);
      prisma.invitation.findUnique.mockResolvedValue(null);
      prisma.invitation.create.mockResolvedValue({
        id: 'i-1',
        email,
        role,
        token: 'invite-token-uuid',
        expiresAt: expect.anything(),
      });

      const result = await service.inviteMember(wsId, email, role);

      expect(result.email).toBe(email);
      expect(result.role).toBe(role);
      expect(emailService.sendTeamInviteEmail).toHaveBeenCalledWith(
        email,
        'Um membro',
        'Test Workspace',
        'http://localhost:3000/invite/accept?token=invite-token-uuid',
      );
    });

    it('throws BadRequestException when user is already a member', async () => {
      prisma.agent.findUnique.mockResolvedValue({ id: 'a-1', email });

      await expect(service.inviteMember(wsId, email, role)).rejects.toThrow(BadRequestException);
    });

    it('deletes existing invitation and creates a new one', async () => {
      prisma.agent.findUnique.mockResolvedValue(null);
      prisma.invitation.findUnique.mockResolvedValue({ id: 'old-i', email });
      prisma.invitation.create.mockResolvedValue({
        id: 'i-new',
        email,
        role,
        token: 'invite-token-uuid',
        expiresAt: new Date(),
      });

      await service.inviteMember(wsId, email, role);

      expect(prisma.invitation.delete).toHaveBeenCalledWith({ where: { id: 'old-i' } });
      expect(prisma.invitation.create).toHaveBeenCalled();
    });

    it('includes inviter name in email when inviterId is provided', async () => {
      prisma.agent.findUnique
        .mockResolvedValueOnce(null) // existing member check
        .mockResolvedValueOnce({ name: 'Alice' }); // inviter lookup
      prisma.invitation.findUnique.mockResolvedValue(null);
      prisma.invitation.create.mockResolvedValue({
        id: 'i-1',
        email,
        role,
        token: 'invite-token-uuid',
        expiresAt: new Date(),
      });

      await service.inviteMember(wsId, email, role, 'a-1');

      expect(emailService.sendTeamInviteEmail).toHaveBeenCalledWith(
        email,
        'Alice',
        'Test Workspace',
        expect.anything(),
      );
    });

    it('falls back to "Um membro" when inviter is not found', async () => {
      prisma.agent.findUnique
        .mockResolvedValueOnce(null) // existing member check
        .mockResolvedValueOnce(null); // inviter lookup returns null
      prisma.invitation.findUnique.mockResolvedValue(null);
      prisma.invitation.create.mockResolvedValue({
        id: 'i-1',
        email,
        role,
        token: 'invite-token-uuid',
        expiresAt: new Date(),
      });

      await service.inviteMember(wsId, email, role, 'a-missing');

      expect(emailService.sendTeamInviteEmail).toHaveBeenCalledWith(
        email,
        'Um membro',
        'Test Workspace',
        expect.anything(),
      );
    });
  });

  describe('acceptInvite', () => {
    const token = 'valid-token';
    const name = 'Bob';
    const password = 'password123';

    it('creates agent and deletes invitation on valid token', async () => {
      const invite = {
        id: 'i-1',
        workspaceId: wsId,
        email: 'bob@x.com',
        role: 'MEMBER',
        token,
        expiresAt: new Date(Date.now() + 86400000), // tomorrow
      };
      prisma.invitation.findUnique.mockResolvedValue(invite);
      prisma.agent.create.mockResolvedValue({
        id: 'a-new',
        name,
        email: invite.email,
        role: invite.role,
      });
      prisma.invitation.delete.mockResolvedValue(invite);

      const result = await service.acceptInvite(token, name, password);

      expect(result.id).toBe('a-new');
      expect(prisma.agent.create).toHaveBeenCalledWith({
        data: {
          workspaceId: wsId,
          email: invite.email,
          name,
          password: 'hashed-pw',
          role: 'MEMBER',
        },
      });
      expect(prisma.invitation.delete).toHaveBeenCalledWith({ where: { id: 'i-1' } });
    });

    it('throws BadRequestException when token does not exist', async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);

      await expect(service.acceptInvite(token, name, password)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when token is expired', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'i-1',
        expiresAt: new Date(Date.now() - 86400000), // yesterday
      });

      await expect(service.acceptInvite(token, name, password)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when password is too short', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'i-1',
        expiresAt: new Date(Date.now() + 86400000),
      });

      await expect(service.acceptInvite(token, name, 'short')).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when password is empty', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: 'i-1',
        expiresAt: new Date(Date.now() + 86400000),
      });

      await expect(service.acceptInvite(token, name, '')).rejects.toThrow(BadRequestException);
    });
  });

  describe('revokeInvite', () => {
    const inviteId = 'i-1';

    it('deletes invitation and logs audit when it belongs to workspace', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: inviteId,
        workspaceId: wsId,
        email: 'b@x.com',
      });
      prisma.invitation.delete.mockResolvedValue({ id: inviteId });

      await service.revokeInvite(wsId, inviteId);

      expect(auditService.log).toHaveBeenCalledWith({
        workspaceId: wsId,
        action: 'DELETE_RECORD',
        resource: 'Invitation',
        resourceId: inviteId,
        details: { deletedBy: 'user', email: 'b@x.com' },
      });
      expect(prisma.invitation.delete).toHaveBeenCalledWith({ where: { id: inviteId } });
    });

    it('throws NotFoundException when invitation does not exist', async () => {
      prisma.invitation.findUnique.mockResolvedValue(null);

      await expect(service.revokeInvite(wsId, inviteId)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when invitation belongs to different workspace', async () => {
      prisma.invitation.findUnique.mockResolvedValue({
        id: inviteId,
        workspaceId: 'ws-other',
      });

      await expect(service.revokeInvite(wsId, inviteId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('removeMember', () => {
    const memberId = 'a-1';

    it('deletes agent and logs audit when member belongs to workspace', async () => {
      prisma.agent.findUnique.mockResolvedValue({
        id: memberId,
        workspaceId: wsId,
        email: 'alice@x.com',
      });
      prisma.agent.delete.mockResolvedValue({ id: memberId });

      await service.removeMember(wsId, memberId);

      expect(auditService.log).toHaveBeenCalledWith({
        workspaceId: wsId,
        action: 'DELETE_RECORD',
        resource: 'Agent',
        resourceId: memberId,
        details: { deletedBy: 'user', email: 'alice@x.com' },
      });
      expect(prisma.agent.delete).toHaveBeenCalledWith({ where: { id: memberId } });
    });

    it('throws NotFoundException when agent does not exist', async () => {
      prisma.agent.findUnique.mockResolvedValue(null);

      await expect(service.removeMember(wsId, memberId)).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when agent belongs to different workspace', async () => {
      prisma.agent.findUnique.mockResolvedValue({
        id: memberId,
        workspaceId: 'ws-other',
      });

      await expect(service.removeMember(wsId, memberId)).rejects.toThrow(NotFoundException);
    });
  });
});
