import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { StorageDriversService } from './storage-drivers.service';

const s3SendMock = jest.fn().mockResolvedValue(undefined);

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: s3SendMock })),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
  DeleteObjectCommand: jest.fn(),
  HeadBucketCommand: jest.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock AWS SDK UnknownError matching the real shape from @aws-sdk/core. */
function makeUnknownError(message?: string) {
  const err = new Error(
    message ??
      'UnknownError: UnknownError from @aws-sdk/core.protocols.ProtocolLib.getErrorSchemaOrThrowBaseException',
  );
  err.name = 'UnknownError';
  (err as Record<string, unknown>).$metadata = { httpStatusCode: 400 };
  return err;
}

/** Build a mock AWS AccessDenied error. */
function _makeAccessDeniedError() {
  const err = new Error('Access Denied');
  err.name = 'AccessDenied';
  return err;
}

function configureBucket(config: { get: jest.Mock }, bucket = 'my-bucket', region = 'us-east-1') {
  config.get.mockImplementation((key: string) => {
    if (key === 'S3_BUCKET') {
      return bucket;
    }
    if (key === 'S3_REGION') {
      return region;
    }
    return undefined;
  });
}

describe('StorageDriversService', () => {
  let service: StorageDriversService;
  let config: { get: jest.Mock };

  beforeEach(() => {
    s3SendMock.mockClear();
    config = { get: jest.fn().mockReturnValue(undefined) };

    service = new StorageDriversService(config as ConfigService);
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
        if (key === 'S3_BUCKET') {
          return 'my-bucket';
        }
        if (key === 'S3_REGION') {
          return 'us-east-1';
        }
        return undefined;
      });

      const result = await service.uploadToS3(Buffer.from('test'), 'dir/file.txt');

      expect(s3SendMock).toHaveBeenCalled();
      expect(result).toMatchObject({ path: 'dir/file.txt', size: 4 });
    });

    it('falls back to local when S3 upload fails', async () => {
      config.get.mockImplementation((key: string) => {
        if (key === 'S3_BUCKET') {
          return 'my-bucket';
        }
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

    it('falls back to local on AWS UnknownError (protocol mismatch)', async () => {
      configureBucket(config);
      s3SendMock.mockRejectedValueOnce(makeUnknownError());

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

    it('caches the S3 client across uploads', async () => {
      (S3Client as unknown as jest.Mock).mockClear();
      // Force a new service so the internal cache is fresh
      service = new StorageDriversService(config as ConfigService);
      configureBucket(config);

      await service.uploadToS3(Buffer.from('test'), 'first.txt');
      await service.uploadToS3(Buffer.from('test'), 'second.txt');

      // S3Client constructor should be called only once (cached)
      expect(S3Client).toHaveBeenCalledTimes(1);
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
      configureBucket(config);

      const result = await service.deleteFromS3('dir/file.txt');
      expect(result).toBe(true);
      expect(s3SendMock).toHaveBeenCalled();
    });

    it('returns false on AWS UnknownError (protocol mismatch)', async () => {
      configureBucket(config);
      s3SendMock.mockRejectedValueOnce(makeUnknownError());

      const result = await service.deleteFromS3('dir/file.txt');
      expect(result).toBe(false);
    });

    it('returns false on network error', async () => {
      configureBucket(config);
      s3SendMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const result = await service.deleteFromS3('dir/file.txt');
      expect(result).toBe(false);
    });
  });

  describe('readFromS3', () => {
    it('returns null when S3_BUCKET is not configured', async () => {
      const result = await service.readFromS3('dir/file.txt', () => 'application/octet-stream');
      expect(result).toBeNull();
    });

    it('returns null on AWS UnknownError (protocol mismatch)', async () => {
      configureBucket(config);
      s3SendMock.mockRejectedValueOnce(makeUnknownError());

      const result = await service.readFromS3('dir/file.txt', () => 'application/octet-stream');
      expect(result).toBeNull();
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
        if (key === 'S3_BUCKET') {
          return 'my-bucket';
        }
        return undefined;
      });
      s3SendMock.mockResolvedValueOnce(undefined);

      const result = await service.checkS3Health();
      expect(result).toMatchObject({ status: 'UP', driver: 's3' });
    });

    it('returns DOWN on AWS UnknownError with error details', async () => {
      configureBucket(config);
      s3SendMock.mockRejectedValueOnce(makeUnknownError());

      const result = await service.checkS3Health();
      expect(result).toMatchObject({ status: 'DOWN', driver: 's3' });
      expect(result.details).toBeDefined();
      expect(result.details!.error).toBeTruthy();
    });
  });
});
