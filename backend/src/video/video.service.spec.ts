import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { VideoService } from './video.service';

describe('VideoService', () => {
  let service: VideoService;
  let prisma: {
    mediaJob: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      mediaJob: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [VideoService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<VideoService>(VideoService);
  });

  describe('createJob', () => {
    it('creates a media job with VIDEO_GENERATION type and PENDING status', async () => {
      const job = {
        id: 'job-1',
        workspaceId: 'ws-1',
        type: 'VIDEO_GENERATION',
        status: 'PENDING',
        inputUrl: 'https://example.com/video.mp4',
        prompt: 'Make it cinematic',
      };
      prisma.mediaJob.create.mockResolvedValue(job);

      const result = await service.createJob(
        'ws-1',
        'https://example.com/video.mp4',
        'Make it cinematic',
      );

      expect(result).toEqual(job);
      expect(prisma.mediaJob.create).toHaveBeenCalledWith({
        data: {
          workspaceId: 'ws-1',
          type: 'VIDEO_GENERATION',
          status: 'PENDING',
          inputUrl: 'https://example.com/video.mp4',
          prompt: 'Make it cinematic',
        },
      });
    });
  });

  describe('getJob', () => {
    const jobFixture = {
      id: 'job-1',
      workspaceId: 'ws-1',
      type: 'VIDEO_GENERATION',
      status: 'PENDING',
      inputUrl: 'https://example.com/video.mp4',
      prompt: 'Make it cinematic',
      outputUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('throws NotFoundException when job does not exist', async () => {
      prisma.mediaJob.findUnique.mockResolvedValue(null);

      await expect(service.getJob('nonexistent', 'ws-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when job belongs to different workspace', async () => {
      prisma.mediaJob.findUnique.mockResolvedValue({
        ...jobFixture,
        workspaceId: 'other-ws',
      });

      await expect(service.getJob('job-1', 'ws-1')).rejects.toThrow(ForbiddenException);
    });

    it('returns the job when it exists and belongs to the workspace', async () => {
      prisma.mediaJob.findUnique.mockResolvedValue(jobFixture);

      const result = await service.getJob('job-1', 'ws-1');

      expect(result).toEqual(jobFixture);
      expect(prisma.mediaJob.findUnique).toHaveBeenCalledWith({
        where: { id: 'job-1' },
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
    });
  });

  describe('listJobs', () => {
    it('returns jobs for the given workspace ordered by createdAt desc', async () => {
      const jobs = [
        {
          id: 'job-2',
          workspaceId: 'ws-1',
          type: 'VIDEO_GENERATION',
          status: 'COMPLETED',
          inputUrl: 'https://example.com/v2.mp4',
          outputUrl: 'https://cdn.example.com/v2-out.mp4',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'job-1',
          workspaceId: 'ws-1',
          type: 'VIDEO_GENERATION',
          status: 'PENDING',
          inputUrl: 'https://example.com/v1.mp4',
          outputUrl: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      prisma.mediaJob.findMany.mockResolvedValue(jobs);

      const result = await service.listJobs('ws-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 'job-2', status: 'COMPLETED' });
      expect(prisma.mediaJob.findMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        select: {
          id: true,
          workspaceId: true,
          type: true,
          status: true,
          inputUrl: true,
          outputUrl: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });
    });

    it('returns empty array when workspace has no jobs', async () => {
      prisma.mediaJob.findMany.mockResolvedValue([]);

      const result = await service.listJobs('ws-empty');

      expect(result).toEqual([]);
    });
  });
});
