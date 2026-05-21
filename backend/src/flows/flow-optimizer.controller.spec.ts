import { FlowOptimizerController } from './flow-optimizer.controller';

describe('FlowOptimizerController', () => {
  const optimizeFlow = jest.fn();

  let controller: FlowOptimizerController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new FlowOptimizerController({ optimizeFlow } as never);
  });

  describe('optimize', () => {
    it('calls service.optimizeFlow with workspaceId from request and flowId from param', async () => {
      optimizeFlow.mockResolvedValue(undefined);

      const req = { user: { workspaceId: 'ws-1' } } as never;
      await controller.optimize(req, 'flow-abc');

      expect(optimizeFlow).toHaveBeenCalledWith('ws-1', 'flow-abc');
    });

    it('propagates different workspaceId and flowId to the service', async () => {
      optimizeFlow.mockResolvedValue(undefined);

      const req = { user: { workspaceId: 'ws-admin' } } as never;
      await controller.optimize(req, 'flow-xyz');

      expect(optimizeFlow).toHaveBeenCalledWith('ws-admin', 'flow-xyz');
    });

    it('propagates service rejection as a thrown error', async () => {
      const error = new Error('OpenAI quota exceeded');
      optimizeFlow.mockRejectedValue(error);

      const req = { user: { workspaceId: 'ws-1' } } as never;

      await expect(controller.optimize(req, 'flow-abc')).rejects.toThrow('OpenAI quota exceeded');
    });

    it('returns the value produced by the service', async () => {
      const mockSuggestion = { nodes: [{ id: 'n1' }], reason: 'simplified' };
      optimizeFlow.mockResolvedValue(mockSuggestion);

      const req = { user: { workspaceId: 'ws-1' } } as never;

      const result = await controller.optimize(req, 'flow-abc');
      expect(result).toBe(mockSuggestion);
    });
  });
});
