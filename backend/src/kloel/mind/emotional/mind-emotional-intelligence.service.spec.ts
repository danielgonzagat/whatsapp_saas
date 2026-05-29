import { MindEmotionalIntelligenceService } from './mind-emotional-intelligence.service';
import type { SpineEmitterService } from '../../spine/spine-emitter.service';
import type { MindBeliefService } from '../inference/mind-belief.service';
import type { MindBelief } from '../../mind.types';

type EmitCall = Parameters<SpineEmitterService['emit']>[0];

function makeSpineMock(): { service: SpineEmitterService; calls: EmitCall[] } {
  const calls: EmitCall[] = [];
  const service = {
    emit: jest.fn(async (input: EmitCall) => {
      calls.push(input);
      return { eventId: 'evt_test' } as unknown as Awaited<
        ReturnType<SpineEmitterService['emit']>
      >;
    }),
  } as unknown as SpineEmitterService;
  return { service, calls };
}

function makeBeliefsMock(rows: MindBelief[]): MindBeliefService {
  return {
    list: jest.fn(async () => rows),
  } as unknown as MindBeliefService;
}

describe('MindEmotionalIntelligenceService', () => {
  describe('inferEmotionalState', () => {
    it('detects anger from lexical signals and shouting intensity', async () => {
      const { service: spine, calls } = makeSpineMock();
      const service = new MindEmotionalIntelligenceService(spine);

      const result = await service.inferEmotionalState('ws_alpha', 'conv_1', [
        'ISSO É UM ABSURDO! quero cancelar agora, lixo de atendimento!!!',
      ]);

      expect(result.state).toBe('angry');
      expect(result.confidence).toBeGreaterThan(0.3);
      expect(result.basis).toContain('anger:');
      expect(calls).toHaveLength(1);
      expect(calls[0]?.eventName).toBe('cognition.emotional.inferred');
      expect(calls[0]?.workspaceId).toBe('ws_alpha');
      expect(calls[0]?.entityRef?.entityId).toBe('conv_1');
      expect(calls[0]?.truthMode).toBe('inferred');
      expect(calls[0]?.payload?.['state']).toBe('angry');
    });

    it('returns neutral with minimal confidence on bland input', async () => {
      const service = new MindEmotionalIntelligenceService();
      const result = await service.inferEmotionalState('ws_alpha', 'conv_2', [
        'ok entendi obrigado',
      ]);
      expect(result.state).toBe('neutral');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('returns neutral / zero confidence when recentMessages is empty', async () => {
      const service = new MindEmotionalIntelligenceService();
      const result = await service.inferEmotionalState('ws_alpha', 'conv_3', []);
      expect(result.state).toBe('neutral');
      expect(result.confidence).toBe(0);
      expect(result.basis).toBe('empty-input');
    });

    it('tolerates missing SpineEmitterService and missing MindBeliefService', async () => {
      const service = new MindEmotionalIntelligenceService();
      const result = await service.inferEmotionalState('ws_alpha', 'conv_4', [
        'não funciona, estou esperando há horas',
      ]);
      expect(['frustrated', 'angry']).toContain(result.state);
    });

    it('uses MindBelief variance as a bayesian shift toward frustration', async () => {
      const { service: spine } = makeSpineMock();
      const beliefs = makeBeliefsMock([
        {
          workspaceId: 'ws_alpha',
          subject: 'conv_5',
          predicate: 'conversation.sentiment',
          context: {},
          mean: 0,
          variance: 1.5,
          samples: 10,
          alpha: 1,
          beta: 1,
        },
      ]);
      const service = new MindEmotionalIntelligenceService(spine, beliefs);

      const result = await service.inferEmotionalState('ws_alpha', 'conv_5', [
        'estou esperando uma resposta',
      ]);

      expect(result.state).toBe('frustrated');
      expect(result.basis).toContain('variance:');
    });

    it('survives belief lookup failure without throwing', async () => {
      const beliefs = {
        list: jest.fn(async () => {
          throw new Error('db down');
        }),
      } as unknown as MindBeliefService;
      const service = new MindEmotionalIntelligenceService(undefined, beliefs);
      const result = await service.inferEmotionalState('ws_alpha', 'conv_6', ['amei o produto']);
      expect(result.state).toBe('excited');
    });
  });

  describe('recommendTone', () => {
    it.each([
      ['angry', 'empathetic'],
      ['frustrated', 'concise'],
      ['excited', 'enthusiastic'],
      ['curious', 'professional'],
      ['neutral', 'professional'],
    ] as const)('maps %s → %s', (state, expected) => {
      const service = new MindEmotionalIntelligenceService();
      const rec = service.recommendTone(state, {});
      expect(rec.tone).toBe(expected);
      expect(rec.rationale.length).toBeGreaterThan(0);
    });
  });

  describe('performance / queue-safety', () => {
    it('returns under 100ms for a typical input', async () => {
      const service = new MindEmotionalIntelligenceService();
      const t0 = Date.now();
      await service.inferEmotionalState('ws_alpha', 'conv_7', [
        'isso aqui é incrível, amei o resultado!',
        'estou animado para começar',
      ]);
      expect(Date.now() - t0).toBeLessThan(100);
    });
  });
});
