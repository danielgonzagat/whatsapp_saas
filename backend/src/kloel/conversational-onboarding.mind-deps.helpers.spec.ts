import {
  buildOnboardingMindSignalsDeps,
  emitOnboardingCognitionDecision,
} from './conversational-onboarding.mind-deps.helpers';

describe('buildOnboardingMindSignalsDeps', () => {
  const baseLogger = { warn: jest.fn() };
  const basePrisma = {
    autopilotEvent: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as Parameters<typeof buildOnboardingMindSignalsDeps>[0];

  it('returns only prisma and logger when no optional services are present', () => {
    const deps = buildOnboardingMindSignalsDeps(basePrisma, baseLogger, {});
    expect(Object.keys(deps).sort()).toEqual(['logger', 'prisma']);
  });

  it('spreads all optional services that are provided', () => {
    const attentionService = { id: 'att' } as unknown as NonNullable<
      Parameters<typeof buildOnboardingMindSignalsDeps>[2]['attentionService']
    >;
    const deps = buildOnboardingMindSignalsDeps(basePrisma, baseLogger, {
      attentionService,
    });
    expect(deps.attentionService).toBe(attentionService);
  });
});

describe('emitOnboardingCognitionDecision', () => {
  it('warns with reason=spine_not_injected when spine is undefined', async () => {
    const logger = { warn: jest.fn() };
    emitOnboardingCognitionDecision(undefined, logger, {
      workspaceId: 'ws-1',
      toolCallsCount: 0,
      completionStartMs: Date.now() - 10,
      modelUsed: 'deepseek-chat',
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(logger.warn).toHaveBeenCalledWith('kloel_cognition_event_skipped', {
      reason: 'spine_not_injected',
    });
  });

  it('calls spine.emit with cognition.decision_made event when spine is present', async () => {
    const logger = { warn: jest.fn() };
    const spine = { emit: jest.fn().mockResolvedValue(undefined) };
    emitOnboardingCognitionDecision(
      spine as unknown as Parameters<typeof emitOnboardingCognitionDecision>[0],
      logger,
      {
        workspaceId: 'ws-1',
        toolCallsCount: 2,
        completionStartMs: Date.now() - 25,
        modelUsed: 'deepseek-chat',
      },
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(spine.emit).toHaveBeenCalledTimes(1);
    const call = (spine.emit.mock.calls[0] as [Record<string, unknown>])[0];
    expect(call.eventName).toBe('cognition.decision_made');
    expect(call.workspaceId).toBe('ws-1');
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
