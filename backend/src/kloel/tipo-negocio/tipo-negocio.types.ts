/**
 * UTP-MATURITY-002 variant — TipoNegocio Classifier types.
 *
 * Classifica negocios em 5 dimensoes independentes a partir de
 * sinais extraidos de eventos do spine (SpineEventRef), sem
 * depender de declaracao humana.
 *
 * Dimensoes:
 *   ticket    — low | mid | high       (valor medio dos pagamentos)
 *   modelo    — recurrence | perpetual | launch | evergreen
 *   oferta    — service | physical_product | infoproduct | saas | agency_service
 *   touch     — high_touch | self_serve
 *   audiencia — b2b | b2c | hibrido
 */

import type { SpineEventRef } from '../mind/mind.types';

export type Ticket = 'low' | 'mid' | 'high';
export type Modelo = 'recurrence' | 'perpetual' | 'launch' | 'evergreen';
export type Oferta = 'service' | 'physical_product' | 'infoproduct' | 'saas' | 'agency_service';
export type Touch = 'high_touch' | 'self_serve';
export type Audiencia = 'b2b' | 'b2c' | 'hibrido';
interface DimensionConfidence {
  readonly label: string;
  readonly confidence: number;
}

export interface ProfileNegocio {
  readonly workspaceId: string;
  readonly ticket: Ticket;
  readonly ticketConfidence: number;
  readonly modelo: Modelo;
  readonly modeloConfidence: number;
  readonly oferta: Oferta;
  readonly ofertaConfidence: number;
  readonly touch: Touch;
  readonly touchConfidence: number;
  readonly audiencia: Audiencia;
  readonly audienciaConfidence: number;
  readonly classifiedAt: string;
  readonly dimensions: readonly DimensionConfidence[];
}

export interface ClassifyInput {
  readonly events: readonly SpineEventRef[];
  readonly workspaceId: string;
  readonly nowMs?: number;
}

export function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}