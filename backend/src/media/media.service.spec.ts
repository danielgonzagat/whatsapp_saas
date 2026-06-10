import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { MediaService } from './media.service';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';

type MediaJobCreateArgs = {
  data: {
    workspaceId: string;
    type: string;
    status: string;
    inputUrl: string;
    prompt?: string;
  };
};

type StorageUploadResult = { path: string; url: string; size: number };

const queueAddMock = jest.fn<Promise<void>, [string, unknown]>().mockResolvedValue(undefined);

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: queueAddMock })),
}));

jest.mock('../common/redis/redis.util', () => ({
  createBullMqConnectionOptions: jest.fn(() => ({
    url: 'redis://localhost:6379',
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  })),
  createRedisClient: jest.fn(() => ({})),
}));

jest.mock('../common/utils/url-validator', () => ({
  collectAllowedHosts: jest.fn().mockReturnValue(new Set(['cdn.example.com'])),
  validateNoInternalAccess: jest.fn((url: string) => {
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
      throw new BadRequestException('SSRF blocked');
    }
  }),
}));

describe('MediaService', () => {
  let service: MediaService;
  let prisma: ReturnType<typeof createPartialPrismaMock>;
  let config: { get: jest.Mock<string | undefined, [string, string?]> };
  let storage: {
    upload: jest.Mock<Promise<StorageUploadResult>, [Buffer, Record<string, unknown>]>;
    uploadFromUrl: jest.Mock<Promise<StorageUploadResult>, [string, Record<string, unknown>]>;
    isLocalDriver: jest.Mock<boolean, []>;
    readLocalFile: jest.Mock<Buffer, [string]>;
    getSignedUrl: jest.Mock<string, [string]>;
  };

  beforeEach(() => {
    queueAddMock.mockClear();

    prisma = createPartialPrismaMock({
      mediaJob: ['create', 'findFirst'],
      document: ['create', 'findMany', 'findFirst', 'updateMany'],
    });
    prisma.mediaJob.create.mockResolvedValue({
      id: 'job-1',
      status: 'PENDING',
    });
    prisma.mediaJob.findFirst.mockResolvedValue(null);
    prisma.document.create.mockResolvedValue({
      id: 'doc-1',
      name: 'test',
      filePath: '/uploads/test.pdf',
    });
    prisma.document.findMany.mockResolvedValue([]);
    prisma.document.findFirst.mockResolvedValue(null);
    prisma.document.updateMany.mockResolvedValue({ count: 1 });
    config = { get: jest.fn<string | undefined, [string, string?]>().mockReturnValue(undefined) };
    storage = {
      upload: jest
        .fn<Promise<StorageUploadResult>, [Buffer, Record<string, unknown>]>()
        .mockResolvedValue({
          path: '/uploads/doc.pdf',
          url: 'https://s3.example.com/doc.pdf',
          size: 4,
        }),
      uploadFromUrl: jest
        .fn<Promise<StorageUploadResult>, [string, Record<string, unknown>]>()
        .mockResolvedValue({
          path: '/uploads/remote.jpg',
          url: 'https://s3.example.com/remote.jpg',
          size: 9,
        }),
      isLocalDriver: jest.fn<boolean, []>().mockReturnValue(true),
      readLocalFile: jest.fn<Buffer, [string]>().mockReturnValue(Buffer.from('data')),
      getSignedUrl: jest.fn<string, [string]>().mockReturnValue('https://signed.url/doc.pdf'),
    };

    service = new MediaService(
      prisma as PrismaService,
      config as ConfigService,
      storage as StorageService,
    );
  });

  describe('createVideoJob', () => {
    it('blocks SSRF by rejecting internal URLs', async () => {
      await expect(
        service.createVideoJob('ws-1', { imageUrl: 'http://localhost:3001/admin' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a video job with external URL and dispatches to worker', async () => {
      const result = await service.createVideoJob('ws-1', {
        imageUrl: 'https://cdn.example.com/image.png',
        prompt: 'generate video',
      });

      expect(result).toMatchObject({ id: 'job-1', status: 'PENDING' });
      const [createArgs] = prisma.mediaJob.create.mock.calls[0]! as [MediaJobCreateArgs];
      expect(createArgs.data.workspaceId).toBe('ws-1');
      expect(createArgs.data.type).toBe('VIDEO_GENERATION');
      expect(createArgs.data.inputUrl).toBe('https://cdn.example.com/image.png');
      expect(queueAddMock).toHaveBeenCalledWith('generate-video', expect.objectContaining({}));
    });
  });

  describe('getJobStatus', () => {
    it('throws NotFoundException when job does not exist', async () => {
      await expect(service.getJobStatus('nonexistent', 'ws-1')).rejects.toThrow(NotFoundException);
    });

    it('returns job data when found', async () => {
      const job = { id: 'job-1', workspaceId: 'ws-1', status: 'COMPLETED' };
      prisma.mediaJob.findFirst.mockResolvedValueOnce(job);

      const result = await service.getJobStatus('job-1', 'ws-1');
      expect(result).toEqual(job);
    });
  });

  describe('uploadDocument', () => {
    it('throws BadRequestException when file has no buffer', async () => {
      await expect(service.uploadDocument('ws-1', {} as { buffer: Buffer }, {})).rejects.toThrow(
        BadRequestException,
      );
    });

    it('uploads document successfully with valid file buffer', async () => {
      const file = {
        buffer: Buffer.from('test-content'),
        originalname: 'doc.pdf',
        mimetype: 'application/pdf',
        size: 100,
      };

      const result = await service.uploadDocument('ws-1', file, { name: 'My Doc' });

      expect(result).toMatchObject({
        success: true,
      });
      expect(storage.upload).toHaveBeenCalled();
      expect(prisma.document.create).toHaveBeenCalled();
    });
  });

  describe('attach', () => {
    it('stores a base64 data-URL upload and returns the stored URL (happy path)', async () => {
      const dataUrl = `data:image/png;base64,${Buffer.from('png-bytes').toString('base64')}`;

      const result = await service.attach('ws-1', { imageBase64: dataUrl });

      expect(result).toMatchObject({ success: true });
      expect(result.data?.url).toBe('https://s3.example.com/doc.pdf');
      const [buffer, opts] = storage.upload.mock.calls[0] as [Buffer, Record<string, unknown>];
      expect(Buffer.isBuffer(buffer)).toBe(true);
      expect(buffer.toString()).toBe('png-bytes');
      expect(opts.folder).toBe('media/ws-1');
      expect(opts.mimeType).toBe('image/png');
      expect(opts.workspaceId).toBe('ws-1');
    });

    it('re-hosts an external image URL via uploadFromUrl', async () => {
      const result = await service.attach('ws-1', {
        imageUrl: 'https://cdn.example.com/cover.jpg',
      });

      expect(result).toMatchObject({ success: true });
      expect(result.data?.url).toBe('https://s3.example.com/remote.jpg');
      const [sourceUrl, opts] = storage.uploadFromUrl.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(sourceUrl).toBe('https://cdn.example.com/cover.jpg');
      expect(opts.folder).toBe('media/ws-1');
      expect(opts.workspaceId).toBe('ws-1');
    });

    it('returns an honest error when no image input is provided', async () => {
      const result = await service.attach('ws-1', {});

      expect(result).toEqual({ success: false, data: null, error: 'image_input_required' });
      expect(storage.upload).not.toHaveBeenCalled();
      expect(storage.uploadFromUrl).not.toHaveBeenCalled();
    });
  });
});
