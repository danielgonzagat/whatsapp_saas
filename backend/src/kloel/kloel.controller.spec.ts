import { KloelController } from './kloel.controller';

describe('KloelController', () => {
  let kloelService: any;
  let controller: KloelController;

  beforeEach(() => {
    kloelService = {
      thinkSync: jest.fn().mockResolvedValue({
        response: 'ok',
      }),
    };

    controller = new KloelController(kloelService, {} as any, {} as any, {} as any);
  });

  it('uses legacy string user.id as a fallback when sub is absent', async () => {
    await controller.thinkSync({ message: 'oi' }, {
      workspaceId: 'ws-1',
      user: {
        id: 'legacy-user',
        workspaceId: 'ws-1',
      },
    } as any);

    expect(kloelService.thinkSync).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        userId: 'legacy-user',
      }),
    );
  });

  it('ignores malformed legacy user.id values instead of forwarding objects', async () => {
    await controller.thinkSync({ message: 'oi' }, {
      workspaceId: 'ws-1',
      user: {
        id: { broken: true },
        workspaceId: 'ws-1',
      },
    } as any);

    expect(kloelService.thinkSync).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        userId: undefined,
      }),
    );
  });
});
