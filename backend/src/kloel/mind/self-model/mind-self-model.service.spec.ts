import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { MindSelfModelService, SELF_MODEL_RETENTION_VERSIONS } from './mind-self-model.service';
import { castMock } from '../../../../test/helpers/cast-mock';

describe('MindSelfModelService', () => {
  let service: MindSelfModelService;
  let prisma: {
    mindWorkspaceState: { findUnique: jest.Mock };
    mindDailyReport: { findFirst: jest.Mock };
    mindSelfModel: {
      findFirst: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      deleteMany: jest.Mock;
    };
  };

  const baseState = {
    workspaceId: 'ws-1',
    tickCount: 120,
    surpriseWindow: 2,
    perceivedWindow: 10,
    openDecisions: 3,
    lastError: null,
    lastTickAt: new Date('2026-05-29T00:00:00.000Z'),
    health: { status: 'ok' },
  };

  const baseReport = {
    workspaceId: 'ws-1',
    reportDate: new Date('2026-05-28T00:00:00.000Z'),
    metrics: {
      lifts: [
        { decisionType: 'reply', lift: 0.2 },
        { decisionType: 'wait', lift: -0.1 },
      ],
    },
  };

  beforeEach(async () => {
    prisma = {
      mindWorkspaceState: { findUnique: jest.fn().mockResolvedValue(baseState) },
      mindDailyReport: { findFirst: jest.fn().mockResolvedValue(baseReport) },
      mindSelfModel: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...data })),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [MindSelfModelService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(MindSelfModelService);
  });

  describe('derive', () => {
    it('derives beliefs_about_self, decision_patterns, known_limits from state + report', async () => {
      const derived = await service.derive('ws-1');

      expect(derived.beliefsAboutSelf).toMatchObject({
        hasOperated: true,
        maturity: 'experienced',
        observedTicks: 120,
        perceivesEnvironment: true,
        healthStatus: 'ok',
      });
      expect(derived.decisionPatterns).toMatchObject({
        openDecisions: 3,
        measuredDecisionTypes: 2,
        decisionTypesWithPositiveLift: 1,
        bestLift: 0.2,
      });
      expect(derived.knownLimits).toMatchObject({
        hasRecentFailure: false,
        coldStart: false,
        noLiftEvidence: false,
        degradedSubsystems: [],
      });
      expect(derived.derivedFrom).toMatchObject({ hadState: true, hadReport: true });
    });

    it('reports cold-start limits when there is no state or report', async () => {
      prisma.mindWorkspaceState.findUnique.mockResolvedValue(null);
      prisma.mindDailyReport.findFirst.mockResolvedValue(null);

      const derived = await service.derive('ws-1');
      expect(derived.beliefsAboutSelf).toMatchObject({
        hasOperated: false,
        maturity: 'cold-start',
      });
      expect(derived.knownLimits).toMatchObject({ coldStart: true, noLiftEvidence: true });
    });
  });

  describe('snapshot', () => {
    it('appends a versioned row (version 1) when no prior version exists', async () => {
      const row = await service.snapshot('ws-1');

      expect(prisma.mindSelfModel.create).toHaveBeenCalledTimes(1);
      const createArg = castMock<
        [
          {
            data: {
              workspaceId: string;
              version: number;
              beliefsAboutSelf: unknown;
              decisionPatterns: unknown;
              knownLimits: unknown;
              contradictions: unknown;
              id: string;
            };
          },
        ]
      >(prisma.mindSelfModel.create.mock.calls[0])[0].data;
      expect(createArg.workspaceId).toBe('ws-1');
      expect(createArg.version).toBe(1);
      expect(createArg.beliefsAboutSelf).toBeDefined();
      expect(createArg.decisionPatterns).toBeDefined();
      expect(createArg.knownLimits).toBeDefined();
      expect(createArg.contradictions).toEqual([]);
      expect(typeof createArg.id).toBe('string');
      expect(row.version).toBe(1);
    });

    it('increments version off the latest persisted row (append-only)', async () => {
      prisma.mindSelfModel.findFirst.mockResolvedValue({
        version: 7,
        beliefsAboutSelf: { maturity: 'experienced', hasOperated: true },
        decisionPatterns: {},
        knownLimits: {},
        derivedFrom: {},
      });

      await service.snapshot('ws-1');
      expect(
        castMock<[{ data: { version: number } }]>(prisma.mindSelfModel.create.mock.calls[0])[0].data
          .version,
      ).toBe(8);
    });

    it('flags a contradiction when a self-belief flips vs the previous version', async () => {
      // Previous version believed it had a recent failure and was a cold-start;
      // current derived state contradicts both.
      prisma.mindSelfModel.findFirst.mockResolvedValue({
        version: 3,
        beliefsAboutSelf: { hasOperated: false, maturity: 'cold-start' },
        decisionPatterns: {},
        knownLimits: { hasRecentFailure: true },
        derivedFrom: {},
      });

      const row = await service.snapshot('ws-1');
      const persistedContradictions = castMock<
        [{ data: { contradictions: Array<{ field: string }> } }]
      >(prisma.mindSelfModel.create.mock.calls[0])[0].data.contradictions;

      expect(persistedContradictions.length).toBeGreaterThan(0);
      const fields = persistedContradictions.map((c) => c.field);
      expect(fields).toContain('beliefsAboutSelf.hasOperated');
      expect(fields).toContain('beliefsAboutSelf.maturity');
      expect(fields).toContain('knownLimits.hasRecentFailure');
      expect(row.version).toBe(4);
    });

    it('records no contradictions when the self-model is stable vs the previous version', async () => {
      const stable = await service.derive('ws-1');
      prisma.mindSelfModel.findFirst.mockResolvedValue({
        version: 2,
        beliefsAboutSelf: stable.beliefsAboutSelf,
        decisionPatterns: stable.decisionPatterns,
        knownLimits: stable.knownLimits,
        derivedFrom: stable.derivedFrom,
      });

      await service.snapshot('ws-1');
      expect(
        castMock<[{ data: { contradictions: unknown } }]>(
          prisma.mindSelfModel.create.mock.calls[0],
        )[0].data.contradictions,
      ).toEqual([]);
    });
  });

  describe('detectContradictions', () => {
    it('returns empty when there is no previous version', () => {
      const next = {
        beliefsAboutSelf: { hasOperated: true },
        decisionPatterns: {},
        knownLimits: {},
        derivedFrom: {},
      };
      expect(service.detectContradictions(null, next)).toEqual([]);
    });
  });

  describe('prune (retention)', () => {
    it('no-ops on empty workspaceId', async () => {
      const result = await service.prune('');
      expect(result.deleted).toBe(0);
      expect(prisma.mindSelfModel.deleteMany).not.toHaveBeenCalled();
    });

    it('no-ops when fewer than keepVersions rows exist (no boundary row)', async () => {
      prisma.mindSelfModel.findMany.mockResolvedValue([]); // boundary lookup empty
      const result = await service.prune('ws-1', { keepVersions: 200 });
      expect(result.deleted).toBe(0);
      expect(prisma.mindSelfModel.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes rows below the version cutoff AND older than the age floor', async () => {
      // The Nth-newest version is 50 -> anything strictly below 50 AND older
      // than the 90-day floor gets reaped.
      prisma.mindSelfModel.findMany.mockResolvedValue([{ version: 50 }]);
      prisma.mindSelfModel.deleteMany.mockResolvedValue({ count: 17 });

      const result = await service.prune('ws-1', { keepVersions: 200, maxAgeDays: 90 });

      expect(result.deleted).toBe(17);
      const where = castMock<[{ where: { workspaceId: string; version: { lt: number } } }]>(
        prisma.mindSelfModel.deleteMany.mock.calls[0],
      )[0].where;
      expect(where.workspaceId).toBe('ws-1');
      expect(where.version.lt).toBe(50);
      expect(where).toHaveProperty('snapshotAt');
    });

    it('uses the SELF_MODEL_RETENTION_VERSIONS default for the boundary skip', async () => {
      prisma.mindSelfModel.findMany.mockResolvedValue([{ version: 5 }]);
      prisma.mindSelfModel.deleteMany.mockResolvedValue({ count: 0 });

      await service.prune('ws-1');

      const findArgs = castMock<[{ skip: number; take: number }]>(
        prisma.mindSelfModel.findMany.mock.calls[0],
      )[0];
      // boundary lookup skips keepVersions-1 to land on the Nth-newest row.
      expect(findArgs.skip).toBe(SELF_MODEL_RETENTION_VERSIONS - 1);
      expect(findArgs.take).toBe(1);
    });

    it('snapshot triggers a best-effort prune that never breaks the append', async () => {
      prisma.mindSelfModel.findMany.mockResolvedValue([{ version: 10 }]);
      prisma.mindSelfModel.deleteMany.mockRejectedValue(new Error('db down'));

      // snapshot must still resolve with the appended row despite a prune throw.
      const row = await service.snapshot('ws-1');
      expect(row.version).toBe(1);
      // allow the fire-and-forget prune promise to settle.
      await new Promise((resolve) => setImmediate(resolve));
    });
  });
});
