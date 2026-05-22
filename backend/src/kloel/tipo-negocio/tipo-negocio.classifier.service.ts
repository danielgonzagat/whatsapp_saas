/**
 * TipoNegocioClassifierService — Camada VIII maturity variant.
 *
 * Classifies a workspace's business profile across 5 dimensions
 * (ticket, modelo, oferta, touch, audiencia) from spine events,
 * primarily `commerce.payment.approved`.
 *
 * Each dimension produces a label + confidence ∈ [0, 1].
 * The service works with pure functions and is injectable
 * into NestJS modules.
 */

import type { SpineEventRef } from '../mind/mind.types';
import type {
  Audiencia,
  ClassifyInput,
  Modelo,
  Oferta,
  ProfileNegocio,
  Ticket,
  Touch,
} from './tipo-negocio.types';
import { clampConfidence } from './tipo-negocio.types';

interface ApprovedPayment {
  readonly amount: number;
  readonly occurredAt: string;
  readonly payerId: string | undefined;
  readonly productType: string | undefined;
  readonly hasWhatsappInteraction: boolean;
  readonly hasManualInteraction: boolean;
}

export class TipoNegocioClassifierService {
  classify(input: ClassifyInput): ProfileNegocio {
    const { events, workspaceId, nowMs } = input;
    const workspaceEvents = events.filter(
      (e) => e.workspaceId === workspaceId || e.workspaceId === undefined,
    );

    const approved = workspaceEvents
      .filter((e) => e.eventName === 'commerce.payment.approved')
      .map((e) => toApprovedPayment(e))
      .filter((a): a is ApprovedPayment => a !== null);

    const whatsappEvents = workspaceEvents.filter(
      (e) =>
        e.eventName.startsWith('commerce.whatsapp.') &&
        e.eventName !== 'commerce.whatsapp.session_lifecycle',
    );

    const classifiedAt = new Date(nowMs ?? Date.now()).toISOString();

    const ticket = classifyTicket(approved);
    const modelo = classifyModelo(approved);
    const oferta = classifyOferta(approved, workspaceEvents);
    const touch = classifyTouch(whatsappEvents, approved);
    const audiencia = classifyAudiencia(approved);

    return {
      workspaceId,
      ticket: ticket.label,
      ticketConfidence: ticket.confidence,
      modelo: modelo.label,
      modeloConfidence: modelo.confidence,
      oferta: oferta.label,
      ofertaConfidence: oferta.confidence,
      touch: touch.label,
      touchConfidence: touch.confidence,
      audiencia: audiencia.label,
      audienciaConfidence: audiencia.confidence,
      classifiedAt,
      dimensions: [
        { label: 'ticket', confidence: ticket.confidence },
        { label: 'modelo', confidence: modelo.confidence },
        { label: 'oferta', confidence: oferta.confidence },
        { label: 'touch', confidence: touch.confidence },
        { label: 'audiencia', confidence: audiencia.confidence },
      ],
    };
  }
}

export function classifyTicket(approved: readonly ApprovedPayment[]): {
  label: Ticket;
  confidence: number;
} {
  if (approved.length === 0) {
    return { label: 'low', confidence: 0.2 };
  }

  const amounts = approved.map((p) => p.amount);
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;

  if (mean >= 2000) {
    const conf = clampConfidence(0.5 + Math.min(0.45, (mean - 2000) / 4000));
    return { label: 'high', confidence: conf };
  }
  if (mean >= 300) {
    const conf = clampConfidence(0.5 + Math.min(0.4, (mean - 300) / 1700));
    return { label: 'mid', confidence: conf };
  }
  const conf = clampConfidence(0.3 + Math.min(0.5, mean / 300));
  return { label: 'low', confidence: conf };
}

