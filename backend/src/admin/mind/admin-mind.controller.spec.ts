import { NotFoundException } from '@nestjs/common';
import { AdminMindController } from './admin-mind.controller';
import { AdminMindService } from './admin-mind.service';

interface GetHealthResult {
  workspaceId: string;
  workspaceName: string;
  runtime: unknown;
  pendingOutbox: number;
  openPredictions: number;
  openDecisions: number;
}

interface AskQuestionResult {
  workspaceId: string;
  workspaceName: string;
  answer: string;
  state: unknown;
  lift: unknown;
  concepts: unknown;
}

interface GenerateReportResult {
  workspaceId: string;
  workspaceName: string;
  id: string;
  content: string;
  metrics: unknown;
}

describe('AdminMindController', () => {
  type AdminMindServiceMock = AdminMindService & {
    getLift: jest.MockedFunction<AdminMindService['getLift']>;
    getRecentSurprise: jest.MockedFunction<AdminMindService['getRecentSurprise']>;
    getState: jest.MockedFunction<AdminMindService['getState']>;
    getConcepts: jest.MockedFunction<(ws: string, hours: number) => Promise<object>>;
    getHealth: jest.MockedFunction<(ws: string) => Promise<GetHealthResult>>;
    getBriefing: jest.MockedFunction<(ws: string) => Promise<object>>;
    askQuestion: jest.MockedFunction<(ws: string, q: string) => Promise<AskQuestionResult>>;
    generateReport: jest.MockedFunction<(ws: string) => Promise<GenerateReportResult>>;
  };

  function buildController() {
    const service = Object.assign(Object.create(AdminMindService.prototype) as AdminMindService, {
      getState: jest.fn(),
      getRecentSurprise: jest.fn(),
      getLift: jest.fn(),
      getConcepts: jest.fn(),
      getHealth: jest.fn(),
      getBriefing: jest.fn(),
      askQuestion: jest.fn(),
      generateReport: jest.fn(),
    }) as AdminMindServiceMock;

    return {
      service,
      controller: new AdminMindController(service),
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
            resolvedAt: new Date(),
            createdAt: new Date(),
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
            resolvedAt: new Date(),
            createdAt: new Date(),
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

  describe('GET :workspaceId/concepts', () => {
    it('returns concept detections for a workspace', async () => {
      const { controller, service } = buildController();
      service.getConcepts.mockResolvedValue({
        workspaceId: 'ws-1',
        workspaceName: 'Test',
        hours: 24,
        concepts: [{ concept: 'urgent_inquiry', count: 5 }],
        examples: [],
      });

      const result = await controller.concepts('ws-1', { hours: 24 });

      expect(service.getConcepts).toHaveBeenCalledWith('ws-1', 24);
      expect(result.concepts).toHaveLength(1);
      expect(result.concepts[0].concept).toBe('urgent_inquiry');
    });

    it('defaults hours to 24', async () => {
      const { controller, service } = buildController();
      service.getConcepts.mockResolvedValue({
        workspaceId: 'ws-1',
        workspaceName: 'Test',
        hours: 24,
        concepts: [],
        examples: [],
      });

      await controller.concepts('ws-1', { hours: undefined });

      expect(service.getConcepts).toHaveBeenCalledWith('ws-1', 24);
    });
  });

  describe('GET :workspaceId/health', () => {
    it('returns health dashboard for a workspace', async () => {
      const { controller, service } = buildController();
      service.getHealth.mockResolvedValue({
        workspaceId: 'ws-1',
        workspaceName: 'Test',
        runtime: null,
        pendingOutbox: 0,
        openPredictions: 5,
        openDecisions: 2,
      });

      const result = await controller.health('ws-1');

      expect(service.getHealth).toHaveBeenCalledWith('ws-1');
      expect(result.pendingOutbox).toBe(0);
      expect(result.openPredictions).toBe(5);
    });
  });

  describe('GET :workspaceId/briefing', () => {
    it('returns MIND briefing narrative', async () => {
      const { controller, service } = buildController();
      service.getBriefing.mockResolvedValue({
        workspaceId: 'ws-1',
        workspaceName: 'Test',
        briefing: 'MIND report summary text',
      });

      const result = await controller.briefing('ws-1');

      expect(service.getBriefing).toHaveBeenCalledWith('ws-1');
      expect(result.briefing).toBe('MIND report summary text');
    });
  });

  describe('POST :workspaceId/ask', () => {
    it('delegates question to service', async () => {
      const { controller, service } = buildController();
      const askPayload: AskQuestionResult = {
        workspaceId: 'ws-1',
        workspaceName: 'Test',
        answer: 'Resposta da MIND aqui.',
        state: {},
        lift: {},
        concepts: {},
      };
      service.askQuestion.mockResolvedValue(askPayload);

      const result = await controller.ask('ws-1', { question: 'Qual o lift de followups?' });

      expect(service.askQuestion).toHaveBeenCalledWith('ws-1', 'Qual o lift de followups?');
      expect(result.answer).toBe('Resposta da MIND aqui.');
    });
  });

  describe('POST :workspaceId/report', () => {
    it('generates daily report through service', async () => {
      const { controller, service } = buildController();
      const reportPayload: GenerateReportResult = {
        workspaceId: 'ws-1',
        workspaceName: 'Test',
        id: 'rpt-1',
        content: '# Relatorio diario MIND',
        metrics: {},
      };
      service.generateReport.mockResolvedValue(reportPayload);

      const result = await controller.report('ws-1');

      expect(service.generateReport).toHaveBeenCalledWith('ws-1');
      expect(result.content).toContain('Relatorio diario MIND');
    });
  });
});
