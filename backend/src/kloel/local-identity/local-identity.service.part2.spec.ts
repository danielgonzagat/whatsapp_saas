import { LocalIdentityService } from './local-identity.service';
import { VOLUME_THRESHOLD } from './local-identity.types';
import { makeEvent, makeWorkspaceEvents, synthetic100 } from './local-identity.service.spec.helpers';

describe('LocalIdentityService', () => {
  let service: LocalIdentityService;

  beforeEach(() => {
    service = new LocalIdentityService();
    makeEvent.seq = 0;
  });

  it('derives customer conversion ratio correctly', () => {
    const events: SpineEventRef[] = [];
    // 20 leads created
    for (let i = 0; i < 20; i++) {
      events.push(
        makeEvent({
          eventName: 'commerce.lead.created',
          occurredAt: new Date(`2026-05-10T10:00:00.000Z`).toISOString(),
          workspaceId: 'wks_test_001',
        }),
      );
    }
    // 5 leads converted
    for (let i = 0; i < 5; i++) {
      events.push(
        makeEvent({
          eventName: 'commerce.lead.converted',
          occurredAt: new Date(`2026-05-10T14:00:00.000Z`).toISOString(),
          workspaceId: 'wks_test_001',
          valence: 'positive',
        }),
      );
    }
    // Fill to threshold
    while (events.length < VOLUME_THRESHOLD) {
      events.push(
        makeEvent({
          eventName: 'commerce.whatsapp.message_received',
          occurredAt: new Date(`2026-05-10T12:00:00.000Z`).toISOString(),
          workspaceId: 'wks_test_001',
        }),
      );
    }

    const profile = service.deriveProfile('wks_test_001', events);
    expect(profile).toBeDefined();
    const cp = profile!.customer.typicalProfile as Record<string, unknown>;
    expect(cp.conversionRatio).toBe(0.25); // 5/20 = 0.25
  });

  it('derives decision patterns from next_step_defined and handoff_to_human', () => {
    const events = synthetic100();
    const profile = service.deriveProfile('wks_test_001', events);

    expect(profile).toBeDefined();
    expect(profile!.decisionPatterns.typicalNextSteps.length).toBeGreaterThan(0);
    expect(profile!.decisionPatterns.typicalNextSteps).toContain('send_proposal');
    expect(profile!.decisionPatterns.typicalEscalations).toContain('complex_pricing');
  });

  describe('operator feedback bridge (R1/N3)', () => {
    function makeOperatorFeedback(
      note: string,
      accepted: boolean,
      learningFraming: string,
      opts?: { entityType?: string; occurredAt?: string },
    ): SpineEventRef {
      return makeEvent({
        eventName: 'cognition.valence_assigned',
        occurredAt: opts?.occurredAt ?? new Date('2026-05-10T10:00:00.000Z').toISOString(),
        workspaceId: 'wks_test_001',
        entityRef: {
          entityType: opts?.entityType ?? 'operator',
          entityId: 'operator_01',
        },
        payload: {
          accepted,
          operatorNote: note,
          learningFraming,
        },
      });
    }

    it('single operator feedback does NOT enter decisionPatterns', () => {
      const events = makeWorkspaceEvents(VOLUME_THRESHOLD, {
        workspaceId: 'wks_test_001',
      });
      events.push(
        makeOperatorFeedback(
          'avoid rigid scheduling language for este perfil',
          false,
          'not human performance scoring - pattern improvement',
        ),
      );

      const profile = service.deriveProfile('wks_test_001', events);
      expect(profile).toBeDefined();
      const notes = profile!.decisionPatterns.typicalNextSteps.filter(s =>
        s.startsWith('learn_from_operator_feedback:'),
      );
      expect(notes).toHaveLength(0);
    });

    it('repeated identical operator note enters typicalNextSteps in low-noise form', () => {
      const events = makeWorkspaceEvents(VOLUME_THRESHOLD, {
        workspaceId: 'wks_test_001',
      });
      const note = 'avoid rigid scheduling language for este perfil';
      events.push(
        makeOperatorFeedback(note, false, 'not human performance scoring - pattern improvement'),
      );
      events.push(
        makeOperatorFeedback(
          note,
          false,
          'not human performance scoring - same observation repeated',
        ),
      );

      const profile = service.deriveProfile('wks_test_001', events);
      expect(profile).toBeDefined();
      expect(profile!.decisionPatterns.typicalNextSteps).toContain(
        `learn_from_operator_feedback: ${note}`,
      );
    });

    it('operator note must appear at least twice to qualify (threshold strict)', () => {
      const events = makeWorkspaceEvents(VOLUME_THRESHOLD, {
        workspaceId: 'wks_test_001',
      });
      const noteA = 'soften objections with empathetic rephrase';
      const noteB = 'use shorter follow-up windows for this audience';
      events.push(
        makeOperatorFeedback(noteA, false, 'not human performance scoring'),
      );
      events.push(
        makeOperatorFeedback(noteB, false, 'not human performance scoring'),
      );

      const profile = service.deriveProfile('wks_test_001', events);
      expect(profile).toBeDefined();
      const reflections = profile!.decisionPatterns.typicalNextSteps.filter(s =>
        s.startsWith('learn_from_operator_feedback:'),
      );
      expect(reflections).toHaveLength(0);
    });

    it('ignores feedback with accepted=true', () => {
      const events = makeWorkspaceEvents(VOLUME_THRESHOLD, {
        workspaceId: 'wks_test_001',
      });
      const note = 'avoid rigid scheduling language for este perfil';
      events.push(makeOperatorFeedback(note, false, 'not human performance scoring'));
      events.push(makeOperatorFeedback(note, true, 'not human performance scoring'));

      const profile = service.deriveProfile('wks_test_001', events);
      expect(profile).toBeDefined();
      const reflections = profile!.decisionPatterns.typicalNextSteps.filter(s =>
        s.startsWith('learn_from_operator_feedback:'),
      );
      expect(reflections).toHaveLength(0);
    });

    it('ignores feedback without the required learningFraming phrase', () => {
      const events = makeWorkspaceEvents(VOLUME_THRESHOLD, {
        workspaceId: 'wks_test_001',
      });
      const note = 'avoid rigid scheduling language for este perfil';
      events.push(
        makeOperatorFeedback(note, false, 'not human performance scoring'),
      );
      events.push(
        makeOperatorFeedback(note, false, 'human review quality check'),
      );

      const profile = service.deriveProfile('wks_test_001', events);
      expect(profile).toBeDefined();
      const reflections = profile!.decisionPatterns.typicalNextSteps.filter(s =>
        s.startsWith('learn_from_operator_feedback:'),
      );
      expect(reflections).toHaveLength(0);
    });

    it('ignores feedback with blank operatorNote', () => {
      const events = makeWorkspaceEvents(VOLUME_THRESHOLD, {
        workspaceId: 'wks_test_001',
      });
      events.push(makeOperatorFeedback('   ', false, 'not human performance scoring'));
      events.push(makeOperatorFeedback('   ', false, 'not human performance scoring'));

      const profile = service.deriveProfile('wks_test_001', events);
      expect(profile).toBeDefined();
      const reflections = profile!.decisionPatterns.typicalNextSteps.filter(s =>
        s.startsWith('learn_from_operator_feedback:'),
      );
      expect(reflections).toHaveLength(0);
    });

    it('ignores feedback with non-operator entityType', () => {
      const events = makeWorkspaceEvents(VOLUME_THRESHOLD, {
        workspaceId: 'wks_test_001',
      });
      const note = 'avoid rigid scheduling language for este perfil';
      events.push(
        makeOperatorFeedback(note, false, 'not human performance scoring', { entityType: 'lead' }),
      );
      events.push(
        makeOperatorFeedback(note, false, 'not human performance scoring', { entityType: 'lead' }),
      );

      const profile = service.deriveProfile('wks_test_001', events);
      expect(profile).toBeDefined();
      const reflections = profile!.decisionPatterns.typicalNextSteps.filter(s =>
        s.startsWith('learn_from_operator_feedback:'),
      );
      expect(reflections).toHaveLength(0);
    });

    it('repeated operator notes coexist with existing typicalNextSteps', () => {
      const events: SpineEventRef[] = [];
      const base = new Date('2026-05-10T10:00:00.000Z');

      for (let i = 0; i < 8; i++) {
        events.push(
          makeEvent({
            eventName: 'commerce.crm.next_step_defined',
            occurredAt: new Date(base.getTime() + i * 3600_000).toISOString(),
            workspaceId: 'wks_test_001',
            entityRef: { entityType: 'lead', entityId: `lead_${i}` },
            payload: { step: 'send_proposal' },
          }),
        );
      }

      const note = 'soften objections with empathetic rephrase';
      for (let i = 0; i < 3; i++) {
        events.push(
          makeOperatorFeedback(
            note,
            false,
            'not human performance scoring - pattern improvement',
            { occurredAt: new Date(base.getTime() + i * 3600_000).toISOString() },
          ),
        );
      }

      while (events.length < VOLUME_THRESHOLD) {
        events.push(
          makeEvent({
            eventName: 'commerce.lead.created',
            occurredAt: new Date(base.getTime() + events.length * 3600_000).toISOString(),
            workspaceId: 'wks_test_001',
          }),
        );
      }

      const profile = service.deriveProfile('wks_test_001', events);
      expect(profile).toBeDefined();
      const steps = profile!.decisionPatterns.typicalNextSteps;
      expect(steps).toContain('send_proposal');
      expect(steps).toContain(`learn_from_operator_feedback: ${note}`);
      expect(steps.length).toBeLessThanOrEqual(5);
    });
  });
});
