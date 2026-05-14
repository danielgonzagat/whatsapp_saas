
jest.mock('@sentry/node', () => ({}), { virtual: true });

jest.mock('../auth/workspace-access', () => ({
  resolveWorkspaceId: jest.fn(),
}));

jest.mock('../common/file-signature.util', () => ({
  detectUploadedMime: jest.fn(),
}));

jest.mock('../common/throttler/route-class.decorator', () => ({
  RouteClass: () => () => {},
}));

import { resolveWorkspaceId } from '../auth/workspace-access';
import { detectUploadedMime } from '../common/file-signature.util';
import { MediaController } from './media.controller';

const resolveWorkspaceIdMock = resolveWorkspaceId as jest.Mock;
const detectUploadedMimeMock = detectUploadedMime as jest.Mock;

interface UploadedFileType {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

describe('MediaController', () => {
  const createVideoJob = jest.fn();
  const getJobStatus = jest.fn();
  const uploadDocument = jest.fn();
  const listDocuments = jest.fn();
  const getDocument = jest.fn();
  const getDocumentFile = jest.fn();
  const deleteDocument = jest.fn();

  let controller: MediaController;

  const mockReq = {
    user: { sub: 'u-1', workspaceId: 'ws-1' },
    headers: {},
  } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    resolveWorkspaceIdMock.mockReturnValue('ws-1');

    controller = new MediaController({
      createVideoJob,
      getJobStatus,
      uploadDocument,
      listDocuments,
      getDocument,
      getDocumentFile,
      deleteDocument,
    } as never);
  });

  describe('POST /video (generateVideo)', () => {
    it('strips workspaceId from body and calls service.createVideoJob with resolved workspaceId', async () => {
      createVideoJob.mockResolvedValue({ id: 'job-1', status: 'PENDING' });
      const dto = {
        imageUrl: 'https://example.com/img.png',
        prompt: 'a prompt',
        workspaceId: 'ws-explicit',
      };

      const result = await controller.generateVideo(mockReq, dto);

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(mockReq, 'ws-explicit');
      const { workspaceId, ...expectedData } = dto;
      expect(createVideoJob).toHaveBeenCalledWith('ws-1', expectedData);
      expect(result).toEqual({ id: 'job-1', status: 'PENDING' });
    });

    it('propagates rejection from service.createVideoJob', async () => {
      createVideoJob.mockRejectedValueOnce(new Error('Video generation failed'));

      await expect(
        controller.generateVideo(mockReq, { imageUrl: 'https://example.com/img.png' }),
      ).rejects.toThrow('Video generation failed');
    });
  });

  describe('GET /job/:id (getStatus)', () => {
    it('calls service.getJobStatus with id and resolved workspaceId', async () => {
      getJobStatus.mockResolvedValue({ id: 'job-1', status: 'COMPLETED' });

      const result = await controller.getStatus(mockReq, 'job-1');

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(mockReq);
      expect(getJobStatus).toHaveBeenCalledWith('job-1', 'ws-1');
      expect(result).toEqual({ id: 'job-1', status: 'COMPLETED' });
    });

    it('propagates rejection from service.getJobStatus', async () => {
      getJobStatus.mockRejectedValueOnce(new Error('Not found'));

      await expect(controller.getStatus(mockReq, 'job-missing')).rejects.toThrow('Not found');
    });
  });

