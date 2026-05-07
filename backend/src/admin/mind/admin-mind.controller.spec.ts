import { NotFoundException } from '@nestjs/common';
import { AdminMindController } from './admin-mind.controller';
import { AdminMindService } from './admin-mind.service';

describe('AdminMindController', () => {
  function buildController() {
    const service = {
      getState: jest.fn(),
      getRecentSurprise: jest.fn(),
      getLift: jest.fn(),
    };

    return {
      service,
      controller: new AdminMindController(service as unknown as AdminMindService),
    };
  }

  describe('GET :workspaceId/state', () => {
    it('returns belief, prediction, and policy summaries for a workspace', async () => {
      const { controller, service } = buildController();
      service.getState.mockResolvedValue({
        workspaceId: 'ws-1',
        workspaceName: 'Test Workspace',
        beliefSummary: {
          totalPredicates: 3,
          predicates: [
            {
              predicate: 'P(reply|template,hour,channel)',
              total: 42,
              minSamples: 0,
              maxSamples: 120,
              avgMean: 0.45,
            },
          ],
        },
        predictionSummary: {
          total: 100,
          resolved: 80,
          open: 20,
          avgSurprise: 0.34,
          highSurpriseCount: 8,
        },
        policySummary: {
          total: 50,
          resolved: 30,
          unresolved: 20,
          decisionTypes: ['followup_timing', 'template_choice'],
        },
        topConversionBeliefs: [],
      });

      const result = await controller.state('ws-1');

      expect(service.getState).toHaveBeenCalledWith('ws-1', undefined);
      expect(result.beliefSummary.totalPredicates).toBe(3);
      expect(result.predictionSummary.total).toBe(100);
      expect(result.policySummary.total).toBe(50);
    });

    it('passes optional decisionType filter', async () => {
      const { controller, service } = buildController();
      service.getState.mockResolvedValue({
        workspaceId: 'ws-1',
        workspaceName: 'Test',
        beliefSummary: { totalPredicates: 0, predicates: [] },
        predictionSummary: {
          total: 0,
          resolved: 0,
          open: 0,
          avgSurprise: 0,
          highSurpriseCount: 0,
        },
        policySummary: {
          total: 0,
          resolved: 0,
          unresolved: 0,
          decisionTypes: [],
        },
        topConversionBeliefs: [],
      });

      await controller.state('ws-1', 'followup_timing');

      expect(service.getState).toHaveBeenCalledWith('ws-1', 'followup_timing');
    });

    it('propagates NotFoundException when workspace does not exist', async () => {
      const { controller, service } = buildController();
      service.getState.mockRejectedValue(new NotFoundException('Workspace não encontrado'));

      await expect(controller.state('ws-nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('GET :workspaceId/surprise', () => {
    it('returns recent surprise items with severity classification', async () => {
      const { controller, service } = buildController();
      service.getRecentSurprise.mockResolvedValue({
        workspaceId: 'ws-1',
        workspaceName: 'Test Workspace',
        items: [
          {
            id: 'pred-1',
            subject: 'contact:c1',
            predicate: 'P(reply|template,hour,channel)',
            predictedMean: 0.3,
            actual: 1,
            surprise: 1.2,
            severity: 'high',
            horizonSec: 86400,
            resolvedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
          {
            id: 'pred-2',
            subject: 'contact:c2',
            predicate: 'P(conversion|segment,price_band,channel,hour)',
            predictedMean: 0.8,
            actual: 0,
            surprise: 1.61,
            severity: 'high',
            horizonSec: 3600,
            resolvedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
          },
        ],
        total: 2,
      });

      const result = await controller.surprise('ws-1', { limit: 10 });

      expect(service.getRecentSurprise).toHaveBeenCalledWith('ws-1', 10);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].severity).toBe('high');
      expect(result.items[0].surprise).toBe(1.2);
    });

    it('defaults limit to 20 when not specified', async () => {
      const { controller, service } = buildController();
      service.getRecentSurprise.mockResolvedValue({
        workspaceId: 'ws-1',
        workspaceName: 'Test',
        items: [],
        total: 0,
      });

      await controller.surprise('ws-1', { limit: undefined });

      expect(service.getRecentSurprise).toHaveBeenCalledWith('ws-1', 20);
    });
  });

  describe('GET :workspaceId/lift', () => {
    it('returns lift analysis with top chosen actions', async () => {
      const { controller, service } = buildController();
      service.getLift.mockResolvedValue({
        workspaceId: 'ws-1',
        workspaceName: 'Test Workspace',
        decisionType: 'followup_timing',
        sinceDays: 14,
        n: 45,
        mindMean: 0.68,
        baselineMean: 0.5,
        lift: 0.36,
        pZScore: 1.96,
        topChosenActions: [
          { chosen: 'send_now', baseline: 'delay_24h', outcome: 1, count: 30 },
          { chosen: 'delay_24h', baseline: 'delay_24h', outcome: 0, count: 15 },
        ],
      });

      const result = await controller.lift('ws-1', {
        decisionType: 'followup_timing',
        sinceDays: 30,
      });

      expect(service.getLift).toHaveBeenCalledWith('ws-1', 'followup_timing', 30);
      expect(result.lift).toBe(0.36);
      expect(result.pZScore).toBe(1.96);
      expect(result.topChosenActions).toHaveLength(2);
    });

    it('defaults sinceDays to 14', async () => {
      const { controller, service } = buildController();
      service.getLift.mockResolvedValue({
        workspaceId: 'ws-1',
        workspaceName: 'Test',
        decisionType: 'template_choice',
        sinceDays: 14,
        n: 0,
        mindMean: 0,
        baselineMean: 0,
        lift: 0,
        pZScore: 0,
        topChosenActions: [],
      });

      await controller.lift('ws-1', { decisionType: 'template_choice' });

      expect(service.getLift).toHaveBeenCalledWith('ws-1', 'template_choice', 14);
    });

    it('propagates NotFoundException when workspace does not exist', async () => {
      const { controller, service } = buildController();
      service.getLift.mockRejectedValue(new NotFoundException('Workspace não encontrado'));

      await expect(
        controller.lift('ws-nonexistent', { decisionType: 'followup_timing' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
