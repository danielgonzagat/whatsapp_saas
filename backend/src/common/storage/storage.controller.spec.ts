import { existsSync, createReadStream } from 'node:fs';

// Stub Sentry + ops-alert before every transitive import resolution.
// storage.controller -> storage.service -> storage-drivers -> ops-alert -> @sentry/node
jest.mock('@sentry/node', () => ({}), { virtual: true });
jest.mock('../../observability/ops-alert.service', () => ({
  OpsAlertService: jest.fn(),
  AlertSeverity: { INFO: 'info', WARN: 'warn', CRITICAL: 'critical' },
}));

import { StorageController } from './storage.controller';

jest.mock('./storage.service', () => ({
  StorageService: jest.fn(),
}));

jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
  createReadStream: jest.fn(),
}));

const existsSyncMock = existsSync as jest.Mock;
const createReadStreamMock = createReadStream as jest.Mock;

describe('StorageController', () => {
  const resolveLocalAccessToken = jest.fn();
  const readAccessFile = jest.fn();
  const getMimeTypeForPath = jest.fn();

  let controller: StorageController;

  const createMockRes = () =>
    ({
      setHeader: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    }) as never;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new StorageController({
      resolveLocalAccessToken,
      readAccessFile,
      getMimeTypeForPath,
    } as never);
  });

  describe('serveSignedLocalFile', () => {
    it('streams a local file when it exists on disk', async () => {
      const resolved = {
        relativePath: 'media/test.jpg',
        absolutePath: '/uploads/media/test.jpg',
      };
      resolveLocalAccessToken.mockReturnValue(resolved);
      getMimeTypeForPath.mockReturnValue('image/jpeg');
      existsSyncMock.mockReturnValue(true);

      const mockStream = { pipe: jest.fn() };
      createReadStreamMock.mockReturnValue(mockStream);

      const res = createMockRes();

      await controller.serveSignedLocalFile('valid-token', res);

      expect(resolveLocalAccessToken).toHaveBeenCalledWith('valid-token');
      expect(getMimeTypeForPath).toHaveBeenCalledWith('media/test.jpg');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, max-age=300');
      expect(createReadStreamMock).toHaveBeenCalledWith('/uploads/media/test.jpg');
      expect(mockStream.pipe).toHaveBeenCalledWith(res);
    });

    it('falls back to remote when local file does not exist', async () => {
      const resolved = {
        relativePath: 'media/remote.jpg',
        absolutePath: '/uploads/media/remote.jpg',
      };
      resolveLocalAccessToken.mockReturnValue(resolved);
      existsSyncMock.mockReturnValue(false);

      readAccessFile.mockResolvedValue({
        buffer: Buffer.from('remote-data'),
        mimeType: 'image/png',
      });

      const res = createMockRes();

      await controller.serveSignedLocalFile('remote-token', res);

      expect(resolveLocalAccessToken).toHaveBeenCalledWith('remote-token');
      expect(readAccessFile).toHaveBeenCalledWith('media/remote.jpg');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'image/png');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Length',
        String(Buffer.from('remote-data').length),
      );
      expect(res.send).toHaveBeenCalledWith(Buffer.from('remote-data'));
    });

    it('throws ForbiddenException when token is expired', async () => {
      resolveLocalAccessToken.mockImplementation(() => {
        throw new Error('expired_storage_token');
      });

      const res = createMockRes();

      await expect(controller.serveSignedLocalFile('expired-token', res)).rejects.toThrow(
        'Link de arquivo expirado',
      );
    });

    it('throws NotFoundException for unknown token errors', async () => {
      resolveLocalAccessToken.mockImplementation(() => {
        throw new Error('invalid_storage_token');
      });

      const res = createMockRes();

      await expect(controller.serveSignedLocalFile('bad-token', res)).rejects.toThrow(
        'Arquivo não encontrado',
      );
    });

    it('throws NotFoundException when remote read returns null', async () => {
      const resolved = {
        relativePath: 'media/missing.jpg',
        absolutePath: '/uploads/media/missing.jpg',
      };
      resolveLocalAccessToken.mockReturnValue(resolved);
      existsSyncMock.mockReturnValue(false);
      readAccessFile.mockResolvedValue(null);

      const res = createMockRes();

      await expect(controller.serveSignedLocalFile('missing-token', res)).rejects.toThrow(
        'Arquivo não encontrado',
      );
    });
  });

  describe('serveSignedAccessFile', () => {
    it('serves a local access file with download name', async () => {
      const resolved = {
        relativePath: 'access/report.pdf',
        absolutePath: '/uploads/access/report.pdf',
        downloadName: 'relatorio.pdf',
      };
      resolveLocalAccessToken.mockReturnValue(resolved);
      getMimeTypeForPath.mockReturnValue('application/pdf');
      existsSyncMock.mockReturnValue(true);

      const mockStream = { pipe: jest.fn() };
      createReadStreamMock.mockReturnValue(mockStream);

      const res = createMockRes();

      await controller.serveSignedAccessFile('access-token', res);

      expect(resolveLocalAccessToken).toHaveBeenCalledWith('access-token');
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('relatorio.pdf'),
      );
      expect(mockStream.pipe).toHaveBeenCalledWith(res);
    });
  });
});
