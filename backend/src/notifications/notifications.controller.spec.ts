jest.mock('./notifications.service', () => ({
  NotificationsService: jest.fn(),
}));

import { NotificationsController } from './notifications.controller';

describe('NotificationsController', () => {
  const registerDevice = jest.fn();
  const getPreferences = jest.fn();
  const updatePreferences = jest.fn();

  let controller: NotificationsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new NotificationsController(
      { registerDevice } as never,
      { getPreferences, updatePreferences } as never,
    );
  });

  describe('registerDevice', () => {
    const mockReq = {
      user: { sub: 'u-1', workspaceId: 'ws-1' },
      headers: {},
    } as never;

    it('calls service.registerDevice with user sub, body token, and body platform (happy path)', async () => {
      const body = { token: 'fcm-token-123', platform: 'ios' };
      const mockResult = { id: 1, token: 'fcm-token-123', platform: 'ios', agentId: 'u-1' };
      registerDevice.mockResolvedValueOnce(mockResult);

      const result = await controller.registerDevice(mockReq, body);

      expect(registerDevice).toHaveBeenCalledWith('u-1', 'fcm-token-123', 'ios');
      expect(result).toEqual(mockResult);
    });

    it('propagates user identity: req.user.sub is passed as agentId to service', async () => {
      const req = {
        user: { sub: 'agent-custom', workspaceId: 'ws-2' },
        headers: {},
      } as never;
      const body = { token: 'tok', platform: 'android' };
      registerDevice.mockResolvedValueOnce({});

      await controller.registerDevice(req, body);

      expect(registerDevice).toHaveBeenCalledWith('agent-custom', 'tok', 'android');
    });

    it('propagates body fields: token and platform are passed as positional args to service', async () => {
      const body = { token: 'fcm-token-456', platform: 'web' };
      registerDevice.mockResolvedValueOnce({});

      await controller.registerDevice(mockReq, body);

      expect(registerDevice).toHaveBeenCalledWith('u-1', 'fcm-token-456', 'web');
    });

    it('propagates error when service.registerDevice rejects (error path)', async () => {
      const body = { token: 'bad-token', platform: 'ios' };
      const error = new Error('Firebase registration failed');
      registerDevice.mockRejectedValueOnce(error);

      await expect(controller.registerDevice(mockReq, body)).rejects.toThrow(
        'Firebase registration failed',
      );
    });
  });

  describe('preferences endpoints', () => {
    const mockReq = {
      user: { sub: 'u-1', workspaceId: 'ws-1' },
      headers: {},
    } as never;

    it('GET preferences delegates with workspaceId and userId from the JWT', async () => {
      getPreferences.mockResolvedValueOnce({ emailTips: true });

      const result = await controller.getPreferences(mockReq);

      expect(getPreferences).toHaveBeenCalledWith('ws-1', 'u-1');
      expect(result).toEqual({ emailTips: true });
    });

    it('PUT preferences sanitizes the body and persists only known boolean toggles', async () => {
      updatePreferences.mockResolvedValueOnce({ emailTips: false });

      const result = await controller.updatePreferences(mockReq, {
        emailTips: false,
        unknownKey: true,
      });

      expect(updatePreferences).toHaveBeenCalledWith('ws-1', 'u-1', { emailTips: false });
      expect(result).toEqual({ emailTips: false });
    });

    it('PUT preferences rejects a body without any valid toggle', async () => {
      await expect(
        controller.updatePreferences(mockReq, { emailTips: 'not-a-boolean' }),
      ).rejects.toThrow(/preferência de notificação válida/);
      expect(updatePreferences).not.toHaveBeenCalled();
    });
  });
});
