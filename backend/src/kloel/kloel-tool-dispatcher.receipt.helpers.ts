import { createHash } from 'crypto';
import { sanitizeDetails } from './kloel-tool-dispatcher.high-risk.helpers';
import {
  asString,
  buildReceiptEvidenceUrl,
  deriveReceiptOutputs,
  receiptKeyPart,
} from './kloel-tool-dispatcher.helpers';
import type { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
import type { UnknownRecord } from '../common/types';

/** Idempotency time-bucket window in milliseconds (60s per Y-2 DoD). */
export const IDEMPOTENCY_WINDOW_MS = 60_000;

/**
 * Deterministically hash the redacted payload of a capability invocation.
 *
 * Uses a stable key ordering so that semantically-identical inputs (regardless
 * of property declaration order) collapse to the same hash. Returns a short
 * hex digest suitable for inclusion in an idempotency key.
 */
export function hashReceiptPayload(inputs: UnknownRecord): string {
  const stable = JSON.stringify(inputs, Object.keys(inputs).sort());
  return createHash('sha256').update(stable).digest('hex').slice(0, 16);
}

/**
 * Canonical idempotency-key derivation for a capability receipt (Y-2 DoD).
 *
 * Key = actorId + intent(capabilityId) + payloadHash + 60s time bucket.
 *
 * The 60s bucket means two identical invocations by the same actor for the same
 * intent and payload within the same minute collapse to the same key (safe
 * replay), while invocations in different minutes are treated as distinct.
 */
export function deriveIdempotencyKey(
  capabilityId: string,
  actorId: string,
  inputs: UnknownRecord,
  nowMs: number = Date.now(),
): string {
  const bucket = Math.floor(nowMs / IDEMPOTENCY_WINDOW_MS);
  return [
    receiptKeyPart(actorId),
    receiptKeyPart(capabilityId),
    hashReceiptPayload(inputs),
    String(bucket),
  ].join(':');
}

export type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

/**
 * Attach a canonical receipt to a tool result when the capability is
 * registered in the live CapabilityRegistryV2. Returns the original result
 * unchanged when the registry is unavailable or the capability is unknown.
 */
export function buildCanonicalReceipt(
  capRegistryV2: CapabilityRegistryV2Service | undefined,
  capabilityId: string,
  workspaceId: string,
  args: UnknownRecord,
  result: ToolResult,
  userId: string | undefined,
  startedAt: number,
): ToolResult {
  const cap = capRegistryV2?.get(capabilityId);
  if (!cap || !capRegistryV2) {
    return result;
  }

  const inputs = sanitizeDetails(args);
  const outputs = result.success ? deriveReceiptOutputs(result, inputs) : {};
  const actorId = userId ?? 'kloel-chat';
  const idempotencyKey = deriveIdempotencyKey(capabilityId, actorId, inputs, startedAt);
  const requestId = [
    receiptKeyPart(capabilityId),
    receiptKeyPart(workspaceId),
    receiptKeyPart(actorId),
  ]
    .join(':')
    .slice(0, 120);
  const auditLogId = asString(result.auditLogId, `audit_${requestId}`);
  const evidenceUrl = result.success
    ? buildReceiptEvidenceUrl(cap.evidenceUrlBuilder, outputs)
    : undefined;
  const receiptParams: Parameters<CapabilityRegistryV2Service['createReceipt']>[0] = {
    capabilityId: cap.id,
    title: cap.title,
    context: {
      workspaceId,
      actorId,
      source: 'dashboard-chat',
      idempotencyKey,
      requestId,
    },
    inputs,
    outputs,
    domainEvents: result.success ? cap.emits : [],
    auditLogId,
    ...(cap.executionRail !== undefined ? { executionRail: cap.executionRail } : {}),
    durationMs: Date.now() - startedAt,
    success: result.success,
  };

  if (evidenceUrl) {
    receiptParams.evidenceUrl = evidenceUrl;
  }
  if (typeof result.error === 'string') {
    receiptParams.error = result.error;
  }

  const receipt = capRegistryV2.createReceipt(receiptParams);
  return {
    ...result,
    capabilityId: cap.id,
    outputs,
    domainEvents: receipt.domainEvents,
    auditLogId: receipt.auditLogId,
    evidenceUrl: receipt.evidenceUrl,
    receipt,
  };
}
