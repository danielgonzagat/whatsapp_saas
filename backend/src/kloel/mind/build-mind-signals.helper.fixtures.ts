export const mockLogger = { warn: jest.fn() };

export const makeAutopilotRow = (
  overrides: Partial<{ id: string; intent: string; action: string; createdAt: Date }> = {},
) => ({
  id: overrides.id ?? 'evt-001',
  intent: overrides.intent ?? 'commerce.lead.replied',
  action: overrides.action ?? '',
  createdAt: overrides.createdAt ?? new Date(),
});

export const mockPrisma = (rows: ReturnType<typeof makeAutopilotRow>[] = []) => ({
  autopilotEvent: { findMany: jest.fn().mockResolvedValue(rows) },
});
