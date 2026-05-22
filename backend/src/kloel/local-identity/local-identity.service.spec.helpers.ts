import { VOLUME_THRESHOLD } from './local-identity.types';
import type { SpineEventRef } from '../mind/mind.types';

export function makeEvent(
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

export function makeWorkspaceEvents(
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

export function synthetic100(): SpineEventRef[] {
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
        ...(valences[i] !== undefined ? { valence: valences[i] } : {}),
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
