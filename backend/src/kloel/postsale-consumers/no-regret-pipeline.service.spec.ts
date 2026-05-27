import { NoRegretPipelineService } from './no-regret-pipeline.service';
import type { DetectionInput } from './postsale-consumers.types';

const ENTITY = { entityType: 'order' as const, entityId: 'ord-1' };
const WKS = 'ws-test';

function makeEvent(over?: Record<string, unknown>) {
  return {
    eventId: 'ev-1',
    eventName: 'commerce.payment.approved',
    workspaceId: WKS,
    entityRef: ENTITY,
    occurredAt: '2026-05-27T10:00:00.000Z',
    truthMode: 'observed' as const,
    ...over,
  };
}

describe('NoRegretPipelineService', () => {
  let service: NoRegretPipelineService;
  const mockAntiRemorse = {
    assess: jest.fn().mockReturnValue({
      remorseRiskScore: 0.1,
      recommendedAction: 'monitor' as const,
      entityRef: ENTITY,
      objectionRecoveryDetected: false,
    }),
  };
  const mockActivation = {
    track: jest.fn().mockReturnValue({
      completedSteps: 3,
      activationLikely: true,
      stalledDays: 0,
      evidenceEventIds: ['act-1'],
    }),
  };
  const mockFirstValue = {
    detect: jest.fn().mockResolvedValue({
      valueObtained: true,
      kind: 'activation_complete',
      evidenceEventIds: ['fv-1'],
      evidenceQuality: 'activation_signal' as const,
    }),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NoRegretPipelineService(
      mockAntiRemorse as any,
      mockActivation as any,
      mockFirstValue as any,
      undefined,
    );
  });

  function baseInput(over?: Partial<DetectionInput>): DetectionInput {
    return {
      events: [makeEvent(), makeEvent({ eventName: 'commerce.post_sale.activation_started' })],
      workspaceId: WKS,
      entityRef: ENTITY,
      nowMs: Date.parse('2026-05-27T12:00:00.000Z'),
      ...over,
    };
  }

  it('returns no_regret_confirmed phase when all signals green', async () => {
    const result = await service.assess(baseInput());

    expect(result.workspaceId).toBe(WKS);
    expect(result.entityRef).toEqual(ENTITY);
    expect(result.phase).toBe('no_regret_confirmed');
    expect(result.isNoRegret).toBe(true);
    expect(result.antiRemorse).toBeDefined();
    expect(result.activation).toBeDefined();
    expect(result.firstValue).toBeDefined();
    expect(result.control).toBeDefined();
    expect(result.control.riskClass).toBe('R1');
  });

  it('returns no_payment_observed when no payment event exists', async () => {
    const result = await service.assess(
      baseInput({
        events: [
          makeEvent({ eventName: 'commerce.lead.created' }),
        ],
      }),
    );

    expect(result.phase).toBe('no_payment_observed');
    expect(result.isNoRegret).toBe(false);
  });

  it('returns recovery_needed when anti-remorse recommends reassurance', async () => {
    mockAntiRemorse.assess.mockReturnValueOnce({
      remorseRiskScore: 0.8,
      recommendedAction: 'send_reassurance' as const,
      entityRef: ENTITY,
      objectionRecoveryDetected: false,
    });

    const result = await service.assess(baseInput());

    expect(result.phase).toBe('recovery_needed');
    expect(result.control.riskClass).toBe('R2');
    expect(result.control.delegationMode).toBe('owner_review');
  });

  it('returns stalled_risk when activation started but no first value', async () => {
    mockFirstValue.detect.mockResolvedValueOnce({
      valueObtained: false,
      kind: undefined,
      evidenceEventIds: [],
      evidenceQuality: 'insufficient' as const,
    });
    mockActivation.track.mockReturnValueOnce({
      completedSteps: 1,
      activationLikely: false,
      stalledDays: 7,
      evidenceEventIds: [],
    });

    const result = await service.assess(baseInput());

    expect(result.phase).toBe('stalled_risk');
    expect(result.control.riskClass).toBe('R2');
  });

  it('returns immediate_post_sale when recent payment and no activation', async () => {
    mockFirstValue.detect.mockResolvedValueOnce({
      valueObtained: false,
      kind: undefined,
      evidenceEventIds: [],
      evidenceQuality: 'insufficient' as const,
    });
    mockActivation.track.mockReturnValueOnce({
      completedSteps: 0,
      activationLikely: false,
      stalledDays: 0,
      evidenceEventIds: [],
    });

    const result = await service.assess(
      baseInput({
        events: [
          makeEvent({
            occurredAt: '2026-05-27T11:30:00.000Z',
          }),
        ],
      }),
    );

    expect(result.phase).toBe('immediate_post_sale');
  });

  it('returns silent_monitoring when window passed and no evidence', async () => {
    mockFirstValue.detect.mockResolvedValueOnce({
      valueObtained: false,
      kind: undefined,
      evidenceEventIds: [],
      evidenceQuality: 'insufficient' as const,
    });
    mockActivation.track.mockReturnValueOnce({
      completedSteps: 0,
      activationLikely: false,
      stalledDays: 0,
      evidenceEventIds: [],
    });

    const result = await service.assess(
      baseInput({
        events: [
          makeEvent({
            occurredAt: '2026-05-26T10:00:00.000Z',
          }),
        ],
      }),
    );

    expect(result.phase).toBe('silent_monitoring');
    expect(result.control.delegationMode).toBe('silent_monitoring');
  });

  it('returns value_forming when activation started but no-regret not confirmed', async () => {
    mockActivation.track.mockReturnValueOnce({
      completedSteps: 2,
      activationLikely: false,
      stalledDays: 2,
      evidenceEventIds: ['act-1'],
    });
    mockFirstValue.detect.mockResolvedValueOnce({
      valueObtained: true,
      kind: 'explicit_first_value',
      evidenceEventIds: ['fv-1'],
      evidenceQuality: 'value_signal' as const,
    });

    const result = await service.assess(
      baseInput({
        events: [
          makeEvent({
            occurredAt: '2026-05-26T10:00:00.000Z',
          }),
        ],
      }),
    );

    expect(result.phase).toBe('value_forming');
  });

  it('includes control with safeNextStep for every phase', async () => {
    const result = await service.assess(baseInput());

    expect(result.control.safeNextStep).toBeTruthy();
    expect(result.control.uncertainty).toBeTruthy();
    expect(result.control.leadOutcomeGuardrail).toBeTruthy();
    expect(result.control.rollback).toBeTruthy();
  });

  it('passes refundRisk to anti-remorse assessment', async () => {
    await service.assess(baseInput(), 0.5);

    expect(mockAntiRemorse.assess).toHaveBeenCalledWith(
      expect.anything(),
      0.5,
    );
  });

  it('includes assessedAt as ISO string', async () => {
    const result = await service.assess(baseInput());

    expect(result.assessedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
  });
});