export function classifyModelo(approved: readonly ApprovedPayment[]): {
  label: Modelo;
  confidence: number;
} {
  if (approved.length < 2) {
    return { label: 'evergreen', confidence: 0.2 };
  }

  const byPayer = new Map<string, number>();
  for (const p of approved) {
    if (p.payerId) {
      byPayer.set(p.payerId, (byPayer.get(p.payerId) ?? 0) + 1);
    }
  }

  const recurrenceRatio =
    approved.length > 1
      ? [...byPayer.values()].filter((c) => c >= 2).length / Math.max(1, byPayer.size)
      : 0;

  const timeline = approved.map((p) => p.occurredAt).sort();
  const firstItem = timeline[0];
  const lastItem = timeline[timeline.length - 1];
  const firstTs = firstItem ? new Date(firstItem).getTime() : 0;
  const lastTs = lastItem ? new Date(lastItem).getTime() : 0;
  const windowDays = Math.max(1, (lastTs - firstTs) / (1000 * 60 * 60 * 24));

  const paymentsPerDay = approved.length / windowDays;

  const hasConcentration = detectConcentration(timeline, 5);

  if (recurrenceRatio >= 0.5) {
    const conf = clampConfidence(0.5 + recurrenceRatio * 0.45);
    return { label: 'recurrence', confidence: conf };
  }

  if (hasConcentration && paymentsPerDay >= 0.5) {
    const conf = clampConfidence(0.55 + Math.min(0.4, paymentsPerDay / 5));
    return { label: 'launch', confidence: conf };
  }

  if (recurrenceRatio <= 0.05 && windowDays >= 30) {
    const conf = clampConfidence(0.3 + Math.min(0.6, windowDays / 180));
    return { label: 'perpetual', confidence: conf };
  }

  const conf = clampConfidence(0.25 + Math.min(0.55, (approved.length - 1) / 20));
  return { label: 'evergreen', confidence: conf };
}

export function classifyOferta(
  approved: readonly ApprovedPayment[],
  allEvents: readonly SpineEventRef[],
): { label: Oferta; confidence: number } {
  if (approved.length === 0) {
    return { label: 'service', confidence: 0.15 };
  }

  const typeCounts: Partial<Record<Oferta, number>> = {};
  for (const p of approved) {
    const inferred = inferOfertaFromProductType(p.productType ?? '');
    if (inferred) {
      typeCounts[inferred] = (typeCounts[inferred] ?? 0) + 1;
    }
  }

  const hasPhysicalEvents = allEvents.some(
    (e) =>
      e.eventName.startsWith('commerce.cart.') &&
      e.payload &&
      typeof e.payload === 'object' &&
      (e.payload as Record<string, unknown>)['needsShipping'] === true,
  );

  if (hasPhysicalEvents) {
    typeCounts['physical_product'] = (typeCounts['physical_product'] ?? 0) + 1;
  }

  const entries = Object.entries(typeCounts) as [Oferta, number][];
  entries.sort((a, b) => b[1] - a[1]);

  if (entries.length === 0) {
    const amounts = approved.map((p) => p.amount);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    if (mean >= 5000) {
      return { label: 'agency_service', confidence: 0.3 };
    }
    if (mean >= 1000) {
      return { label: 'service', confidence: 0.28 };
    }
    return { label: 'infoproduct', confidence: 0.25 };
  }

  const topEntry = entries[0] as [Oferta, number];
  const topRatio = topEntry[1] / approved.length;
  const conf = clampConfidence(0.3 + topRatio * 0.65);

  return { label: topEntry[0], confidence: conf };
}

export function classifyTouch(
  whatsappEvents: readonly SpineEventRef[],
  approved: readonly ApprovedPayment[],
): { label: Touch; confidence: number } {
  void whatsappEvents;
  if (approved.length === 0) {
    return { label: 'self_serve', confidence: 0.2 };
  }

  const highTouchCount = approved.filter(
    (p) => p.hasWhatsappInteraction || p.hasManualInteraction,
  ).length;

  const highTouchRatio = highTouchCount / approved.length;

  if (highTouchRatio >= 0.6) {
    const conf = clampConfidence(0.55 + highTouchRatio * 0.4);
    return { label: 'high_touch', confidence: conf };
  }

  if (highTouchRatio >= 0.3) {
    const conf = clampConfidence(0.35 + highTouchRatio * 0.5);
    return { label: 'high_touch', confidence: conf };
  }

  const conf = clampConfidence(0.3 + (1 - highTouchRatio) * 0.6);
  return { label: 'self_serve', confidence: conf };
}

