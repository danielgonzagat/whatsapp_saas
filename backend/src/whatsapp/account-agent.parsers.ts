/**
 * Pure parsing/normalization helpers for AccountAgentService payloads.
 *
 * Extracted from account-agent.service.ts to keep the service under the
 * architecture line-count guardrail and to make these stateless, easily
 * testable helpers reusable without instantiating the NestJS service.
 */

import type {
  AccountApprovalPayload,
  AccountInputSessionPayload,
  ApprovalStatus,
  InputSessionStatus,
} from './account-agent.types';

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function readNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return null;
}

export function normalizeApprovalStatus(value: unknown): ApprovalStatus {
  switch (value) {
    case 'APPROVED':
    case 'REJECTED':
    case 'COMPLETED':
      return value;
    case 'OPEN':
    default:
      return 'OPEN';
  }
}

export function normalizeInputSessionStatus(value: unknown): InputSessionStatus {
  switch (value) {
    case 'WAITING_OFFERS':
    case 'WAITING_COMPANY':
    case 'COMPLETED':
      return value;
    case 'WAITING_DESCRIPTION':
    default:
      return 'WAITING_DESCRIPTION';
  }
}

export function parseApprovalPayload(value: unknown): AccountApprovalPayload | null {
  const payload = asRecord(value);
  if (!payload) {
    return null;
  }

  const id = readString(payload.id);
  const requestedProductName = readString(payload.requestedProductName);
  const normalizedProductName = readString(payload.normalizedProductName);
  const customerMessage = readString(payload.customerMessage);
  const operatorPrompt = readString(payload.operatorPrompt);
  const firstDetectedAt = readString(payload.firstDetectedAt);
  const lastDetectedAt = readString(payload.lastDetectedAt);

  if (
    !id ||
    !requestedProductName ||
    !normalizedProductName ||
    !customerMessage ||
    !operatorPrompt ||
    !firstDetectedAt ||
    !lastDetectedAt
  ) {
    return null;
  }

  return {
    id,
    kind: 'product_creation',
    status: normalizeApprovalStatus(payload.status),
    requestedProductName,
    normalizedProductName,
    contactId: readNullableString(payload.contactId),
    contactName: readNullableString(payload.contactName),
    phone: readNullableString(payload.phone),
    conversationId: readNullableString(payload.conversationId),
    customerMessage,
    operatorPrompt,
    source: 'inbound_catalog_gap',
    firstDetectedAt,
    lastDetectedAt,
    inputSessionId: readNullableString(payload.inputSessionId),
    materializedProductId: readNullableString(payload.materializedProductId),
  };
}

export function parseInputSessionPayload(value: unknown): AccountInputSessionPayload | null {
  const payload = asRecord(value);
  if (!payload) {
    return null;
  }

  const id = readString(payload.id);
  const approvalId = readString(payload.approvalId);
  const productName = readString(payload.productName);
  const normalizedProductName = readString(payload.normalizedProductName);
  const customerMessage = readString(payload.customerMessage);
  const createdAt = readString(payload.createdAt);
  const updatedAt = readString(payload.updatedAt);

  if (
    !id ||
    !approvalId ||
    !productName ||
    !normalizedProductName ||
    !customerMessage ||
    !createdAt ||
    !updatedAt
  ) {
    return null;
  }

  const answers = asRecord(payload.answers) ?? {};

  return {
    id,
    approvalId,
    kind: 'product_creation',
    status: normalizeInputSessionStatus(payload.status),
    productName,
    normalizedProductName,
    contactId: readNullableString(payload.contactId),
    contactName: readNullableString(payload.contactName),
    phone: readNullableString(payload.phone),
    customerMessage,
    answers: {
      description: readNullableString(answers.description),
      offers: readNullableString(answers.offers),
      company: readNullableString(answers.company),
    },
    createdAt,
    updatedAt,
    completedAt: readNullableString(payload.completedAt),
    materializedProductId: readNullableString(payload.materializedProductId),
  };
}

export function getPromptForStage(stage: InputSessionStatus, productName: string): string {
  switch (stage) {
    case 'WAITING_DESCRIPTION':
      return `Descreva ${productName} com o máximo de detalhes que puder. Quanto melhor a descrição, mais vendas eu consigo fazer.`;
    case 'WAITING_OFFERS':
      return `Descreva todos os planos de ${productName}: oferta, quantidade, o que você entrega, o que o cliente recebe, preço, desconto máximo, parcelamento e links de compra. Quanto mais detalhe, mais vendas eu consigo gerar.`;
    case 'WAITING_COMPANY':
      return `Por último: informe o nome da empresa responsável, CNPJ e o máximo de contexto comercial e institucional sobre ${productName}. Quanto melhor e maior a descrição, mais vendas eu consigo fazer.`;
    case 'COMPLETED':
    default:
      return `${productName} já está pronto para venda.`;
  }
}
