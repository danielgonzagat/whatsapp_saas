import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { StructuredLogger } from '../logging/structured-logger';

/**
 * BrainDecideDegradeFilter
 *
 * Controller-scoped filter for the Kloel chat decision endpoint.
 *
 * A `BadRequestException` on `POST /brain/decide` is almost always raised by
 * the GLOBAL `ValidationPipe` BEFORE the controller handler runs (the handler's
 * own try/catch can only catch service-layer throws — pipe rejections happen
 * pre-handler). A bare 400 there hard-kills the chat for an authenticated user
 * with no honest feedback.
 *
 * This filter does NOT weaken validation: the global pipe still runs and bad
 * data still never reaches business logic. It only converts the user-facing
 * failure into the honest degraded state prescribed by CLAUDE.md ("FALLBACK no
 * chat → degraded") while logging the FULL validation detail server-side so the
 * real root cause stays diagnosable in Railway. Scoped strictly to the chat
 * decision route — every other Bad Request keeps its real 400.
 */
@Catch(BadRequestException)
export class BrainDecideDegradeFilter implements ExceptionFilter {
  private readonly logger = StructuredLogger.from(BrainDecideDegradeFilter.name);

  catch(exception: BadRequestException, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const url = typeof request.url === 'string' ? request.url : '';
    const isDecide = request.method === 'POST' && url.includes('/brain/decide');

    if (!isDecide) {
      // Preserve the real 400 for every other route/handler.
      const status = exception.getStatus();
      response.status(status).json(exception.getResponse());
      return;
    }

    // Log the FULL validation payload (the class-validator message array) so
    // the exact failing constraint is recoverable from server logs without
    // needing the browser body. Never swallowed silently.
    let detail: string;
    try {
      detail = JSON.stringify(exception.getResponse());
    } catch {
      detail = exception.message;
    }
    this.logger.error(`brain.decide rejected pre-handler (validation): ${detail}`);

    const body = (request.body ?? {}) as {
      intent?: unknown;
      source?: unknown;
      context?: { clientRequestId?: unknown } | null;
    };
    const degradedIntent =
      typeof body.intent === 'string' && body.intent.trim() ? body.intent : 'user_message';
    const degradedSource =
      typeof body.source === 'string' && body.source.trim() ? body.source : 'chat';
    const clientRequestId = body.context?.clientRequestId;
    const degradedRequestId =
      typeof clientRequestId === 'string' && clientRequestId.trim()
        ? clientRequestId
        : `brain_degraded_${Date.now()}`;

    response.status(200).json({
      actions: [],
      confidence: 0,
      intent: degradedIntent,
      requestId: degradedRequestId,
      source: degradedSource,
      response:
        'O Kloel teve uma instabilidade momentânea e não conseguiu concluir esta ação. Sua mensagem foi preservada — tente novamente em instantes.',
    });
  }
}
