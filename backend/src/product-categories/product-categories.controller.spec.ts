jest.mock('../auth/workspace-access', () => ({
  resolveWorkspaceId: jest.fn(),
}));

import { ProductCategoriesController } from './product-categories.controller';
import { resolveWorkspaceId } from '../auth/workspace-access';

const resolveWorkspaceIdMock = resolveWorkspaceId as jest.Mock;

describe('ProductCategoriesController', () => {
  const listByWorkspace = jest.fn();

  let controller: ProductCategoriesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ProductCategoriesController({
      listByWorkspace,
    } as never);
  });

  describe('list', () => {
    const req = {
      user: { sub: 'u-1', workspaceId: 'ws-1' },
      headers: {},
    } as never;

    it('should call service.listByWorkspace with resolved workspaceId', async () => {
      resolveWorkspaceIdMock.mockReturnValue('ws-1');
      listByWorkspace.mockResolvedValueOnce([{ category: 'Marketing' }]);

      const result = await controller.list(req);

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(req);
      expect(listByWorkspace).toHaveBeenCalledWith('ws-1');
      expect(result).toEqual([{ category: 'Marketing' }]);
    });

    it('should propagate identity from req.user to resolveWorkspaceId', async () => {
      resolveWorkspaceIdMock.mockReturnValue('ws-1');
      listByWorkspace.mockResolvedValueOnce([]);

      await controller.list(req);

      expect(resolveWorkspaceIdMock).toHaveBeenCalledWith(
        expect.objectContaining({
          user: { sub: 'u-1', workspaceId: 'ws-1' },
        }),
      );
    });

    it('should propagate error when service.listByWorkspace rejects', async () => {
      const error = new Error('DB down');
      resolveWorkspaceIdMock.mockReturnValue('ws-1');
      listByWorkspace.mockRejectedValueOnce(error);

      await expect(controller.list(req)).rejects.toThrow('DB down');
    });

    it('should return empty array when service returns no categories', async () => {
      resolveWorkspaceIdMock.mockReturnValue('ws-1');
      listByWorkspace.mockResolvedValueOnce([]);

      const result = await controller.list(req);

      expect(result).toEqual([]);
    });
  });
});
