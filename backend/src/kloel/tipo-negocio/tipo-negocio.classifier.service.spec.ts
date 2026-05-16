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
describe('classifyTicket', () => {
  it('returns low with low confidence when no payments', () => {
    const r = classifyTicket([]);
    expect(r.label).toBe('low');
    expect(r.confidence).toBe(0.2);
  });

  it('classifies ticket <= 300 as low', () => {
    const r = classifyTicket([
      { amount: 100, occurredAt: '2026-05-14T00:00:00Z', payerId: 'p1' },
      { amount: 200, occurredAt: '2026-05-14T00:00:00Z', payerId: 'p2' },
    ]);
    expect(r.label).toBe('low');
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('classifies ticket between 300 and 2000 as mid', () => {
    const r = classifyTicket([
      { amount: 500, occurredAt: '2026-05-14T00:00:00Z' },
      { amount: 700, occurredAt: '2026-05-14T00:00:00Z' },
    ]);
    expect(r.label).toBe('mid');
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('classifies ticket >= 2000 as high', () => {
    const r = classifyTicket([
      { amount: 3000, occurredAt: '2026-05-14T00:00:00Z' },
      { amount: 5000, occurredAt: '2026-05-14T00:00:00Z' },
    ]);
    expect(r.label).toBe('high');
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('single payment at exact boundary 300 yields mid', () => {
    const r = classifyTicket([{ amount: 300, occurredAt: '2026-05-14T00:00:00Z' }]);
    expect(r.label).toBe('mid');
  });
});

// =========================================================================
// classifyModelo
// =========================================================================
describe('classifyModelo', () => {
  it('returns evergreen low confidence with < 2 payments', () => {
    const r = classifyModelo([{ amount: 100, occurredAt: '2026-05-14T00:00:00Z' }]);
    expect(r.label).toBe('evergreen');
    expect(r.confidence).toBe(0.2);
  });

  it('classifies as recurrence when same payer pays multiple times', () => {
    const r = classifyModelo([
      { amount: 50, occurredAt: '2026-04-10T00:00:00Z', payerId: 'p1' },
      { amount: 50, occurredAt: '2026-05-10T00:00:00Z', payerId: 'p1' },
      { amount: 50, occurredAt: '2026-06-10T00:00:00Z', payerId: 'p1' },
      { amount: 80, occurredAt: '2026-05-12T00:00:00Z', payerId: 'p2' },
    ]);
    expect(r.label).toBe('recurrence');
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('classifies as launch when payments concentrated in short window', () => {
    const r = classifyModelo([
      { amount: 200, occurredAt: '2026-05-14T10:00:00Z', payerId: 'p1' },
      { amount: 200, occurredAt: '2026-05-14T11:00:00Z', payerId: 'p2' },
      { amount: 200, occurredAt: '2026-05-14T12:00:00Z', payerId: 'p3' },
      { amount: 200, occurredAt: '2026-05-14T13:00:00Z', payerId: 'p4' },
      { amount: 200, occurredAt: '2026-05-14T14:00:00Z', payerId: 'p5' },
    ]);
    expect(r.label).toBe('launch');
    expect(r.confidence).toBeGreaterThanOrEqual(0.55);
  });

  it('classifies as perpetual when spread over long period with unique payers', () => {
    const r = classifyModelo([
      { amount: 500, occurredAt: '2025-12-01T00:00:00Z', payerId: 'p1' },
      { amount: 500, occurredAt: '2026-03-01T00:00:00Z', payerId: 'p2' },
      { amount: 500, occurredAt: '2026-05-14T00:00:00Z', payerId: 'p3' },
    ]);
    expect(r.label).toBe('perpetual');
    expect(r.confidence).toBeGreaterThanOrEqual(0.3);
  });
});

// =========================================================================
// classifyOferta
// =========================================================================
describe('classifyOferta', () => {
  it('returns service with low confidence when no payments', () => {
    const r = classifyOferta([], []);
    expect(r.label).toBe('service');
    expect(r.confidence).toBeLessThanOrEqual(0.2);
  });

  it('classifies as saas from productType hint', () => {
    const approved = [
      { amount: 100, occurredAt: '2026-05-14T00:00:00Z', productType: 'saas-plataforma' },
      { amount: 100, occurredAt: '2026-05-14T00:00:00Z', productType: 'software' },
    ];
    const r = classifyOferta(approved, []);
    expect(r.label).toBe('saas');
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('classifies as infoproduct from productType hint', () => {
    const approved = [
      { amount: 50, occurredAt: '2026-05-14T00:00:00Z', productType: 'curso-online' },
      { amount: 50, occurredAt: '2026-05-14T00:00:00Z', productType: 'ebook' },
    ];
    const r = classifyOferta(approved, []);
    expect(r.label).toBe('infoproduct');
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('classifies as physical_product from cart shipping events', () => {
    const approved = [{ amount: 150, occurredAt: '2026-05-14T00:00:00Z', productType: 'produto' }];
    const cartEv = ev({
      eventName: 'commerce.cart.created',
      payload: { needsShipping: true },
    });
    const r = classifyOferta(approved, [cartEv]);
    expect(r.label).toBe('physical_product');
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('classifies as agency_service from productType hint', () => {
    const approved = [
      { amount: 3000, occurredAt: '2026-05-14T00:00:00Z', productType: 'agencia-gestao' },
    ];
    const r = classifyOferta(approved, []);
    expect(r.label).toBe('agency_service');
  });

  it('defaults to infoproduct when no hints and medium ticket', () => {
    const approved = [
      { amount: 150, occurredAt: '2026-05-14T00:00:00Z' },
      { amount: 200, occurredAt: '2026-05-14T00:00:00Z' },
    ];
    const r = classifyOferta(approved, []);
    expect(r.label).toBe('infoproduct');
  });
});

// =========================================================================
// classifyTouch
// =========================================================================
describe('classifyTouch', () => {
  it('returns self_serve low confidence with no payments', () => {
    const r = classifyTouch([], []);
    expect(r.label).toBe('self_serve');
    expect(r.confidence).toBe(0.2);
  });

  it('classifies as high_touch when most payments have WhatsApp interaction', () => {
    const approved = [
      { amount: 100, occurredAt: '2026-05-14T00:00:00Z', hasWhatsappInteraction: true },
      { amount: 200, occurredAt: '2026-05-14T00:00:00Z', hasWhatsappInteraction: true },
      { amount: 300, occurredAt: '2026-05-14T00:00:00Z', hasManualInteraction: true },
    ];
    const r = classifyTouch([], approved);
    expect(r.label).toBe('high_touch');
    expect(r.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('classifies as self_serve when no interaction flags', () => {
    const approved = [
      { amount: 100, occurredAt: '2026-05-14T00:00:00Z' },
      { amount: 200, occurredAt: '2026-05-14T00:00:00Z' },
      { amount: 300, occurredAt: '2026-05-14T00:00:00Z' },
    ];
    const r = classifyTouch([], approved);
    expect(r.label).toBe('self_serve');
    expect(r.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('classifies high_touch at mixed ratio >= 0.3 with reduced confidence', () => {
    const approved = [
      { amount: 100, occurredAt: '2026-05-14T00:00:00Z', hasWhatsappInteraction: true },
      { amount: 200, occurredAt: '2026-05-14T00:00:00Z' },
      { amount: 300, occurredAt: '2026-05-14T00:00:00Z' },
    ];
    const r = classifyTouch([], approved);
    expect(r.label).toBe('high_touch');
    expect(r.confidence).toBeGreaterThanOrEqual(0.35);
    expect(r.confidence).toBeLessThanOrEqual(0.75);
  });
});

// =========================================================================
// classifyAudiencia
// =========================================================================
describe('classifyAudiencia', () => {
  it('returns b2c low confidence with no payments', () => {
    const r = classifyAudiencia([]);
    expect(r.label).toBe('b2c');
    expect(r.confidence).toBe(0.2);
  });

  it('classifies as b2b when most productTypes indicate enterprise', () => {
    const approved = [
      { amount: 5000, occurredAt: '2026-05-14T00:00:00Z', productType: 'b2b-empresa' },
      { amount: 7000, occurredAt: '2026-05-14T00:00:00Z', productType: 'enterprise' },
    ];
    const r = classifyAudiencia(approved);
    expect(r.label).toBe('b2b');
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('classifies as b2c when most productTypes indicate consumer', () => {
    const approved = [
      { amount: 50, occurredAt: '2026-05-14T00:00:00Z', productType: 'b2c-consumidor' },
      { amount: 50, occurredAt: '2026-05-14T00:00:00Z', productType: 'consumer' },
    ];
    const r = classifyAudiencia(approved);
    expect(r.label).toBe('b2c');
    expect(r.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('classifies as hibrido when both b2b and b2c signals present', () => {
    const approved = [
      { amount: 5000, occurredAt: '2026-05-14T00:00:00Z', productType: 'b2b-empresa' },
      { amount: 5000, occurredAt: '2026-05-14T00:00:00Z', productType: 'b2b-empresa' },
      { amount: 50, occurredAt: '2026-05-14T00:00:00Z', productType: 'b2c-consumidor' },
      { amount: 50, occurredAt: '2026-05-14T00:00:00Z', productType: 'b2c-consumidor' },
    ];
    const r = classifyAudiencia(approved);
    expect(r.label).toBe('hibrido');
    expect(r.confidence).toBeGreaterThanOrEqual(0.4);
  });

  it('defaults to b2b when high ticket and no type hints', () => {
    const approved = [
      { amount: 5000, occurredAt: '2026-05-14T00:00:00Z' },
      { amount: 8000, occurredAt: '2026-05-14T00:00:00Z' },
    ];
    const r = classifyAudiencia(approved);
    expect(r.label).toBe('b2b');
  });
});

// =========================================================================
// TipoNegocioClassifierService — classify() integration
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
