import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MindBeliefService } from '../../kloel/mind-belief.service';
import { MindPolicyService } from '../../kloel/mind-policy.service';
import { MindObservabilityService } from '../../kloel/mind-observability.service';
import { MindReportService } from '../../kloel/mind-report.service';
import { MindLiftReportService } from '../../kloel/mind-lift-report.service';
import { AdminMindService } from './admin-mind.service';

describe('AdminMindService', () => {
  let service: AdminMindService;
  let prisma: {
    workspace: { findUnique: jest.Mock };
    mindPrediction: { findMany: jest.Mock };
    $queryRaw: jest.Mock;
  };
  let beliefs: { list: jest.Mock };
  let policy: { harness: jest.Mock };
  let observability: {
    concepts: jest.Mock;
    health: jest.Mock;
    briefing: jest.Mock;
    ask: jest.Mock;
  };
  let reports: { generateDaily: jest.Mock };
  let liftReport: { aggregate: jest.Mock };

  beforeEach(async () => {
    prisma = {
      workspace: { findUnique: jest.fn() },
      mindPrediction: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    beliefs = { list: jest.fn().mockResolvedValue([]) };
    policy = { harness: jest.fn().mockResolvedValue({}) };
    observability = {
      concepts: jest.fn().mockResolvedValue({ concepts: [] }),
      health: jest.fn().mockResolvedValue({ runtime: null }),
      briefing: jest.fn().mockResolvedValue({ ok: true }),
      ask: jest.fn().mockResolvedValue({ answer: 'a' }),
    };
    reports = { generateDaily: jest.fn().mockResolvedValue({ ok: true }) };
    liftReport = { aggregate: jest.fn().mockResolvedValue({ rows: [] }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminMindService,
        { provide: PrismaService, useValue: prisma },
        { provide: MindBeliefService, useValue: beliefs },
        { provide: MindLiftReportService, useValue: liftReport },
        { provide: MindPolicyService, useValue: policy },
        { provide: MindObservabilityService, useValue: observability },
        { provide: MindReportService, useValue: reports },
      ],
    }).compile();
    service = module.get(AdminMindService);
  });

  describe('NotFoundException on missing workspace', () => {
    const expectations: Array<[string, () => Promise<unknown>]> = [
      ['getState', () => service.getState('ws-missing')],
      ['getRecentSurprise', () => service.getRecentSurprise('ws-missing')],
      ['getConcepts', () => service.getConcepts('ws-missing')],
      ['getHealth', () => service.getHealth('ws-missing')],
      ['getBriefing', () => service.getBriefing('ws-missing')],
      ['askQuestion', () => service.askQuestion('ws-missing', 'q?')],
      ['generateReport', () => service.generateReport('ws-missing')],
    ];

    for (const [name, fn] of expectations) {
      it(`${name} throws NotFoundException`, async () => {
        prisma.workspace.findUnique.mockResolvedValue(null);
        await expect(fn()).rejects.toThrow(NotFoundException);
      });
    }
  });

  describe('happy path delegation', () => {
    beforeEach(() => {
      prisma.workspace.findUnique.mockResolvedValue({ id: 'ws-1', name: 'My WS' });
    });

    it('getConcepts enriches observability result with workspace info', async () => {
      observability.concepts.mockResolvedValue({ concepts: [{ concept: 'x', count: 1 }] });
      const result = await service.getConcepts('ws-1', 12);
      expect(observability.concepts).toHaveBeenCalledWith('ws-1', 12);
      expect(result.workspaceId).toBe('ws-1');
      expect(result.workspaceName).toBe('My WS');
    });

    it('getHealth delegates to observability.health', async () => {
      observability.health.mockResolvedValue({ runtime: { workspaceId: 'ws-1' } });
      const result = await service.getHealth('ws-1');
      expect(observability.health).toHaveBeenCalledWith('ws-1');
      expect(result.workspaceId).toBe('ws-1');
    });

    it('getBriefing delegates to observability.briefing', async () => {
      const result = await service.getBriefing('ws-1');
      expect(observability.briefing).toHaveBeenCalledWith('ws-1');
      expect(result.workspaceName).toBe('My WS');
    });

    it('askQuestion forwards question text to observability.ask', async () => {
      await service.askQuestion('ws-1', 'what now?');
      expect(observability.ask).toHaveBeenCalledWith('ws-1', 'what now?');
    });

    it('generateReport delegates to reports.generateDaily', async () => {
      await service.generateReport('ws-1');
      expect(reports.generateDaily).toHaveBeenCalledWith('ws-1');
    });

    it('getRecentSurprise queries mindPrediction with resolved+surprise filter and limit', async () => {
      await service.getRecentSurprise('ws-1', 5);
      const arg = prisma.mindPrediction.findMany.mock.calls[0][0];
      expect(arg.where.workspaceId).toBe('ws-1');
      expect(arg.where.resolvedAt).toEqual({ not: null });
      expect(arg.take).toBe(5);
    });
  });
});
