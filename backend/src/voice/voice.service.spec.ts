import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceService } from './voice.service';

const voiceMockAdd = jest.fn();

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: voiceMockAdd,
  })),
  get __mockAdd() {
    return voiceMockAdd;
  },
}));

jest.mock('../common/redis/redis.util', () => ({
  createRedisClient: jest.fn().mockReturnValue({}),
}));

describe('VoiceService', () => {
  let service: VoiceService;
  let prisma: {
    voiceProfile: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
    voiceJob: {
      create: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      voiceProfile: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      voiceJob: {
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [VoiceService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<VoiceService>(VoiceService);
  });

  describe('createVoiceProfile', () => {
    it('creates a voice profile with workspace id', async () => {
      const profile = {
        id: 'vp-1',
        workspaceId: 'ws-1',
        name: 'John',
        provider: 'OPENAI',
        voiceId: 'voice-123',
      };
      prisma.voiceProfile.create.mockResolvedValue(profile);

      const result = await service.createVoiceProfile('ws-1', {
        name: 'John',
        provider: 'OPENAI',
        voiceId: 'voice-123',
      });

      expect(result).toEqual(profile);
      expect(prisma.voiceProfile.create).toHaveBeenCalledWith({
        data: {
          name: 'John',
          provider: 'OPENAI',
          voiceId: 'voice-123',
          workspaceId: 'ws-1',
        },
      });
    });
  });

  describe('generateAudio', () => {
    const data = { profileId: 'vp-1', text: 'Hello world' };

    it('throws ForbiddenException when profile does not exist', async () => {
      prisma.voiceProfile.findUnique.mockResolvedValue(null);

      await expect(service.generateAudio('ws-1', data)).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when profile belongs to different workspace', async () => {
      prisma.voiceProfile.findUnique.mockResolvedValue({
        workspaceId: 'other-ws',
      });

      await expect(service.generateAudio('ws-1', data)).rejects.toThrow(ForbiddenException);
    });

    it('creates a voice job and enqueues it when profile is valid', async () => {
      prisma.voiceProfile.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
      });
      prisma.voiceJob.create.mockResolvedValue({
        id: 'job-1',
        text: 'Hello world',
        profileId: 'vp-1',
        workspaceId: 'ws-1',
        status: 'PENDING',
      });

      const result = await service.generateAudio('ws-1', data);

      expect(result).toMatchObject({
        id: 'job-1',
        status: 'PENDING',
        workspaceId: 'ws-1',
      });
      expect(prisma.voiceJob.create).toHaveBeenCalledWith({
        data: {
          text: 'Hello world',
          profileId: 'vp-1',
          workspaceId: 'ws-1',
          status: 'PENDING',
        },
      });
    });

    it('enqueues the job with correct payload', async () => {
      prisma.voiceProfile.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
      });
      prisma.voiceJob.create.mockResolvedValue({
        id: 'job-99',
        text: 'Test',
        profileId: 'vp-1',
        workspaceId: 'ws-1',
        status: 'PENDING',
      });

      await service.generateAudio('ws-1', data);

      expect(voiceMockAdd).toHaveBeenCalledWith('generate-audio', {
        jobId: 'job-99',
        workspaceId: 'ws-1',
        text: 'Hello world',
        profileId: 'vp-1',
      });
    });
  });

  describe('getProfiles', () => {
    it('returns profiles for the given workspace with expected select', async () => {
      const profiles = [
        {
          id: 'vp-1',
          workspaceId: 'ws-1',
          name: 'Voice A',
          provider: 'OPENAI',
          voiceId: 'v1',
          createdAt: new Date(),
        },
        {
          id: 'vp-2',
          workspaceId: 'ws-1',
          name: 'Voice B',
          provider: 'OPENAI',
          voiceId: 'v2',
          createdAt: new Date(),
        },
      ];
      prisma.voiceProfile.findMany.mockResolvedValue(profiles);

      const result = await service.getProfiles('ws-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 'vp-1', name: 'Voice A' });
      expect(prisma.voiceProfile.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
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
    });

    it('returns empty array when workspace has no profiles', async () => {
      prisma.voiceProfile.findMany.mockResolvedValue([]);

      const result = await service.getProfiles('ws-empty');

      expect(result).toEqual([]);
    });
  });
});
