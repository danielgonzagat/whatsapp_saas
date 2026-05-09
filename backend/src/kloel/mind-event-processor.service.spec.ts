import { MindEventProcessorService } from './mind-event-processor.service';

describe('MindEventProcessorService', () => {
  const predictor = {
    predictConversion: jest.fn(),
    predictReply: jest.fn(),
  };
  const surprise = {
    resolveBinary: jest.fn(),
  };
  const policy = {
    resolveOpenForSubject: jest.fn(),
  };
  const cases = {
    recordCase: jest.fn(),
  };
  const concepts = {
    detect: jest.fn(),
  };

  let service: MindEventProcessorService;

  beforeEach(() => {
    jest.clearAllMocks();
    predictor.predictConversion.mockResolvedValue({});
    predictor.predictReply.mockResolvedValue({});
    surprise.resolveBinary.mockResolvedValue(0);
    policy.resolveOpenForSubject.mockResolvedValue(1);
    cases.recordCase.mockResolvedValue(undefined);
    concepts.detect.mockResolvedValue(undefined);
    service = new MindEventProcessorService(
      predictor as never,
      surprise as never,
      policy as never,
      cases as never,
      concepts as never,
    );
  });

  it('closes reply-oriented MIND decisions when an inbound message arrives', async () => {
    await service.process({
      kind: 'message.received',
      workspaceId: 'ws-1',
      subject: 'contact:lead-1',
      payload: { channel: 'instagram', content: 'quero comprar' },
      occurredAt: new Date('2026-05-09T12:00:00.000Z'),
    });

    expect(policy.resolveOpenForSubject).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      subject: 'contact:lead-1',
      decisionType: 'followup_timing',
      outcome: 1,
      baselineOutcome: 1,
    });
    for (const decisionType of ['audio_vs_text', 'message_format', 'tom', 'channel_choice']) {
      expect(policy.resolveOpenForSubject).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        subject: 'workspace:ws-1',
        decisionType,
        outcome: 1,
        baselineOutcome: 1,
      });
    }
  });

  it('closes conversion-oriented MIND decisions when checkout is paid', async () => {
    await service.process({
      kind: 'checkout.paid',
      workspaceId: 'ws-1',
      subject: 'order:order-1',
      payload: { status: 'PAID' },
      occurredAt: new Date('2026-05-09T12:00:00.000Z'),
    });

    expect(policy.resolveOpenForSubject).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      subject: 'order:order-1',
      decisionType: 'cart_recovery',
      outcome: 1,
      baselineOutcome: 1,
    });
    for (const decisionType of ['coupon_offer', 'product_offer', 'objection_response']) {
      expect(policy.resolveOpenForSubject).toHaveBeenCalledWith({
        workspaceId: 'ws-1',
        subject: 'workspace:ws-1',
        decisionType,
        outcome: 1,
        baselineOutcome: 1,
      });
    }
  });

  it('closes human transfer decisions when autopilot qualifies a lead', async () => {
    await service.process({
      kind: 'autopilot.lead_qualified.completed',
      workspaceId: 'ws-1',
      subject: 'contact:lead-1',
      payload: { intent: 'lead_qualified' },
      occurredAt: new Date('2026-05-09T12:00:00.000Z'),
    });

    expect(policy.resolveOpenForSubject).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      subject: 'workspace:ws-1',
      decisionType: 'human_transfer',
      outcome: 1,
      baselineOutcome: 1,
    });
  });
});
