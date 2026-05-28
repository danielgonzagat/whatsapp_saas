import { ValenceTaggerService } from './valence-tagger.service';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import { SpineEventRef } from './mind.types';

type ChatEmitArg = {
  eventName: string;
  workspaceId: string;
  valence: string;
  payload: { surface: string; success: boolean; degraded: boolean };
};

function makeEmitMock(): jest.Mock {
  return jest.fn().mockResolvedValue(undefined);
}

function makeSpine(emit: jest.Mock): SpineEmitterService {
  return { emit } as unknown as SpineEmitterService;
}

describe('ValenceTaggerService — chat.replied outcome tagging (PI-K16-D)', () => {
  describe('tag(ChatOutcomeEvent)', () => {
    it('emits with positive valence when success is true and not degraded', async () => {
      const emit = makeEmitMock();
      const service = new ValenceTaggerService(makeSpine(emit));

      service.tag({
        eventName: 'chat.replied',
        workspaceId: 'ws-1',
        payload: { surface: 'dashboard', success: true, degraded: false },
      });

      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      expect(emit).toHaveBeenCalledTimes(1);
      const emitCalls = emit.mock.calls as Array<[ChatEmitArg]>;
      const call = emitCalls[0]?.[0];
      expect(call?.eventName).toBe('chat.replied');
      expect(call?.workspaceId).toBe('ws-1');
      expect(call?.valence).toBe('positive');
      expect(call?.payload.surface).toBe('dashboard');
      expect(call?.payload.success).toBe(true);
      expect(call?.payload.degraded).toBe(false);
    });

    it('emits with negative valence when degraded is true', async () => {
      const emit = makeEmitMock();
      const service = new ValenceTaggerService(makeSpine(emit));

      service.tag({
        eventName: 'chat.replied',
        workspaceId: 'ws-2',
        payload: { surface: 'onboarding', success: false, degraded: true },
      });

      await new Promise<void>((resolve) => setTimeout(resolve, 10));

      expect(emit).toHaveBeenCalledTimes(1);
      const emitCalls = emit.mock.calls as Array<[ChatEmitArg]>;
      const call = emitCalls[0]?.[0];
      expect(call?.valence).toBe('negative');
      expect(call?.workspaceId).toBe('ws-2');
      expect(call?.payload.surface).toBe('onboarding');
    });

    it('does not throw when spine is absent (no injection)', () => {
      const service = new ValenceTaggerService(undefined);

      expect(() =>
        service.tag({
          eventName: 'chat.replied',
          workspaceId: 'ws-3',
          payload: { surface: 'dashboard', success: true, degraded: false },
        }),
      ).not.toThrow();
    });

    it('does not throw when spine.emit rejects (fire-and-forget)', async () => {
      const emit = jest.fn().mockRejectedValue(new Error('spine down'));
      const service = new ValenceTaggerService(makeSpine(emit));

      expect(() =>
        service.tag({
          eventName: 'chat.replied',
          workspaceId: 'ws-4',
          payload: { surface: 'dashboard', success: false, degraded: true },
        }),
      ).not.toThrow();

      await new Promise<void>((resolve) => setTimeout(resolve, 10));
      expect(emit).toHaveBeenCalledTimes(1);
    });

    it('preserves the existing SpineEventRef tag path', () => {
      const service = new ValenceTaggerService(undefined);

      const event: SpineEventRef = {
        eventId: 'evt_1',
        eventName: 'commerce.payment.approved',
        occurredAt: new Date().toISOString(),
        truthMode: 'observed',
        valence: undefined,
      };

      const result: SpineEventRef = service.tag(event);
      expect(result.valence).toBe('positive');
    });
  });
});
