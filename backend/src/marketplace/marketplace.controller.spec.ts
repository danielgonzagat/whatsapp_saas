import { Test, TestingModule } from '@nestjs/testing';
import { MarketplaceController } from './marketplace.controller';
import { MarketplaceService } from './marketplace.service';

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

describe('MarketplaceController', () => {
  let controller: MarketplaceController;
  let service: { listTemplates: jest.Mock; installTemplate: jest.Mock };

  beforeEach(async () => {
    service = {
      listTemplates: jest.fn(),
      installTemplate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MarketplaceController],
      providers: [{ provide: MarketplaceService, useValue: service }],
    }).compile();

    controller = module.get<MarketplaceController>(MarketplaceController);
  });

  describe('listTemplates', () => {
    it('returns templates from service', async () => {
      const templates = [{ id: 't1', name: 'Welcome' }];
      service.listTemplates.mockResolvedValue(templates);

      const result = await controller.listTemplates('onboarding');

      expect(result).toEqual(templates);
      expect(service.listTemplates).toHaveBeenCalledWith('onboarding');
    });

    it('returns empty array when no templates exist', async () => {
      service.listTemplates.mockResolvedValue([]);

      const result = await controller.listTemplates();

      expect(result).toEqual([]);
      expect(service.listTemplates).toHaveBeenCalledWith(undefined);
    });

    it('propagates error from service', async () => {
      service.listTemplates.mockRejectedValue(new Error('DB down'));

      await expect(controller.listTemplates()).rejects.toThrow('DB down');
    });
  });

  describe('installTemplate', () => {
    it('creates flow via service using workspaceId from request', async () => {
      const flow = { id: 'f-1', name: 'My Flow' };
      service.installTemplate.mockResolvedValue(flow);
      const req = { user: { workspaceId: 'ws-1' } };

      const result = await controller.installTemplate(req, 'tpl-1');

      expect(result).toEqual(flow);
      expect(service.installTemplate).toHaveBeenCalledWith('ws-1', 'tpl-1');
    });

    it('throws when template is not found', async () => {
      service.installTemplate.mockRejectedValue(new Error('Template not found'));
      const req = { user: { workspaceId: 'ws-1' } };

      await expect(controller.installTemplate(req, 'tpl-missing')).rejects.toThrow(
        'Template not found',
      );
    });

    it('propagates prisma error from service', async () => {
      service.installTemplate.mockRejectedValue(new Error('Database connection lost'));
      const req = { user: { workspaceId: 'ws-1' } };

      await expect(controller.installTemplate(req, 'tpl-1')).rejects.toThrow(
        'Database connection lost',
      );
    });
  });
});
