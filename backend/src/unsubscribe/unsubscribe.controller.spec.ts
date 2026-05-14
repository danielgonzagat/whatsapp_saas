import { Test, TestingModule } from '@nestjs/testing';
import { UnsubscribeController } from './unsubscribe.controller';
import { UnsubscribeService } from './unsubscribe.service';

describe('UnsubscribeController', () => {
  let controller: UnsubscribeController;
  let service: UnsubscribeService;

  const mockRedirect = jest.fn();
  const mockResponse = { redirect: mockRedirect } as Response;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UnsubscribeController],
      providers: [
        {
          provide: UnsubscribeService,
          useValue: {
            processUnsubscribeToken: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UnsubscribeController>(UnsubscribeController);
    service = module.get<UnsubscribeService>(UnsubscribeService);
  });

  describe('GET /unsubscribe', () => {
    it('redirects to success page on valid token', async () => {
      jest.spyOn(service, 'processUnsubscribeToken').mockResolvedValue({
        success: true,
        email: 'test@example.com',
        workspaceId: 'ws-1',
        contactId: 'ct-1',
      });

      await controller.unsubscribe('valid-token', mockResponse as never);

      expect(service.processUnsubscribeToken).toHaveBeenCalledWith('valid-token');
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/unsubscribed'));
      const redirectUrl = mockRedirect.mock.calls[0][0] as string;
      expect(redirectUrl).not.toContain('error');
    });

    it('redirects to error page on invalid token', async () => {
      jest.spyOn(service, 'processUnsubscribeToken').mockResolvedValue({
        success: false,
        error: 'invalid_token',
      });

      await controller.unsubscribe('bad-token', mockResponse as never);

      expect(mockRedirect).toHaveBeenCalledWith(
        expect.stringContaining('/unsubscribed?error=invalid_token'),
      );
    });

    it('redirects to error page on missing token', async () => {
      await controller.unsubscribe('', mockResponse as never);

      expect(mockRedirect).toHaveBeenCalledWith(
        expect.stringContaining('/unsubscribed?error=missing_token'),
      );
    });

    it('redirects to error page on null/undefined token', async () => {
      await controller.unsubscribe(undefined as string, mockResponse as never);

      expect(mockRedirect).toHaveBeenCalledWith(
        expect.stringContaining('/unsubscribed?error=missing_token'),
      );
    });
  });
});
