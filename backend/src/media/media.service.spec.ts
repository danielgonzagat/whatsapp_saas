import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { MediaService } from './media.service';

const queueAddMock = jest.fn().mockResolvedValue(undefined);

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({ add: queueAddMock })),
}));

jest.mock('../common/redis/redis.util', () => ({
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
  let prisma: {
    mediaJob: { create: jest.Mock; findFirst: jest.Mock };
    document: { create: jest.Mock; findMany: jest.Mock; findFirst: jest.Mock; updateMany: jest.Mock };
  };
  let config: { get: jest.Mock };
  let storage: { upload: jest.Mock; isLocalDriver: jest.Mock; readLocalFile: jest.Mock; getSignedUrl: jest.Mock };

  beforeEach(() => {
    queueAddMock.mockClear();

    prisma = {
      mediaJob: {
        create: jest.fn().mockResolvedValue({ id: 'job-1', status: 'PENDING' }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      document: {
        create: jest.fn().mockResolvedValue({ id: 'doc-1', name: 'test', filePath: '/uploads/test.pdf' }),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    config = { get: jest.fn().mockReturnValue(undefined) };
    storage = {
      upload: jest.fn().mockResolvedValue({ path: '/uploads/doc.pdf', url: 'https://s3.example.com/doc.pdf' }),
      isLocalDriver: jest.fn().mockReturnValue(true),
      readLocalFile: jest.fn().mockReturnValue(Buffer.from('data')),
      getSignedUrl: jest.fn().mockReturnValue('https://signed.url/doc.pdf'),
    };

    service = new MediaService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
      storage as unknown as StorageService,
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
      expect(prisma.mediaJob.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId: 'ws-1',
            type: 'VIDEO_GENERATION',
            inputUrl: 'https://cdn.example.com/image.png',
          }),
        }),
      );
      expect(queueAddMock).toHaveBeenCalledWith('generate-video', expect.any(Object));
    });
  });

  describe('getJobStatus', () => {
    it('throws NotFoundException when job does not exist', async () => {
      await expect(service.getJobStatus('nonexistent', 'ws-1')).rejects.toThrow(
        NotFoundException,
      );
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
      await expect(
        service.uploadDocument('ws-1', {} as never, {}),
      ).rejects.toThrow(BadRequestException);
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
});
