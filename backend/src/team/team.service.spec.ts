import { BadRequestException } from '@nestjs/common';
import { hashAuthToken } from '../auth/auth-token-hash';
import { TeamService } from './team.service';

describe('TeamService', () => {
  let prisma: any;
  let configService: any;
  let emailService: any;
  let auditService: any;
  let service: TeamService;

  beforeEach(() => {
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
      workspace: {
        findUnique: jest.fn(),
      },
    };
    configService = {
      get: jest.fn().mockReturnValue('https://app.kloel.test'),
    };
    emailService = {
      sendTeamInviteEmail: jest.fn().mockResolvedValue(undefined),
    };
    auditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    service = new TeamService(prisma, configService, emailService, auditService);
  });

  it('stores invitation tokens hashed at rest and returns a sanitized response', async () => {
    prisma.agent.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ name: 'Daniel' });
    prisma.invitation.findUnique.mockResolvedValue(null);
    prisma.workspace.findUnique.mockResolvedValue({ name: 'Workspace Teste' });
    prisma.invitation.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'invite-1',
      ...data,
    }));

    const result = await service.inviteMember('ws-1', 'invite@test.com', 'ADMIN', 'agent-1');

    expect(result).not.toHaveProperty('token');
    const createToken = prisma.invitation.create.mock.calls[0][0].data.token as string;
    expect(createToken).toMatch(/^[a-f0-9]{64}$/);
    expect(emailService.sendTeamInviteEmail).toHaveBeenCalledWith(
      'invite@test.com',
      'Daniel',
      'Workspace Teste',
      expect.stringContaining('/invite/accept?token='),
    );
    expect(emailService.sendTeamInviteEmail.mock.calls[0][3]).not.toContain(createToken);
  });

  it('accepts hashed invitation tokens and still supports legacy plaintext rows', async () => {
    const hashedToken = hashAuthToken('raw-invite-token');
    prisma.invitation.findUnique
      .mockResolvedValueOnce({
        id: 'invite-1',
        workspaceId: 'ws-1',
        email: 'invite@test.com',
        role: 'ADMIN',
        token: hashedToken,
        expiresAt: new Date(Date.now() + 60_000),
      })
      .mockResolvedValueOnce(null);
    prisma.agent.create.mockResolvedValue({ id: 'agent-1' });
    prisma.invitation.delete.mockResolvedValue(undefined);

    await expect(
      service.acceptInvite('raw-invite-token', 'Novo Usuario', 'super-secret-123'),
    ).resolves.toEqual({ id: 'agent-1' });

    expect(prisma.invitation.findUnique).toHaveBeenNthCalledWith(1, {
      where: { token: hashedToken },
    });
  });

  it('falls back to legacy plaintext invitation tokens when needed', async () => {
    prisma.invitation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'invite-legacy',
        workspaceId: 'ws-1',
        email: 'legacy@test.com',
        role: 'ADMIN',
        token: 'legacy-token',
        expiresAt: new Date(Date.now() + 60_000),
      });
    prisma.agent.create.mockResolvedValue({ id: 'agent-legacy' });
    prisma.invitation.delete.mockResolvedValue(undefined);

    await expect(
      service.acceptInvite('legacy-token', 'Usuario Legado', 'super-secret-123'),
    ).resolves.toEqual({ id: 'agent-legacy' });

    expect(prisma.invitation.findUnique).toHaveBeenNthCalledWith(2, {
      where: { token: 'legacy-token' },
    });
  });

  it('rejects expired invites', async () => {
    prisma.invitation.findUnique
      .mockResolvedValueOnce({
        id: 'invite-expired',
        workspaceId: 'ws-1',
        email: 'expired@test.com',
        role: 'ADMIN',
        token: hashAuthToken('expired-token'),
        expiresAt: new Date(Date.now() - 60_000),
      });

    await expect(
      service.acceptInvite('expired-token', 'Usuario Expirado', 'super-secret-123'),
    ).rejects.toThrow(BadRequestException);
  });
});
