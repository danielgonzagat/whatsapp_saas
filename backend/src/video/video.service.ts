import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VideoService {
  constructor(private prisma: PrismaService) {}

  async createJob(workspaceId: string, inputUrl: string, prompt: string) {
    return this.prisma.mediaJob.create({
      data: {
        workspaceId,
        type: 'VIDEO_GENERATION',
        status: 'PENDING',
        inputUrl,
        prompt,
      },
    });
  }

  async getJob(id: string, workspaceId: string) {
    const job = await this.prisma.mediaJob.findUnique({
      where: { id },
      select: {
        id: true,
        workspaceId: true,
        status: true,
        type: true,
        inputUrl: true,
        prompt: true,
        outputUrl: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!job) throw new NotFoundException('Job não encontrado');
    if (job.workspaceId !== workspaceId) {
      throw new ForbiddenException('Job não pertence a este workspace');
    }
    return job;
  }

  async listJobs(workspaceId: string) {
    return this.prisma.mediaJob.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
