import { KloelController } from './kloel.controller';

describe('KloelController', () => {
  let kloelService: {
    thinkSync: jest.Mock;
  };
  let controller: KloelController;

  beforeEach(() => {
    kloelService = {
      thinkSync: jest.fn().mockResolvedValue({
        response: 'ok',
      }),
    };

    controller = new KloelController(
      kloelService as never as ConstructorParameters<typeof KloelController>[0],
      {} as never as ConstructorParameters<typeof KloelController>[1],
      {} as never as ConstructorParameters<typeof KloelController>[2],
      {} as never as ConstructorParameters<typeof KloelController>[3],
      {} as never as ConstructorParameters<typeof KloelController>[4],
    );
  });

  it('uses legacy string user.id as a fallback when sub is absent', async () => {
    await controller.thinkSync({ message: 'oi' }, {
      workspaceId: 'ws-1',
      user: {
        id: 'legacy-user',
        workspaceId: 'ws-1',
      },
    } as unknown as Parameters<KloelController['thinkSync']>[1]);

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
    } as unknown as Parameters<KloelController['thinkSync']>[1]);

    expect(kloelService.thinkSync).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        userId: undefined,
      }),
    );
  });
});
