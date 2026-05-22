/**
 * UTP-LEGIT-012 — Block With Justification Service.
 *
 * Applies blocks with legal justification: policy violation,
 * legal requirement, regulatory order, copyright claim,
 * trademark infringement, right of publicity, court order,
 * platform terms, consent required, jurisdiction block.
 *
 * Generates appeal instructions and determines if legal
 * review is required.
 *
 * Pure function — stateless block justification generation.
 */

import type { BlockInput, BlockResult } from './types';
import { generateId } from './types';

function legalReviewRequired(reason: string): boolean {
  const reviewReasons = [
    'court_order',
    'regulatory_order',
    'trademark_infringement',
    'right_of_publicity',
    'copyright_claim',
  ];
  return reviewReasons.includes(reason);
}

function generateAppealInstructions(reason: string): string {
  switch (reason) {
    case 'copyright_claim':
      return 'Para recorrer, envie uma contranotificacao conforme DMCA/LGPD art. 21 incluindo: identificacao do conteudo, dados de contato, declaracao de boa-fe.';
    case 'trademark_infringement':
      return 'Para recorrer, apresente comprovante de registro de marca ou autorizacao de uso do titular.';
    case 'policy_violation':
      return 'Para recorrer, revise os termos de uso da plataforma e submeta uma revisao com a evidencia de conformidade.';
    case 'court_order':
      return 'Bloqueio por ordem judicial. Contate seu advogado para recorrer na jurisdição competente.';
    case 'regulatory_order':
      return 'Bloqueio por determinação de orgao regulador. Consulte a notificacao oficial para instrucoes de recurso.';
    case 'right_of_publicity':
      return 'Para recorrer, apresente autorizacao assinada de uso de imagem ou comprovante de dominio publico.';
    case 'legal_requirement':
      return 'Para recorrer, apresente documentacao legal que demonstre conformidade com a regulacao aplicavel.';
    default:
      return 'Para recorrer, contate o suporte com a referencia deste bloqueio e a documentacao comprobatoria.';
  }
}

function isPermanent(reason: string): boolean {
  const permanentReasons = ['court_order', 'regulatory_order'];
  return permanentReasons.includes(reason);
}

export function applyBlockWithJustification(input: BlockInput): BlockResult {
  const nowMs = input.nowMs ?? Date.now();

  const block = {
    blockId: generateId('block'),
    workspaceId: input.workspaceId,
    reason: input.reason,
    description: input.description,
    legalBasis: input.legalBasis,
    appliedBy: input.appliedBy,
    blockedResources: input.blockedResources,
    appealInstructions: generateAppealInstructions(input.reason),
    expiresAt: input.expiresAt,
    appliedAt: new Date(nowMs).toISOString(),
    liftedAt: null,
  };

  return {
    block,
    isPermanent: isPermanent(input.reason),
    requiresLegalReview: legalReviewRequired(input.reason),
    assessedAt: new Date(nowMs).toISOString(),
  };
}
