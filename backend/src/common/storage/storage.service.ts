import { safeJoin, safeResolve } from '../../common/safe-path';
import { createHmac, timingSafeEqual } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuid } from 'uuid';
import { getTraceHeaders } from '../trace-headers';
import { validateNoInternalAccess } from '../utils/url-validator';
import { StorageDriversService } from './storage-drivers.service';

const BACKSLASH_RE = /\\/g;
const LEADING_SLASHES_RE = /^\/+/;

/** Storage service. */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: string;
  private readonly uploadsDir: string;
  private readonly baseUrl: string;
  private readonly signingSecret: string;

  constructor(
    private config: ConfigService,
    private readonly drivers: StorageDriversService,
  ) {
    this.driver = this.config.get('STORAGE_DRIVER', 'local');
    this.uploadsDir = safeJoin(__dirname, '..', '..', '..', 'uploads');
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

  /** On module init. */
  async onModuleInit() {
    if (this.driver === 'r2') {
      try {
        await this.drivers.verifyR2Connection();
      } catch (error: unknown) {
        const errorMsg =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'unknown error';
        this.logger.warn(
          `R2 connection check failed: ${errorMsg}. Uploads will fall back to local storage.`,
        );
      }
    }
  }

  /** Upload. */
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
    const relativePath = safeJoin(folder, filename);
    switch (this.driver) {
      case 's3':
        return this.drivers.uploadToS3(buffer, relativePath, options.mimeType, (b, p) =>
          this.uploadToLocal(b, p),
        );
      case 'r2':
        return this.drivers.uploadToR2(buffer, relativePath, options.mimeType, (b, p) =>
          this.uploadToLocal(b, p),
        );
      default:
        return this.uploadToLocal(buffer, relativePath);
    }
  }

  /** Upload audio. */
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

  /** Upload avatar. */
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

  /** Upload product image. */
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

  /** Upload whats app media. */
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

  /** Upload from url. */
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
      headers: getTraceHeaders(),
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

  /** Health check. */
  async healthCheck(): Promise<{
    status: 'UP' | 'DOWN' | 'DEGRADED';
    driver: string;
    details?: Record<string, unknown>;
  }> {
    if (this.isLocalDriver()) {
      const writable = this.drivers.isLocalWritable(this.uploadsDir);
      return {
        status: writable ? 'UP' : 'DOWN',
        driver: 'local',
        details: { uploadsDir: this.uploadsDir, writable },
      };
    }
    if (this.driver === 'r2') {
      return this.drivers.checkR2Health(this.uploadsDir);
    }
    if (this.driver === 's3') {
      return this.drivers.checkS3Health();
    }
    return {
      status: 'DOWN',
      driver: this.driver,
      details: { error: 'Unknown driver' },
    };
  }

  /** Is local driver. */
  isLocalDriver(): boolean {
    return this.driver === 'local';
  }

  /** Get public url. */
  getPublicUrl(relativePath: string): string {
    const normalized = this.normalizeRelativePath(relativePath);
    if (this.isLocalDriver()) {
      return this.buildLocalAccessUrl(normalized);
    }
    return this.buildRemotePublicUrl(normalized);
  }

  /** Get signed url. */
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

  /** Resolve local access token. */
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

  /** Get mime type for path. */
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

  /** Read local file. */
  readLocalFile(relativePath: string): Buffer {
    const fullPath = this.resolveAbsolutePath(relativePath);
    return fs.readFileSync(fullPath);
  }

  /** Read access file. */
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
        return this.drivers.readFromR2(normalized, (p) => this.getMimeTypeForPath(p));
      case 's3':
        return this.drivers.readFromS3(normalized, (p) => this.getMimeTypeForPath(p));
      default:
        return null;
    }
  }

  private async uploadToLocal(
    buffer: Buffer,
    relativePath: string,
  ): Promise<{ url: string; path: string; size: number }> {
    const normalizedPath = this.normalizeRelativePath(relativePath);
    const fullPath = this.resolveAbsolutePath(normalizedPath);
    const dir = path.dirname(fullPath);
    // Criar diretório se não existir
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
    // Escrever arquivo
    await fs.promises.writeFile(fullPath, buffer);
    const url = this.getPublicUrl(normalizedPath);
    this.logger.debug(`Uploaded to local: ${normalizedPath} (${buffer.length} bytes)`);
    return {
      url,
      path: normalizedPath,
      size: buffer.length,
    };
  }

  /** Delete. */
  async delete(relativePath: string): Promise<boolean> {
    try {
      switch (this.driver) {
        case 's3':
          return this.drivers.deleteFromS3(relativePath, (p) => this.deleteFromLocal(p));
        case 'r2':
          return this.drivers.deleteFromR2(relativePath, (p) => this.deleteFromLocal(p));
        default:
          return this.deleteFromLocal(relativePath);
      }
    } catch (error: unknown) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'unknown error';
      this.logger.warn(`Failed to delete ${relativePath}: ${errorMsg}`);
      return false;
    }
  }

  private async deleteFromLocal(relativePath: string): Promise<boolean> {
    const fullPath = this.resolveAbsolutePath(relativePath);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
      return true;
    }
    return false;
  }

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
      const r2Url = this.drivers.buildR2PublicUrl(relativePath);
      if (r2Url) return r2Url;
    }
    this.logger.warn(
      `Remote storage URL fallback used for "${relativePath}". Serving a signed local URL instead of exposing /uploads.`,
    );
    return this.buildProxyAccessUrl(relativePath);
  }

  private sign(value: string): string {
    return createHmac('sha256', this.signingSecret).update(value).digest('base64url');
  }

  private normalizeRelativePath(relativePath: string): string {
    const normalized = path.posix
      .normalize(String(relativePath || '').replace(BACKSLASH_RE, '/'))
      .replace(LEADING_SLASHES_RE, '');
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
    const fullPath = safeResolve(this.uploadsDir, normalized);
    const uploadsRoot = safeResolve(this.uploadsDir);
    if (fullPath !== uploadsRoot && !fullPath.startsWith(`${uploadsRoot}${path.sep}`)) {
      throw new Error('invalid_storage_path');
    }
    return fullPath;
  }

  /** Build proxy access URL (exposed for controller use). */
  buildProxyToken(
    relativePath: string,
    options: { expiresInSeconds?: number; downloadName?: string } = {},
  ): string {
    return this.buildProxyAccessUrl(relativePath, options);
  }
}
