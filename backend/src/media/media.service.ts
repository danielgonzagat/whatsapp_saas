import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Queue } from 'bullmq';
import { createRedisClient } from '../common/redis/redis.util';
import { extname } from 'path';
import { v4 as uuid } from 'uuid';
import { StorageService } from '../common/storage/storage.service';

@Injectable()
export class MediaService {
  private mediaQueue: Queue;
  private prismaAny: any;
  private readonly baseUrl: string;

  constructor(
    private prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {
    const connection = createRedisClient();
    this.mediaQueue = new Queue('media-jobs', { connection });
    this.prismaAny = prisma as Record<string, any>;
    this.baseUrl =
      this.config.get('MEDIA_BASE_URL') ||
      this.config.get('APP_URL', 'http://localhost:3001');
  }

  async createVideoJob(workspaceId: string, data: any) {
    const job = await this.prisma.mediaJob.create({
      data: {
        workspaceId,
        type: 'VIDEO_GENERATION',
        status: 'PENDING',
        inputUrl: data.imageUrl,
        prompt: data.prompt,
      },
    });
 // PULSE:OK — worker processor pending implementation
    await this.mediaQueue.add('generate-video', {
      jobId: job.id,
      inputUrl: data.imageUrl,
      prompt: data.prompt,
    });

    return job;
  }

  async getJobStatus(id: string, workspaceId: string) {
    const job = await this.prisma.mediaJob.findUnique({ where: { id } });
    if (!job) {
      throw new NotFoundException('Job não encontrado');
    }
    if (job.workspaceId !== workspaceId) {
      throw new ForbiddenException('Job não pertence a este workspace');
    }
    return job;
  }

  // ============ DOCUMENTOS / CATÁLOGOS ============

  /**
   * Upload de documento/catálogo
   */
  async uploadDocument(
    workspaceId: string,
    file: any,
    metadata: { name?: string; description?: string; category?: string },
  ) {
    if (!file?.buffer) {
      throw new BadRequestException('Arquivo inválido');
    }

    const stored = await this.storage.upload(file.buffer, {
      filename: `${uuid()}${extname(file.originalname || '')}`,
      mimeType: file.mimetype,
      folder: 'documents',
      workspaceId,
    });

    const doc = await this.prismaAny.document.create({
      data: {
        workspaceId,
        name: metadata.name || file.originalname,
        fileName: file.originalname,
        filePath: stored.path,
        mimeType: file.mimetype,
        fileSize: file.size,
        description: metadata.description,
        category: metadata.category,
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
    const where: any = { workspaceId, isActive: true };
    if (category) {
      where.category = category;
    }

    const documents = await this.prismaAny.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return {
      documents: documents.map((doc: any) => ({
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
    let doc = await this.prismaAny.document.findFirst({
      where: {
        workspaceId,
        id: idOrName,
        isActive: true,
      },
    });

    // Se não encontrar, busca por nome
    if (!doc) {
      doc = await this.prismaAny.document.findFirst({
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

    const response = await fetch(
      this.storage.getSignedUrl(doc.filePath, {
        downloadName: doc.fileName,
      }),
      { signal: AbortSignal.timeout(30000) },
    );
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
    const doc = await this.prismaAny.document.findFirst({
      where: { workspaceId, id },
    });

    if (!doc) {
      throw new NotFoundException('Documento não encontrado');
    }

    await this.prismaAny.document.update({
      where: { id },
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
