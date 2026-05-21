import type { SpineEventRef } from '../mind/mind.types';
import { TipoNegocioClassifierService } from './tipo-negocio.classifier.service';
import type { ClassifyInput, ProfileNegocio } from './tipo-negocio.types';
import {
  classifyAudiencia,
  classifyModelo,
  classifyOferta,
  classifyTicket,
  classifyTouch,
} from './tipo-negocio.classifier.service';

const WKS = 'wks_demo';
const NOW = Date.parse('2026-05-14T22:00:00.000Z');
const svc = new TipoNegocioClassifierService();

function ev(over?: Partial<SpineEventRef>): SpineEventRef {
  const defaults: Record<string, unknown> = {
    eventId: over?.eventId ?? `e_${Math.random().toString(36).slice(2, 8)}`,
    eventName: over?.eventName ?? 'commerce.payment.approved',
    workspaceId: over?.workspaceId ?? WKS,
    occurredAt: over?.occurredAt ?? '2026-05-14T20:00:00.000Z',
    truthMode: over?.truthMode ?? 'observed',
  };
  if (over?.entityRef !== undefined) defaults['entityRef'] = over.entityRef;
  if (over?.valence !== undefined) defaults['valence'] = over.valence;
  if (over?.payload !== undefined) defaults['payload'] = over.payload;
  if (over?.correlationId !== undefined) defaults['correlationId'] = over.correlationId;
  return defaults as SpineEventRef;
}

function payment(
  amount: number,
  extras?: Record<string, unknown>,
  over?: Partial<SpineEventRef>,
): SpineEventRef {
  return ev({
    eventName: 'commerce.payment.approved',
    payload: { amount, ...(extras ?? {}) },
    occurredAt: over?.occurredAt,
    workspaceId: over?.workspaceId,
  });
}

function waMsg(over?: Partial<SpineEventRef>): SpineEventRef {
  return ev({
    eventName: 'commerce.whatsapp.message_received',
    ...over,
  });
}

function ap(amount: number, overrides?: Partial<SpineEventRef>): SpineEventRef {
  return payment(amount, {}, overrides);
}

