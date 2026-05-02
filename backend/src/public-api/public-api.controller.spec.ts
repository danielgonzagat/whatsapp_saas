import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { PublicApiController } from './public-api.controller';
import { InboxService } from '../inbox/inbox.service';

jest.mock('./api-key.guard', () => ({
  ApiKeyGuard: class SpecApiKeyGuard {
    canActivate() {
      return true;
    }
  },
}));

describe('PublicApiController', () => {
  let controller: PublicApiController;

  const mockInboxService: any = {
    saveMessageByPhone: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicApiController],
      providers: [{ provide: InboxService, useValue: mockInboxService }],
    }).compile();

    controller = module.get<PublicApiController>(PublicApiController);
  });

  describe('sendMessage', () => {
    const mockRequest: any = {
      user: { workspaceId: 'ws-1' },
    };

    it('envia mensagem de texto via InboxService', async () => {
      const saved: any = { id: 'msg-1', content: 'Hello from API!' };
      mockInboxService.saveMessageByPhone.mockResolvedValue(saved);

      const result = await controller.sendMessage(mockRequest, {
        phone: '5511999999999',
        message: 'Hello from API!',
      });

      expect(result).toEqual(saved);
      expect(mockInboxService.saveMessageByPhone).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        phone: '5511999999999',
        content: 'Hello from API!',
        direction: 'OUTBOUND',
        type: 'TEXT',
      });
    });

    it('passa workspaceId extraído do request', async () => {
      mockInboxService.saveMessageByPhone.mockResolvedValue({ id: 'msg-2' });

      await controller.sendMessage(
        { user: { workspaceId: 'ws-custom' } },
        { phone: '5511888888888', message: 'Teste' },
      );

      expect(mockInboxService.saveMessageByPhone).toHaveBeenCalledWith(
        expect.objectContaining({ workspaceId: 'ws-custom' }),
      );
    });

    it('propaga erros do InboxService', async () => {
      mockInboxService.saveMessageByPhone.mockRejectedValue(new Error('Contact blocked'));

      await expect(
        controller.sendMessage(mockRequest, {
          phone: '5511999999999',
          message: 'Hello',
        }),
      ).rejects.toThrow('Contact blocked');
    });
  });
});
