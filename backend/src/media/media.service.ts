import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { createBullMqConnectionOptions } from '../common/redis/redis.util';
import { StorageService } from '../common/storage/storage.service';
import { getTraceHeaders } from '../common/trace-headers';
import { safeStorageFetch } from '../common/utils/url-safety';
import { collectAllowedHosts, validateNoInternalAccess } from '../common/utils/url-validator';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_NAMES } from '../queue/queue-names.const';

/**
 * Decode a base64 image payload — accepts a bare base64 string or a full
 * `data:<mime>;base64,<...>` URL. Returns the decoded bytes plus the resolved
 * MIME type (explicit `mimeTypeHint` wins, then the data-URL prefix, then a
 * sensible image default). Invalid payloads yield an empty buffer so callers
 * can short-circuit with an honest error.
 */
function decodeBase64Image(
  input: string,
  mimeTypeHint?: string,
): { buffer: Buffer; mimeType: string } {
  let raw = input.trim();
  let dataUrlMime: string | undefined;
  const dataUrlMatch = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(raw);
  if (dataUrlMatch) {
    dataUrlMime = dataUrlMatch[1] || undefined;
    raw = dataUrlMatch[2] ?? '';
  }
  const buffer = (() => {
    try {
      return Buffer.from(raw, 'base64');
    } catch {
      return Buffer.alloc(0);
    }
  })();
  return {
    buffer,
    mimeType: mimeTypeHint || dataUrlMime || 'image/jpeg',
  };
}

