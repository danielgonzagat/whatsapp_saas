import { LocalIdentityService } from './local-identity.service';
import { VOLUME_THRESHOLD } from './local-identity.types';
import type { SpineEventRef } from '../mind/mind.types';

function makeEvent(
  override: Partial<SpineEventRef> & { eventName: string; occurredAt: string },
): SpineEventRef {
  const idx = makeEvent.seq++;
  return {
    eventId: `evt_test_${String(idx).padStart(5, '0')}`,
    workspaceId: 'wks_test_001',
    truthMode: 'observed',
    ...override,
  };
}
makeEvent.seq = 0;

function makeWorkspaceEvents(
  count: number,
  overrides?: Partial<SpineEventRef>,
): SpineEventRef[] {
  const base = new Date('2026-05-10T00:00:00.000Z');
  const events: SpineEventRef[] = [];
  for (let i = 0; i < count; i++) {
    const t = new Date(base.getTime() + i * 3600_000);
    events.push(
      makeEvent({
        eventName: overrides?.eventName ?? 'commerce.lead.created',
        occurredAt: t.toISOString(),
        ...overrides,
      }),
    );
  }
  return events;
}

function synthetic100(): SpineEventRef[] {
  const events: SpineEventRef[] = [];
  const base = new Date('2026-05-10T00:00:00.000Z');

  // 20 lead.created
  for (let i = 0; i < 20; i++) {
    const h = 8 + (i % 12);
    const t = new Date(base.getTime() + i * 600_000 + h * 3600_000);
    events.push(
      makeEvent({
        eventName: 'commerce.lead.created',
        occurredAt: t.toISOString(),
        workspaceId: 'wks_test_001',
        entityRef: { entityType: 'lead', entityId: `lead_${i}` },
      }),
    );
  }

  // 15 lead.contacted
  for (let i = 0; i < 15; i++) {
    const h = 9 + (i % 10);
    const t = new Date(base.getTime() + 2_400_000 + i * 300_000 + h * 3600_000);
    events.push(
      makeEvent({
        eventName: 'commerce.lead.contacted',
        occurredAt: t.toISOString(),
        workspaceId: 'wks_test_001',
        entityRef: { entityType: 'lead', entityId: `lead_${i}` },
      }),
    );
  }

  // 8 lead.converted
  for (let i = 0; i < 8; i++) {
    const t = new Date(base.getTime() + 8_6400_000 + i * 3600_000);
    events.push(
      makeEvent({
        eventName: 'commerce.lead.converted',
        occurredAt: t.toISOString(),
        workspaceId: 'wks_test_001',
        entityRef: { entityType: 'lead', entityId: `lead_${i}` },
        valence: 'positive',
      }),
    );
  }

  // 6 payment.approved — linked to leads via payload.leadId
  for (let i = 0; i < 6; i++) {
    const t = new Date(base.getTime() + 172_800_000 + i * 3600_000);
    events.push(
      makeEvent({
        eventName: 'commerce.payment.approved',
        occurredAt: t.toISOString(),
        workspaceId: 'wks_test_001',
        entityRef: { entityType: 'payment', entityId: `pay_${i}` },
        valence: 'positive',
        payload: { leadId: `lead_${i}`, productId: `prod_${i % 3}` },
      }),
    );
  }

  // 10 message_replied — with varying valences
  const valences: Array<'positive' | 'negative' | 'neutral'> = [
    'positive', 'positive', 'positive', 'positive',
    'negative', 'negative',
    'neutral', 'neutral',
    'positive', 'negative',
  ];
  for (let i = 0; i < 10; i++) {
    const t = new Date(base.getTime() + 5_400_000 + i * 1800_000 + (10 + i) * 3600_000);
    events.push(
      makeEvent({
        eventName: 'commerce.whatsapp.message_replied',
        occurredAt: t.toISOString(),
        workspaceId: 'wks_test_001',
        entityRef: { entityType: 'conversation', entityId: `conv_${i}` },
        valence: valences[i],
        payload: {
          body: i % 2 === 0
            ? 'Olá, o preço do produto está dentro do seu orçamento'
            : 'Podemos agendar uma demonstração gratuita para você',
        },
      }),
    );
  }

  // 8 message_received
  for (let i = 0; i < 8; i++) {
    const t = new Date(base.getTime() + 3_600_000 + i * 2400_000);
    events.push(
      makeEvent({
        eventName: 'commerce.whatsapp.message_received',
        occurredAt: t.toISOString(),
        workspaceId: 'wks_test_001',
        entityRef: { entityType: 'conversation', entityId: `conv_${i}` },
        payload: {
          body: 'Quanto custa o plano básico de vendas?',
        },
      }),
    );
  }

  // 12 crm.stage_changed
  const stages = ['new', 'contacted', 'qualified', 'negotiation', 'won'];
  for (let i = 0; i < 12; i++) {
    const t = new Date(base.getTime() + 10_800_000 + i * 7200_000);
    events.push(
      makeEvent({
        eventName: 'commerce.crm.stage_changed',
        occurredAt: t.toISOString(),
        workspaceId: 'wks_test_001',
        entityRef: { entityType: 'lead', entityId: `lead_${i % 20}` },
        payload: { toStage: stages[i % stages.length] },
      }),
    );
  }

  // 8 crm.next_step_defined
  const nextSteps = ['send_proposal', 'schedule_call', 'follow_up_email', 'send_contract'];
  for (let i = 0; i < 8; i++) {
    const t = new Date(base.getTime() + 14_400_000 + i * 5400_000);
    events.push(
      makeEvent({
        eventName: 'commerce.crm.next_step_defined',
        occurredAt: t.toISOString(),
        workspaceId: 'wks_test_001',
        entityRef: { entityType: 'lead', entityId: `lead_${i}` },
        payload: { step: nextSteps[i % nextSteps.length] },
      }),
    );
  }

  // 4 whatsapp.handoff_to_human
  const escalations = ['complex_pricing', 'angry_customer', 'complex_pricing', 'legal_question'];
  for (let i = 0; i < 4; i++) {
    const t = new Date(base.getTime() + 18_000_000 + i * 7200_000);
    events.push(
      makeEvent({
        eventName: 'commerce.whatsapp.handoff_to_human',
        occurredAt: t.toISOString(),
        workspaceId: 'wks_test_001',
        entityRef: { entityType: 'conversation', entityId: `conv_${i}` },
        payload: { reason: escalations[i] },
      }),
    );
  }

  // Fill remaining to reach 100
  const remaining = VOLUME_THRESHOLD - events.length;
  for (let i = 0; i < remaining; i++) {
    const h = 14 + (i % 8);
    const t = new Date(base.getTime() + 3_600_000 + i * 1200_000 + h * 3600_000);
    events.push(
      makeEvent({
        eventName: 'commerce.whatsapp.message_received',
        occurredAt: t.toISOString(),
        workspaceId: 'wks_test_001',
        entityRef: { entityType: 'conversation', entityId: `conv_fill_${i}` },
      }),
    );
  }

  return events;
}

