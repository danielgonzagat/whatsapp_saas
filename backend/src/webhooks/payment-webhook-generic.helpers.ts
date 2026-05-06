/**
 * Pure helper utilities for PaymentWebhookGenericController.
 * No NestJS DI — plain functions only, safe to unit-test in isolation.
 */
import * as crypto from 'node:crypto';
import { BadRequestException, type Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { PrismaService } from '../prisma/prisma.service';
import { validateNoInternalAccess } from '../common/utils/url-validator';
import type { WebhookRequest } from './payment-webhook-types';

/** Throw BadRequestException if the workspace does not exist. */
export async function assertWorkspaceExists(prisma: PrismaService, workspaceId: string) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!ws) throw new BadRequestException('invalid_workspaceId');
}

/** Verify a shared-secret header or HMAC signature against the expected value. */
export function verifySharedSecretOrSignature(
  req: WebhookRequest,
  expectedSecret: string,
  sharedSecret?: string,
  signature?: string,
): boolean {
  if (sharedSecret && safeCompare(sharedSecret, expectedSecret)) return true;
  if (!signature) return false;
  const reqBody = req?.body;
  const raw = req?.rawBody || JSON.stringify(reqBody || '');
  const payload = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw));
  const hexDigest = crypto.createHmac('sha256', expectedSecret).update(payload).digest('hex');
  const base64Digest = crypto.createHmac('sha256', expectedSecret).update(payload).digest('base64');
  return safeCompare(signature, hexDigest) || safeCompare(signature, base64Digest);
}

/** Constant-time string comparison (both trimmed). */
function safeCompare(left: string, right: string): boolean {
  const l = String(left || '').trim();
  const r = String(right || '').trim();
  if (!l || l.length !== r.length) return false;
  return crypto.timingSafeEqual(Buffer.from(l), Buffer.from(r));
}

/** Build a stable request-id for ops alerts. */
function buildOpsAlertRequestId(message: string, meta: Record<string, unknown>): string {
  const stableId =
    asString(meta.eventId) ||
    asString(meta.externalId) ||
    asString(meta.paymentIntentId) ||
    asString(meta.orderId) ||
    crypto.randomUUID();
  return `payment-webhook:${message}:${stableId}`;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/**
 * Idempotency check using atomic Redis SET EX NX.
 * Returns duplicate-response when event was already processed, null otherwise.
 */
export async function ensureIdempotent(
  eventId: string | undefined,
  req: WebhookRequest,
  redis: Redis,
  logger: Logger,
  sendOpsAlertFn: (message: string, meta: Record<string, unknown>) => Promise<void>,
): Promise<{ ok: true; received: true; duplicate: true; reason: string } | null> {
  const reqBody = req?.body;
  const raw = req?.rawBody || JSON.stringify(reqBody || '');
  const key =
    eventId ||
    crypto
      .createHash('sha256')
      .update(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)))
      .digest('hex')
      .slice(0, 32);
  const cacheKey = `webhook:payment:${key}`;
  const result = await redis.set(cacheKey, '1', 'EX', 300, 'NX');
  if (result === null) {
    logger.warn(`Duplicate payment webhook ignored: ${key}`);
    await sendOpsAlertFn('webhook_duplicate_payment', { key, path: req?.url });
    return { ok: true, received: true, duplicate: true, reason: 'duplicate_event' };
  }
  return null;
}

/** Send an ops alert to OPS_WEBHOOK_URL / DLQ_WEBHOOK_URL and push to Redis alerts list. */
export async function sendOpsAlert(
  message: string,
  meta: Record<string, unknown>,
  redis: Redis,
): Promise<void> {
  const url =
    process.env.OPS_WEBHOOK_URL ||
    process.env.AUTOPILOT_ALERT_WEBHOOK ||
    process.env.DLQ_WEBHOOK_URL;
  if (!url || !globalThis.fetch) return;
  const requestId = buildOpsAlertRequestId(message, meta);
  try {
    validateNoInternalAccess(url);
    await globalThis.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
      body: JSON.stringify({
        type: message,
        meta,
        requestId,
        at: new Date().toISOString(),
        env: process.env.NODE_ENV || 'dev',
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // best effort
  }
  try {
    const payload = { type: message, meta, requestId, at: new Date().toISOString() };
    await redis.lpush('alerts:webhooks', JSON.stringify(payload));
    await redis.ltrim('alerts:webhooks', 0, 49);
  } catch {
    // ignore
  }
}
