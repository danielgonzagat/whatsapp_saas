import * as fs from 'node:fs';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { safeJoin } from '../../common/safe-path';
import { OpsAlertService } from '../../observability/ops-alert.service';
import { buildAwsCallContext, classifyAwsError } from './s3-error-classifier';
import type { AwsCallContext } from './s3-error-classifier';
import {
  STORAGE_DRIVER_DEFAULTS,
  buildPutObjectInput,
  buildR2DefaultEndpoint,
  buildR2PublicUrl,
  buildS3PublicUrl,
  describeUnknownError,
  objectBodyToBuffer,
  validateR2Credentials,
} from './storage-drivers.service.helpers';

type UploadResult = { url: string; path: string; size: number };
type LocalUploadFallback = (buf: Buffer, path: string) => Promise<UploadResult>;

/**
 * StorageDriversService
 *
 * Handles the low-level S3, R2, and local filesystem driver operations.
 * Used internally by StorageService.
 */
@Injectable()
export class StorageDriversService {
  private readonly logger = new Logger(StorageDriversService.name);
  private r2Client: S3Client | null = null;
  private s3Client: S3Client | null = null;

  constructor(
    private config: ConfigService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  /** Upload buffer to S3, falling back to local if unconfigured. */
  async uploadToS3(
    buffer: Buffer,
    relativePath: string,
    mimeType?: string,
    uploadToLocal?: LocalUploadFallback,
  ): Promise<UploadResult> {
    const bucket = this.getConfigString('S3_BUCKET');
    const region = this.getConfigString('S3_REGION') ?? STORAGE_DRIVER_DEFAULTS.s3Region;
    const ctx: AwsCallContext = buildAwsCallContext({
      operation: 'uploadToS3',
      region,
      bucket: bucket ?? '',
      key: relativePath,
    });
    if (!bucket) {
      this.logger.warn('S3_BUCKET not configured, falling back to local storage');
      if (uploadToLocal) {
        return uploadToLocal(buffer, relativePath);
      }
      throw new Error('S3_BUCKET not configured and no local fallback provided');
    }
    try {
      const client = this.getS3Client(region);
      await client.send(
        new PutObjectCommand(
          buildPutObjectInput({
            bucket,
            key: relativePath,
            body: buffer,
            mimeType,
            acl: 'public-read',
          }),
        ),
      );
      const url = buildS3PublicUrl({
        bucket,
        region,
        relativePath,
        cdnBase: this.getConfigString('CDN_BASE_URL'),
      });
      this.logger.debug(`Uploaded to S3: ${relativePath} (${buffer.length} bytes)`);
      return { url, path: relativePath, size: buffer.length };
    } catch (error: unknown) {
      const classified = classifyAwsError(error, ctx);
      void this.opsAlert?.alertOnCriticalError(error, 'StorageDriversService.uploadToS3', {
        metadata: { category: classified.category, awsCode: classified.awsCode },
      });
      this.logger.error(`S3 upload failed: ${classified.message}, falling back to local`);
      if (uploadToLocal) {
        return uploadToLocal(buffer, relativePath);
      }
      throw error;
    }
  }

  /** Upload buffer to R2, falling back to local if unconfigured. */
  async uploadToR2(
    buffer: Buffer,
    relativePath: string,
    mimeType?: string,
    uploadToLocal?: LocalUploadFallback,
  ): Promise<UploadResult> {
    const client = this.getR2Client();
    if (!client) {
      this.logger.warn('R2 not fully configured, falling back to local storage');
      if (uploadToLocal) {
        return uploadToLocal(buffer, relativePath);
      }
      throw new Error('R2 not configured and no local fallback provided');
    }
    const bucket = this.getConfigString('R2_BUCKET');
    if (!bucket) {
      throw new Error('R2 not configured and no local fallback provided');
    }
    try {
      await client.send(
        new PutObjectCommand(
          buildPutObjectInput({
            bucket,
            key: relativePath,
            body: buffer,
            mimeType,
          }),
        ),
      );
      const url = this.buildR2PublicUrl(relativePath);
      this.logger.debug(`Uploaded to R2: ${relativePath} (${buffer.length} bytes)`);
      return { url, path: relativePath, size: buffer.length };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'StorageDriversService.uploadToR2');
      const errorMsg = describeUnknownError(error);
      this.logger.error(`R2 upload failed: ${errorMsg}, falling back to local`);
      if (uploadToLocal) {
        return uploadToLocal(buffer, relativePath);
      }
      throw error;
    }
  }

