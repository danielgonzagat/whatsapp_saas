import { ValenceTaggerService } from '../mind/valence-tagger.service';
import { SpineEmitterService } from '../spine/spine-emitter.service';
import { KycEventEmitterService } from './kyc-event-emitter.service';

function buildSpine(ringCapacity?: number) {
  return new SpineEmitterService(new ValenceTaggerService(), { ringCapacity });
}

describe('KycEventEmitterService (contract spec)', () => {
  function build(opts: { ringCapacity?: number } = {}) {
    const spine = buildSpine(opts.ringCapacity);
    const emitter = new KycEventEmitterService(spine);
    return { spine, emitter };
  }

  describe('commerce.kyc.document_submitted', () => {
    it('emits with correct eventName, workspaceId, entityRef, truthMode, and provenance', () => {
      const { spine, emitter } = build();

      emitter.emitDocumentSubmitted({
        agentId: 'agent_1',
        workspaceId: 'ws_1',
        correlationId: 'corr_abc',
      });

      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const ev = events[0]!;
      expect(ev.eventName).toBe('commerce.kyc.document_submitted');
      expect(ev.workspaceId).toBe('ws_1');
      expect(ev.entityRef).toEqual({ entityType: 'agent', entityId: 'agent_1' });
      expect(ev.truthMode).toBe('observed');
      expect(ev.provenance.source).toBe('production');
      expect(ev.provenance.processor).toBe('kyc-event-emitter');
      expect(ev.provenance.processorVersion).toBe('1.0.0');
      expect(ev.provenance.schemaVersion).toBe('1.0.0');
      expect(['dev', 'staging', 'prod']).toContain(ev.provenance.environment);
      expect(ev.correlationId).toBe('corr_abc');
      expect(ev.payload).toEqual({ agentId: 'agent_1' });
    });

    it('does not tag valence (non-terminal event)', () => {
      const { spine, emitter } = build();

      emitter.emitDocumentSubmitted({ agentId: 'a', workspaceId: 'w' });

      const events = spine.recentEvents();
      expect(events[0]?.valence).toBeUndefined();
    });
  });

  describe('commerce.kyc.approved', () => {
    it('emits with correct eventName and truthMode: observed', () => {
      const { spine, emitter } = build();

      emitter.emitApproved({ agentId: 'agent_2', workspaceId: 'ws_2' });

      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const ev = events[0]!;
      expect(ev.eventName).toBe('commerce.kyc.approved');
      expect(ev.truthMode).toBe('observed');
      expect(ev.workspaceId).toBe('ws_2');
      expect(ev.entityRef).toEqual({ entityType: 'agent', entityId: 'agent_2' });
    });

    it('ValenceTaggerService tags terminal as positive', () => {
      const { spine, emitter } = build();

      emitter.emitApproved({ agentId: 'a', workspaceId: 'w' });

      const events = spine.recentEvents();
      expect(events[0]?.valence).toBe('positive');
    });

    it('payload reflects auto mode', () => {
      const { spine, emitter } = build();

      emitter.emitApproved({ agentId: 'a', workspaceId: 'w', autoApproved: true });

      const events = spine.recentEvents();
      expect(events[0]?.payload).toEqual({ agentId: 'a', mode: 'auto' });
    });

    it('payload reflects admin mode by default', () => {
      const { spine, emitter } = build();

      emitter.emitApproved({ agentId: 'a', workspaceId: 'w' });

      const events = spine.recentEvents();
      expect(events[0]?.payload).toEqual({ agentId: 'a', mode: 'admin' });
    });
  });

  describe('commerce.kyc.rejected', () => {
    it('emits with correct eventName, truthMode: observed, terminal negative', () => {
      const { spine, emitter } = build();

      emitter.emitRejected({ agentId: 'agent_3', workspaceId: 'ws_3', reason: 'doc mismatch' });

      const events = spine.recentEvents();
      expect(events).toHaveLength(1);
      const ev = events[0]!;
      expect(ev.eventName).toBe('commerce.kyc.rejected');
      expect(ev.truthMode).toBe('observed');
      expect(ev.workspaceId).toBe('ws_3');
      expect(ev.entityRef).toEqual({ entityType: 'agent', entityId: 'agent_3' });
      expect(ev.payload).toEqual({ agentId: 'agent_3', reason: 'doc mismatch' });
    });

    it('ValenceTaggerService tags terminal as negative', () => {
      const { spine, emitter } = build();

      emitter.emitRejected({ agentId: 'a', workspaceId: 'w', reason: 'doc mismatch' });

      const events = spine.recentEvents();
      expect(events[0]?.valence).toBe('negative');
    });
  });

  describe('error resilience', () => {
    it('does not throw when the spine ring buffer overflows', () => {
      const { spine, emitter } = build({ ringCapacity: 4 });

      for (let i = 0; i < 100; i += 1) {
        expect(() =>
          emitter.emitDocumentSubmitted({
            agentId: `agent_${i}`,
            workspaceId: `ws_${i}`,
          }),
        ).not.toThrow();
      }

      expect(spine.recentEvents()).toHaveLength(4);
    });

    it('does not throw when payload is malformed — logs and returns', () => {
      const { emitter } = build();

      expect(() => {
        (emitter as unknown as Record<string, unknown>)['emitDocumentSubmitted']?.({});
      }).not.toThrow();
    });

    it('does not throw when called with minimal params', () => {
      const { emitter, spine } = build();

      expect(() =>
        emitter.emitDocumentSubmitted({ agentId: 'a', workspaceId: 'w' }),
      ).not.toThrow();
      expect(spine.recentEvents()).toHaveLength(1);
    });
  });

  describe('correlation sequencing', () => {
    it('two consecutive emissions with different correlationIds produce two distinct events', () => {
      const { spine, emitter } = build();

      emitter.emitDocumentSubmitted({
        agentId: 'a',
        workspaceId: 'w',
        correlationId: 'corr_1',
      });
      emitter.emitDocumentSubmitted({
        agentId: 'a',
        workspaceId: 'w',
        correlationId: 'corr_2',
      });

      const events = spine.recentEvents();
      expect(events).toHaveLength(2);
      expect(events[0]?.correlationId).toBe('corr_1');
      expect(events[1]?.correlationId).toBe('corr_2');
      expect(events[0]?.eventId).not.toBe(events[1]?.eventId);
    });
  });

  describe('ValenceTaggerService coverage', () => {
    it('runs over all emitted events and tags terminals', () => {
      const { spine, emitter } = build();

      emitter.emitDocumentSubmitted({ agentId: 'a', workspaceId: 'w' });
      emitter.emitApproved({ agentId: 'a', workspaceId: 'w' });
      emitter.emitRejected({ agentId: 'a', workspaceId: 'w', reason: 'test' });

      const events = spine.recentEvents();
      expect(events).toHaveLength(3);
      expect(events[0]?.eventName).toBe('commerce.kyc.document_submitted');
      expect(events[0]?.valence).toBeUndefined();
      expect(events[1]?.eventName).toBe('commerce.kyc.approved');
      expect(events[1]?.valence).toBe('positive');
      expect(events[2]?.eventName).toBe('commerce.kyc.rejected');
      expect(events[2]?.valence).toBe('negative');
    });
  });
});