// =========================================================================
// classifyTicket
// =========================================================================
describe('TipoNegocioClassifierService.classify', () => {
  it('returns full profile for workspace with payments', () => {
    const events: SpineEventRef[] = [
      payment(150, { payerId: 'p1', productType: 'infoproduct', hasWhatsappInteraction: true }),
      payment(200, { payerId: 'p2', productType: 'infoproduct', hasWhatsappInteraction: true }),
      payment(180, { payerId: 'p3', productType: 'infoproduct' }),
    ];
    const input: ClassifyInput = { events, workspaceId: WKS, nowMs: NOW };
    const p: ProfileNegocio = svc.classify(input);

    expect(p.workspaceId).toBe(WKS);
    expect(p.ticket).toBeDefined();
    expect(p.modelo).toBeDefined();
    expect(p.oferta).toBeDefined();
    expect(p.touch).toBeDefined();
    expect(p.audiencia).toBeDefined();
    expect(p.classifiedAt).toBeTruthy();
    expect(p.dimensions).toHaveLength(5);
  });

  it('excludes events from other workspaces', () => {
    const events: SpineEventRef[] = [
      ap(5000, { workspaceId: 'wks_other' }),
      ap(50, { workspaceId: 'wks_other' }),
      ap(50, { workspaceId: 'wks_other' }),
    ];
    const input: ClassifyInput = { events, workspaceId: WKS, nowMs: NOW };
    const p = svc.classify(input);

    expect(p.ticket).toBe('low');
    expect(p.ticketConfidence).toBe(0.2);
  });

  it('handles mixed event types gracefully', () => {
    const events: SpineEventRef[] = [
      payment(1200, {
        payerId: 'p1',
        productType: 'saas',
        hasWhatsappInteraction: true,
        hasManualInteraction: true,
      }),
      payment(1200, { payerId: 'p1', productType: 'saas' }),
      payment(1200, { payerId: 'p2', productType: 'saas' }),
      waMsg(),
      ev({ eventName: 'commerce.cart.abandoned' }),
      ev({ eventName: 'commerce.lead.created', entityRef: { entityType: 'lead', entityId: 'l1' } }),
    ];
    const input: ClassifyInput = { events, workspaceId: WKS, nowMs: NOW };
    const p = svc.classify(input);

    expect(p.ticket).toBe('mid');
    expect(p.modelo).toBe('recurrence');
    expect(p.oferta).toBe('saas');
    expect(p.touch).toBe('high_touch');
    expect(p.audiencia).toBe('b2b');
  });

  it('handles empty events', () => {
    const input: ClassifyInput = { events: [], workspaceId: WKS, nowMs: NOW };
    const p = svc.classify(input);

    expect(p.ticket).toBe('low');
    expect(p.modelo).toBe('evergreen');
    expect(p.oferta).toBe('service');
    expect(p.touch).toBe('self_serve');
    expect(p.audiencia).toBe('b2c');
    expect(p.dimensions).toHaveLength(5);
  });

  it('detects launch modelo from concentrated multi-payer payments', () => {
    const events: SpineEventRef[] = [
      payment(500, { payerId: 'p1' }, { occurredAt: '2026-05-14T10:00:00Z' }),
      payment(500, { payerId: 'p2' }, { occurredAt: '2026-05-14T11:00:00Z' }),
      payment(500, { payerId: 'p3' }, { occurredAt: '2026-05-14T12:00:00Z' }),
      payment(500, { payerId: 'p4' }, { occurredAt: '2026-05-14T13:00:00Z' }),
    ];
    const input: ClassifyInput = { events, workspaceId: WKS, nowMs: NOW };
    const p = svc.classify(input);
    expect(p.modelo).toBe('launch');
  });

  it('high ticket service defaults to agency_service+high_touch+b2b', () => {
    const events: SpineEventRef[] = [
      payment(8000, { hasWhatsappInteraction: true, hasManualInteraction: true }),
      payment(12000, { hasWhatsappInteraction: true }),
    ];
    const input: ClassifyInput = { events, workspaceId: WKS, nowMs: NOW };
    const p = svc.classify(input);

    expect(p.ticket).toBe('high');
    expect(p.oferta).toBe('agency_service');
    expect(p.touch).toBe('high_touch');
    expect(p.audiencia).toBe('b2b');
  });

  it('small recurring payments classify as recurrence+low+saas+self_serve+b2c', () => {
    const events: SpineEventRef[] = [
      payment(
        99,
        { payerId: 'p1', productType: 'saas' },
        { occurredAt: '2026-01-14T20:00:00.000Z' },
      ),
      payment(
        99,
        { payerId: 'p1', productType: 'saas' },
        { occurredAt: '2026-02-14T20:00:00.000Z' },
      ),
      payment(
        99,
        { payerId: 'p1', productType: 'saas' },
        { occurredAt: '2026-03-14T20:00:00.000Z' },
      ),
    ];
    const input: ClassifyInput = { events, workspaceId: WKS, nowMs: NOW };
    const p = svc.classify(input);

    expect(p.ticket).toBe('low');
    expect(p.modelo).toBe('recurrence');
    expect(p.oferta).toBe('saas');
    expect(p.touch).toBe('self_serve');
    expect(p.audiencia).toBe('b2c');
  });

  it('confidence floats within [0, 1] for all dimensions', () => {
    const events: SpineEventRef[] = [
      payment(1500, { payerId: 'p1', productType: 'infoproduct' }),
      payment(1500, { payerId: 'p1', productType: 'infoproduct' }),
      payment(1500, { payerId: 'p2', productType: 'infoproduct' }),
    ];
    const input: ClassifyInput = { events, workspaceId: WKS, nowMs: NOW };
    const p = svc.classify(input);

    for (const d of p.dimensions) {
      expect(d.confidence).toBeGreaterThanOrEqual(0);
      expect(d.confidence).toBeLessThanOrEqual(1);
    }

    expect(p.ticketConfidence).toBeGreaterThanOrEqual(0);
    expect(p.ticketConfidence).toBeLessThanOrEqual(1);
    expect(p.modeloConfidence).toBeGreaterThanOrEqual(0);
    expect(p.modeloConfidence).toBeLessThanOrEqual(1);
    expect(p.ofertaConfidence).toBeGreaterThanOrEqual(0);
    expect(p.ofertaConfidence).toBeLessThanOrEqual(1);
    expect(p.touchConfidence).toBeGreaterThanOrEqual(0);
    expect(p.touchConfidence).toBeLessThanOrEqual(1);
    expect(p.audienciaConfidence).toBeGreaterThanOrEqual(0);
    expect(p.audienciaConfidence).toBeLessThanOrEqual(1);
  });

  it('classifies infoproduct launch with mixed audience signals as hibrido', () => {
    const events: SpineEventRef[] = [
      payment(
        497,
        { payerId: 'p1', productType: 'b2c-consumidor' },
        { occurredAt: '2026-05-10T10:00:00Z' },
      ),
      payment(
        497,
        { payerId: 'p2', productType: 'b2c-consumidor' },
        { occurredAt: '2026-05-10T11:00:00Z' },
      ),
      payment(
        497,
        { payerId: 'p3', productType: 'b2c-consumidor' },
        { occurredAt: '2026-05-10T12:00:00Z' },
      ),
      payment(
        497,
        { payerId: 'p4', productType: 'b2b-empresa' },
        { occurredAt: '2026-05-10T13:00:00Z' },
      ),
    ];
    const input: ClassifyInput = { events, workspaceId: WKS, nowMs: NOW };
    const p = svc.classify(input);

    expect(p.modelo).toBe('launch');
    expect(p.audiencia).toBe('hibrido');
  });
});
