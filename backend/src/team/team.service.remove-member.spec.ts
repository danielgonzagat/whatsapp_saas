import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { EmailService } from '../auth/email.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamService } from './team.service';

describe('TeamService removeMember', () => {
  let service: TeamService;
  let prisma: {
    agent: {
      count: jest.Mock;
      findUnique: jest.Mock;
      delete: jest.Mock;
    };
  };
  let auditService: { log: jest.Mock };

  const wsId = 'ws-1';
  const memberId = 'a-1';

  beforeEach(async () => {
    prisma = {
      agent: {
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn(),
        delete: jest.fn(),
      },
    };
    auditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TeamService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: EmailService, useValue: { sendTeamInviteEmail: jest.fn() } },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get<TeamService>(TeamService);
  });

  it('deletes agent and logs audit when member belongs to workspace', async () => {
    prisma.agent.count.mockResolvedValue(1);
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
    expect(prisma.agent.delete).toHaveBeenCalledWith({
      where: { id: memberId, workspaceId: wsId },
    });
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