  /** Delete from S3, falling back to local. */
  async deleteFromS3(
    relativePath: string,
    deleteFromLocal?: (path: string) => Promise<boolean>,
  ): Promise<boolean> {
    const bucket = this.getConfigString('S3_BUCKET');
    if (!bucket) {
      if (deleteFromLocal) {
        return deleteFromLocal(relativePath);
      }
      return false;
    }
    try {
      const region = this.getConfigString('S3_REGION') ?? STORAGE_DRIVER_DEFAULTS.s3Region;
      const client = this.getS3Client(region);
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: relativePath }));
      return true;
    } catch (error: unknown) {
      const region = this.getConfigString('S3_REGION') ?? STORAGE_DRIVER_DEFAULTS.s3Region;
      classifyAwsError(
        error,
        buildAwsCallContext({
          operation: 'deleteFromS3',
          region,
          bucket: bucket ?? '',
          key: relativePath,
        }),
      );
      return false;
    }
  }

  /** Delete from R2, falling back to local. */
  async deleteFromR2(
    relativePath: string,
    deleteFromLocal?: (path: string) => Promise<boolean>,
  ): Promise<boolean> {
    const client = this.getR2Client();
    if (!client) {
      if (deleteFromLocal) {
        return deleteFromLocal(relativePath);
      }
      return false;
    }
    try {
      const bucket = this.getConfigString('R2_BUCKET');
      if (!bucket) {
        return false;
      }
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: relativePath }));
      return true;
    } catch {
      return false;
    }
  }

  /** Read from S3. */
  async readFromS3(
    relativePath: string,
    getMimeTypeForPath: (path: string) => string,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const bucket = this.getConfigString('S3_BUCKET');
    if (!bucket) {
      return null;
    }
    try {
      const region = this.getConfigString('S3_REGION') ?? STORAGE_DRIVER_DEFAULTS.s3Region;
      const client = this.getS3Client(region);
      const response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: relativePath }),
      );
      return {
        buffer: await objectBodyToBuffer(response.Body),
        mimeType: response.ContentType || getMimeTypeForPath(relativePath),
      };
    } catch (error: unknown) {
      const region = this.getConfigString('S3_REGION') ?? STORAGE_DRIVER_DEFAULTS.s3Region;
      classifyAwsError(
        error,
        buildAwsCallContext({
          operation: 'readFromS3',
          region,
          bucket: bucket ?? '',
          key: relativePath,
        }),
      );
      void this.opsAlert?.alertOnCriticalError(error, 'StorageDriversService.getMimeTypeForPath');
      this.logger.warn(`S3 remote read failed for "${relativePath}"`);
      return null;
    }
  }

  /** Read from R2. */
  async readFromR2(
    relativePath: string,
    getMimeTypeForPath: (path: string) => string,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const client = this.getR2Client();
    const bucket = this.getConfigString('R2_BUCKET');
    if (!client || !bucket) {
      return null;
    }
    try {
      const response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: relativePath }),
      );
      return {
        buffer: await objectBodyToBuffer(response.Body),
        mimeType: response.ContentType || getMimeTypeForPath(relativePath),
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'StorageDriversService.getMimeTypeForPath');
      const errorMsg = describeUnknownError(error);
      this.logger.warn(`R2 remote read failed for "${relativePath}": ${errorMsg}`);
      return null;
    }
  }

  /** Check R2 bucket health. */
  async checkR2Health(uploadsDir: string): Promise<{
    status: 'UP' | 'DOWN' | 'DEGRADED';
    driver: string;
    details?: Record<string, unknown>;
  }> {
    try {
      const client = this.getR2Client();
      if (!client) {
        return {
          status: 'DEGRADED',
          driver: 'r2',
          details: { error: 'R2 not fully configured, using local fallback' },
        };
      }
      const bucket = this.getConfigString('R2_BUCKET');
      if (!bucket) {
        return {
          status: 'DEGRADED',
          driver: 'r2',
          details: { error: 'R2_BUCKET not configured, using local fallback' },
        };
      }
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return { status: 'UP', driver: 'r2', details: { bucket } };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'StorageDriversService.send');
      const errorMsg = describeUnknownError(error);
      const fallbackWritable = this.isLocalWritable(uploadsDir);
      return {
        status: fallbackWritable ? 'DEGRADED' : 'DOWN',
        driver: 'r2',
        details: {
          error: errorMsg,
          fallback: fallbackWritable ? 'local' : 'unavailable',
          uploadsDir,
          writable: fallbackWritable,
        },
      };
    }
  }

  /** Check S3 bucket health. */
  async checkS3Health(): Promise<{
    status: 'UP' | 'DOWN' | 'DEGRADED';
    driver: string;
    details?: Record<string, unknown>;
  }> {
    try {
      const bucket = this.getConfigString('S3_BUCKET');
      if (!bucket) {
        return { status: 'DEGRADED', driver: 's3', details: { error: 'S3_BUCKET not configured' } };
      }
      const region = this.getConfigString('S3_REGION') ?? STORAGE_DRIVER_DEFAULTS.s3Region;
      const client = this.getS3Client(region);
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return { status: 'UP', driver: 's3', details: { bucket } };
    } catch (error: unknown) {
      const region = this.getConfigString('S3_REGION') ?? STORAGE_DRIVER_DEFAULTS.s3Region;
      const bucket = this.getConfigString('S3_BUCKET') ?? '';
      classifyAwsError(
        error,
        buildAwsCallContext({
          operation: 'checkS3Health',
          region,
          bucket,
        }),
      );
      void this.opsAlert?.alertOnCriticalError(error, 'StorageDriversService.send');
      const errorMsg = describeUnknownError(error);
      return { status: 'DOWN', driver: 's3', details: { error: errorMsg } };
    }
  }

  /** Verify R2 connection on startup. */
  async verifyR2Connection(): Promise<void> {
    const client = this.getR2Client();
    if (!client) {
      return;
    }
    const bucket = this.getConfigString('R2_BUCKET');
    if (!bucket) {
      return;
    }
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    this.logger.log(`R2 connection verified (bucket: ${bucket})`);
  }

  /** Build R2 public URL for a relative path. */
  buildR2PublicUrl(relativePath: string): string {
    return buildR2PublicUrl({
      relativePath,
      r2PublicUrl: this.getConfigString('R2_PUBLIC_URL'),
      cdnBase: this.getConfigString('CDN_BASE_URL'),
    });
  }

  /** Lazily-initialised S3 client, cached. */
  getS3Client(region: string): S3Client {
    if (!this.s3Client) {
      this.s3Client = new S3Client({ region });
      this.logger.debug(`S3 client initialised for region=${region}`);
    }
    return this.s3Client;
  }

  getR2Client(): S3Client | null {
    if (this.r2Client) {
      return this.r2Client;
    }
    const credentials = validateR2Credentials({
      bucket: this.getConfigString('R2_BUCKET'),
      accountId: this.getConfigString('R2_ACCOUNT_ID'),
      accessKeyId: this.getConfigString('R2_ACCESS_KEY_ID'),
      secretAccessKey: this.getConfigString('R2_SECRET_ACCESS_KEY'),
    });
    if (!credentials) {
      return null;
    }
    try {
      const endpoint =
        this.getConfigString('R2_ENDPOINT') ?? buildR2DefaultEndpoint(credentials.accountId);
      this.r2Client = new S3Client({
        region: 'auto',
        endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
        },
      });
      return this.r2Client;
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'StorageDriversService.getR2Client');
      const errorMsg = describeUnknownError(error);
      this.logger.error(`Failed to create R2 client: ${errorMsg}`);
      return null;
    }
  }

  isLocalWritable(uploadsDir: string): boolean {
    try {
      const testFile = safeJoin(uploadsDir, `.healthcheck_${Date.now()}`);
      fs.writeFileSync(testFile, 'ok');
      fs.unlinkSync(testFile);
      return true;
    } catch {
      return false;
    }
  }

  private getConfigString(key: string): string | undefined {
    const value = this.config.get<string>(key);
    return typeof value === 'string' && value.trim() ? value : undefined;
  }
}