describe('LocalIdentityService', () => {
  let service: LocalIdentityService;

  beforeEach(() => {
    service = new LocalIdentityService();
    makeEvent.seq = 0;
  });

  it('returns undefined when event count is below the volume threshold', () => {
    const events = makeWorkspaceEvents(VOLUME_THRESHOLD - 1, {
      eventName: 'commerce.lead.created',
      workspaceId: 'wks_test_001',
    });
    const profile = service.deriveProfile('wks_test_001', events);
    expect(profile).toBeUndefined();
  });

  it('returns undefined for workspace with zero events', () => {
    const profile = service.deriveProfile('wks_test_001', []);
    expect(profile).toBeUndefined();
  });

  it('returns undefined when workspaceId does not match any events', () => {
    const events = makeWorkspaceEvents(VOLUME_THRESHOLD, {
      workspaceId: 'wks_other',
    });
    const profile = service.deriveProfile('wks_test_001', events);
    expect(profile).toBeUndefined();
  });

  it('derives profile at threshold with synthetic 100-event sample', () => {
    const events = synthetic100();
    const profile = service.deriveProfile('wks_test_001', events);

    expect(profile).toBeDefined();
    expect(profile!.workspaceId).toBe('wks_test_001');
    expect(profile!.derivedFromEventsCount).toBeGreaterThanOrEqual(VOLUME_THRESHOLD);
    expect(profile!.derivedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );

    // Operational
    const op = profile!.operational;
    expect(op.typicalHours).toBeInstanceOf(Array);
    expect(op.typicalHours.length).toBeGreaterThan(0);
    expect(op.typicalHours.length).toBeLessThanOrEqual(3);
    for (const h of op.typicalHours) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(23);
    }
    expect(op.typicalEntityTypes).toBeInstanceOf(Array);
    expect(op.typicalEntityTypes.length).toBeGreaterThan(0);
    expect(op.typicalEntityTypes).toContain('lead');

    // Language
    expect(profile!.language.tone).toBeDefined();
    expect(typeof profile!.language.tone).toBe('string');
    expect(profile!.language.vocabulary).toBeInstanceOf(Array);

    // Product
    expect(profile!.product.catalog).toBeInstanceOf(Array);
    for (const item of profile!.product.catalog) {
      expect(typeof item.productId).toBe('string');
      expect(typeof item.role).toBe('string');
    }

    // Customer
    const cp = profile!.customer.typicalProfile as Record<string, unknown>;
    expect(typeof cp.leadCount).toBe('number');
    expect(typeof cp.conversionCount).toBe('number');
    expect(typeof cp.conversionRatio).toBe('number');
    expect(cp.commonStages).toBeInstanceOf(Array);

    // Temporal
    expect(profile!.temporal.peakHours).toBeInstanceOf(Array);
    for (const h of profile!.temporal.peakHours) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(23);
    }
    expect(typeof profile!.temporal.typicalCycleHours).toBe('number');

    // Decision patterns
    expect(profile!.decisionPatterns.typicalNextSteps).toBeInstanceOf(Array);
    expect(profile!.decisionPatterns.typicalEscalations).toBeInstanceOf(Array);
  });

  it('tone reflects valence mix — mostly positive when positive dominates', () => {
    const events = makeWorkspaceEvents(40, {
      eventName: 'commerce.whatsapp.message_replied',
      workspaceId: 'wks_test_001',
      valence: 'positive',
    });
    // Add 10 negative and remaining neutral
    for (let i = 0; i < 10; i++) {
      events.push(
        makeEvent({
          eventName: 'commerce.whatsapp.message_replied',
          occurredAt: new Date(`2026-05-10T${10 + i}:00:00.000Z`).toISOString(),
          workspaceId: 'wks_test_001',
          valence: 'negative',
        }),
      );
    }
    // Fill to 100
    while (events.length < VOLUME_THRESHOLD) {
      const h = 14 + (events.length % 10);
      events.push(
        makeEvent({
          eventName: 'commerce.whatsapp.message_received',
          occurredAt: new Date(`2026-05-10T${String(h).padStart(2, '0')}:00:00.000Z`).toISOString(),
          workspaceId: 'wks_test_001',
        }),
      );
    }

    const profile = service.deriveProfile('wks_test_001', events);
    expect(profile).toBeDefined();
    expect(profile!.language.tone).toBe('positive');
  });

  it('tone reflects valence mix — mostly negative when negative dominates', () => {
    const events = makeWorkspaceEvents(50, {
      eventName: 'commerce.whatsapp.message_replied',
      workspaceId: 'wks_test_001',
      valence: 'negative',
    });
    // Add 10 positive
    for (let i = 0; i < 10; i++) {
      events.push(
        makeEvent({
          eventName: 'commerce.whatsapp.message_replied',
          occurredAt: new Date(`2026-05-10T${10 + i}:00:00.000Z`).toISOString(),
          workspaceId: 'wks_test_001',
          valence: 'positive',
        }),
      );
    }
    while (events.length < VOLUME_THRESHOLD) {
      const h = 14 + (events.length % 10);
      events.push(
        makeEvent({
          eventName: 'commerce.whatsapp.message_received',
          occurredAt: new Date(`2026-05-10T${String(h).padStart(2, '0')}:00:00.000Z`).toISOString(),
          workspaceId: 'wks_test_001',
        }),
      );
    }

    const profile = service.deriveProfile('wks_test_001', events);
    expect(profile).toBeDefined();
    expect(profile!.language.tone).toBe('negative');
  });

  it('peakHours matches injected hour distribution', () => {
    const events: SpineEventRef[] = [];
    // Inject events concentrated at hours 8, 9, 10 (peak), 14, 15
    const hours = [
      ...[8, 8, 8, 8, 8, 8, 8, 8, 8, 8],
      ...[9, 9, 9, 14, 14, 14],
      ...[10, 10],
      ...[15, 16, 17],
    ];
    for (let i = 0; i < hours.length; i++) {
      const h = hours[i]!;
      const t = new Date(`2026-05-10T${String(h).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}:00.000Z`);
      events.push(
        makeEvent({
          eventName: 'commerce.lead.created',
          occurredAt: t.toISOString(),
          workspaceId: 'wks_test_001',
        }),
      );
    }

    // Fill to threshold
    while (events.length < VOLUME_THRESHOLD) {
      events.push(
        makeEvent({
          eventName: 'commerce.lead.created',
          occurredAt: new Date(`2026-05-10T12:00:00.000Z`).toISOString(),
          workspaceId: 'wks_test_001',
        }),
      );
    }

    const profile = service.deriveProfile('wks_test_001', events);
    expect(profile).toBeDefined();
    // Hour 8 should be in peak hours because it's the most frequent
    expect(profile!.temporal.peakHours).toContain(8);
  });

  it('computes typicalCycleHours from lead.contacted to payment.approved', () => {
    const events: SpineEventRef[] = [];
    const base = new Date('2026-05-10T10:00:00.000Z');

    // lead.contacted for lead_A at hour 10
    events.push(
      makeEvent({
        eventName: 'commerce.lead.contacted',
        occurredAt: base.toISOString(),
        workspaceId: 'wks_test_001',
        entityRef: { entityType: 'lead', entityId: 'lead_A' },
      }),
    );

    // lead.contacted for lead_B at hour 11
    const baseB = new Date('2026-05-10T11:00:00.000Z');
    events.push(
      makeEvent({
        eventName: 'commerce.lead.contacted',
        occurredAt: baseB.toISOString(),
        workspaceId: 'wks_test_001',
        entityRef: { entityType: 'lead', entityId: 'lead_B' },
      }),
    );

    // payment.approved for lead_A at hour 58 (48h after contact)
    const paidA = new Date(base.getTime() + 48 * 3600_000);
    events.push(
      makeEvent({
        eventName: 'commerce.payment.approved',
        occurredAt: paidA.toISOString(),
        workspaceId: 'wks_test_001',
        entityRef: { entityType: 'payment', entityId: 'pay_A' },
        payload: { leadId: 'lead_A' },
      }),
    );

    // payment.approved for lead_B at hour 83 (72h after contact)
    const paidB = new Date(baseB.getTime() + 72 * 3600_000);
    events.push(
      makeEvent({
        eventName: 'commerce.payment.approved',
        occurredAt: paidB.toISOString(),
        workspaceId: 'wks_test_001',
        entityRef: { entityType: 'payment', entityId: 'pay_B' },
        payload: { leadId: 'lead_B' },
      }),
    );

    // Fill to threshold
    while (events.length < VOLUME_THRESHOLD) {
      events.push(
        makeEvent({
          eventName: 'commerce.lead.created',
          occurredAt: new Date(`2026-05-10T12:00:00.000Z`).toISOString(),
          workspaceId: 'wks_test_001',
        }),
      );
    }

    const profile = service.deriveProfile('wks_test_001', events);
    expect(profile).toBeDefined();
    // Median of 48h and 72h = 60h
    expect(profile!.temporal.typicalCycleHours).toBeGreaterThan(0);
    expect(profile!.temporal.typicalCycleHours).toBe(60);
  });

  it('is pure: same input produces the same output', () => {
    makeEvent.seq = 0;
    const events = synthetic100();
    const p1 = service.deriveProfile('wks_test_001', events);

    makeEvent.seq = 0;
    const events2 = synthetic100();
    const p2 = service.deriveProfile('wks_test_001', events2);

    expect(p1).toBeDefined();
    expect(p2).toBeDefined();
    // derivedAt uses new Date() and will differ between calls; compare
    // without it to verify functional purity.
    const { derivedAt: _d1, ...rest1 } = p1!;
    const { derivedAt: _d2, ...rest2 } = p2!;
    expect(rest1).toEqual(rest2);
  });

  it('isolates workspaces — events from other workspace are ignored', () => {
    const events = synthetic100();
    // Add 100 events from another workspace
    const otherEvents = makeWorkspaceEvents(VOLUME_THRESHOLD, {
      workspaceId: 'wks_other',
    });
    const allEvents = [...events, ...otherEvents];

    const profile = service.deriveProfile('wks_other', allEvents);
    expect(profile).toBeDefined();
    expect(profile!.workspaceId).toBe('wks_other');
    expect(profile!.derivedFromEventsCount).toBe(VOLUME_THRESHOLD);
  });

  it('extracts vocabulary from message payloads', () => {
    const events: SpineEventRef[] = [];
    // 50 message_replied events with known tokens
    for (let i = 0; i < 50; i++) {
      events.push(
        makeEvent({
          eventName: 'commerce.whatsapp.message_replied',
          occurredAt: new Date(`2026-05-10T${10 + (i % 14)}:00:00.000Z`).toISOString(),
          workspaceId: 'wks_test_001',
          payload: {
            body: 'Olá cliente seu plano vendas está disponível hoje preço especial',
          },
          valence: 'neutral',
        }),
      );
    }

    // Fill to threshold
    while (events.length < VOLUME_THRESHOLD) {
      events.push(
        makeEvent({
          eventName: 'commerce.lead.created',
          occurredAt: new Date(`2026-05-10T12:00:00.000Z`).toISOString(),
          workspaceId: 'wks_test_001',
        }),
      );
    }

    const profile = service.deriveProfile('wks_test_001', events);
    expect(profile).toBeDefined();
    expect(profile!.language.vocabulary.length).toBeGreaterThan(0);
    // Check that stop words are excluded
    const vocab = profile!.language.vocabulary.join(' ');
    expect(vocab).not.toContain('seu');
    expect(vocab).not.toContain('está');
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
});
