import {
  RuntimeConversationTracerService,
  TRACER_STEP_KINDS,
} from './runtime-conversation-tracer.service';
import type { ScopedRecordInput } from './runtime-conversation-tracer.service';

const WS = 'ws-test';
const CID = 'contact-1';
const CORR = 'corr-abc123';

describe('RuntimeConversationTracerService', () => {
  let tracer: RuntimeConversationTracerService;

  beforeEach(() => {
    tracer = new RuntimeConversationTracerService();
  });

  describe('unscoped record (backward compat)', () => {
    it('records a single event', () => {
      tracer.record('step1_inbox_recorded', { channel: 'whatsapp' });
      expect(tracer.events).toHaveLength(1);
      expect(tracer.events[0].kind).toBe('step1_inbox_recorded');
      expect(tracer.events[0].detail.channel).toBe('whatsapp');
      expect(typeof tracer.events[0].timestamp).toBe('number');
    });

    it('records events in order with ascending timestamps', () => {
      tracer.record('step1_inbox_recorded');
      tracer.record('step2_contact_resolved');
      tracer.record('step3_memory_queried');
      expect(tracer.events).toHaveLength(3);
      expect(tracer.steps()).toEqual([
        'step1_inbox_recorded',
        'step2_contact_resolved',
        'step3_memory_queried',
      ]);
      expect(tracer.events[0].timestamp).toBeLessThanOrEqual(tracer.events[1].timestamp);
      expect(tracer.events[1].timestamp).toBeLessThanOrEqual(tracer.events[2].timestamp);
    });

    it('clears all events', () => {
      tracer.record('step1_inbox_recorded');
      tracer.record('step5_policy_chose');
      tracer.clear();
      expect(tracer.events).toHaveLength(0);
      expect(tracer.steps()).toEqual([]);
    });

    it('assertSteps passes when all expected steps are present in order', () => {
      for (const kind of TRACER_STEP_KINDS) {
        tracer.record(kind);
      }
      expect(() => tracer.assertSteps(TRACER_STEP_KINDS)).not.toThrow();
    });

    it('assertSteps fails for missing step', () => {
      tracer.record('step1_inbox_recorded');
      tracer.record('step3_memory_queried');
      expect(() =>
        tracer.assertSteps([
          'step1_inbox_recorded',
          'step2_contact_resolved',
          'step3_memory_queried',
        ]),
      ).toThrow('Missing tracer steps: step2_contact_resolved');
    });

    it('assertSteps fails for wrong order', () => {
      tracer.record('step3_memory_queried');
      tracer.record('step1_inbox_recorded');
      expect(() => tracer.assertSteps(['step1_inbox_recorded', 'step3_memory_queried'])).toThrow(
        'Step order violation',
      );
    });

    it('toJSON produces valid JSON with all events', () => {
      tracer.record('step1_inbox_recorded', { channel: 'whatsapp' });
      tracer.record('step4_concept_classified', { concept: 'price_objection', confidence: 0.8 });
      const json = tracer.toJSON();
      const parsed: Array<{ kind: string }> = JSON.parse(json) as Array<{ kind: string }>;
      expect(parsed).toHaveLength(2);
      expect(parsed[0]!.kind).toBe('step1_inbox_recorded');
      expect(parsed[1]!.kind).toBe('step4_concept_classified');
    });

    it('events getter returns reference to unscoped trace', () => {
      tracer.record('step1_inbox_recorded');
      const events = tracer.events;
      expect(events).toHaveLength(1);
      tracer.record('step2_contact_resolved');
      expect(tracer.events).toHaveLength(2);
    });
  });

  describe('scoped record + getTrace', () => {
    it('records events per (workspaceId, contactId, correlationId)', () => {
      const input: ScopedRecordInput = {
        workspaceId: WS,
        contactId: CID,
        correlationId: CORR,
        kind: 'step1_inbox_recorded',
        detail: { channel: 'whatsapp' },
      };
      tracer.record(input);

      const events = tracer.getTrace({ workspaceId: WS, contactId: CID, correlationId: CORR });
      expect(events).toHaveLength(1);
      expect(events[0].kind).toBe('step1_inbox_recorded');
      expect(events[0].detail.channel).toBe('whatsapp');
    });

    it('isolates traces by correlationId', () => {
      tracer.record({
        workspaceId: WS,
        contactId: CID,
        correlationId: 'corr-1',
        kind: 'step1_inbox_recorded',
      });
      tracer.record({
        workspaceId: WS,
        contactId: CID,
        correlationId: 'corr-2',
        kind: 'step1_inbox_recorded',
      });
      tracer.record({
        workspaceId: WS,
        contactId: CID,
        correlationId: 'corr-1',
        kind: 'step2_contact_resolved',
      });

      const trace1 = tracer.getTrace({ workspaceId: WS, contactId: CID, correlationId: 'corr-1' });
      const trace2 = tracer.getTrace({ workspaceId: WS, contactId: CID, correlationId: 'corr-2' });

      expect(trace1).toHaveLength(2);
      expect(trace1[0].kind).toBe('step1_inbox_recorded');
      expect(trace1[1].kind).toBe('step2_contact_resolved');
      expect(trace2).toHaveLength(1);
      expect(trace2[0].kind).toBe('step1_inbox_recorded');
    });

    it('returns empty array for unknown trace', () => {
      const events = tracer.getTrace({
        workspaceId: 'nonexistent',
        contactId: 'nobody',
        correlationId: 'nope',
      });
      expect(events).toEqual([]);
    });

    it('scoped records do NOT pollute unscoped events', () => {
      tracer.record({
        workspaceId: WS,
        contactId: CID,
        correlationId: CORR,
        kind: 'step1_inbox_recorded',
      });
      expect(tracer.events).toHaveLength(0);
    });

    it('listTraces returns all scoped entries', () => {
      tracer.record({
        workspaceId: WS,
        contactId: CID,
        correlationId: 'corr-1',
        kind: 'step1_inbox_recorded',
      });
      tracer.record({
        workspaceId: WS,
        contactId: CID,
        correlationId: 'corr-2',
        kind: 'step1_inbox_recorded',
      });

      const entries = tracer.listTraces();
      expect(entries).toHaveLength(2);
      expect(entries[0].workspaceId).toBe(WS);
      expect(entries[1].workspaceId).toBe(WS);
    });

    it('detail defaults to empty object', () => {
      tracer.record({
        workspaceId: WS,
        contactId: CID,
        correlationId: CORR,
        kind: 'step1_inbox_recorded',
      });
      const events = tracer.getTrace({ workspaceId: WS, contactId: CID, correlationId: CORR });
      expect(events[0].detail).toEqual({});
    });

    it('records full 12-step scoped trace', () => {
      const kinds = [...TRACER_STEP_KINDS];
      for (const kind of kinds) {
        tracer.record({ workspaceId: WS, contactId: CID, correlationId: CORR, kind });
      }
      const events = tracer.getTrace({ workspaceId: WS, contactId: CID, correlationId: CORR });
      expect(events).toHaveLength(12);
      const recordedKinds = events.map((e) => e.kind);
      expect(recordedKinds).toEqual(kinds);
    });

    it('handles trace with missing contactId (empty string)', () => {
      tracer.record({
        workspaceId: WS,
        contactId: '',
        correlationId: CORR,
        kind: 'step1_inbox_recorded',
      });
      const events = tracer.getTrace({ workspaceId: WS, contactId: '', correlationId: CORR });
      expect(events).toHaveLength(1);
    });
  });

  describe('TRACER_STEP_KINDS', () => {
    it('has exactly 12 entries', () => {
      expect(TRACER_STEP_KINDS).toHaveLength(12);
    });

    it('all step kinds are unique', () => {
      expect(new Set(TRACER_STEP_KINDS).size).toBe(12);
    });
  });
});
