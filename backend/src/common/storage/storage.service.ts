import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: string;
  private readonly uploadsDir: string;
  private readonly baseUrl: string;

  constructor(private config: ConfigService) {
    this.driver = this.config.get('STORAGE_DRIVER', 'local');
    this.uploadsDir = path.join(__dirname, '..', '..', '..', 'uploads');
    this.baseUrl = this.config.get('CDN_BASE_URL') || 
                   this.config.get('MEDIA_BASE_URL') || 
                   this.config.get('APP_URL', 'http://localhost:3001');
    
    // Garantir que o diretório de uploads existe
    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
    
    this.logger.log(`StorageService initialized with driver: ${this.driver}`);
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
  async uploadAudio(
    buffer: Buffer,
    workspaceId: string,
  ): Promise<{ url: string; path: string }> {
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
   * Upload para sistema de arquivos local
   */
  private async uploadToLocal(
    buffer: Buffer,
    relativePath: string,
  ): Promise<{ url: string; path: string; size: number }> {
    const fullPath = path.join(this.uploadsDir, relativePath);
    const dir = path.dirname(fullPath);

    // Criar diretório se não existir
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Escrever arquivo
    fs.writeFileSync(fullPath, buffer);

    const url = `${this.baseUrl}/uploads/${relativePath}`;
    
    this.logger.debug(`Uploaded to local: ${relativePath} (${buffer.length} bytes)`);
    
    return {
      url,
      path: relativePath,
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
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
      
      const client = new S3Client({ region });
      
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: relativePath,
        Body: buffer,
        ContentType: mimeType || 'application/octet-stream',
        ACL: 'public-read',
      }));

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
    const bucket = this.config.get('R2_BUCKET');
    const accountId = this.config.get('R2_ACCOUNT_ID');
    const accessKeyId = this.config.get('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get('R2_SECRET_ACCESS_KEY');
    
    if (!bucket || !accountId || !accessKeyId || !secretAccessKey) {
      this.logger.warn('R2 not fully configured, falling back to local storage');
      return this.uploadToLocal(buffer, relativePath);
    }

    try {
      // R2 usa API compatível com S3
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
      
      const client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });

      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: relativePath,
        Body: buffer,
        ContentType: mimeType || 'application/octet-stream',
      }));

      const cdnBase = this.config.get('CDN_BASE_URL');
      const url = cdnBase 
        ? `${cdnBase}/${relativePath}`
        : `https://${bucket}.${accountId}.r2.cloudflarestorage.com/${relativePath}`;

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
    const fullPath = path.join(this.uploadsDir, relativePath);
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
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
      const client = new S3Client({ region: this.config.get('S3_REGION', 'us-east-1') });
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: relativePath }));
      return true;
    } catch {
      return false;
    }
  }

  private async deleteFromR2(relativePath: string): Promise<boolean> {
    // Similar ao S3, R2 usa mesma API
    return this.deleteFromS3(relativePath);
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

  /**
   * Gera URL pública para um arquivo existente
   */
  getPublicUrl(relativePath: string): string {
    return `${this.baseUrl}/uploads/${relativePath}`;
  }
}
