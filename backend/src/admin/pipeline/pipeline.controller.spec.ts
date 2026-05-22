import { PipelineController } from './pipeline.controller';

describe('PipelineController', () => {
  const service = {
    getState: jest.fn(),
    setState: jest.fn(),
    getHealth: jest.fn(),
  };

  let controller: PipelineController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PipelineController(service as never);
  });

  it('delegates getState to service', async () => {
    service.getState.mockResolvedValue({ workspaceId: 'ws-1', state: 'active' });
    const result = await controller.state('ws-1');
    expect(service.getState).toHaveBeenCalledWith('ws-1');
    expect(result).toEqual({ workspaceId: 'ws-1', state: 'active' });
  });

  it('delegates setState to service', async () => {
    service.setState.mockResolvedValue({ workspaceId: 'ws-1', state: 'active' });
    const result = await controller.setState({
      workspaceId: 'ws-1',
      state: 'active',
      reason: 'testing',
    });
    expect(service.setState).toHaveBeenCalledWith(
      'ws-1',
      'active',
      'admin',
      'testing',
    );
    expect(result).toEqual({ workspaceId: 'ws-1', state: 'active' });
  });

  it('delegates health to service', async () => {
    service.getHealth.mockResolvedValue({ state: 'active', fallbackRate1h: 0 });
    const result = await controller.health('ws-1');
    expect(service.getHealth).toHaveBeenCalledWith('ws-1');
    expect(result).toEqual({ state: 'active', fallbackRate1h: 0 });
  });
});
