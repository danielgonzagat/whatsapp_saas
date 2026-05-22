import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { IdempotencyService } from './idempotency.service';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const DEFAULT_TTL = 24 * 3600;

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  private readonly logger = new Logger(IdempotencyMiddleware.name);

  constructor(private readonly idempotency: IdempotencyService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const key = req.header('Idempotency-Key');
    if (!key) {
      next();
      return;
    }

    if (!MUTATING_METHODS.has(req.method)) {
      next();
      return;
    }

    const cached = await this.idempotency.get(key, req.method, req.path);
    if (cached) {
      res.status(cached.status).json(cached.body);
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      this.idempotency
        .set(key, req.method, req.path, res.statusCode, body, DEFAULT_TTL)
        .catch((err: unknown) => {
          this.logger.warn(
            `Idempotency cache write in middleware failed: ${err instanceof Error ? err.message : 'unknown_error'}`,
          );
        });
      return originalJson(body);
    };

    next();
  }
}
