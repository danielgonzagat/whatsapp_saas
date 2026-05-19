import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';

jest.mock('../auth/jwt-auth.guard', () => ({
  JwtAuthGuard: class MockJwtAuthGuard {
    canActivate() {
      return true;
    }
  },
}));

jest.mock('../auth/workspace-access', () => ({
  resolveWorkspaceId: jest.fn((req: { user?: { workspaceId?: string } }, explicit?: string) => {
    return explicit || req.user?.workspaceId || 'ws-default';
  }),
}));

describe('VideoController', () => {
  let controller: VideoController;
  let service: { createJob: jest.Mock; getJob: jest.Mock; listJobs: jest.Mock };

  beforeEach(async () => {
    service = {
      createJob: jest.fn(),
      getJob: jest.fn(),
      listJobs: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VideoController],
      providers: [{ provide: VideoService, useValue: service }],
    }).compile();

    controller = module.get<VideoController>(VideoController);
  });

  describe('createJob', () => {
    it('creates a media job via service', async () => {
      const job = { id: 'job-1', status: 'PENDING' };
      service.createJob.mockResolvedValue(job);
      const req = { user: { workspaceId: 'ws-1' } } as never;

      const result = await controller.createJob(req, {
        inputUrl: 'https://example.com/video.mp4',
        prompt: 'Cinematic',
      });

      expect(result).toEqual(job);
      expect(service.createJob).toHaveBeenCalledWith(
        'ws-1',
        'https://example.com/video.mp4',
        'Cinematic',
      );
    });

    it('propagates error from service when creation fails', async () => {
      service.createJob.mockRejectedValue(new Error('DB error'));
      const req = { user: { workspaceId: 'ws-1' } } as never;

      await expect(controller.createJob(req, { inputUrl: 'url', prompt: 'test' })).rejects.toThrow(
        'DB error',
      );
    });
  });

  describe('getJob', () => {
    it('returns the job when it exists and belongs to workspace', async () => {
      const job = { id: 'job-1', workspaceId: 'ws-1', status: 'PENDING' };
      service.getJob.mockResolvedValue(job);
      const req = { user: { workspaceId: 'ws-1' } } as never;

      const result = await controller.getJob(req, 'job-1');

      expect(result).toEqual(job);
      expect(service.getJob).toHaveBeenCalledWith('job-1', 'ws-1');
    });

    it('throws NotFoundException when job does not exist', async () => {
      service.getJob.mockRejectedValue(new NotFoundException('Job não encontrado'));
      const req = { user: { workspaceId: 'ws-1' } } as never;

      await expect(controller.getJob(req, 'nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when job belongs to another workspace', async () => {
      service.getJob.mockRejectedValue(new ForbiddenException('Job não pertence a este workspace'));
      const req = { user: { workspaceId: 'ws-1' } } as never;

      await expect(controller.getJob(req, 'job-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listJobs', () => {
    it('returns jobs for the workspace', async () => {
      const jobs = [{ id: 'j1' }, { id: 'j2' }];
      service.listJobs.mockResolvedValue(jobs);
      const req = { user: { workspaceId: 'ws-1' } } as never;

      const result = await controller.listJobs(req);

      expect(result).toEqual(jobs);
      expect(service.listJobs).toHaveBeenCalledWith('ws-1');
    });
  });
});
