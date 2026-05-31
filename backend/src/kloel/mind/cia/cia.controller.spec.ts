import { CiaController } from './cia.controller';

describe('CiaController', () => {
  const getSurface = jest.fn();
  const getHumanTasks = jest.fn();
  const getAccountRuntime = jest.fn();
  const getCapabilityRegistry = jest.fn();
  const getConversationActionRegistry = jest.fn();
  const getAccountApprovals = jest.fn();
  const getAccountInputSessions = jest.fn();
  const getAccountWorkItems = jest.fn();
  const getAccountProof = jest.fn();
  const getCycleProof = jest.fn();
  const getConversationProof = jest.fn();
  const activateAutopilotTotal = jest.fn();
  const approveHumanTask = jest.fn();
  const rejectHumanTask = jest.fn();
  const approveAccountApproval = jest.fn();
  const rejectAccountApproval = jest.fn();
  const respondToAccountInputSession = jest.fn();
  const resumeConversation = jest.fn();

  let controller: CiaController;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new CiaController({
      getSurface,
      getHumanTasks,
      getAccountRuntime,
      getCapabilityRegistry,
      getConversationActionRegistry,
      getAccountApprovals,
      getAccountInputSessions,
      getAccountWorkItems,
      getAccountProof,
      getCycleProof,
      getConversationProof,
      activateAutopilotTotal,
      approveHumanTask,
      rejectHumanTask,
      approveAccountApproval,
      rejectAccountApproval,
      respondToAccountInputSession,
      resumeConversation,
    } as never);
  });

  describe('getSurface', () => {
    it('delegates to service with workspaceId and returns the surface (happy path)', async () => {
      const surface = { title: 'KLOEL', subtitle: 'Orquestrando seus canais de venda' };
      getSurface.mockResolvedValue(surface);

      const result = await controller.getSurface('ws-1');

      expect(getSurface).toHaveBeenCalledWith('ws-1');
      expect(result).toBe(surface);
    });
  });

  describe('approveHumanTask', () => {
    it('delegates to service with workspaceId, taskId, and body (alternate route)', async () => {
      const body = { message: 'Aprovado', resume: true };
      const outcome = { approved: true, taskId: 'task-1', sent: true, resumed: true };
      approveHumanTask.mockResolvedValue(outcome);

      const result = await controller.approveHumanTask('ws-42', 'task-99', body);

      expect(approveHumanTask).toHaveBeenCalledWith('ws-42', 'task-99', body);
      expect(result).toBe(outcome);
    });
  });

  describe('getConversationProof', () => {
    it('propagates service rejection (error path)', async () => {
      const error = new Error('Prova indisponivel');
      getConversationProof.mockRejectedValue(error);

      await expect(controller.getConversationProof('ws-1', 'conv-abc')).rejects.toThrow(
        'Prova indisponivel',
      );
      expect(getConversationProof).toHaveBeenCalledWith('ws-1', 'conv-abc');
    });
  });

  describe('activateAutopilotTotal', () => {
    it('passes workspaceId and optional limit into service call (identity propagated)', async () => {
      const activation = { activated: true };
      activateAutopilotTotal.mockResolvedValue(activation);

      const result = await controller.activateAutopilotTotal('ws-kernel', { limit: 50 });

      expect(activateAutopilotTotal).toHaveBeenCalledWith('ws-kernel', 50);
      expect(result).toBe(activation);
    });
  });
});
