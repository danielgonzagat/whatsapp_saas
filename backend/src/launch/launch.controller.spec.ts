jest.mock('../auth/workspace-access', () => ({
  resolveWorkspaceId: jest.fn(),
}));

jest.mock('../common/throttler/route-class.decorator', () => ({
  RouteClass: () => () => {},
}));

jest.mock('../common/decorators/internal-endpoint.decorator', () => ({
  InternalEndpoint: () => () => {},
}));

import { resolveWorkspaceId } from '../auth/workspace-access';
import { LaunchController } from './launch.controller';

const resolveWorkspaceIdMock = resolveWorkspaceId as jest.Mock;

describe('LaunchController', () => {
  const listLaunchersMock = jest.fn();
  const createLauncherMock = jest.fn();
  const addGroupMock = jest.fn();
  const getRedirectLinkMock = jest.fn();

  let controller: LaunchController;

  beforeEach(() => {
    jest.clearAllMocks();
    resolveWorkspaceIdMock.mockReturnValue('ws-1');

    controller = new LaunchController({
      listLaunchers: listLaunchersMock,
      createLauncher: createLauncherMock,
      addGroup: addGroupMock,
      getRedirectLink: getRedirectLinkMock,
    } as never);
  });

  const mockReq = { user: { sub: 'u-1', workspaceId: 'ws-1' }, headers: {} } as never;

  describe('GET /launch/launchers (listLaunchers)', () => {
    it('calls service.listLaunchers with resolved workspaceId and returns data', async () => {
      listLaunchersMock.mockResolvedValue([
        { id: 'l-1', name: 'Launch 1', groups: [] },
      ]);

      const result = await controller.listLaunchers(mockReq);

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(mockReq);
      expect(listLaunchersMock).toHaveBeenCalledWith('ws-1');
      expect(result).toEqual([{ id: 'l-1', name: 'Launch 1', groups: [] }]);
    });

    it('propagates rejection from service.listLaunchers', async () => {
      listLaunchersMock.mockRejectedValue(new Error('DB error'));

      await expect(controller.listLaunchers(mockReq)).rejects.toThrow('DB error');
    });
  });

  describe('POST /launch/launcher (createLauncher)', () => {
    it('calls service.createLauncher with resolved workspaceId and dto (workspaceId stripped)', async () => {
      createLauncherMock.mockResolvedValue({ id: 'l-2', name: 'New Launch' });
      const dto = { name: 'New Launch', description: 'desc', workspaceId: 'ws-1' };

      const result = await controller.createLauncher(mockReq, dto);
      const { workspaceId, ...expectedRest } = dto;

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(mockReq, 'ws-1');
      expect(createLauncherMock).toHaveBeenCalledWith('ws-1', expectedRest);
      expect(result).toEqual({ id: 'l-2', name: 'New Launch' });
    });

    it('propagates rejection from service.createLauncher', async () => {
      createLauncherMock.mockRejectedValue(new Error('Creation failed'));
      const dto = { name: 'New Launch' };

      await expect(controller.createLauncher(mockReq, dto)).rejects.toThrow('Creation failed');
    });
  });

  describe('POST /launch/launcher/:id/groups (addGroup)', () => {
    it('calls service.addGroup with resolved workspaceId, launcherId, and dto (workspaceId stripped)', async () => {
      addGroupMock.mockResolvedValue({ id: 'g-1', name: 'Group A' });
      const dto = { groupId: 'gid-1', role: 'member', workspaceId: 'ws-1' };

      const result = await controller.addGroup(mockReq, 'l-3', dto);
      const { workspaceId, ...expectedRest } = dto;

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(mockReq, 'ws-1');
      expect(addGroupMock).toHaveBeenCalledWith('ws-1', 'l-3', expectedRest);
      expect(result).toEqual({ id: 'g-1', name: 'Group A' });
    });
  });

  describe('GET /launch/join/:slug (joinLaunch)', () => {
    it('calls service.getRedirectLink and redirects to valid WhatsApp URL', async () => {
      const redirectLink = 'https://chat.whatsapp.com/abc123';
      getRedirectLinkMock.mockResolvedValue(redirectLink);
      const redirectStub = jest.fn();
      const resMock = { redirect: redirectStub } as never;

      await controller.joinLaunch('my-launch', resMock);

      expect(getRedirectLinkMock).toHaveBeenCalledWith('my-launch');
      expect(redirectStub).toHaveBeenCalledWith(redirectLink);
    });

    it('throws BadRequestException for non-HTTPS redirect link', async () => {
      getRedirectLinkMock.mockResolvedValue('http://chat.whatsapp.com/abc');
      const resMock = { redirect: jest.fn() } as never;

      await expect(controller.joinLaunch('bad-slug', resMock)).rejects.toThrow(
        'Invalid redirect link',
      );
    });

    it('throws BadRequestException for non-WhatsApp hostname', async () => {
      getRedirectLinkMock.mockResolvedValue('https://evil.com/phish');
      const resMock = { redirect: jest.fn() } as never;

      await expect(controller.joinLaunch('bad-slug', resMock)).rejects.toThrow(
        'Invalid redirect link',
      );
    });

    it('propagates rejection from service.getRedirectLink', async () => {
      getRedirectLinkMock.mockRejectedValue(new NotFoundException('Launch not found'));
      const resMock = { redirect: jest.fn() } as never;

      await expect(controller.joinLaunch('nonexistent', resMock)).rejects.toThrow(
        'Launch not found',
      );
    });
  });

  describe('identity propagation', () => {
    it('passes workspaceId from resolveWorkspaceId into service call for createLauncher', async () => {
      resolveWorkspaceIdMock.mockReturnValue('ws-from-token');
      createLauncherMock.mockResolvedValue({ id: 'l-5' });
      const dto = { name: 'Identity Test' };

      await controller.createLauncher(mockReq, dto);

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(mockReq, undefined);
      expect(createLauncherMock).toHaveBeenCalledWith('ws-from-token', dto);
    });

    it('passes workspaceId from resolveWorkspaceId into service call for listLaunchers', async () => {
      resolveWorkspaceIdMock.mockReturnValue('ws-token-2');
      listLaunchersMock.mockResolvedValue([]);

      await controller.listLaunchers(mockReq);

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(mockReq);
      expect(listLaunchersMock).toHaveBeenCalledWith('ws-token-2');
    });
  });
});

// NestJS exceptions used in joinLaunch validation
class NotFoundException extends Error {
  constructor(message: string) { super(message); this.name = 'NotFoundException'; }
}
