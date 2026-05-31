import { Response } from 'express';
import { StructuredLogger } from '../logging/structured-logger';

export function writeSseResponse(res: Response, responseText: string): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const responsePayload = { content: responseText, done: true };
  res.write('data: ' + JSON.stringify(responsePayload) + '\n\n');
  res.end();
}

const FALLBACK_REPLY =
  'Tive uma instabilidade momentânea pra processar agora. Pode repetir a mensagem em alguns segundos? Estou aqui pra continuar o onboarding.';

export function buildOnboardingFallback(
  reason: string,
  ctx: {
    error: unknown;
    workspaceId: string;
    hasResponseHeaders: boolean;
    willingWrite: boolean;
  },
  logger: StructuredLogger,
): string {
  logger.warn('Onboarding degraded', {
    tag: 'kloel_onboarding_degraded',
    reason,
    errorMessage:
      ctx.error instanceof Error
        ? ctx.error.message
        : typeof ctx.error === 'string'
          ? ctx.error
          : ctx.error == null
            ? ''
            : JSON.stringify(ctx.error),
    errorName: ctx.error instanceof Error ? ctx.error.constructor.name : typeof ctx.error,
    hasResponseHeaders: ctx.hasResponseHeaders,
    willingWrite: ctx.willingWrite,
  });
  return FALLBACK_REPLY;
}
