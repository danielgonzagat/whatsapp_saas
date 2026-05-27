import { PipelineService, type DecisionShadowInput } from './pipeline.service';
import { createPartialPrismaMock } from '../../../test/helpers/prisma.mock';

describe('PipelineService', () => {
  const prisma = createPartialPrismaMock({
    pipelineState: ['findUnique', 'create', 'upsert', 'update', 'updateMany'],
    decisionShadow: ['upsert'],
  });
  const events = {
    recordCommercial: jest.fn(),
  };

  let service: PipelineService;

  beforeEach(() => {
    jest.clearAllMocks();
    events.recordCommercial.mockResolvedValue(undefined);
    service = new PipelineService(prisma as never, events as never);
  });

  describe('getState', () => {
    it('returns existing PipelineState when present', async () => {
      const existing = {
        id: 'p1',
        workspaceId: 'ws-1',
        state: 'shadow',
        transitionedAt: new Date(),
        transitionedBy: null,
        snapshot: null,
        fallbackRate1h: 0,
      };
      prisma.pipelineState.findUnique.mockResolvedValue(existing);
      await expect(service.getState('ws-1')).resolves.toEqual(existing);
      expect(prisma.pipelineState.create).not.toHaveBeenCalled();
    });

    it('auto-creates a legacy PipelineState when missing (no surprises in prod)', async () => {
      prisma.pipelineState.findUnique.mockResolvedValueOnce(null);
      prisma.pipelineState.create.mockResolvedValueOnce({
        id: 'p2',
        workspaceId: 'ws-2',
        state: 'legacy',
        transitionedAt: new Date(),
        transitionedBy: null,
        snapshot: null,
        fallbackRate1h: 0,
      });
      const result = await service.getState('ws-2');
      expect(result.state).toBe('legacy');
      expect(prisma.pipelineState.create).toHaveBeenCalledWith({
        data: { workspaceId: 'ws-2', state: 'legacy' },
      });
    });
  });

  describe('setState', () => {
    it('upserts state and emits brain.event.spine pipeline.state.changed event', async () => {
      prisma.pipelineState.findUnique.mockResolvedValueOnce({
        state: 'legacy',
      });
      prisma.pipelineState.upsert.mockResolvedValueOnce({
        id: 'p1',
        workspaceId: 'ws-1',
        state: 'shadow',
        transitionedAt: new Date(),
        transitionedBy: 'admin',
        snapshot: { previousState: 'legacy', reason: 'manual' },
        fallbackRate1h: 0,
      });

      await service.setState('ws-1', 'shadow', 'admin', 'manual');

      expect(prisma.pipelineState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId: 'ws-1' },
          create: expect.objectContaining({
            workspaceId: 'ws-1',
            state: 'shadow',
            transitionedBy: 'admin',
            fallbackRate1h: 0,
          }),
          update: expect.objectContaining({
            state: 'shadow',
            transitionedBy: 'admin',
            fallbackRate1h: 0,
          }),
        }),
      );
      expect(events.recordCommercial).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          eventType: 'pipeline.state.changed',
          payload: expect.objectContaining({
            previousState: 'legacy',
            newState: 'shadow',
            reason: 'manual',
            by: 'admin',
          }),
        }),
      );
    });

    it('records "manual transition" when reason is omitted', async () => {
      prisma.pipelineState.findUnique.mockResolvedValueOnce({ state: 'shadow' });
      prisma.pipelineState.upsert.mockResolvedValueOnce({});
      await service.setState('ws-9', 'active');
      expect(events.recordCommercial).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({ reason: 'manual transition' }),
        }),
      );
    });

    it('resets fallbackRate1h to 0 on every transition (clean slate per state)', async () => {
      prisma.pipelineState.findUnique.mockResolvedValueOnce({ state: 'active' });
      prisma.pipelineState.upsert.mockResolvedValueOnce({});
      await service.setState('ws-1', 'shadow', 'system', 'auto-fallback');
      expect(prisma.pipelineState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ fallbackRate1h: 0 }),
        }),
      );
    });
  });

  describe('recordShadow', () => {
    const input: DecisionShadowInput = {
      workspaceId: 'ws-1',
      channel: 'instagram',
      inboundCorrelationId: 'abc123',
      orchestratorDecision: { audio: 'text' },
      legacyBaseline: { audio: 'text' },
      outcomeKey: 'shadow:ws-1:abc123',
    };

    it('upserts DecisionShadow keyed on (workspaceId, inboundCorrelationId) and emits event', async () => {
      prisma.decisionShadow.upsert.mockResolvedValueOnce(undefined);
      await service.recordShadow(input);
      expect(prisma.decisionShadow.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId_inboundCorrelationId: {
              workspaceId: 'ws-1',
              inboundCorrelationId: 'abc123',
            },
          },
        }),
      );
      expect(events.recordCommercial).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId: 'ws-1',
          subject: 'channel:instagram',
          eventType: 'pipeline.shadow_recorded',
          payload: expect.objectContaining({
            channel: 'instagram',
            inboundCorrelationId: 'abc123',
            outcomeKey: 'shadow:ws-1:abc123',
          }),
        }),
      );
    });

    it('idempotency key is stable across replays (no duplicate events)', async () => {
      prisma.decisionShadow.upsert.mockResolvedValue(undefined);
      await service.recordShadow(input);
      await service.recordShadow(input);
      const calls = events.recordCommercial.mock.calls.filter(
        ([arg]) => (arg as { eventType?: string }).eventType === 'pipeline.shadow_recorded',
      );
      // Both calls happen, but each uses the same idempotencyKey shape so
      // upstream BrainEventSpine de-dupes. The test verifies the contract.
      expect(calls.length).toBe(2);
      const firstKey = (calls[0]?.[0] as { idempotencyKey: string }).idempotencyKey;
      const secondKey = (calls[1]?.[0] as { idempotencyKey: string }).idempotencyKey;
      expect(firstKey).toBe(secondKey);
    });
  });

  describe('incrementFallback (auto-shadow guard)', () => {
    it('increments fallbackRate1h by 0.01', async () => {
      prisma.pipelineState.updateMany.mockResolvedValueOnce(undefined);
      prisma.pipelineState.findUnique.mockResolvedValueOnce({
        id: 'p1',
        workspaceId: 'ws-1',
        state: 'shadow',
        fallbackRate1h: 0.02,
      });
      await service.incrementFallback('ws-1');
      expect(prisma.pipelineState.updateMany).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1' },
        data: { fallbackRate1h: { increment: 0.01 } },
      });
    });

    it('AUTO-FALLBACK: moves active workspace to shadow when fallbackRate1h crosses 0.05 (5%)', async () => {
      prisma.pipelineState.updateMany.mockResolvedValueOnce(undefined);
      // First findUnique inside incrementFallback's getState call:
      prisma.pipelineState.findUnique.mockResolvedValueOnce({
        id: 'p1',
        workspaceId: 'ws-1',
        state: 'active',
        fallbackRate1h: 0.06,
        transitionedAt: new Date(),
        transitionedBy: null,
        snapshot: null,
      });
      // Second findUnique inside setState (previous):
      prisma.pipelineState.findUnique.mockResolvedValueOnce({ state: 'active' });
      prisma.pipelineState.upsert.mockResolvedValueOnce({
        id: 'p1',
        workspaceId: 'ws-1',
        state: 'shadow',
        transitionedAt: new Date(),
        transitionedBy: 'system',
        snapshot: { previousState: 'active' },
        fallbackRate1h: 0,
      });

      await service.incrementFallback('ws-1');

      // setState was called transitioning active -> shadow with reason
      const setStateCall = prisma.pipelineState.upsert.mock.calls[0]?.[0] as {
        update: { state: string; transitionedBy: string };
      };
      expect(setStateCall.update.state).toBe('shadow');
      expect(setStateCall.update.transitionedBy).toBe('system');

      // event spine recorded the auto-fallback
      const stateChangedEvent = events.recordCommercial.mock.calls.find(
        ([arg]) => (arg as { eventType?: string }).eventType === 'pipeline.state.changed',
      );
      expect(stateChangedEvent).toBeDefined();
      const payload = (stateChangedEvent![0] as { payload: { reason: string; by: string } })
        .payload;
      expect(payload.reason).toMatch(/auto-fallback/);
      expect(payload.by).toBe('system');
    });

    it('does NOT auto-fallback when current state is shadow (already fallen back)', async () => {
      prisma.pipelineState.updateMany.mockResolvedValueOnce(undefined);
      prisma.pipelineState.findUnique.mockResolvedValueOnce({
        id: 'p1',
        workspaceId: 'ws-1',
        state: 'shadow',
        fallbackRate1h: 0.08,
        transitionedAt: new Date(),
        transitionedBy: null,
        snapshot: null,
      });
      await service.incrementFallback('ws-1');
      expect(prisma.pipelineState.upsert).not.toHaveBeenCalled();
    });

    it('does NOT auto-fallback when below threshold even for active', async () => {
      prisma.pipelineState.updateMany.mockResolvedValueOnce(undefined);
      prisma.pipelineState.findUnique.mockResolvedValueOnce({
        id: 'p1',
        workspaceId: 'ws-1',
        state: 'active',
        fallbackRate1h: 0.04,
        transitionedAt: new Date(),
        transitionedBy: null,
        snapshot: null,
      });
      await service.incrementFallback('ws-1');
      expect(prisma.pipelineState.upsert).not.toHaveBeenCalled();
    });
  });
});
