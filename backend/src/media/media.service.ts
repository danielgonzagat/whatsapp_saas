import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

@Injectable()
export class MediaService {
  private mediaQueue: Queue;

  constructor(private prisma: PrismaService) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is required');
    }
    const connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });
    this.mediaQueue = new Queue('media-jobs', { connection });
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
}
