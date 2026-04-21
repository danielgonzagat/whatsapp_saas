/**
 * Pure builders for admin audit entries. Extracted from
 * admin-audit.interceptor.ts so Lizard measures each helper independently
 * (TypeScript grammar bundles neighbouring small functions into the
 * nearest exported symbol, inflating cyclomatic complexity).
 */
import type { ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedAdmin } from '../auth/admin-auth.types';
import { sanitizeForAudit } from '../common/admin-sanitize';

/** Resolve audit action. */
export function resolveAuditAction(context: ExecutionContext): string {
  return `${context.getClass().name}.${context.getHandler().name}`;
}

function resolveRequestPath(req: Request): string {
  return req.path ?? req.url ?? '';
}

/** Build audit details. */
export function buildAuditDetails(req: Request): Record<string, unknown> {
  return {
    method: req.method,
    path: resolveRequestPath(req),
    query: sanitizeForAudit(req.query ?? {}),
    body: sanitizeForAudit(req.body ?? {}),
    params: sanitizeForAudit(req.params ?? {}),
  };
}

function extractForwardedForHeader(req: Request): string | null {
  const forwarded = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim();
  return forwarded ? forwarded : null;
}

/** Resolve client ip. */
export function resolveClientIp(req: Request): string | null {
  return extractForwardedForHeader(req) || req.ip || req.socket?.remoteAddress || null;
}

/** Build admin audit entry. */
export function buildAdminAuditEntry(
  context: ExecutionContext,
  req: Request & { admin?: AuthenticatedAdmin },
) {
  return {
    adminUserId: req.admin?.id ?? null,
    action: resolveAuditAction(context),
    details: buildAuditDetails(req),
    ip: resolveClientIp(req),
    userAgent: req.headers['user-agent'] ?? null,
  };
}