export function classifyAudiencia(approved: readonly ApprovedPayment[]): {
  label: Audiencia;
  confidence: number;
} {
  if (approved.length === 0) {
    return { label: 'b2c', confidence: 0.2 };
  }

  const b2bCount = approved.filter((p) => {
    const pt = (p.productType ?? '').toLowerCase();
    return (
      pt.includes('b2b') ||
      pt.includes('empresa') ||
      pt.includes('corp') ||
      pt.includes('enterprise')
    );
  }).length;

  const b2cCount = approved.filter((p) => {
    const pt = (p.productType ?? '').toLowerCase();
    return (
      pt.includes('b2c') ||
      pt.includes('consumidor') ||
      pt.includes('consumer') ||
      pt.includes('pessoa')
    );
  }).length;

  const neutralCount = approved.length - b2bCount - b2cCount;
  const b2bRatio = b2bCount / approved.length;
  const b2cRatio = b2cCount / approved.length;

  if (b2bRatio >= 0.25 && b2cRatio >= 0.25) {
    const conf = clampConfidence(0.35 + Math.min(b2bRatio, b2cRatio) * 0.6);
    return { label: 'hibrido', confidence: conf };
  }

  if (b2bRatio >= 0.5) {
    const conf = clampConfidence(0.5 + b2bRatio * 0.4);
    return { label: 'b2b', confidence: conf };
  }

  if (b2cRatio >= 0.5) {
    const conf = clampConfidence(0.5 + b2cRatio * 0.4);
    return { label: 'b2c', confidence: conf };
  }

  const amounts = approved.map((p) => p.amount);
  const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  if (mean >= 3000 || (neutralCount === approved.length && mean >= 1000)) {
    return { label: 'b2b', confidence: clampConfidence(0.25 + Math.min(mean, 5000) / 20000) };
  }

  return { label: 'b2c', confidence: 0.3 };
}

function toApprovedPayment(event: SpineEventRef): ApprovedPayment | null {
  const p = event.payload as Record<string, unknown> | undefined;
  if (!p) {
    return null;
  }

  let amount: number;
  if (typeof p['amount'] === 'number') {
    amount = p['amount'];
  } else if (typeof p['amount'] === 'string') {
    amount = Number.parseFloat(p['amount']);
  } else if (typeof p['valor'] === 'number') {
    amount = p['valor'];
  } else if (typeof p['valor'] === 'string') {
    amount = Number.parseFloat(p['valor']);
  } else {
    amount = 0;
  }

  if (Number.isNaN(amount)) {
    return null;
  }

  return {
    amount,
    occurredAt: event.occurredAt,
    payerId: typeof p['payerId'] === 'string' ? p['payerId'] : undefined,
    productType:
      typeof p['productType'] === 'string'
        ? p['productType']
        : typeof p['tipoProduto'] === 'string'
          ? p['tipoProduto']
          : undefined,
    hasWhatsappInteraction: p['hasWhatsappInteraction'] === true,
    hasManualInteraction: p['hasManualInteraction'] === true,
  };
}

function inferOfertaFromProductType(productType: string): Oferta | null {
  const pt = productType.toLowerCase();
  if (pt.includes('saas') || pt.includes('software') || pt.includes('plataforma')) {
    return 'saas';
  }
  if (pt.includes('fisico') || pt.includes('produto') || pt.includes('physical')) {
    return 'physical_product';
  }
  if (
    pt.includes('info') ||
    pt.includes('curso') ||
    pt.includes('ebook') ||
    pt.includes('treinamento')
  ) {
    return 'infoproduct';
  }
  if (pt.includes('agencia') || pt.includes('agency') || pt.includes('gestao')) {
    return 'agency_service';
  }
  if (pt.includes('servico') || pt.includes('service') || pt.includes('consultoria')) {
    return 'service';
  }
  return null;
}

function detectConcentration(timestamps: string[], windowHours: number): boolean {
  if (timestamps.length < 3) {
    return false;
  }

  for (let i = 0; i < timestamps.length - 2; i++) {
    const a = new Date(timestamps[i] ?? '').getTime();
    const b = new Date(timestamps[i + 2] ?? '').getTime();
    if (Number.isNaN(a) || Number.isNaN(b)) {
      continue;
    }
    if (b - a <= windowHours * 60 * 60 * 1000) {
      return true;
    }
  }

  return false;
}
