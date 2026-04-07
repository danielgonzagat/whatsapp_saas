import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual, createHmac } from 'crypto';
import { getTraceHeaders } from '../trace-headers'; // propagates X-Request-ID
import { validateNoInternalAccess } from '../utils/url-validator';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuid } from 'uuid';

/**
 * StorageService - Serviço de armazenamento de mídia
 *
 * Suporta:
 * - Local filesystem (default para dev)
 * - CDN/S3/R2 (configurável via env vars)
 *
 * Variáveis de ambiente:
 * - STORAGE_DRIVER: 'local' | 's3' | 'r2' (default: 'local')
 * - CDN_BASE_URL: URL base para arquivos públicos
 * - APP_URL: URL do backend (fallback para local)
 * - S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY (para S3)
 * - R2_BUCKET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (para R2)
 * - R2_PUBLIC_URL: Public URL for R2 bucket (e.g. custom domain or r2.dev URL)
 * - R2_ENDPOINT: Full R2 endpoint URL (overrides auto-generated from account ID)
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: string;
  private readonly uploadsDir: string;
  private readonly baseUrl: string;
  private readonly signingSecret: string;
  private r2Client: any = null;

  constructor(private config: ConfigService) {
    this.driver = this.config.get('STORAGE_DRIVER', 'local');
    this.uploadsDir = path.join(__dirname, '..', '..', '..', 'uploads');
    this.baseUrl =
      this.config.get('CDN_BASE_URL') ||
      this.config.get('MEDIA_BASE_URL') ||
      this.config.get('APP_URL', 'http://localhost:3001');
    this.signingSecret =
      this.config.get('STORAGE_SIGNING_SECRET') ||
      this.config.get('JWT_SECRET') ||
      'dev-secret-insecure';

    // Garantir que o diretório de uploads existe
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }

    this.logger.log(`StorageService initialized with driver: ${this.driver}`);
  }

  async onModuleInit() {
    if (this.driver === 'r2') {
      try {
        const client = this.getR2Client();
        if (client) {
          const { HeadBucketCommand } = require('@aws-sdk/client-s3');
          const bucket = this.config.get('R2_BUCKET');
          await client.send(new HeadBucketCommand({ Bucket: bucket }));
          this.logger.log(`R2 connection verified (bucket: ${bucket})`);
        }
      } catch (error: any) {
        this.logger.warn(
          `R2 connection check failed: ${error.message}. Uploads will fall back to local storage.`,
        );
      }
    }
  }

  /**
   * Upload de arquivo (Buffer) para storage
   * Retorna URL pública do arquivo
   */
  async upload(
    buffer: Buffer,
    options: {
      filename?: string;
      mimeType?: string;
      folder?: string;
      workspaceId?: string;
    } = {},
  ): Promise<{ url: string; path: string; size: number }> {
    const ext = this.getExtensionFromMime(options.mimeType || 'application/octet-stream');
    const filename = options.filename || `${uuid()}${ext}`;
    const folder = options.folder || 'media';
    const relativePath = path.join(folder, filename);

    switch (this.driver) {
      case 's3':
        return this.uploadToS3(buffer, relativePath, options.mimeType);
      case 'r2':
        return this.uploadToR2(buffer, relativePath, options.mimeType);
      default:
        return this.uploadToLocal(buffer, relativePath);
    }
  }

  /**
   * Upload de áudio gerado por TTS
   */
  async uploadAudio(buffer: Buffer, workspaceId: string): Promise<{ url: string; path: string }> {
    const filename = `audio_${workspaceId}_${Date.now()}.mp3`;
    const result = await this.upload(buffer, {
      filename,
      mimeType: 'audio/mpeg',
      folder: 'audio',
      workspaceId,
    });
    return { url: result.url, path: result.path };
  }

  /**
   * Upload de avatar de usuário/workspace
   */
  async uploadAvatar(
    buffer: Buffer,
    entityId: string,
    mimeType = 'image/jpeg',
  ): Promise<{ url: string; path: string; size: number }> {
    const ext = this.getExtensionFromMime(mimeType) || '.jpg';
    const filename = `avatar_${entityId}_${Date.now()}${ext}`;
    return this.upload(buffer, {
      filename,
      mimeType,
      folder: 'avatars',
    });
  }

  /**
   * Upload de imagem de produto
   */
  async uploadProductImage(
    buffer: Buffer,
    productId: string,
    mimeType = 'image/jpeg',
  ): Promise<{ url: string; path: string; size: number }> {
    const ext = this.getExtensionFromMime(mimeType) || '.jpg';
    const filename = `product_${productId}_${Date.now()}${ext}`;
    return this.upload(buffer, {
      filename,
      mimeType,
      folder: 'products',
    });
  }

  /**
   * Upload de mídia do WhatsApp (áudio, imagem, vídeo, documento)
   */
  async uploadWhatsAppMedia(
    buffer: Buffer,
    workspaceId: string,
    mimeType: string,
    originalName?: string,
  ): Promise<{ url: string; path: string; size: number }> {
    const ext = this.getExtensionFromMime(mimeType) || '';
    const filename = originalName || `wa_${workspaceId}_${Date.now()}${ext}`;
    return this.upload(buffer, {
      filename,
      mimeType,
      folder: `whatsapp/${workspaceId}`,
      workspaceId,
    });
  }

  /**
   * Download de URL e upload para storage
   */
  async uploadFromUrl(
    sourceUrl: string,
    options: {
      filename?: string;
      mimeType?: string;
      folder?: string;
      workspaceId?: string;
      timeoutMs?: number;
    } = {},
  ): Promise<{ url: string; path: string; size: number }> {
    const timeoutMs = options.timeoutMs || 30000;
    validateNoInternalAccess(sourceUrl);
    const response = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Failed to download from URL: HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType =
      options.mimeType || response.headers.get('content-type') || 'application/octet-stream';

    return this.upload(buffer, {
      filename: options.filename,
      mimeType: contentType,
      folder: options.folder || 'downloads',
      workspaceId: options.workspaceId,
    });
  }

  /**
   * Health check do storage - verifica se o driver está operacional
   */
  async healthCheck(): Promise<{
    status: 'UP' | 'DOWN' | 'DEGRADED';
    driver: string;
    details?: Record<string, any>;
  }> {
    if (this.isLocalDriver()) {
      const writable = this.isLocalWritable();
      return {
        status: writable ? 'UP' : 'DOWN',
        driver: 'local',
        details: { uploadsDir: this.uploadsDir, writable },
      };
    }

    if (this.driver === 'r2') {
      try {
        const client = this.getR2Client();
        if (!client) {
          return {
            status: 'DEGRADED',
            driver: 'r2',
            details: { error: 'R2 not fully configured, using local fallback' },
          };
        }
        const { HeadBucketCommand } = require('@aws-sdk/client-s3');
        const bucket = this.config.get('R2_BUCKET');
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
        return {
          status: 'UP',
          driver: 'r2',
          details: { bucket },
        };
      } catch (error: any) {
        const fallbackWritable = this.isLocalWritable();
        return {
          status: fallbackWritable ? 'DEGRADED' : 'DOWN',
          driver: 'r2',
          details: {
            error: error.message,
            fallback: fallbackWritable ? 'local' : 'unavailable',
            uploadsDir: this.uploadsDir,
            writable: fallbackWritable,
          },
        };
      }
    }

    if (this.driver === 's3') {
      try {
        const bucket = this.config.get('S3_BUCKET');
        if (!bucket) {
          return {
            status: 'DEGRADED',
            driver: 's3',
            details: { error: 'S3_BUCKET not configured' },
          };
        }
        const { S3Client, HeadBucketCommand } = require('@aws-sdk/client-s3');
        const client = new S3Client({
          region: this.config.get('S3_REGION', 'us-east-1'),
        });
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
        return { status: 'UP', driver: 's3', details: { bucket } };
      } catch (error: any) {
        return {
          status: 'DOWN',
          driver: 's3',
          details: { error: error.message },
        };
      }
    }

    return {
      status: 'DOWN',
      driver: this.driver,
      details: { error: 'Unknown driver' },
    };
  }

  isLocalDriver(): boolean {
    return this.driver === 'local';
  }

  getPublicUrl(relativePath: string): string {
    const normalized = this.normalizeRelativePath(relativePath);
    if (this.isLocalDriver()) {
      return this.buildLocalAccessUrl(normalized);
    }

    return this.buildRemotePublicUrl(normalized);
  }

  getSignedUrl(
    relativePath: string,
    options: {
      expiresInSeconds?: number;
      downloadName?: string;
    } = {},
  ): string {
    const normalized = this.normalizeRelativePath(relativePath);
    if (!this.isLocalDriver()) {
      return this.getPublicUrl(normalized);
    }

    return this.buildLocalAccessUrl(normalized, options);
  }

  resolveLocalAccessToken(token: string): {
    relativePath: string;
    absolutePath: string;
    downloadName?: string;
  } {
    const [encodedPayload, signature] = String(token || '').split('.');
    if (!encodedPayload || !signature) {
      throw new Error('invalid_storage_token');
    }

    const expectedSignature = this.sign(encodedPayload);
    const expectedBuffer = Buffer.from(expectedSignature);
    const receivedBuffer = Buffer.from(signature);

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new Error('invalid_storage_signature');
    }

    const raw = Buffer.from(encodedPayload, 'base64url').toString('utf8');
    let payload: { p?: string; exp?: number; d?: string };
    try {
      payload = JSON.parse(raw) as { p?: string; exp?: number; d?: string };
    } catch {
      throw new Error('invalid_storage_token_payload');
    }

    const relativePath = this.normalizeRelativePath(payload.p || '');
    if (!relativePath) {
      throw new Error('invalid_storage_path');
    }

    if (payload.exp && Date.now() > payload.exp) {
      throw new Error('expired_storage_token');
    }

    const absolutePath = this.resolveAbsolutePath(relativePath);
    return {
      relativePath,
      absolutePath,
      downloadName: payload.d || undefined,
    };
  }

  getMimeTypeForPath(relativePath: string): string {
    const ext = path.extname(relativePath).toLowerCase();
    const mapping: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
      '.webm': 'audio/webm',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.pdf': 'application/pdf',
      '.json': 'application/json',
      '.txt': 'text/plain',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };

    return mapping[ext] || 'application/octet-stream';
  }

  readLocalFile(relativePath: string): Buffer {
    const fullPath = this.resolveAbsolutePath(relativePath);
    return fs.readFileSync(fullPath);
  }

  async readAccessFile(relativePath: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const normalized = this.normalizeRelativePath(relativePath);
    const localPath = this.resolveAbsolutePath(normalized);

    if (fs.existsSync(localPath)) {
      return {
        buffer: fs.readFileSync(localPath),
        mimeType: this.getMimeTypeForPath(normalized),
      };
    }

    switch (this.driver) {
      case 'r2':
        return this.readFromR2(normalized);
      case 's3':
        return this.readFromS3(normalized);
      default:
        return null;
    }
  }

  /**
   * Upload para sistema de arquivos local
   */
  private async uploadToLocal(
    buffer: Buffer,
    relativePath: string,
  ): Promise<{ url: string; path: string; size: number }> {
    const normalizedPath = this.normalizeRelativePath(relativePath);
    const fullPath = this.resolveAbsolutePath(normalizedPath);
    const dir = path.dirname(fullPath);

    // Criar diretório se não existir
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Escrever arquivo
    fs.writeFileSync(fullPath, buffer);

    const url = this.getPublicUrl(normalizedPath);

    this.logger.debug(`Uploaded to local: ${normalizedPath} (${buffer.length} bytes)`);

    return {
      url,
      path: normalizedPath,
      size: buffer.length,
    };
  }

  /**
   * Upload para Amazon S3
   * Requer: npm install @aws-sdk/client-s3
   */
  private async uploadToS3(
    buffer: Buffer,
    relativePath: string,
    mimeType?: string,
  ): Promise<{ url: string; path: string; size: number }> {
    const bucket = this.config.get('S3_BUCKET');
    const region = this.config.get('S3_REGION', 'us-east-1');

    if (!bucket) {
      this.logger.warn('S3_BUCKET not configured, falling back to local storage');
      return this.uploadToLocal(buffer, relativePath);
    }

    try {
      // Importar SDK dinamicamente para evitar dependência obrigatória

      const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

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

      return {
        url,
        path: relativePath,
        size: buffer.length,
      };
    } catch (error: any) {
      this.logger.error(`S3 upload failed: ${error.message}, falling back to local`);
      return this.uploadToLocal(buffer, relativePath);
    }
  }

  /**
   * Upload para Cloudflare R2
   */
  private async uploadToR2(
    buffer: Buffer,
    relativePath: string,
    mimeType?: string,
  ): Promise<{ url: string; path: string; size: number }> {
    const client = this.getR2Client();
    if (!client) {
      this.logger.warn('R2 not fully configured, falling back to local storage');
      return this.uploadToLocal(buffer, relativePath);
    }

    const bucket = this.config.get('R2_BUCKET');

    try {
      const { PutObjectCommand } = require('@aws-sdk/client-s3');

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

      return {
        url,
        path: relativePath,
        size: buffer.length,
      };
    } catch (error: any) {
      this.logger.error(`R2 upload failed: ${error.message}, falling back to local`);
      return this.uploadToLocal(buffer, relativePath);
    }
  }

  /**
   * Returns a cached R2 S3-compatible client, or null if not configured.
   */
  private getR2Client(): any {
    if (this.r2Client) return this.r2Client;

    const bucket = this.config.get('R2_BUCKET');
    const accountId = this.config.get('R2_ACCOUNT_ID');
    const accessKeyId = this.config.get('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get('R2_SECRET_ACCESS_KEY');

    if (!bucket || !accountId || !accessKeyId || !secretAccessKey) {
      return null;
    }

    try {
      const { S3Client } = require('@aws-sdk/client-s3');

      const endpoint =
        this.config.get('R2_ENDPOINT') || `https://${accountId}.r2.cloudflarestorage.com`;

      this.r2Client = new S3Client({
        region: 'auto',
        endpoint,
        forcePathStyle: true,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });

      return this.r2Client;
    } catch (error: any) {
      this.logger.error(`Failed to create R2 client: ${error.message}`);
      return null;
    }
  }

  /**
   * Build the public URL for an R2 object.
   * Priority: R2_PUBLIC_URL > CDN_BASE_URL > constructed URL from account/bucket.
   */
  private buildR2PublicUrl(relativePath: string): string {
    const r2PublicUrl = this.config.get('R2_PUBLIC_URL');
    if (r2PublicUrl) {
      return `${r2PublicUrl.replace(/\/+$/, '')}/${relativePath}`;
    }
    const cdnBase = this.config.get('CDN_BASE_URL');
    if (cdnBase) {
      return `${cdnBase}/${relativePath}`;
    }
    this.logger.warn('R2_PUBLIC_URL not configured. Falling back to signed backend access URL.');
    return this.buildProxyAccessUrl(relativePath);
  }

  /**
   * Check if local uploads directory is writable.
   */
  private isLocalWritable(): boolean {
    try {
      const testFile = path.join(this.uploadsDir, `.healthcheck_${Date.now()}`);
      fs.writeFileSync(testFile, 'ok');
      fs.unlinkSync(testFile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Deleta arquivo do storage
   */
  async delete(relativePath: string): Promise<boolean> {
    try {
      switch (this.driver) {
        case 's3':
          return this.deleteFromS3(relativePath);
        case 'r2':
          return this.deleteFromR2(relativePath);
        default:
          return this.deleteFromLocal(relativePath);
      }
    } catch (error: any) {
      this.logger.warn(`Failed to delete ${relativePath}: ${error.message}`);
      return false;
    }
  }

  private async deleteFromLocal(relativePath: string): Promise<boolean> {
    const fullPath = this.resolveAbsolutePath(relativePath);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      return true;
    }
    return false;
  }

  private async deleteFromS3(relativePath: string): Promise<boolean> {
    const bucket = this.config.get('S3_BUCKET');
    if (!bucket) return this.deleteFromLocal(relativePath);

    try {
      const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
      const client = new S3Client({
        region: this.config.get('S3_REGION', 'us-east-1'),
      });
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: relativePath }));
      return true;
    } catch {
      return false;
    }
  }

  private async deleteFromR2(relativePath: string): Promise<boolean> {
    const client = this.getR2Client();
    if (!client) return this.deleteFromLocal(relativePath);

    try {
      const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
      const bucket = this.config.get('R2_BUCKET');
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: relativePath }));
      return true;
    } catch {
      return false;
    }
  }

  private async readFromS3(
    relativePath: string,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const bucket = this.config.get('S3_BUCKET');
    if (!bucket) {
      return null;
    }

    try {
      const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
      const client = new S3Client({
        region: this.config.get('S3_REGION', 'us-east-1'),
      });
      const response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: relativePath }),
      );

      return {
        buffer: await this.objectBodyToBuffer(response.Body),
        mimeType: response.ContentType || this.getMimeTypeForPath(relativePath),
      };
    } catch (error: any) {
      this.logger.warn(`S3 remote read failed for "${relativePath}": ${error.message}`);
      return null;
    }
  }

  private async readFromR2(
    relativePath: string,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const client = this.getR2Client();
    const bucket = this.config.get('R2_BUCKET');
    if (!client || !bucket) {
      return null;
    }

    try {
      const { GetObjectCommand } = require('@aws-sdk/client-s3');
      const response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: relativePath }),
      );

      return {
        buffer: await this.objectBodyToBuffer(response.Body),
        mimeType: response.ContentType || this.getMimeTypeForPath(relativePath),
      };
    } catch (error: any) {
      this.logger.warn(`R2 remote read failed for "${relativePath}": ${error.message}`);
      return null;
    }
  }

  private async objectBodyToBuffer(body: any): Promise<Buffer> {
    if (!body) {
      return Buffer.alloc(0);
    }

    if (Buffer.isBuffer(body)) {
      return body;
    }

    if (typeof body.transformToByteArray === 'function') {
      return Buffer.from(await body.transformToByteArray());
    }

    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<any>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  /**
   * Obtém extensão do arquivo baseado no MIME type
   */
  private getExtensionFromMime(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'audio/mpeg': '.mp3',
      'audio/mp3': '.mp3',
      'audio/ogg': '.ogg',
      'audio/wav': '.wav',
      'audio/webm': '.webm',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'application/pdf': '.pdf',
      'application/json': '.json',
      'text/plain': '.txt',
    };
    return mimeToExt[mimeType] || '';
  }

  private buildLocalAccessUrl(
    relativePath: string,
    options: {
      expiresInSeconds?: number;
      downloadName?: string;
    } = {},
  ): string {
    const payload: { p: string; exp?: number; d?: string } = {
      p: this.normalizeRelativePath(relativePath),
    };

    if (
      typeof options.expiresInSeconds === 'number' &&
      Number.isFinite(options.expiresInSeconds) &&
      options.expiresInSeconds > 0
    ) {
      payload.exp = Date.now() + options.expiresInSeconds * 1000;
    }

    if (options.downloadName) {
      payload.d = options.downloadName;
    }

    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const token = `${encodedPayload}.${this.sign(encodedPayload)}`;
    return `${this.baseUrl}/storage/local/${token}`;
  }

  private buildProxyAccessUrl(
    relativePath: string,
    options: {
      expiresInSeconds?: number;
      downloadName?: string;
    } = {},
  ): string {
    const payload: { p: string; exp?: number; d?: string } = {
      p: this.normalizeRelativePath(relativePath),
    };

    if (
      typeof options.expiresInSeconds === 'number' &&
      Number.isFinite(options.expiresInSeconds) &&
      options.expiresInSeconds > 0
    ) {
      payload.exp = Date.now() + options.expiresInSeconds * 1000;
    }

    if (options.downloadName) {
      payload.d = options.downloadName;
    }

    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const token = `${encodedPayload}.${this.sign(encodedPayload)}`;
    return `${this.baseUrl}/storage/access/${token}`;
  }

  private buildRemotePublicUrl(relativePath: string): string {
    const cdnBase = this.config.get('CDN_BASE_URL');
    if (cdnBase) {
      return `${cdnBase}/${relativePath}`;
    }

    if (this.driver === 's3') {
      const bucket = this.config.get('S3_BUCKET');
      const region = this.config.get('S3_REGION', 'us-east-1');
      if (bucket) {
        return `https://${bucket}.s3.${region}.amazonaws.com/${relativePath}`;
      }
    }

    if (this.driver === 'r2') {
      return this.buildR2PublicUrl(relativePath);
    }

    this.logger.warn(
      `Remote storage URL fallback used for "${relativePath}". Serving a signed local URL instead of exposing /uploads.`,
    );
    return this.buildLocalAccessUrl(relativePath);
  }

  private sign(value: string): string {
    return createHmac('sha256', this.signingSecret).update(value).digest('base64url');
  }

  private normalizeRelativePath(relativePath: string): string {
    const normalized = path.posix
      .normalize(String(relativePath || '').replace(/\\/g, '/'))
      .replace(/^\/+/, '');

    if (
      !normalized ||
      normalized === '.' ||
      normalized.startsWith('..') ||
      normalized.includes('/../')
    ) {
      throw new Error('invalid_storage_path');
    }

    return normalized;
  }

  private resolveAbsolutePath(relativePath: string): string {
    const normalized = this.normalizeRelativePath(relativePath);
    const fullPath = path.resolve(this.uploadsDir, normalized);
    const uploadsRoot = path.resolve(this.uploadsDir);

    if (fullPath !== uploadsRoot && !fullPath.startsWith(`${uploadsRoot}${path.sep}`)) {
      throw new Error('invalid_storage_path');
    }

    return fullPath;
  }
}
