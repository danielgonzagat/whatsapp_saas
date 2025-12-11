import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Queue } from 'bullmq';
import { createRedisClient } from '../common/redis/redis.util';
import * as fs from 'fs';
import { join } from 'path';

@Injectable()
export class MediaService {
  private mediaQueue: Queue;
  private prismaAny: any;

  constructor(private prisma: PrismaService) {
    const connection = createRedisClient();
    this.mediaQueue = new Queue('media-jobs', { connection });
    this.prismaAny = prisma as any;
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
    const doc = await this.prismaAny.document.create({
      data: {
        workspaceId,
        name: metadata.name || file.originalname,
        fileName: file.originalname,
        filePath: file.filename, // Nome único gerado pelo multer
        mimeType: file.mimetype,
        fileSize: file.size,
        description: metadata.description,
        category: metadata.category,
        isActive: true,
      },
    });

    return {
      success: true,
      document: doc,
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
      documents,
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

    return doc;
  }

  /**
   * Lê o arquivo do disco e retorna como Buffer
   */
  async getDocumentFile(workspaceId: string, idOrName: string): Promise<{
    buffer: Buffer;
    mimeType: string;
    fileName: string;
  }> {
    const doc = await this.getDocument(workspaceId, idOrName);
    const filePath = join(__dirname, '..', '..', '..', 'uploads', doc.filePath);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Arquivo físico não encontrado');
    }

    const buffer = fs.readFileSync(filePath);
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
}
