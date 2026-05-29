import {
  MindMultiModalPerceptionService,
  type MultiModalVisionAdapter,
  type StructuredPerceptionEvent,
} from './mind-multimodal-perception.service';

describe('MindMultiModalPerceptionService', () => {
  type AnyEmit = { emit: jest.Mock };

  const makeSpine = (): AnyEmit => ({ emit: jest.fn().mockResolvedValue(undefined) });

  const makeAudio = (overrides: Partial<{ text: string; duration: number }> = {}) => ({
    transcribe: jest.fn().mockResolvedValue({
      text: overrides.text ?? 'transcript-pt',
      duration: overrides.duration ?? 1.234,
      language: 'pt',
    }),
  });

  const makeVision = (
    overrides: Partial<{ description: string; detectedObjects: string[] }> = {},
  ) =>
    ({
      describe: jest.fn().mockResolvedValue({
        description: overrides.description ?? 'a cat on a sofa',
        detectedObjects: overrides.detectedObjects ?? ['cat', 'sofa'],
      }),
    }) as unknown as MultiModalVisionAdapter;

  describe('perceiveAudio', () => {
    it('delegates to AudioService.transcribe and returns transcript + bigint durationMs', async () => {
      const audio = makeAudio({ text: 'ola mundo', duration: 2.5 });
      const spine = makeSpine();
      const svc = new MindMultiModalPerceptionService(
        audio as unknown as never,
        undefined,
        undefined,
        spine as unknown as never,
      );

      const out = await svc.perceiveAudio('ws-1', Buffer.from('audio-bytes'), 'audio/ogg');

      expect(audio.transcribe).toHaveBeenCalledWith(expect.any(Buffer), 'pt', 'ws-1');
      expect(out.transcript).toBe('ola mundo');
      expect(out.durationMs).toBe(2500n);
      expect(typeof out.sourceFingerprint).toBe('string');
      expect(out.sourceFingerprint).toHaveLength(32);
      expect(spine.emit).toHaveBeenCalledTimes(1);
      const env = (spine.emit.mock.calls as Array<[Record<string, unknown>]>)[0]![0];
      expect(env.eventName).toBe('cognition.perception.multimodal_observed');
      expect(env.workspaceId).toBe('ws-1');
      expect(env.payload.modality).toBe('audio');
      expect(env.payload.adapterAvailable).toBe(true);
      expect(env.payload.hasTranscript).toBe(true);
    });

    it('returns honest empty observation when AudioService is absent', async () => {
      const spine = makeSpine();
      const svc = new MindMultiModalPerceptionService(
        undefined,
        undefined,
        undefined,
        spine as unknown as never,
      );

      const out = (await svc.perceiveAudio('ws-1', Buffer.from('x'), 'audio/wav')) as {
        sourceFingerprint?: string;
        transcript?: string;
        durationMs?: bigint;
      };

      expect(out).toEqual({ sourceFingerprint: expect.any(String) as unknown });
      expect(out.transcript).toBeUndefined();
      expect(out.durationMs).toBeUndefined();
      const envCalls = spine.emit.mock.calls as Array<[{ payload: { adapterAvailable: boolean } }]>;
      const env = envCalls[0]?.[0];
      expect(env?.payload?.adapterAvailable).toBe(false);
    });

    it('returns honest empty observation when transcribe throws', async () => {
      const audio = { transcribe: jest.fn().mockRejectedValue(new Error('whisper down')) };
      const spine = makeSpine();
      const svc = new MindMultiModalPerceptionService(
        audio as unknown as never,
        undefined,
        undefined,
        spine as unknown as never,
      );

      const out = (await svc.perceiveAudio('ws-1', Buffer.from('x'), 'audio/wav')) as {
        sourceFingerprint?: string;
        transcript?: string;
        durationMs?: bigint;
      };

      expect(out.transcript).toBeUndefined();
      expect(out.sourceFingerprint).toHaveLength(32);
      const env = (spine.emit.mock.calls as Array<[Record<string, unknown>]>)[0]![0];
      expect(env.payload.failure).toBe('transcribe_threw');
    });
  });

  describe('perceiveImage', () => {
    it('delegates to vision adapter when present', async () => {
      const vision = makeVision({ description: 'gato', detectedObjects: ['gato', 'sofa'] });
      const spine = makeSpine();
      const svc = new MindMultiModalPerceptionService(
        undefined,
        vision,
        undefined,
        spine as unknown as never,
      );

      const out = await svc.perceiveImage('ws-2', Buffer.from('jpg-bytes'), 'image/jpeg');

      expect(out.description).toBe('gato');
      expect(out.detectedObjects).toEqual(['gato', 'sofa']);
      expect(out.sourceFingerprint).toHaveLength(32);
      const env = (spine.emit.mock.calls as Array<[Record<string, unknown>]>)[0]![0];
      expect(env.payload.modality).toBe('image');
      expect(env.payload.objectCount).toBe(2);
    });

    it('falls back to honest empty observation when vision adapter is absent', async () => {
      const spine = makeSpine();
      const svc = new MindMultiModalPerceptionService(
        undefined,
        undefined,
        undefined,
        spine as unknown as never,
      );

      const out = await svc.perceiveImage('ws-2', Buffer.from('jpg'), 'image/jpeg');

      expect(out.description).toBeUndefined();
      expect(out.detectedObjects).toBeUndefined();
      expect(out.sourceFingerprint).toHaveLength(32);
      const envCalls = spine.emit.mock.calls as Array<[{ payload: { adapterAvailable: boolean } }]>;
      const env = envCalls[0]?.[0];
      expect(env?.payload?.adapterAvailable).toBe(false);
    });

    it('returns honest empty when vision throws', async () => {
      const vision = {
        describe: jest.fn().mockRejectedValue(new Error('vision down')),
      } as unknown as MultiModalVisionAdapter;
      const spine = makeSpine();
      const svc = new MindMultiModalPerceptionService(
        undefined,
        vision,
        undefined,
        spine as unknown as never,
      );

      const out = await svc.perceiveImage('ws-2', Buffer.from('jpg'), 'image/jpeg');

      expect(out.description).toBeUndefined();
      const env = (spine.emit.mock.calls as Array<[Record<string, unknown>]>)[0]![0];
      expect(env.payload.failure).toBe('vision_threw');
    });
  });

  describe('perceiveStructuredEvent', () => {
    it('delegates to MindPerceptionService.perceive when available', () => {
      const delegated = {
        subject: 'lead:abc',
        salience: 0.77,
        semanticContext: { tag: 'lead.qualified' },
      };
      const perception = { perceive: jest.fn().mockReturnValue(delegated) };
      const spine = makeSpine();
      const svc = new MindMultiModalPerceptionService(
        undefined,
        undefined,
        perception as unknown as never,
        spine as unknown as never,
      );

      const event: StructuredPerceptionEvent = {
        kind: 'lead.qualified',
        payload: { leadId: 'abc' },
      };
      const out = svc.perceiveStructuredEvent('ws-3', event);

      expect(perception.perceive).toHaveBeenCalledWith('ws-3', event);
      expect(out.subject).toBe('lead:abc');
      expect(out.salience).toBe(0.77);
      expect(out.semanticContext).toEqual({ tag: 'lead.qualified' });
      const env = (spine.emit.mock.calls as Array<[Record<string, unknown>]>)[0]![0];
      expect(env.payload.delegated).toBe(true);
      expect(env.payload.modality).toBe('structured');
    });

    it('produces local descriptor when MindPerceptionService has no perceive method', () => {
      const perception = {} as unknown as never;
      const spine = makeSpine();
      const svc = new MindMultiModalPerceptionService(
        undefined,
        undefined,
        perception,
        spine as unknown as never,
      );

      const out = svc.perceiveStructuredEvent('ws-3', {
        kind: 'commerce.lead.qualified',
        payload: { leadId: 'abc', extra: 'data' },
      });

      expect(out.subject).toBe('leadId:abc');
      expect(out.salience).toBeGreaterThan(0);
      expect(out.salience).toBeLessThanOrEqual(1);
      expect(out.semanticContext).toEqual({
        kind: 'commerce.lead.qualified',
        payloadKeys: ['leadId', 'extra'],
      });
      const env = (spine.emit.mock.calls as Array<[Record<string, unknown>]>)[0]![0];
      expect(env.payload.delegated).toBe(false);
    });

    it('rejects an event missing kind', () => {
      const svc = new MindMultiModalPerceptionService();
      expect(() => svc.perceiveStructuredEvent('ws-3', { kind: '', payload: {} })).toThrow(
        /event.kind is required/,
      );
    });
  });

  describe('missing optional services tolerance', () => {
    it('boots and operates with zero dependencies injected (workspace check still enforced)', async () => {
      const svc = new MindMultiModalPerceptionService();
      await expect(svc.perceiveAudio('ws-z', Buffer.from(''), 'audio/wav')).resolves.toHaveProperty(
        'sourceFingerprint',
      );
      await expect(svc.perceiveImage('ws-z', Buffer.from(''), 'image/png')).resolves.toHaveProperty(
        'sourceFingerprint',
      );
      const passthrough = svc.perceiveStructuredEvent('ws-z', {
        kind: 'noop',
        payload: {},
      });
      expect(passthrough.subject).toBe('kind:noop');
    });

    it('throws on empty workspaceId across all three entry points', async () => {
      const svc = new MindMultiModalPerceptionService();
      await expect(svc.perceiveAudio('', Buffer.from(''), 'audio/wav')).rejects.toThrow(
        /workspaceId is required/,
      );
      await expect(svc.perceiveImage('', Buffer.from(''), 'image/png')).rejects.toThrow(
        /workspaceId is required/,
      );
      expect(() => svc.perceiveStructuredEvent('', { kind: 'x', payload: {} })).toThrow(
        /workspaceId is required/,
      );
    });
  });
});
