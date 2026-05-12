import { ConfigService } from '@nestjs/config';
import { StorageDriversService } from './storage-drivers.service';

const s3SendMock = jest.fn().mockResolvedValue(undefined);

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: s3SendMock })),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
  HeadBucketCommand: jest.fn(),
}));

describe('StorageDriversService', () => {
  let service: StorageDriversService;
  let config: { get: jest.Mock };

  beforeEach(() => {
    s3SendMock.mockClear();
    config = { get: jest.fn().mockReturnValue(undefined) };

    service = new StorageDriversService(
      config as unknown as ConfigService,
    );
  });

  describe('uploadToS3', () => {
    it('falls back to local when S3_BUCKET is not configured', async () => {
      const localFallback = jest
        .fn()
        .mockResolvedValue({ url: '/local/path', path: 'local', size: 10 });

      const result = await service.uploadToS3(
        Buffer.from('test'),
        'dir/file.txt',
        undefined,
        localFallback,
      );

      expect(result).toEqual({ url: '/local/path', path: 'local', size: 10 });
      expect(localFallback).toHaveBeenCalled();
    });

    it('throws when S3_BUCKET not configured and no local fallback', async () => {
      await expect(
        service.uploadToS3(Buffer.from('test'), 'dir/file.txt', undefined, undefined),
      ).rejects.toThrow('S3_BUCKET not configured and no local fallback provided');
    });

    it('uploads to S3 when bucket is configured', async () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'S3_BUCKET') return 'my-bucket';
        if (key === 'S3_REGION') return 'us-east-1';
        return undefined;
      });

      const result = await service.uploadToS3(Buffer.from('test'), 'dir/file.txt');

      expect(s3SendMock).toHaveBeenCalled();
      expect(result).toMatchObject({ path: 'dir/file.txt', size: 4 });
    });

    it('falls back to local when S3 upload fails', async () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'S3_BUCKET') return 'my-bucket';
        return undefined;
      });
      s3SendMock.mockRejectedValueOnce(new Error('Network error'));

      const localFallback = jest
        .fn()
        .mockResolvedValue({ url: '/local/path', path: 'local', size: 10 });

      const result = await service.uploadToS3(
        Buffer.from('test'),
        'dir/file.txt',
        undefined,
        localFallback,
      );

      expect(result).toEqual({ url: '/local/path', path: 'local', size: 10 });
    });
  });

  describe('deleteFromS3', () => {
    it('falls back to local delete when S3_BUCKET not configured', async () => {
      const localDelete = jest.fn().mockResolvedValue(true);

      const result = await service.deleteFromS3('dir/file.txt', localDelete);

      expect(result).toBe(true);
      expect(localDelete).toHaveBeenCalledWith('dir/file.txt');
    });

    it('returns false when S3_BUCKET not configured and no local fallback', async () => {
      const result = await service.deleteFromS3('dir/file.txt');
      expect(result).toBe(false);
    });

    it('deletes from S3 successfully when bucket is configured', async () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'S3_BUCKET') return 'my-bucket';
        if (key === 'S3_REGION') return 'us-east-1';
        return undefined;
      });

      const result = await service.deleteFromS3('dir/file.txt');
      expect(result).toBe(true);
      expect(s3SendMock).toHaveBeenCalled();
    });
  });

  describe('checkS3Health', () => {
    it('returns DEGRADED when S3_BUCKET is not configured', async () => {
      const result = await service.checkS3Health();
      expect(result).toEqual({
        status: 'DEGRADED',
        driver: 's3',
        details: { error: 'S3_BUCKET not configured' },
      });
    });

    it('returns UP when bucket is accessible', async () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'S3_BUCKET') return 'my-bucket';
        return undefined;
      });
      s3SendMock.mockResolvedValueOnce(undefined);

      const result = await service.checkS3Health();
      expect(result).toMatchObject({ status: 'UP', driver: 's3' });
    });
  });
});
