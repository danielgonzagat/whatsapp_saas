import { OnboardingProfileController } from './onboarding-profile.controller';

jest.mock('../auth/workspace-access', () => ({
  resolveWorkspaceId: jest.fn((_req: unknown, workspaceId: string) => workspaceId),
}));

jest.mock('./onboarding.service', () => ({
  OnboardingService: jest.fn(),
}));

import { resolveWorkspaceId } from '../auth/workspace-access';

const resolveWorkspaceIdMock = resolveWorkspaceId as jest.Mock;

describe('OnboardingProfileController', () => {
  const mockSaveProfile = jest.fn();
  const mockComplete = jest.fn();
  let controller: OnboardingProfileController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new OnboardingProfileController({
      saveProfile: mockSaveProfile,
      complete: mockComplete,
    } as never);
  });

  const standardReq = {
    user: { sub: 'u-1', workspaceId: 'ws-1', email: 'a@test.com', role: 'admin' },
    headers: {},
  } as never;

  describe('saveProfile', () => {
    it('delegates to onboardingService.saveProfile with resolved workspace and defaults', async () => {
      mockSaveProfile.mockResolvedValueOnce({ completed: false });

      const result = await controller.saveProfile(standardReq, 'ws-1', {});

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(standardReq, 'ws-1');
      expect(mockSaveProfile).toHaveBeenCalledWith('ws-1', {
        userType: 'producer',
        productType: 'digital',
        primaryChannel: 'whatsapp',
        hasProduct: false,
        hasCheckout: false,
        aiUseCase: 'sales',
      });
      expect(result).toEqual({ completed: false });
    });
  });

  describe('complete', () => {
    it('delegates to onboardingService.complete with resolved workspace', async () => {
      const done = { completed: true, completedAt: new Date().toISOString() };
      mockComplete.mockResolvedValueOnce(done);

      const result = await controller.complete(standardReq, 'ws-1');

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(standardReq, 'ws-1');
      expect(mockComplete).toHaveBeenCalledWith('ws-1');
      expect(result).toEqual(done);
    });
  });

  describe('error propagation', () => {
    it('rethrows when onboardingService.saveProfile rejects', async () => {
      mockSaveProfile.mockRejectedValueOnce(new Error('DB error'));

      await expect(controller.saveProfile(standardReq, 'ws-1', {})).rejects.toThrow('DB error');
    });
  });

  describe('identity propagation', () => {
    it('passes the resolved workspace id into the service call', async () => {
      mockSaveProfile.mockResolvedValueOnce({ completed: false });

      await controller.saveProfile(standardReq, 'ws-x', {
        userType: 'affiliate',
        primaryChannel: 'email',
      });

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(standardReq, 'ws-x');
      expect(mockSaveProfile).toHaveBeenCalledWith(
        'ws-x',
        expect.objectContaining({ userType: 'affiliate', primaryChannel: 'email' }),
      );
    });
  });
});
