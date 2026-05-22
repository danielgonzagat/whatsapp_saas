import { V } from '../analytics.design-tokens';
import { ICONS } from './Icons';
import type { IconFn } from '../analytics.types';

export const statusMap: Record<string, { c: string; l: string }> = {
  PAID: { c: V.g2, l: 'Aprovado' },
  PENDING: { c: V.y, l: 'Pendente' },
  PROCESSING: { c: V.bl, l: 'Processando' },
  CANCELED: { c: V.t3, l: 'Cancelado' },
  REFUNDED: { c: V.p, l: 'Estornado' },
  CHARGEBACK: { c: V.pk, l: 'Chargeback' },
  DECLINED: { c: V.r, l: 'Recusado' },
  SHIPPED: { c: V.cy, l: 'Enviado' },
  DELIVERED: { c: V.g2, l: 'Entregue' },
  ACTIVE: { c: V.g2, l: 'Ativa' },
  CANCELLED: { c: V.r, l: 'Cancelada' },
  PAST_DUE: { c: V.y, l: 'Atrasada' },
  TRIALING: { c: V.bl, l: 'Trial' },
  PAUSED: { c: V.t3, l: 'Pausada' },
  active: { c: V.g2, l: 'Ativo' },
  approved: { c: V.g2, l: 'Aprovado' },
};

export const formIcon: Record<string, IconFn> = {
  PIX: ICONS.pix,
  CREDIT_CARD: ICONS.card,
  BOLETO: ICONS.file,
};
