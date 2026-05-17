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

export const ALL_TICKETS: readonly Ticket[] = ['low', 'mid', 'high'] as const;

export type Modelo = 'recurrence' | 'perpetual' | 'launch' | 'evergreen';

export const ALL_MODELOS: readonly Modelo[] = [
  'recurrence',
  'perpetual',
  'launch',
  'evergreen',
] as const;

export type Oferta = 'service' | 'physical_product' | 'infoproduct' | 'saas' | 'agency_service';

export const ALL_OFERTAS: readonly Oferta[] = [
  'service',
  'physical_product',
  'infoproduct',
  'saas',
  'agency_service',
] as const;

export type Touch = 'high_touch' | 'self_serve';

export const ALL_TOUCHES: readonly Touch[] = ['high_touch', 'self_serve'] as const;

export type Audiencia = 'b2b' | 'b2c' | 'hibrido';

export const ALL_AUDIENCIAS: readonly Audiencia[] = ['b2b', 'b2c', 'hibrido'] as const;

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

export const TICKET_DESCRIPTIONS: Readonly<Record<Ticket, string>> = {
  low: 'Ticket medio ate R$ 300. Produtos de entrada, baixo compromisso.',
  mid: 'Ticket medio entre R$ 300 e R$ 2.000. Meio de funil, compromisso moderado.',
  high: 'Ticket medio acima de R$ 2.000. Fundo de funil, alto compromisso.',
};

export const MODELO_DESCRIPTIONS: Readonly<Record<Modelo, string>> = {
  recurrence: 'Receita recorrente — assinaturas, planos mensais, membros. Cobranca periodica.',
  perpetual: 'Venda unica, produto perene. Pagamento unico, acesso vitalicio.',
  launch: 'Lancamento periodico com janela curta de vendas. Picos concentrados de faturamento.',
  evergreen: 'Venda continua com funil sempre aberto. Fluxo constante, sem janela fechada.',
};

export const OFERTA_DESCRIPTIONS: Readonly<Record<Oferta, string>> = {
  service: 'Servico prestado — consultoria, mentoria, executivo. Entrega humana direta.',
  physical_product: 'Produto fisico — envio, logistica, estoque. Tangivel.',
  infoproduct: 'Infoproduto — curso, ebook, treinamento. Digital, escalavel, sem entrega fisica.',
  saas: 'Software como servico — plataforma, ferramenta. Acesso recorrente, cloud.',
  agency_service:
    'Servico de agencia — gestao de trafego, social media, SEO. Retencao por contrato.',
};

export const TOUCH_DESCRIPTIONS: Readonly<Record<Touch, string>> = {
  high_touch: 'Alto contato humano — vendas consultivas, WhatsApp ativo, calls frequentes.',
  self_serve: 'Self-service — checkout autonomo, baixo contato humano, automacao dominante.',
};

export const AUDIENCIA_DESCRIPTIONS: Readonly<Record<Audiencia, string>> = {
  b2b: 'Business-to-business — vende para empresas, CNPJ, tomadores de decisao.',
  b2c: 'Business-to-consumer — vende para pessoa fisica, CPF, consumidor final.',
  hibrido: 'Hibrido — atende tanto B2B quanto B2C de forma significativa.',
};

export function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function makeProfileId(): string {
  return `pn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