/** Media service. */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private mediaQueue: Queue;
  private readonly baseUrl: string;
  private readonly allowedStorageHosts: Set<string>;
  private readonly allowHttpStorage: boolean;

  constructor(
    private prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {
    const connection = createBullMqConnectionOptions();
    this.mediaQueue = new Queue(QUEUE_NAMES.MEDIA, { connection });
    this.baseUrl =
      this.config.get('MEDIA_BASE_URL') || this.config.get('APP_URL', 'http://localhost:3001');
    this.allowedStorageHosts = collectAllowedHosts(
      this.config.get<string>('MEDIA_ALLOWED_STORAGE_HOSTS'),
      this.config.get<string>('S3_PUBLIC_HOST'),
      this.config.get<string>('R2_PUBLIC_HOST'),
    );
    this.allowHttpStorage = this.config.get<string>('NODE_ENV') !== 'production';
  }

  /** Create video job. */
  async createVideoJob(workspaceId: string, data: { imageUrl: string; prompt?: string }) {
    validateNoInternalAccess(data.imageUrl);

    const job = await this.prisma.mediaJob.create({
      data: {
        workspaceId,
        type: 'VIDEO_GENERATION',
        status: 'PENDING',
        inputUrl: data.imageUrl,
        ...(data.prompt !== undefined ? { prompt: data.prompt } : {}),
      },
    });
    await this.mediaQueue.add('generate-video', {
      jobId: job.id,
      inputUrl: data.imageUrl,
      prompt: data.prompt,
    });

    return job;
  }

  /** Get job status. */
  async getJobStatus(id: string, workspaceId: string) {
    const job = await this.prisma.mediaJob.findFirst({ where: { id, workspaceId } });
    if (!job) {
      throw new NotFoundException('Job não encontrado');
    }
    return job;
  }

  /**
   * Attach an image sent in chat (or referenced by URL) to durable storage and
   * return the canonical stored URL.
   *
   * domainService alias: `MediaService.attach` — the first half of the compound
   * capabilities `products.upload_image` / `upload_product_image` /
   * `upload_plan_image` (`MediaService.attach + {Product,Plan}Service.setImage`).
   * It stores the bytes once, workspace-scoped, and hands the resulting URL to
   * the entity `setImage` step. Resolver call convention `(workspaceId, args)`,
   * returns the `{ success, data }` receipt envelope.
   *
   * Supported inputs (in priority order):
   *   - `imageBase64` / `imageData`: a base64 payload (optionally a `data:` URL)
   *     uploaded through the chat — decoded and stored via StorageService.
   *   - `imageUrl`: an external URL — fetched (SSRF-guarded) and re-hosted.
   */
  async attach(
    workspaceId: string,
    args: { imageBase64?: unknown; imageData?: unknown; imageUrl?: unknown; mimeType?: unknown },
  ): Promise<{
    success: boolean;
    data: { url: string; path: string; size: number } | null;
    error?: string;
  }> {
    const base64Input =
      typeof args.imageBase64 === 'string'
        ? args.imageBase64
        : typeof args.imageData === 'string'
          ? args.imageData
          : '';
    const imageUrl = typeof args.imageUrl === 'string' ? args.imageUrl.trim() : '';
    const mimeTypeArg = typeof args.mimeType === 'string' ? args.mimeType : undefined;

    if (base64Input) {
      const { buffer, mimeType } = decodeBase64Image(base64Input, mimeTypeArg);
      if (!buffer.length) {
        return { success: false, data: null, error: 'invalid_image_payload' };
      }
      const stored = await this.storage.upload(buffer, {
        folder: `media/${workspaceId}`,
        mimeType,
        workspaceId,
      });
      this.logger.log('Attached image from upload', {
        context: 'MediaService.attach',
        workspaceId,
        size: stored.size,
      });
      return { success: true, data: stored };
    }

    if (imageUrl) {
      const stored = await this.storage.uploadFromUrl(imageUrl, {
        folder: `media/${workspaceId}`,
        workspaceId,
        ...(mimeTypeArg !== undefined ? { mimeType: mimeTypeArg } : {}),
      });
      this.logger.log('Attached image from URL', {
        context: 'MediaService.attach',
        workspaceId,
        size: stored.size,
      });
      return { success: true, data: stored };
    }

    return { success: false, data: null, error: 'image_input_required' };
  }

  // ============ DOCUMENTOS / CATÁLOGOS ============

  /**
   * Upload de documento/catálogo
   */
  async uploadDocument(
    workspaceId: string,
    file: { buffer: Buffer; originalname?: string; mimetype?: string; size?: number },
    metadata: { name?: string; description?: string; category?: string },
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Arquivo inválido');
    }

    this.logger.log('Uploading document to storage', {
      context: 'MediaService.uploadDocument',
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
    });

    const uploadOpts: Record<string, unknown> = {
      filename: `${randomUUID()}${extname(file.originalname || '')}`,
      folder: 'documents',
      workspaceId,
    };
    if (file.mimetype) {
      uploadOpts.mimeType = file.mimetype;
    }
    const stored = await this.storage.upload(file.buffer, uploadOpts);

    const doc = await this.prisma.document.create({
      data: {
        workspaceId,
        name: metadata.name || file.originalname || 'document',
        fileName: file.originalname || 'file',
        filePath: stored.path,
        mimeType: file.mimetype || 'application/octet-stream',
        fileSize: file.size || 0,
        description: metadata.description || '',
        category: metadata.category || '',
        isActive: true,
      },
    });

    return {
      success: true,
      document: {
        ...doc,
        url: this.buildDocumentAccessUrl(doc.id),
      },
      message: `Documento "${doc.name}" enviado com sucesso!`,
    };
  }

  /**
   * Lista documentos do workspace
   */
  async listDocuments(workspaceId: string, category?: string) {
    const where: Record<string, unknown> = { workspaceId, isActive: true };
    if (category) {
      where.category = category;
    }

    const documents = await this.prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        workspaceId: true,
        name: true,
        fileName: true,
        filePath: true,
        mimeType: true,
        fileSize: true,
        description: true,
        category: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      documents: documents.map((doc) => ({
        ...doc,
        url: this.buildDocumentAccessUrl(doc.id),
      })),
      total: documents.length,
    };
  }

  /**
   * Busca documento por ID ou nome
   */
  async getDocument(workspaceId: string, idOrName: string) {
    // Tenta buscar por ID primeiro
    let doc = await this.prisma.document.findFirst({
      where: {
        workspaceId,
        id: idOrName,
        isActive: true,
      },
    });

    // Se não encontrar, busca por nome
    if (!doc) {
      doc = await this.prisma.document.findFirst({
        where: {
          workspaceId,
          name: { contains: idOrName, mode: 'insensitive' },
          isActive: true,
        },
      });
    }

    if (!doc) {
      throw new NotFoundException(`Documento "${idOrName}" não encontrado`);
    }

    return {
      ...doc,
      url: this.buildDocumentAccessUrl(doc.id),
    };
  }

  /**
   * Lê o arquivo do disco e retorna como Buffer
   */
  async getDocumentFile(
    workspaceId: string,
    idOrName: string,
  ): Promise<{
    buffer: Buffer;
    mimeType: string;
    fileName: string;
  }> {
    const doc = await this.getDocument(workspaceId, idOrName);
    if (this.storage.isLocalDriver()) {
      const buffer = this.storage.readLocalFile(doc.filePath);
      return {
        buffer,
        mimeType: doc.mimeType,
        fileName: doc.fileName,
      };
    }

    const signedUrl = this.storage.getSignedUrl(doc.filePath, {
      downloadName: doc.fileName,
    });
    this.logger.log('Fetching document from remote storage', {
      context: 'MediaService.getDocumentFile',
      documentId: doc.id,
    });
    const response = await safeStorageFetch(signedUrl, {
      allowedHosts: this.allowedStorageHosts,
      allowHttp: this.allowHttpStorage,
      init: {
        headers: getTraceHeaders(),
        signal: AbortSignal.timeout(30000),
      },
    });
    if (!response.ok) {
      throw new NotFoundException('Arquivo remoto não encontrado');
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      buffer,
      mimeType: doc.mimeType,
      fileName: doc.fileName,
    };
  }

  /**
   * Remove documento (soft delete)
   */
  async deleteDocument(workspaceId: string, id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { workspaceId, id },
    });

    if (!doc) {
      throw new NotFoundException('Documento não encontrado');
    }

    await this.prisma.document.updateMany({
      where: { id, workspaceId },
      data: { isActive: false },
    });

    return {
      success: true,
      message: `Documento "${doc.name}" removido com sucesso`,
    };
  }

  private buildDocumentAccessUrl(documentId: string) {
    return `${this.baseUrl}/media/documents/${encodeURIComponent(documentId)}/file`;
  }
}
