import { buildMindSignals } from './build-mind-signals.helper';
import { mockLogger, mockPrisma } from './build-mind-signals.helper.fixtures';

interface RiskClassSignal {
  tier: string;
  reasons: string[];
  recommendedAction: string;
}

/** Narrows the untyped `riskClass` signal for assertions without weakening it. */
function asRiskClass(value: unknown): RiskClassSignal {
  return value as RiskClassSignal;
}

describe('buildMindSignals — riskClass (PI-k8)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('attaches riskClass when riskClassService is injected (routine message → R1)', async () => {
    const mockClassify = jest.fn().mockReturnValue({
      class: 'R1' as const,
      autonomyMode: 'allowed_alone' as const,
      requiredEvidenceLevel: 'N1' as const,
      rollback: ['revert_locally', 'notify_operator'],
    });

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        riskClassService: { classify: mockClassify },
        logger: mockLogger,
      },
      'ws-1',
      'olá, tudo bem?',
    );

    expect(mockClassify).toHaveBeenCalledWith({
      kind: 'message_send',
      target: 'lead',
      reversible: true,
    });
    expect(result.riskClass).toEqual({
      tier: 'R1',
      reasons: ['revert_locally', 'notify_operator'],
      recommendedAction: 'allowed_alone',
    });
  });

  it('infers payment_action from payment keywords in message', async () => {
    const mockClassify = jest.fn().mockReturnValue({
      class: 'R2' as const,
      autonomyMode: 'requires_approval' as const,
      requiredEvidenceLevel: 'N2' as const,
      rollback: ['request_approval_reversal', 'audit_log_entry', 'notify_owner'],
    });

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        riskClassService: { classify: mockClassify },
        logger: mockLogger,
      },
      'ws-1',
      'quero pagar com pix no valor de 500 reais',
    );

    expect(mockClassify).toHaveBeenCalledWith({
      kind: 'payment_action',
      target: 'lead',
      reversible: true,
      financialImpactCents: 0,
    });
    expect(result.riskClass).toEqual({
      tier: 'R2',
      reasons: ['request_approval_reversal', 'audit_log_entry', 'notify_owner'],
      recommendedAction: 'requires_approval',
    });
  });

  it('infers payment_action from financial concepts', async () => {
    const mockClassify = jest.fn().mockReturnValue({
      class: 'R1' as const,
      autonomyMode: 'allowed_alone' as const,
      requiredEvidenceLevel: 'N1' as const,
      rollback: ['revert_locally', 'notify_operator'],
    });

    void (await buildMindSignals(
      {
        prisma: mockPrisma(),
        mindConceptService: {
          detect: jest.fn().mockResolvedValue([{ concept: 'payment_intent', confidence: 0.9 }]),
        },
        riskClassService: { classify: mockClassify },
        logger: mockLogger,
      },
      'ws-1',
      'hello',
    ));

    expect(mockClassify).toHaveBeenCalledWith({
      kind: 'payment_action',
      target: 'lead',
      reversible: true,
      financialImpactCents: 0,
    });
  });

  it('infers lead_block from block keywords', async () => {
    const mockClassify = jest.fn().mockReturnValue({
      class: 'R2' as const,
      autonomyMode: 'requires_approval' as const,
      requiredEvidenceLevel: 'N2' as const,
      rollback: ['request_approval_reversal', 'audit_log_entry', 'notify_owner'],
    });

    void (await buildMindSignals(
      {
        prisma: mockPrisma(),
        riskClassService: { classify: mockClassify },
        logger: mockLogger,
      },
      'ws-1',
      'preciso bloquear esse lead suspeito',
    ));

    expect(mockClassify).toHaveBeenCalledWith({
      kind: 'lead_block',
      target: 'lead',
      reversible: true,
    });
  });

  it('infers public_response from public keywords', async () => {
    const mockClassify = jest.fn().mockReturnValue({
      class: 'R3' as const,
      autonomyMode: 'must_escalate' as const,
      requiredEvidenceLevel: 'N4' as const,
      rollback: ['escalate_to_human', 'freeze_action', 'audit_trail_full', 'notify_owner_manager'],
    });

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        riskClassService: { classify: mockClassify },
        logger: mockLogger,
      },
      'ws-1',
      'vou publicar esse anúncio no site',
    );

    expect(mockClassify).toHaveBeenCalledWith({
      kind: 'public_response',
      target: 'public',
      reversible: true,
    });
    expect(asRiskClass(result.riskClass).reasons).toHaveLength(3);
  });

  it('does NOT attach riskClass when riskClassService is absent', async () => {
    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        logger: mockLogger,
      },
      'ws-1',
      'hello',
    );

    expect(result.riskClass).toBeUndefined();
  });

  it('tolerates classify failure gracefully (logs and skips)', async () => {
    const mockClassify = jest.fn().mockImplementation(() => {
      throw new Error('classification engine offline');
    });

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        riskClassService: { classify: mockClassify },
        logger: mockLogger,
      },
      'ws-1',
      'hello',
    );

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'kloel_risk_class_skipped',
      expect.objectContaining({ reason: 'classification engine offline' }),
    );
    expect(result.riskClass).toBeUndefined();
  });

  it('slices rollback reasons to at most 3', async () => {
    const longRollback = ['a', 'b', 'c', 'd', 'e'];
    const mockClassify = jest.fn().mockReturnValue({
      class: 'R4' as const,
      autonomyMode: 'forbidden' as const,
      requiredEvidenceLevel: 'N6' as const,
      rollback: longRollback,
    });

    const result = await buildMindSignals(
      {
        prisma: mockPrisma(),
        riskClassService: { classify: mockClassify },
        logger: mockLogger,
      },
      'ws-1',
      'hello',
    );

    const riskClass = asRiskClass(result.riskClass);
    expect(riskClass.reasons).toHaveLength(3);
    expect(riskClass.reasons).toEqual(['a', 'b', 'c']);
    expect(riskClass.tier).toBe('R4');
    expect(riskClass.recommendedAction).toBe('forbidden');
  });
});
