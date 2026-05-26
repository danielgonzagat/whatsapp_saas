import { randomUUID } from 'node:crypto';
import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { correlationStore } from './correlation-store';

type RequestWithId = Request & { id?: string };

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const request = req as RequestWithId;
    const incoming =
      (request.headers['x-correlation-id'] as string | undefined) ||
      (request.headers['x-request-id'] as string | undefined);

    const correlationId = incoming || randomUUID();

    if (!request.id) {
      request.id = correlationId;
    }

    request.headers['x-correlation-id'] = correlationId;
    request.headers['x-request-id'] = correlationId;

    if (!res.headersSent) {
      res.setHeader('x-correlation-id', correlationId);
      res.setHeader('x-request-id', correlationId);
    }

    correlationStore.run({ correlationId, requestId: correlationId }, () => {
      next();
    });
  }
}
