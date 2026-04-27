// Connect payout approval — pure parsing helpers
// Extracted from connect-payout-approval.service.ts for architecture guardrail

import { BadRequestException } from '@nestjs/common';

import type {
  ConnectPayoutApprovalDecision,
  ConnectPayoutApprovalPayload,
  ConnectPayoutApprovalSummary,
} from './connect-payout-approval.types';

/** Narrow an unknown value to a record (or null). */
function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Coerce an unknown to a non-empty trimmed string or throw. */
function asNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`Invalid ${field}`);
  }
  return value.trim();
}

/** Parse the persisted approval payload back into the typed shape. */
export function parseApprovalPayload(value: unknown): ConnectPayoutApprovalPayload {
  const record = asRecord(value);
  const amountCents = asNonEmptyString(record?.amountCents, 'approval payload.amountCents');
  const currency = asNonEmptyString(record?.currency, 'approval payload.currency');

  return {
    version: 1,
    workspaceId: asNonEmptyString(record?.workspaceId, 'approval payload.workspaceId'),
    accountBalanceId: asNonEmptyString(
      record?.accountBalanceId,
      'approval payload.accountBalanceId',
    ),
    accountType: asNonEmptyString(record?.accountType, 'approval payload.accountType'),
    stripeAccountId: asNonEmptyString(record?.stripeAccountId, 'approval payload.stripeAccountId'),
    amountCents,
    currency,
    requestId: asNonEmptyString(record?.requestId, 'approval payload.requestId'),
    requestedByType: 'workspace',
  };
}

/** Parse the persisted decision response back into the typed shape. */
function parseDecision(value: unknown): ConnectPayoutApprovalDecision | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const amountCents = typeof record.amountCents === 'string' ? record.amountCents : null;
  const currency = typeof record.currency === 'string' ? record.currency : null;
  if (!amountCents || !currency) {
    return null;
  }

  return {
    payoutId: typeof record.payoutId === 'string' ? record.payoutId : null,
    status: typeof record.status === 'string' ? record.status : null,
    amountCents,
    currency,
    approvedByAdminId:
      typeof record.approvedByAdminId === 'string' ? record.approvedByAdminId : null,
    rejectedByAdminId:
      typeof record.rejectedByAdminId === 'string' ? record.rejectedByAdminId : null,
    reason: typeof record.reason === 'string' ? record.reason : null,
    error: typeof record.error === 'string' ? record.error : null,
  };
}

/** Approval row shape used by the summary mapper (matches Prisma create result). */
interface MappableApprovalRow {
  id: string;
  state: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  respondedAt: Date | null;
  payload: unknown;
  response: unknown;
}

/** Build a `ConnectPayoutApprovalSummary` from a persisted approval row. */
export function mapApprovalSummary(approval: MappableApprovalRow): ConnectPayoutApprovalSummary {
  const payload = parseApprovalPayload(approval.payload);
  const decision = parseDecision(approval.response);

  return {
    approvalRequestId: approval.id,
    workspaceId: payload.workspaceId,
    accountBalanceId: payload.accountBalanceId,
    accountType: payload.accountType,
    stripeAccountId: payload.stripeAccountId,
    amountCents: payload.amountCents,
    currency: payload.currency,
    requestId: payload.requestId,
    state: approval.state,
    title: approval.title,
    createdAt: approval.createdAt.toISOString(),
    updatedAt: approval.updatedAt.toISOString(),
    respondedAt: approval.respondedAt?.toISOString() ?? null,
    decision,
  };
}