  describe('POST /documents/upload (uploadDocument)', () => {
    const mockFile: UploadedFileType = {
      fieldname: 'file',
      originalname: 'catalog.pdf',
      encoding: '7bit',
      mimetype: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('%PDF-1.7 mock'),
    };

    it('calls service.uploadDocument with resolved workspaceId, file and sanitized metadata', async () => {
      detectUploadedMimeMock.mockReturnValue('application/pdf');
      uploadDocument.mockResolvedValue({
        success: true,
        document: { id: 'doc-1', name: 'catalog.pdf' },
        message: 'Documento "catalog.pdf" enviado com sucesso!',
      });

      const result = await controller.uploadDocument(mockReq, mockFile, {
        name: 'My Catalog',
        description: 'A catalog',
        category: 'sales',
        workspaceId: 'ws-1',
      });

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(mockReq, 'ws-1');
      expect(detectUploadedMimeMock).toHaveBeenCalledWith(mockFile);
      expect(uploadDocument).toHaveBeenCalledWith('ws-1', expect.objectContaining({ mimetype: 'application/pdf' }), {
        name: 'My Catalog',
        description: 'A catalog',
        category: 'sales',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('GET /documents (listDocuments)', () => {
    it('calls service.listDocuments with resolved workspaceId and optional category', async () => {
      listDocuments.mockResolvedValue({
        documents: [{ id: 'doc-1', name: 'Catalog' }],
        total: 1,
      });

      const result = await controller.listDocuments(mockReq, 'sales');

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(mockReq);
      expect(listDocuments).toHaveBeenCalledWith('ws-1', 'sales');
      expect(result.documents).toHaveLength(1);
    });

    it('passes undefined category when not provided', async () => {
      listDocuments.mockResolvedValue({ documents: [], total: 0 });

      await controller.listDocuments(mockReq, undefined);

      expect(listDocuments).toHaveBeenCalledWith('ws-1', undefined);
    });
  });

  describe('GET /documents/:idOrName (getDocument)', () => {
    it('calls service.getDocument with resolved workspaceId and idOrName', async () => {
      getDocument.mockResolvedValue({
        id: 'doc-1',
        name: 'Catalog',
        mimeType: 'application/pdf',
        url: 'http://localhost:3001/media/documents/doc-1/file',
      });

      const result = await controller.getDocument(mockReq, 'doc-1');

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(mockReq);
      expect(getDocument).toHaveBeenCalledWith('ws-1', 'doc-1');
      expect(result).toMatchObject({ id: 'doc-1', name: 'Catalog' });
    });
  });

  describe('GET /documents/:idOrName/file (getDocumentFile)', () => {
    it('calls service.getDocumentFile and streams buffer to response', async () => {
      const buffer = Buffer.from('PDF content');
      getDocumentFile.mockResolvedValue({
        buffer,
        mimeType: 'application/pdf',
        fileName: 'catalog.pdf',
      });

      const res = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as never;

      await controller.getDocumentFile(mockReq, 'doc-1', res as never);

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(mockReq);
      expect(getDocumentFile).toHaveBeenCalledWith('ws-1', 'doc-1');
      expect(res['setHeader']).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(res['send']).toHaveBeenCalledWith(buffer);
    });
  });

  describe('DELETE /documents/:id (deleteDocument)', () => {
    it('calls service.deleteDocument with resolved workspaceId and document id', async () => {
      deleteDocument.mockResolvedValue({
        success: true,
        message: 'Documento "Catalog" removido com sucesso',
      });

      const result = await controller.deleteDocument(mockReq, 'doc-1');

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(mockReq);
      expect(deleteDocument).toHaveBeenCalledWith('ws-1', 'doc-1');
      expect(result).toMatchObject({ success: true });
    });

    it('propagates rejection from service.deleteDocument', async () => {
      deleteDocument.mockRejectedValueOnce(new Error('Deletion failed'));

      await expect(controller.deleteDocument(mockReq, 'doc-99')).rejects.toThrow(
        'Deletion failed',
      );
    });
  });

  describe('workspace isolation', () => {
    it('uses resolveWorkspaceId to derive workspaceId from req.user across all endpoints', async () => {
      resolveWorkspaceIdMock.mockReturnValue('ws-isolated');
      createVideoJob.mockResolvedValue({ id: 'j-1' });
      getJobStatus.mockResolvedValue({ id: 'j-1', status: 'DONE' });
      listDocuments.mockResolvedValue({ documents: [], total: 0 });

      await controller.generateVideo(mockReq, {
        imageUrl: 'https://x.com/a.png',
        workspaceId: 'ws-isolated',
      });
      await controller.getStatus(mockReq, 'j-1');
      await controller.listDocuments(mockReq);

      for (const call of resolveWorkspaceIdMock.mock.calls) {
        expect(call[0]).toBe(mockReq);
      }
      expect(createVideoJob).toHaveBeenCalledWith('ws-isolated', expect.anything());
      expect(getJobStatus).toHaveBeenCalledWith('j-1', 'ws-isolated');
      expect(listDocuments).toHaveBeenCalledWith('ws-isolated', undefined);
    });
  });
});
