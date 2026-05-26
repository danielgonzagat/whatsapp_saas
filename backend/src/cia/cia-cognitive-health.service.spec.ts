import { CiaCognitiveHealthService } from './cia-cognitive-health.service';
import { GoalFieldService } from '../kloel/goal-field/goal-field.service';
import type { SpineEventRef } from '../kloel/mind/mind.types';
import type { Tension } from '../kloel/goal-field/goal-field.types';

// ── helpers ───────────────────────────────────────────────────────────

function ev(over: Partial<SpineEventRef> = {}): SpineEventRef {
  return {
    eventId: over.eventId ?? `e_${Math.random().toString(36).slice(2, 8)}`,
    eventName: over.eventName ?? 'commerce.lead.replied',
    workspaceId: over.workspaceId ?? 'ws_test',
    occurredAt: over.occurredAt ?? '2026-05-13T20:00:00.000Z',
    truthMode: over.truthMode ?? 'observed',
    ...(over.entityRef !== undefined ? { entityRef: over.entityRef } : {}),
    ...(over.payload !== undefined ? { payload: over.payload } : {}),
    ...(over.correlationId !== undefined
      ? { correlationId: over.correlationId }
      : {}),
    ...(over.valence !== undefined ? { valence: over.valence } : {}),
  };
}

