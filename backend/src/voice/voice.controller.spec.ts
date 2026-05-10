import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { VoiceController } from './voice.controller';
import { VoiceService } from './voice.service';
import { VoiceProvider } from './dto/create-voice-profile.dto';

jest.mock('../auth/jwt-auth.guard', () => ({
  JwtAuthGuard: class MockJwtAuthGuard {
    canActivate() {
      return true;
    }
  },
}));

jest.mock('../common/guards/workspace.guard', () => ({
  WorkspaceGuard: class MockWorkspaceGuard {
    canActivate() {
      return true;
    }
  },
}));

jest.mock('../auth/workspace-access', () => ({
  resolveWorkspaceId: jest.fn(
    (req: { user?: { workspaceId?: string } }, explicit?: string) => {
      return explicit || req.user?.workspaceId || 'ws-default';
    },
  ),
}));

describe('VoiceController', () => {
  let controller: VoiceController;
  let service: {
    createVoiceProfile: jest.Mock;
    getProfiles: jest.Mock;
    generateAudio: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      createVoiceProfile: jest.fn(),
      getProfiles: jest.fn(),
      generateAudio: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VoiceController],
      providers: [{ provide: VoiceService, useValue: service }],
    }).compile();

    controller = module.get<VoiceController>(VoiceController);
  });

  describe('createProfile', () => {
    it('creates a voice profile via service', async () => {
      const profile = { id: 'vp-1', name: 'Voice A', provider: VoiceProvider.OPENAI, voiceId: 'v1' };
      service.createVoiceProfile.mockResolvedValue(profile);
      const req = { user: { workspaceId: 'ws-1' } } as never;
      const body = { name: 'Voice A', provider: VoiceProvider.OPENAI, voiceId: 'v1' };

      const result = await controller.createProfile(req, body);

      expect(result).toEqual(profile);
      expect(service.createVoiceProfile).toHaveBeenCalledWith('ws-1', body);
    });

    it('propagates error when service fails to create profile', async () => {
      service.createVoiceProfile.mockRejectedValue(new Error('Duplicate voiceId'));
      const req = { user: { workspaceId: 'ws-1' } } as never;
      const body = { name: 'Dup', provider: VoiceProvider.OPENAI, voiceId: 'v1' };

      await expect(controller.createProfile(req, body)).rejects.toThrow('Duplicate voiceId');
    });
  });

  describe('getProfiles', () => {
    it('returns profiles for the workspace', async () => {
      const profiles = [{ id: 'vp-1', name: 'Voice A' }];
      service.getProfiles.mockResolvedValue(profiles);
      const req = { user: { workspaceId: 'ws-1' } } as never;

      const result = await controller.getProfiles(req, 'ws-1');

      expect(result).toEqual(profiles);
      expect(service.getProfiles).toHaveBeenCalledWith('ws-1');
    });

    it('passes explicit workspaceId when provided as query param', async () => {
      service.getProfiles.mockResolvedValue([]);
      const req = { user: { workspaceId: 'ws-token' } } as never;

      await controller.getProfiles(req, 'ws-explicit');

      expect(service.getProfiles).toHaveBeenCalledWith('ws-explicit');
    });
  });

  describe('generate', () => {
    it('generates audio via service', async () => {
      const job = { id: 'job-1', status: 'PENDING' };
      service.generateAudio.mockResolvedValue(job);
      const req = { user: { workspaceId: 'ws-1' } } as never;
      const body = { profileId: 'vp-1', text: 'Hello world' };

      const result = await controller.generate(req, body);

      expect(result).toEqual(job);
      expect(service.generateAudio).toHaveBeenCalledWith('ws-1', body);
    });

    it('throws ForbiddenException when profile does not belong to workspace', async () => {
      service.generateAudio.mockRejectedValue(
        new ForbiddenException('Perfil de voz não pertence a este workspace'),
      );
      const req = { user: { workspaceId: 'ws-1' } } as never;
      const body = { profileId: 'vp-other', text: 'Test' };

      await expect(controller.generate(req, body)).rejects.toThrow(ForbiddenException);
    });

    it('propagates unexpected errors from service', async () => {
      service.generateAudio.mockRejectedValue(new Error('Queue connection lost'));
      const req = { user: { workspaceId: 'ws-1' } } as never;
      const body = { profileId: 'vp-1', text: 'Test' };

      await expect(controller.generate(req, body)).rejects.toThrow('Queue connection lost');
    });
  });
});
