import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

@Injectable()
export class VoiceService {
  private voiceQueue: Queue;

  constructor(private prisma: PrismaService) {
    const connection = new Redis(
      process.env.REDIS_URL || 'redis://localhost:6379',
      {
        maxRetriesPerRequest: null,
      },
    );
    this.voiceQueue = new Queue('voice-jobs', { connection });
  }

  async createVoiceProfile(workspaceId: string, data: any) {
    return this.prisma.voiceProfile.create({
      data: {
        ...data,
        workspaceId,
      },
    });
  }

  async generateAudio(workspaceId: string, data: any) {
    // Validate profile belongs to workspace
    const profile = await this.prisma.voiceProfile.findUnique({
      where: { id: data.profileId },
      select: { workspaceId: true },
    });
    if (!profile || profile.workspaceId !== workspaceId) {
      throw new ForbiddenException(
        'Perfil de voz não pertence a este workspace',
      );
    }

    // 1. Create Job
    const job = await this.prisma.voiceJob.create({
      data: {
        text: data.text,
        profileId: data.profileId,
        workspaceId,
        status: 'PENDING',
      },
    });

    // 2. Add to Queue
    await this.voiceQueue.add('generate-audio', {
      jobId: job.id,
      text: data.text,
      profileId: data.profileId,
    });

    return job;
  }

  async getProfiles(workspaceId: string) {
    return this.prisma.voiceProfile.findMany({ where: { workspaceId } });
  }
}
