import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DataDeleteController } from './data-delete.controller';

describe('DataDeleteController', () => {
  let prisma: {
    agent: {
      update: jest.Mock;
    };
  };
  let audit: {
    log: jest.Mock;
  };
  let controller: DataDeleteController;

  beforeEach(() => {
    prisma = {
      agent: {
        update: jest.fn().mockResolvedValue({ id: 'u-1', name: '[DELETED]' }),
      },
    };
    audit = {
      log: jest.fn().mockResolvedValue(undefined),
    };
    controller = new DataDeleteController(prisma as never as PrismaService, audit as never);
  });

  it('throws BadRequestException when userId is missing', async () => {
    const req = { user: { sub: undefined } } as never;

    await expect(controller.deleteData(req)).rejects.toThrow(BadRequestException);
    await expect(controller.deleteData(req)).rejects.toThrow(
      'User identity required for data deletion',
    );
  });

  it('throws BadRequestException when user is not present', async () => {
    const req = { user: undefined } as never;

    await expect(controller.deleteData(req)).rejects.toThrow(BadRequestException);
  });

  it('anonymizes user and logs audit entries', async () => {
    const req = {
      user: { sub: 'u-1', workspaceId: 'ws-1' },
    } as never;

    const result = await controller.deleteData(req);

    expect(result).toHaveProperty('status', 'deleted');
    expect(result.userId).toBe('u-1');
    expect(result.deletedAt).toBeDefined();
    expect(result.note).toContain('anonymized');

    expect(audit.log).toHaveBeenCalledTimes(2);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'GDPR_DATA_DELETE_REQUESTED' }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'GDPR_DATA_DELETE_COMPLETED' }),
    );

    expect(prisma.agent.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { name: '[DELETED]', email: 'deleted-u-1@removed.local' },
    });
  });

  it('uses system as workspaceId when not provided', async () => {
    const req = {
      user: { sub: 'u-2' },
    } as never;

    await controller.deleteData(req);

    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'system' }));
  });

  it('returns correct deletion note', async () => {
    const req = {
      user: { sub: 'u-3', workspaceId: 'ws-3' },
    } as never;

    const result = await controller.deleteData(req);

    expect(result.note).toBe(
      'Personal data has been anonymized. Audit logs retained per legal obligation.',
    );
  });
});
