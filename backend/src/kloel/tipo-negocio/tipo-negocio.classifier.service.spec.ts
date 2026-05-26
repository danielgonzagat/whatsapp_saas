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
  if (over?.entityRef !== undefined) {defaults['entityRef'] = over.entityRef;}
  if (over?.valence !== undefined) {defaults['valence'] = over.valence;}
  if (over?.payload !== undefined) {defaults['payload'] = over.payload;}
  if (over?.correlationId !== undefined) {defaults['correlationId'] = over.correlationId;}
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