/**
 * Transactional `create_payment_link` dispatch helper extracted from
 * KloelToolDispatcherService. Wraps the underlying chat-tools call with:
 *
 *   1. argument coercion via {@link buildPaymentLinkArgs};
 *   2. forwarding to {@link KloelChatToolsService.toolCreatePaymentLink}
 *      with `executionPath: 'dispatcher'`;
 *   3. a best-effort audit-log write performed inside a Prisma
 *      `$transaction` with `ReadCommitted` isolation;
 *   4. on audit failure, an ops alert and a structured warning (the
 *      payment link itself is never blocked by an audit error);
 *   5. canonical-receipt wrapping via the caller-provided callback.
 *
 * Behaviour is preserved one-for-one with the previous inline method.
 */

import {
  buildPaymentLinkArgs,
  buildPaymentLinkAuditEntry,
  extractAuditErrorMessage,
  type PaymentLinkArgs,
} from './kloel-tool-dispatcher.payment-link.helpers';
import type { AuditService } from '../audit/audit.service';
import type { KloelChatToolsService } from './kloel-chat-tools.service';
import type { OpsAlertService } from '../observability/ops-alert.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { UnknownRecord } from '../common/types';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

type ReceiptApplier = (
  capabilityId: string,
  workspaceId: string,
  args: UnknownRecord,
  result: ToolResult,
  userId: string | undefined,
  startedAt: number,
) => ToolResult;

/** Minimal structured-logger surface used by this helper. */
export interface CreatePaymentLinkLogger {
  warn: (message: string) => void;
}

/** Dependencies required by {@link runCreatePaymentLink}. */
export interface CreatePaymentLinkDeps {
  prisma: PrismaService;
  auditService: AuditService;
  chatToolsService: KloelChatToolsService;
  opsAlert: OpsAlertService | undefined;
  logger: CreatePaymentLinkLogger;
  applyReceipt: ReceiptApplier;
}

/**
 * Dispatch a `create_payment_link` tool call and write a transactional
 * audit log entry alongside the actual payment-link creation. Audit
 * failure is logged but never blocks payment-link delivery.
 */
export async function runCreatePaymentLink(
  deps: CreatePaymentLinkDeps,
  workspaceId: string,
  args: UnknownRecord,
  userId?: string,
): Promise<ToolResult> {
  const startedAt = Date.now();
  const paymentArgs: PaymentLinkArgs = buildPaymentLinkArgs(args);
  const result = await deps.chatToolsService.toolCreatePaymentLink(workspaceId, {
    ...paymentArgs,
    executionPath: 'dispatcher',
  });
  try {
    await deps.prisma.$transaction(
      async (tx) => {
        await deps.auditService.logWithTx(tx, {
          workspaceId,
          ...buildPaymentLinkAuditEntry(paymentArgs, result, userId),
        });
      },
      { isolationLevel: 'ReadCommitted' },
    );
  } catch (auditError: unknown) {
    void deps.opsAlert?.alertOnCriticalError(
      auditError,
      'KloelToolDispatcherService.sanitizeDetails',
    );
    deps.logger.warn(
      `Audit dispatch (payment link) failed: ${extractAuditErrorMessage(auditError)}`,
    );
  }
  return deps.applyReceipt(
    'create_payment_link',
    workspaceId,
    paymentArgs as unknown as UnknownRecord,
    result,
    userId,
    startedAt,
  );
}
