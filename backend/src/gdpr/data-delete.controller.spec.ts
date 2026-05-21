import { BadRequestException } from '@nestjs/common';
import { DataDeleteController } from './data-delete.controller';

describe('DataDeleteController', () => {
  const requestDeletion = jest.fn();
  let controller: DataDeleteController;

  beforeEach(() => {
    requestDeletion.mockReset().mockResolvedValue({
      id: 'gdpr-delete-1',
      type: 'DELETE',
      status: 'PENDING',
      code: 'delete-code',
    });
    controller = new DataDeleteController({ requestDeletion } as never);
  });

  it('throws BadRequestException when userId is missing', async () => {
    const req = { user: { sub: undefined, workspaceId: 'ws-1' } } as never;

    await expect(controller.deleteData(req)).rejects.toThrow(BadRequestException);
    await expect(controller.deleteData(req)).rejects.toThrow(
      'User identity required for data deletion',
    );
  });

  it('throws BadRequestException when user is not present', async () => {
    const req = { user: undefined } as never;

    await expect(controller.deleteData(req)).rejects.toThrow(BadRequestException);
  });

  it('delegates deletion to the full GDPR request workflow', async () => {
    const req = {
      user: { sub: 'u-1', workspaceId: 'ws-1' },
    } as never;

    const result = await controller.deleteData(req);

    expect(requestDeletion).toHaveBeenCalledWith('u-1', 'ws-1');
    expect(result).toEqual(
      expect.objectContaining({
        id: 'gdpr-delete-1',
        type: 'DELETE',
        status: 'PENDING',
      }),
    );
  });

  it('rejects deletion when workspaceId is not provided', async () => {
    const req = {
      user: { sub: 'u-2' },
    } as never;

    await expect(controller.deleteData(req)).rejects.toThrow('User identity required');
    expect(requestDeletion).not.toHaveBeenCalled();
  });
});