function makeTension(over: Partial<Tension> = {}): Tension {
  return {
    tensionId: over.tensionId ?? `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    detectorName: over.detectorName ?? 'cognitive.test_detector',
    dimension: over.dimension ?? 'cognitive',
    workspaceId: over.workspaceId ?? 'ws_test',
    severity: over.severity ?? 0.5,
    description: over.description ?? 'test tension',
    detectedAt: over.detectedAt ?? new Date().toISOString(),
    evidenceEventIds: over.evidenceEventIds ?? [],
  };
}

// ── specs ────────────────────────────────────────────────────────────

describe('CiaCognitiveHealthService', () => {
  it('escalates cognitive tensions with severity >= 0.7', async () => {
    const tLow = makeTension({ severity: 0.4, description: 'low' });
    const tMid = makeTension({ severity: 0.7, description: 'mid' });
    const tHigh = makeTension({ severity: 0.95, description: 'high' });

    const goalField = new GoalFieldService();
    const runCycleSpy = jest
      .spyOn(goalField, 'runCycle')
      .mockReturnValue({
        mode: 'shadow' as const,
        tensions: [tLow, tMid, tHigh],
        aggregated: [],
        candidates: [],
        promoted: [],
        cycleAt: new Date().toISOString(),
      });

    const createMock = jest.fn().mockResolvedValue({ id: 'mem-1' });
    const prisma = { kloelMemory: { create: createMock } };
    const spine = {
      recentEventsAsRef: jest
        .fn()
        .mockReturnValue([ev({ workspaceId: 'ws_test' })]),
    };

    const svc = new CiaCognitiveHealthService(
      prisma as never,
      goalField,
      spine as never,
    );

    const result = await svc.scanAndEscalate('ws_test');

    expect(result).toEqual({ escalated: 2 });
    expect(createMock).toHaveBeenCalledTimes(2);

    expect(createMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'ws_test',
          key: `cog_health:${tMid.tensionId}`,
          category: 'cognitive_health_alert',
          type: 'alert',
          value: expect.objectContaining({
            tensionId: tMid.tensionId,
            severity: 0.7,
          }),
          content: 'mid',
          metadata: expect.objectContaining({ severity: 0.7 }),
        }),
      }),
    );

    expect(createMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: 'ws_test',
          key: `cog_health:${tHigh.tensionId}`,
          category: 'cognitive_health_alert',
          type: 'alert',
          value: expect.objectContaining({
            tensionId: tHigh.tensionId,
            severity: 0.95,
          }),
          content: 'high',
          metadata: expect.objectContaining({ severity: 0.95 }),
        }),
      }),
    );

    const lowCall = createMock.mock.calls.find(
      (call: unknown[]) => {
        const arg = call?.[0] as Record<string, unknown> | undefined;
        return (
          arg?.data &&
          typeof arg.data === 'object' &&
          (arg.data as Record<string, unknown>).content === 'low'
        );
      },
    );
    expect(lowCall).toBeUndefined();

    runCycleSpy.mockRestore();
  });

  it('filters events to the target workspace', async () => {
    const goalField = new GoalFieldService();
    const runCycleSpy = jest
      .spyOn(goalField, 'runCycle')
      .mockReturnValue({
        mode: 'shadow' as const,
        tensions: [],
        aggregated: [],
        candidates: [],
        promoted: [],
        cycleAt: new Date().toISOString(),
      });

    const createMock = jest.fn().mockResolvedValue({ id: 'mem-1' });
    const prisma = { kloelMemory: { create: createMock } };

    const ws1Events = [ev({ workspaceId: 'ws-1' })];
    const ws2Events = [ev({ workspaceId: 'ws-2' })];
    const spine = {
      recentEventsAsRef: jest.fn().mockReturnValue([...ws1Events, ...ws2Events]),
    };

    const svc = new CiaCognitiveHealthService(
      prisma as never,
      goalField,
      spine as never,
    );

    await svc.scanAndEscalate('ws-1');

    expect(spine.recentEventsAsRef).toHaveBeenCalled();
    const cycleEvents = runCycleSpy.mock.calls[0]?.[0]?.events as
      | SpineEventRef[]
      | undefined;
    expect(cycleEvents).toHaveLength(1);
    expect(cycleEvents?.[0]?.workspaceId).toBe('ws-1');

    runCycleSpy.mockRestore();
  });

  it('returns escalated=0 when no tensions meet threshold', async () => {
    const goalField = new GoalFieldService();
    const runCycleSpy = jest
      .spyOn(goalField, 'runCycle')
      .mockReturnValue({
        mode: 'shadow' as const,
        tensions: [makeTension({ severity: 0.4 }), makeTension({ severity: 0.55 })],
        aggregated: [],
        candidates: [],
        promoted: [],
        cycleAt: new Date().toISOString(),
      });

    const createMock = jest.fn().mockResolvedValue({ id: 'mem-1' });
    const prisma = { kloelMemory: { create: createMock } };
    const spine = {
      recentEventsAsRef: jest
        .fn()
        .mockReturnValue([ev({ workspaceId: 'ws_test' })]),
    };

    const svc = new CiaCognitiveHealthService(
      prisma as never,
      goalField,
      spine as never,
    );

    const result = await svc.scanAndEscalate('ws_test');

    expect(result).toEqual({ escalated: 0 });
    expect(createMock).not.toHaveBeenCalled();

    runCycleSpy.mockRestore();
  });

  it('skips non-cognitive tensions even with high severity', async () => {
    const goalField = new GoalFieldService();
    const runCycleSpy = jest
      .spyOn(goalField, 'runCycle')
      .mockReturnValue({
        mode: 'shadow' as const,
        tensions: [
          makeTension({ dimension: 'commercial', severity: 0.95 }),
          makeTension({ dimension: 'financial', severity: 0.85 }),
        ],
        aggregated: [],
        candidates: [],
        promoted: [],
        cycleAt: new Date().toISOString(),
      });

    const createMock = jest.fn().mockResolvedValue({ id: 'mem-1' });
    const prisma = { kloelMemory: { create: createMock } };
    const spine = {
      recentEventsAsRef: jest
        .fn()
        .mockReturnValue([ev({ workspaceId: 'ws_test' })]),
    };

    const svc = new CiaCognitiveHealthService(
      prisma as never,
      goalField,
      spine as never,
    );

    const result = await svc.scanAndEscalate('ws_test');

    expect(result).toEqual({ escalated: 0 });
    expect(createMock).not.toHaveBeenCalled();

    runCycleSpy.mockRestore();
  });

  it('survives create failure and continues escalating remaining tensions', async () => {
    const t1 = makeTension({ severity: 0.7, description: 'first' });
    const t2 = makeTension({ severity: 0.8, description: 'second' });

    const goalField = new GoalFieldService();
    const runCycleSpy = jest
      .spyOn(goalField, 'runCycle')
      .mockReturnValue({
        mode: 'shadow' as const,
        tensions: [t1, t2],
        aggregated: [],
        candidates: [],
        promoted: [],
        cycleAt: new Date().toISOString(),
      });

    const createMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({ id: 'mem-2' });
    const prisma = { kloelMemory: { create: createMock } };
    const spine = {
      recentEventsAsRef: jest
        .fn()
        .mockReturnValue([ev({ workspaceId: 'ws_test' })]),
    };

    const svc = new CiaCognitiveHealthService(
      prisma as never,
      goalField,
      spine as never,
    );

    const result = await svc.scanAndEscalate('ws_test');

    expect(result).toEqual({ escalated: 1 });
    expect(createMock).toHaveBeenCalledTimes(2);

    runCycleSpy.mockRestore();
  });
});
