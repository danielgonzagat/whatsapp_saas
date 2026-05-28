/**
 * Shared fixtures and helpers for MindPolicyService spec files.
 *
 * Split out of the original 851-LOC `mind-policy.service.spec.ts` so each
 * domain (choose / wisdom priors / resolve outcomes / confirm autopilot) can
 * live in its own spec file without duplicating the prisma/belief mock
 * builders.
 */

export type MindPolicyUpdateManyArgs = {
  data: { baselineOutcome: number };
};

export function objectContaining<T extends object>(sample: T): T {
  const matcher: unknown = expect.objectContaining(sample);
  return matcher as T;
}

export function firstMockArg<T>(mock: jest.Mock, callIndex = 0): T {
  const call = mock.mock.calls[callIndex] as readonly unknown[] | undefined;
  return call?.[0] as T;
}

export const buildBeliefs = (beliefs: Array<{ mean: number; variance: number }>) => {
  const getOrInit = jest.fn();
  for (const belief of beliefs) {
    getOrInit.mockReturnValueOnce(Promise.resolve(belief));
  }
  return { getOrInit };
};

export const buildPrisma = (
  harnessRows: Array<{ outcome: number; baselineOutcome: number | null }> = [],
) => ({
  $executeRaw: jest.fn().mockResolvedValue(1),
  $queryRaw: jest.fn().mockResolvedValue(harnessRows),
  workspace: {
    findUnique: jest.fn().mockResolvedValue({ globalPriorOptOut: false }),
  },
  mindPolicy: {
    findMany: jest
      .fn()
      .mockResolvedValue(
        harnessRows.map((r) => ({ outcome: r.outcome, baselineOutcome: r.baselineOutcome })),
      ),
    create: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
  },
});
