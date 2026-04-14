import { ForbiddenException, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createRedisClient } from '../common/redis/redis.util';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class VoiceService {
  private voiceQueue: Queue;

  constructor(private prisma: PrismaService) {
    const connection = createRedisClient();
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
      throw new ForbiddenException('Perfil de voz não pertence a este workspace');
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
    return this.prisma.voiceProfile.findMany({
      where: { workspaceId },
      select: {
        id: true,
        workspaceId: true,
        name: true,
        provider: true,
        voiceId: true,
        createdAt: true,
      },
      take: 50,
    });
  }
}
