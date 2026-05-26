import { MindReportService } from './mind-report.service';

function reportHarness() {
  const prisma = {
    mindWorkspaceState: {
      findUnique: jest.fn().mockResolvedValue({
        lastTickAt: new Date('2026-05-07T12:00:00Z'),
        tickCount: 3,
        perceivedWindow: 9,
        surpriseWindow: 0.7,
      }),
    },
    mindConceptDetection: { findMany: jest.fn().mockResolvedValue([]) },
    mindDailyReport: { upsert: jest.fn(async ({ create }) => create) },
  };
  const beliefs = { list: jest.fn().mockResolvedValue([]) };
  const policy = {
    harness: jest.fn().mockResolvedValue({
      lift: 0,
      mindMean: 0,
      baselineMean: 0,
      n: 0,
      pZScore: 0,
    }),
  };
  const simulator = {
    simulateSyntheticWorkspace: jest.fn().mockReturnValue({
      summary: { overallVerdict: 'clean', totalDecisions: 3, qualityFailed: 0 },
    }),
  };
  const service = new MindReportService(
    prisma as never,
    beliefs as never,
    policy as never,
    simulator as never,
  );
  return { beliefs, policy, prisma, service, simulator };
}

describe('MindReportService', () => {
  it('generates a backend-first markdown health report with synthetic simulation', async () => {
    const { policy, service, simulator } = reportHarness();

    const report = await service.generateDaily('ws-1', new Date('2026-05-07T00:00:00Z'));

    expect(report.content).toContain('# Relatorio diario MIND');
    expect(report.content).toContain('## Lift por decisao');
    expect(report.content).toContain('## Simulacao sintetica');
    expect(simulator.simulateSyntheticWorkspace).toHaveBeenCalledWith('ws-1', 20260507);
    expect(policy.harness).toHaveBeenCalledWith('ws-1', 'followup_timing', 14);
  });

  it('surfaces daily report persistence failures after collecting lift evidence', async () => {
    const { policy, prisma, service } = reportHarness();
    prisma.mindWorkspaceState.findUnique.mockResolvedValueOnce(null);
    prisma.mindDailyReport.upsert.mockRejectedValueOnce(new Error('report write failed'));

    await expect(service.generateDaily('ws-1', new Date('2026-05-07T00:00:00Z'))).rejects.toThrow(
      'report write failed',
    );
    expect(policy.harness).toHaveBeenCalledWith('ws-1', 'followup_timing', 14);
  });
});
