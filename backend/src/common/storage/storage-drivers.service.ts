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

const TRAILING_SLASHES_RE = /\/+$/;

function describeUnknownError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return 'Unknown error';
}

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

  constructor(
    private config: ConfigService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  /** Upload buffer to S3, falling back to local if unconfigured. */
  async uploadToS3(
    buffer: Buffer,
    relativePath: string,
    mimeType?: string,
    uploadToLocal?: (
      buf: Buffer,
      path: string,
    ) => Promise<{ url: string; path: string; size: number }>,
  ): Promise<{ url: string; path: string; size: number }> {
    const bucket = this.config.get('S3_BUCKET');
    const region = this.config.get('S3_REGION', 'us-east-1');
    if (!bucket) {
      this.logger.warn('S3_BUCKET not configured, falling back to local storage');
      if (uploadToLocal) return uploadToLocal(buffer, relativePath);
      throw new Error('S3_BUCKET not configured and no local fallback provided');
    }
    try {
      const client = new S3Client({ region });
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: relativePath,
          Body: buffer,
          ContentType: mimeType || 'application/octet-stream',
          ACL: 'public-read',
        }),
      );
      const cdnBase = this.config.get('CDN_BASE_URL');
      const url = cdnBase
        ? `${cdnBase}/${relativePath}`
        : `https://${bucket}.s3.${region}.amazonaws.com/${relativePath}`;
      this.logger.debug(`Uploaded to S3: ${relativePath} (${buffer.length} bytes)`);
      return { url, path: relativePath, size: buffer.length };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'StorageDriversService.uploadToS3');
      const errorMsg = describeUnknownError(error);
      this.logger.error(`S3 upload failed: ${errorMsg}, falling back to local`);
      if (uploadToLocal) return uploadToLocal(buffer, relativePath);
      throw error;
    }
  }

  /** Upload buffer to R2, falling back to local if unconfigured. */
  async uploadToR2(
    buffer: Buffer,
    relativePath: string,
    mimeType?: string,
    uploadToLocal?: (
      buf: Buffer,
      path: string,
    ) => Promise<{ url: string; path: string; size: number }>,
  ): Promise<{ url: string; path: string; size: number }> {
    const client = this.getR2Client();
    if (!client) {
      this.logger.warn('R2 not fully configured, falling back to local storage');
      if (uploadToLocal) return uploadToLocal(buffer, relativePath);
      throw new Error('R2 not configured and no local fallback provided');
    }
    const bucket = this.config.get('R2_BUCKET');
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: relativePath,
          Body: buffer,
          ContentType: mimeType || 'application/octet-stream',
        }),
      );
      const url = this.buildR2PublicUrl(relativePath);
      this.logger.debug(`Uploaded to R2: ${relativePath} (${buffer.length} bytes)`);
      return { url, path: relativePath, size: buffer.length };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'StorageDriversService.uploadToR2');
      const errorMsg = describeUnknownError(error);
      this.logger.error(`R2 upload failed: ${errorMsg}, falling back to local`);
      if (uploadToLocal) return uploadToLocal(buffer, relativePath);
      throw error;
    }
  }

  /** Delete from S3, falling back to local. */
  async deleteFromS3(
    relativePath: string,
    deleteFromLocal?: (path: string) => Promise<boolean>,
  ): Promise<boolean> {
    const bucket = this.config.get('S3_BUCKET');
    if (!bucket) {
      if (deleteFromLocal) return deleteFromLocal(relativePath);
      return false;
    }
    try {
      const client = new S3Client({ region: this.config.get('S3_REGION', 'us-east-1') });
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: relativePath }));
      return true;
    } catch {
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
      if (deleteFromLocal) return deleteFromLocal(relativePath);
      return false;
    }
    try {
      const bucket = this.config.get('R2_BUCKET');
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
    const bucket = this.config.get('S3_BUCKET');
    if (!bucket) return null;
    try {
      const client = new S3Client({ region: this.config.get('S3_REGION', 'us-east-1') });
      const response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: relativePath }),
      );
      return {
        buffer: await this.objectBodyToBuffer(response.Body),
        mimeType: response.ContentType || getMimeTypeForPath(relativePath),
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'StorageDriversService.getMimeTypeForPath');
      const errorMsg = describeUnknownError(error);
      this.logger.warn(`S3 remote read failed for "${relativePath}": ${errorMsg}`);
      return null;
    }
  }

  /** Read from R2. */
  async readFromR2(
    relativePath: string,
    getMimeTypeForPath: (path: string) => string,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const client = this.getR2Client();
    const bucket = this.config.get('R2_BUCKET');
    if (!client || !bucket) return null;
    try {
      const response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: relativePath }),
      );
      return {
        buffer: await this.objectBodyToBuffer(response.Body),
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
      const bucket = this.config.get('R2_BUCKET');
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
      const bucket = this.config.get('S3_BUCKET');
      if (!bucket) {
        return { status: 'DEGRADED', driver: 's3', details: { error: 'S3_BUCKET not configured' } };
      }
      const client = new S3Client({ region: this.config.get('S3_REGION', 'us-east-1') });
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return { status: 'UP', driver: 's3', details: { bucket } };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'StorageDriversService.send');
      const errorMsg = describeUnknownError(error);
      return { status: 'DOWN', driver: 's3', details: { error: errorMsg } };
    }
  }

  /** Verify R2 connection on startup. */
  async verifyR2Connection() {
    const client = this.getR2Client();
    if (!client) return;
    const bucket = this.config.get('R2_BUCKET');
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    this.logger.log(`R2 connection verified (bucket: ${bucket})`);
  }

  /** Build R2 public URL for a relative path. */
  buildR2PublicUrl(relativePath: string): string {
    const r2PublicUrl = this.config.get('R2_PUBLIC_URL');
    if (r2PublicUrl) {
      return `${r2PublicUrl.replace(TRAILING_SLASHES_RE, '')}/${relativePath}`;
    }
    const cdnBase = this.config.get('CDN_BASE_URL');
    if (cdnBase) {
      return `${cdnBase}/${relativePath}`;
    }
    return '';
  }

  getR2Client(): S3Client | null {
    if (this.r2Client) return this.r2Client;
    const bucket = this.config.get('R2_BUCKET');
    const accountId = this.config.get('R2_ACCOUNT_ID');
    const accessKeyId = this.config.get('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get('R2_SECRET_ACCESS_KEY');
    if (!bucket || !accountId || !accessKeyId || !secretAccessKey) return null;
    try {
      const endpoint =
        this.config.get('R2_ENDPOINT') || `https://${accountId}.r2.cloudflarestorage.com`;
      this.r2Client = new S3Client({
        region: 'auto',
        endpoint,
        forcePathStyle: true,
        credentials: { accessKeyId, secretAccessKey },
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

  private async objectBodyToBuffer(body: unknown): Promise<Buffer> {
    if (!body) return Buffer.alloc(0);
    if (Buffer.isBuffer(body)) return body;
    if (typeof (body as Record<string, unknown>).transformToByteArray === 'function') {
      return Buffer.from(
        await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray(),
      );
    }
    const chunks: Buffer[] = [];
    const streamBody = body as AsyncIterable<Buffer | Uint8Array | string | ArrayBuffer>;
    for await (const chunk of streamBody) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
        continue;
      }
      if (chunk instanceof ArrayBuffer) {
        chunks.push(Buffer.from(new Uint8Array(chunk)));
        continue;
      }
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
}
