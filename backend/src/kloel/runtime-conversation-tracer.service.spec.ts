import { RuntimeConversationTracerService, TRACER_STEP_KINDS } from './runtime-conversation-tracer.service';

describe('RuntimeConversationTracerService', () => {
  let tracer: RuntimeConversationTracerService;

  beforeEach(() => {
    tracer = new RuntimeConversationTracerService();
  });

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
    expect(() => tracer.assertSteps(TRACER_STEP_KINDS as unknown as typeof TRACER_STEP_KINDS)).not.toThrow();
  });

  it('assertSteps fails for missing step', () => {
    tracer.record('step1_inbox_recorded');
    tracer.record('step3_memory_queried');
    expect(() =>
      tracer.assertSteps(['step1_inbox_recorded', 'step2_contact_resolved', 'step3_memory_queried']),
    ).toThrow('Missing tracer steps: step2_contact_resolved');
  });

  it('assertSteps fails for wrong order', () => {
    tracer.record('step3_memory_queried');
    tracer.record('step1_inbox_recorded');
    expect(() =>
      tracer.assertSteps(['step1_inbox_recorded', 'step3_memory_queried']),
    ).toThrow('Step order violation');
  });

  it('toJSON produces valid JSON with all events', () => {
    tracer.record('step1_inbox_recorded', { channel: 'whatsapp' });
    tracer.record('step4_concept_classified', { concept: 'price_objection', confidence: 0.8 });
    const json = tracer.toJSON();
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].kind).toBe('step1_inbox_recorded');
    expect(parsed[1].kind).toBe('step4_concept_classified');
  });

  it('TRACER_STEP_KINDS has exactly 12 entries', () => {
    expect(TRACER_STEP_KINDS).toHaveLength(12);
  });

  it('events getter returns frozen reference', () => {
    tracer.record('step1_inbox_recorded');
    const events = tracer.events;
    expect(events).toHaveLength(1);
    tracer.record('step2_contact_resolved');
    expect(tracer.events).toHaveLength(2);
  });
});
