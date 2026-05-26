import { KloelReflexivityService } from './kloel-reflexivity.service';

const GENERATED_AT = '2026-05-25T12:00:00.000Z';

function reflexivityHarness() {
  const prisma = {
    workspace: {
      findMany: jest.fn().mockResolvedValue([{ id: 'ws-1' }]),
    },
    mindDailyReport: {
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  const service = new KloelReflexivityService(prisma as never);
  const report = {
    generatedAt: GENERATED_AT,
    workspaceId: 'ws-1',
    periodHours: 24,
    totalDecisions: 3,
    successfulDecisions: 2,
    failedDecisions: 1,
    successRate: 0.6667,
    topPatterns: [],
    pendingDecisions: 0,
    recommendations: ['keep measuring'],
  };

  jest.spyOn(service, 'generateReport').mockResolvedValue(report);

  return { prisma, report, service };
}

describe('KloelReflexivityService', () => {
  it('persists periodic reports through an idempotent daily upsert', async () => {
    const { prisma, report, service } = reflexivityHarness();

    await service.periodicReflexivity();

    expect(prisma.mindDailyReport.upsert).toHaveBeenCalledTimes(1);
    const call = prisma.mindDailyReport.upsert.mock.calls.at(0);
    if (!call) {
      throw new Error('expected mindDailyReport upsert call');
    }
    const [input] = call;
    const reportDate = new Date(GENERATED_AT);
    const content = JSON.stringify(report);
    const metrics = {
      totalDecisions: 3,
      successRate: 0.6667,
      recommendations: ['keep measuring'],
    };

    expect(input).toEqual({
      where: {
        workspaceId_reportDate: {
          workspaceId: 'ws-1',
          reportDate,
        },
      },
      update: {
        content,
        metrics,
      },
      create: {
        id: input.create.id,
        workspaceId: 'ws-1',
        reportDate,
        content,
        metrics,
      },
    });
    expect(input.create.id).toHaveLength(36);
    expect(input.create.id).not.toContain('reflex_ws-1_');
  });
});
