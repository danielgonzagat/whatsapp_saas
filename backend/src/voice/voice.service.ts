import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { createBullMqConnectionOptions } from '../common/redis/redis.util';
import { PrismaService } from '../prisma/prisma.service';
import { QUEUE_NAMES } from '../queue/queue-names.const';
import {
  emitVoiceActionExecutedPercept,
  emitVoiceCloneCreatedPercept,
} from './voice-percept-emit.helper';

/** Voice service. */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private voiceQueue: Queue;

  constructor(private prisma: PrismaService) {
    this.logger.log('VoiceService initialized');
    const connection = createBullMqConnectionOptions();
    this.voiceQueue = new Queue(QUEUE_NAMES.VOICE, { connection });
  }

  /** Create voice profile. */
  async createVoiceProfile(
    workspaceId: string,
    data: { name: string; provider: string; voiceId: string },
  ) {
    const profile = await this.prisma.voiceProfile.create({
      data: {
        ...data,
        workspaceId,
      },
    });

    // ADDITIVE, flag-gated (KLOEL_VOICE_PERCEPT_ENABLED, DEFAULT OFF),
    // fire-and-forget: emit ONE canonical `cognition.voice.clone_created`
    // percept into the Mind spine outbox so the cognition loop is aware a
    // workspace cloned/configured a voice. Never blocks or breaks the create.
    void emitVoiceCloneCreatedPercept(this.prisma, this.logger, {
      workspaceId,
      profileId: profile.id,
      provider: profile.provider,
    });

    return profile;
  }

  /** Generate audio. */
  async generateAudio(workspaceId: string, data: { profileId: string; text: string }) {
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
      workspaceId,
      text: data.text,
      profileId: data.profileId,
    });

    // ADDITIVE, flag-gated (KLOEL_VOICE_PERCEPT_ENABLED, DEFAULT OFF),
    // fire-and-forget: emit ONE canonical `cognition.voice.action_executed`
    // percept into the Mind spine outbox so the cognition loop is aware a
    // workspace dispatched a voice (text-to-speech) action. Never blocks or
    // breaks the job dispatch.
    void emitVoiceActionExecutedPercept(this.prisma, this.logger, {
      workspaceId,
      jobId: job.id,
      profileId: data.profileId,
      textLength: data.text.length,
    });

    return job;
  }

  /** Get profiles. */
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
