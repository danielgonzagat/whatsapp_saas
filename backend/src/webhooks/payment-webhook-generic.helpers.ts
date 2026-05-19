import { createHmac } from 'node:crypto';
import { Logger, NotFoundException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { validatePaymentTransition } from '../common/payment-state-machine';
import { PrismaService } from '../prisma/prisma.service';
import type { GenericPaymentWebhookBody, WebhookRequest } from './payment-webhook-types';

export async function assertWorkspaceExists(
  prisma: PrismaService,
  workspaceId: string,
): Promise<void> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true },
  });
  if (!workspace) {
    throw new NotFoundException('workspace_not_found');
  }
}

export function verifySharedSecretOrSignature(
  req: WebhookRequest,
  expectedSecret: string,
  secretHeader: string | undefined,
  signatureHeader: string | undefined,
): boolean {
  if (secretHeader && secretHeader === expectedSecret) {
    return true;
  }
  if (!signatureHeader) {
    return false;
  }
  const raw = req?.rawBody || JSON.stringify(req?.body || {});
  const rawBuffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'utf8');
  const digest = createHmac('sha256', expectedSecret).update(rawBuffer).digest('hex');
  return signatureHeader === digest || signatureHeader === `sha256=${digest}`;
}

export async function ensureIdempotent(
  eventId: string | undefined,
  req: WebhookRequest,
  redis: Redis,
  logger: Logger,
  onDuplicate: (message: string, meta: Record<string, unknown>) => Promise<void> | void,
): Promise<{ ok: true; duplicate: true } | null> {
  const raw = req?.rawBody || JSON.stringify(req?.body || {});
  const rawBuffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'utf8');
  const keySeed =
    eventId || createHmac('sha256', 'generic-payment-webhook').update(rawBuffer).digest('hex');
  const key = `webhook:payment:generic:${keySeed}`;
  const inserted = await redis.set(key, '1', 'EX', 60 * 60 * 24, 'NX');
  if (inserted === 'OK') {
    return null;
  }
  logger.log(`Duplicate payment webhook ignored: ${keySeed}`);
  await onDuplicate('duplicate_payment_webhook', { eventId: keySeed });
  return { ok: true, duplicate: true };
}

export async function sendOpsAlert(
  message: string,
  meta: Record<string, unknown>,
  redis: Redis,
): Promise<void> {
  await redis.publish(
    'ops-alerts',
    JSON.stringify({ message, meta, at: new Date().toISOString() }),
  );
}

export async function updateSaleAndPaymentHelper(
  prisma: PrismaService,
  logger: Logger,
  body: GenericPaymentWebhookBody,
  workspaceId: string,
): Promise<void> {
  if (body.orderId || body.provider) {
    try {
      await prisma.kloelSale.updateMany({
        where: {
          workspaceId,
          OR: [
            body.orderId ? { externalPaymentId: String(body.orderId) } : undefined,
            body.orderId ? { id: String(body.orderId) } : undefined,
          ].filter(Boolean) as Array<{ externalPaymentId: string } | { id: string }>,
        },
        data: { status: 'paid', paidAt: new Date() },
      });
    } catch (saleErr: unknown) {
      const msg =
        saleErr instanceof Error
          ? saleErr
          : new Error(typeof saleErr === 'string' ? saleErr : 'unknown error');
      logger.warn(`Não foi possível atualizar KloelSale (generic): ${msg?.message}`);
    }
  }
  if (body.orderId) {
    try {
      const genericExternalRef = String(body.orderId);
      const existingGenericPayment = await prisma.payment.findFirst({
        where: { workspaceId, externalId: genericExternalRef },
      });
      const canTransitionGeneric =
        !existingGenericPayment ||
        validatePaymentTransition(existingGenericPayment.status || 'PENDING', 'RECEIVED', {
          paymentId: existingGenericPayment?.id,
          provider: body.provider || 'generic',
          externalId: genericExternalRef,
        });
      if (canTransitionGeneric) {
        await prisma.payment.updateMany({
          where: { workspaceId, externalId: genericExternalRef },
          data: { status: 'RECEIVED' },
        });
      } else {
        logger.warn(
          `Generic webhook rejected by state machine: ${existingGenericPayment?.status} -> RECEIVED for ${genericExternalRef}`,
        );
      }
    } catch (paymentErr: unknown) {
      const msg =
        paymentErr instanceof Error
          ? paymentErr
          : new Error(typeof paymentErr === 'string' ? paymentErr : 'unknown error');
      logger.warn(`Não foi possível atualizar Payment (generic): ${msg?.message}`);
    }
  }
}
