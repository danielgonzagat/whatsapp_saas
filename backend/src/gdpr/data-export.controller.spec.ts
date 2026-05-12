import { BadRequestException } from '@nestjs/common';
import { DataExportController } from './data-export.controller';

describe('DataExportController', () => {
  const requestExport = jest.fn();
  let controller: DataExportController;

  beforeEach(() => {
    requestExport.mockReset().mockResolvedValue({
      id: 'gdpr-export-1',
      type: 'EXPORT',
      status: 'PENDING',
      code: 'export-code',
    });
    controller = new DataExportController({ requestExport } as never);
  });

  it('delegates export to the full GDPR request workflow', async () => {
    const req = {
      user: { sub: 'u-1', workspaceId: 'ws-1' },
    } as never;

    const result = await controller.exportData(req);

    expect(requestExport).toHaveBeenCalledWith('u-1', 'ws-1');
    expect(result).toEqual(
      expect.objectContaining({
        id: 'gdpr-export-1',
        type: 'EXPORT',
        status: 'PENDING',
      }),
    );
  });

  it('rejects export when user is missing', async () => {
    const req = { user: undefined } as never;

    await expect(controller.exportData(req)).rejects.toThrow(BadRequestException);
    expect(requestExport).not.toHaveBeenCalled();
  });

  it('rejects export when workspaceId is missing', async () => {
    const req = {
      user: { sub: 'u-2' },
    } as never;

    await expect(controller.exportData(req)).rejects.toThrow('User identity required');
    expect(requestExport).not.toHaveBeenCalled();
  });
});
