import { NeuroCrmController } from './neuro-crm.controller';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

describe('NeuroCrmController', () => {
  const analyzeContact = jest.fn();
  const nextBestAction = jest.fn();
  const clusterLeads = jest.fn();
  const simulateConversation = jest.fn();

  let controller: NeuroCrmController;

  const mockReq = (overrides?: Partial<AuthenticatedRequest>): AuthenticatedRequest =>
    ({
      user: { workspaceId: 'ws-test-1', sub: 'user-1', email: 'test@test.com', role: 'admin' },
      ...overrides,
    }) as AuthenticatedRequest;

  beforeEach(() => {
    jest.clearAllMocks();

    controller = new NeuroCrmController({
      analyzeContact,
      nextBestAction,
      clusterLeads,
      simulateConversation,
    } as never);
  });

  describe('POST analyze/:contactId', () => {
    it('happy path: calls analyzeContact with workspaceId from req and contactId from param', async () => {
      const result = { leadScore: 85, sentiment: 'POSITIVE' as const };
      analyzeContact.mockResolvedValue(result);

      const req = mockReq();
      const response = await controller.analyze(req, 'contact-123');

      expect(analyzeContact).toHaveBeenCalledWith('ws-test-1', 'contact-123');
      expect(response).toEqual(result);
    });
  });

  describe('GET next-best/:contactId', () => {
    it('alternate route: calls nextBestAction with workspaceId and contactId', async () => {
      const result = { action: 'CLOSE_NOW', reason: 'lead quente' };
      nextBestAction.mockResolvedValue(result);

      const req = mockReq();
      const response = await controller.nba(req, 'contact-456');

      expect(nextBestAction).toHaveBeenCalledWith('ws-test-1', 'contact-456');
      expect(response).toEqual(result);
    });
  });

  describe('error propagation', () => {
    it('propagates service rejection when analyzeContact throws', async () => {
      const error = new Error('AI service unavailable');
      analyzeContact.mockRejectedValue(error);

      const req = mockReq();
      await expect(controller.analyze(req, 'contact-error')).rejects.toThrow('AI service unavailable');
    });
  });

  describe('identity propagation', () => {
    it('passes workspaceId from req.user.workspaceId to simulateConversation', async () => {
      const result = { transcript: 'Lead: Oi\nAgent: Ola!' };
      simulateConversation.mockResolvedValue(result);

      const req = mockReq({
        user: { workspaceId: 'ws-custom', sub: 'user-2', email: 'u2@test.com', role: 'editor' },
      });
      const body = { persona: 'Vendedor', scenario: 'cold call', goal: 'Agendar reuniao' };
      const response = await controller.simulate(req, body);

      expect(simulateConversation).toHaveBeenCalledWith({
        workspaceId: 'ws-custom',
        persona: 'Vendedor',
        scenario: 'cold call',
        goal: 'Agendar reuniao',
      });
      expect(response).toEqual(result);
    });
  });
});
