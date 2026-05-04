import { PrismaService } from '../prisma/prisma.service';
import { DataExportController } from './data-export.controller';

describe('DataExportController', () => {
  let prisma: {
    agent: {
      findFirst: jest.Mock;
    };
    workspace: {
      findUnique: jest.Mock;
    };
    auditLog: {
      findMany: jest.Mock;
    };
    message: {
      findMany: jest.Mock;
    };
  };
  let controller: DataExportController;

  beforeEach(() => {
    prisma = {
      agent: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'u-1',
          email: 'agent@test.com',
          name: 'Test Agent',
          workspaceId: 'ws-1',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
      workspace: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'ws-1',
          name: 'Test Workspace',
          createdAt: new Date(),
        }),
      },
      auditLog: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { action: 'LOGIN', resource: 'Agent', createdAt: new Date(), ipAddress: '1.2.3.4' },
          ]),
      },
      message: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'msg-1', content: 'Hello', direction: 'INBOUND', createdAt: new Date() },
          ]),
      },
    };
    controller = new DataExportController(prisma as never as PrismaService);
  });

  it('exports user data with workspace context', async () => {
    const req = {
      user: { sub: 'u-1', workspaceId: 'ws-1' },
    } as never;

    const result = await controller.exportData(req);

    expect(result).toHaveProperty('exportedAt');
    expect(result.user).toHaveProperty('email', 'agent@test.com');
    expect(result.workspace).toHaveProperty('name', 'Test Workspace');
    expect(result.auditLogs).toHaveLength(1);
    expect(result.messages).toHaveLength(1);

    expect(prisma.agent.findFirst).toHaveBeenCalledWith({
      where: { id: 'u-1', workspaceId: 'ws-1' },
      select: expect.objectContaining({ email: true }),
    });
  });

  it('exports user data without workspaceId', async () => {
    const req = {
      user: { sub: 'u-2' },
    } as never;

    const result = await controller.exportData(req);

    expect(result.workspace).toBeNull();
    expect(result.messages).toEqual([]);
    expect(prisma.agent.findFirst).toHaveBeenCalledWith({
      where: { id: 'u-2' },
      select: expect.objectContaining({ email: true }),
    });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { agentId: 'u-2' },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: expect.objectContaining({ action: true }),
    });
  });

  it('handles missing user gracefully', async () => {
    prisma.agent.findFirst.mockResolvedValueOnce(null);

    const req = {
      user: { sub: 'u-unknown' },
    } as never;

    const result = await controller.exportData(req);

    expect(result.user).toBeNull();
    expect(result.auditLogs).toHaveLength(1);
  });

  it('catches message findMany errors', async () => {
    const msgError = new Error('Message table unavailable');
    prisma.message.findMany.mockRejectedValueOnce(msgError);

    const req = {
      user: { sub: 'u-1', workspaceId: 'ws-1' },
    } as never;

    const result = await controller.exportData(req);

    expect(result.messages).toEqual([]);
  });

  it('includes all required fields in response structure', async () => {
    const req = {
      user: { sub: 'u-1', workspaceId: 'ws-1' },
    } as never;

    const result = await controller.exportData(req);

    expect(result).toHaveProperty('exportedAt');
    expect(result).toHaveProperty('user');
    expect(result).toHaveProperty('workspace');
    expect(result).toHaveProperty('auditLogs');
    expect(result).toHaveProperty('messages');
    expect(typeof result.exportedAt).toBe('string');
  });
});
