import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { UnsubscribeController } from './unsubscribe.controller';
import { UnsubscribeService } from './unsubscribe.service';

describe('UnsubscribeController', () => {
  let controller: UnsubscribeController;
  let processUnsubscribeToken: jest.Mock<
    Promise<{
      success: boolean;
      email?: string;
      workspaceId?: string;
      contactId?: string;
      error?: string;
    }>,
    [string]
  >;

  const mockRedirect = jest.fn<void, [string]>();
  const mockResponse = { redirect: mockRedirect } as Response;

  beforeEach(async () => {
    jest.clearAllMocks();
    processUnsubscribeToken = jest.fn<
      Promise<{
        success: boolean;
        email?: string;
        workspaceId?: string;
        contactId?: string;
        error?: string;
      }>,
      [string]
    >();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UnsubscribeController],
      providers: [
        {
          provide: UnsubscribeService,
          useValue: {
            processUnsubscribeToken,
          },
        },
      ],
    }).compile();

    controller = module.get<UnsubscribeController>(UnsubscribeController);
  });

  describe('GET /unsubscribe', () => {
    it('redirects to success page on valid token', async () => {
      processUnsubscribeToken.mockResolvedValue({
        success: true,
        email: 'test@example.com',
        workspaceId: 'ws-1',
        contactId: 'ct-1',
      });

      await controller.unsubscribe('valid-token', mockResponse as never);

      expect(processUnsubscribeToken).toHaveBeenCalledWith('valid-token');
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/unsubscribed'));
      const [redirectUrl] = mockRedirect.mock.calls[0]!;
      expect(redirectUrl).not.toContain('error');
    });

    it('redirects to error page on invalid token', async () => {
      processUnsubscribeToken.mockResolvedValue({
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
