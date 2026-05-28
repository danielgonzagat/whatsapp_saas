import { sanitizeDetails } from './kloel-tool-dispatcher.high-risk.helpers';
import {
  asString,
  buildReceiptEvidenceUrl,
  deriveReceiptOutputs,
  receiptKeyPart,
} from './kloel-tool-dispatcher.helpers';
import type { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
import type { UnknownRecord } from '../common/types';

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
  const idempotencyKey = [
    receiptKeyPart(capabilityId),
    receiptKeyPart(workspaceId),
    receiptKeyPart(actorId),
    receiptKeyPart(JSON.stringify(inputs)),
  ].join(':');
  const requestId = idempotencyKey.slice(0, 120);
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
