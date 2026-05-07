import { MindController } from './mind-controller';

describe('MindController', () => {
  it('exposes tick and narration through the service layer', async () => {
    const controller = new MindController(
      { list: jest.fn() } as never,
      { choose: jest.fn(), harness: jest.fn() } as never,
      { tick: jest.fn().mockResolvedValue({ perceived: 1 }), lift: jest.fn() } as never,
      { narrate: jest.fn().mockResolvedValue('briefing') } as never,
    );

    await expect(controller.tick('ws-1')).resolves.toEqual({ perceived: 1 });
    await expect(controller.narrate('ws-1')).resolves.toEqual({ briefing: 'briefing' });
  });
});
