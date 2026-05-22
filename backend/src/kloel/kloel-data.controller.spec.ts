import { KloelDataController } from './kloel-data.controller';
import { requestDataDeletion, exportData } from './kloel-upload.controller-helpers';

jest.mock('./kloel-upload.controller-helpers', () => ({
  requestDataDeletion: jest.fn().mockResolvedValue(undefined),
  exportData: jest.fn(),
}));

const requestDataDeletionMock = requestDataDeletion as jest.Mock;
const exportDataMock = exportData as jest.Mock;

describe('KloelDataController', () => {
  let controller: KloelDataController;
  const prismaMock = {} as never;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new KloelDataController(prismaMock);
  });

  describe('handleDataDeletion', () => {
    const req = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;

    it('calls requestDataDeletion with prisma, workspaceId, and userId then returns success response', async () => {
      const result = await controller.handleDataDeletion(req);

      expect(requestDataDeletionMock).toHaveBeenCalledWith(
        { prisma: prismaMock },
        'ws-1',
        'u-1',
      );
      expect(result).toEqual({
        success: true,
        message: 'Dados pessoais anonimizados conforme LGPD',
      });
    });

    it('propagates the rejection when requestDataDeletion fails', async () => {
      const error = new Error('database unreachable');
      requestDataDeletionMock.mockRejectedValue(error);

      await expect(controller.handleDataDeletion(req)).rejects.toThrow('database unreachable');
    });
  });

  describe('handleDataExport', () => {
    const req = { user: { sub: 'u-2', workspaceId: 'ws-2' }, headers: {} } as never;

    it('calls exportData with prisma and workspaceId then returns the exported data', async () => {
      const mockData = { contacts: [], messages: [], sales: [], exportedAt: '2026-01-01T00:00:00.000Z' };
      exportDataMock.mockResolvedValue(mockData);

      const result = await controller.handleDataExport(req);

      expect(exportDataMock).toHaveBeenCalledWith({ prisma: prismaMock }, 'ws-2');
      expect(result).toEqual(mockData);
    });

    it('propagates the rejection when exportData fails', async () => {
      exportDataMock.mockRejectedValue(new Error('export failure'));

      await expect(controller.handleDataExport(req)).rejects.toThrow('export failure');
    });
  });
});
