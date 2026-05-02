import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Reflector } from '@nestjs/core';
import type { Redis } from 'ioredis';
import { verify } from 'jsonwebtoken'; // PULSE_OK: reasonable expiry (30m)
import { getJwtSecret } from './jwt-config';
import {
  describeJwtVerifyError,
  extractJwtToken,
  isAuthOptionalInNonProd,
  type JwtRequestLike,
} from './jwt-auth.helpers';
import { IS_PUBLIC_METADATA } from './public.decorator';

/**
 * JWT Guard global.
 * - Permite rotas marcadas com @Public()
 * - Exige Authorization: Bearer <token>
 * - AUTH_OPTIONAL só é tolerado fora de produção para desenvolvimento local
 * - Checks Redis JTI blacklist for revoked access tokens
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    @Optional() @InjectRedis() private readonly redis?: Redis,
  ) {}

  /** Can activate. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.isPublicRoute(context)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<JwtRequestLike>();
    const optional = isAuthOptionalInNonProd();
    const token = extractJwtToken(request);

    if (!token) {
      return this.handleMissingToken(request, optional);
    }
    return this.verifyToken(request, token, optional);
  }

  private isPublicRoute(context: ExecutionContext): boolean {
    return !!this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
  }

  private handleMissingToken(request: JwtRequestLike, optional: boolean): boolean {
    if (optional) {
      request.user = null;
      return true;
    }
    throw new UnauthorizedException('Missing Authorization header');
  }

  private async verifyToken(
    request: JwtRequestLike,
    token: string,
    optional: boolean,
  ): Promise<boolean> {
    let decoded: Record<string, unknown>;
    try {
      decoded = verify(token, getJwtSecret()) as Record<string, unknown>;
    } catch (error: unknown) {
      this.logger.warn(`JWT verification failed: ${describeJwtVerifyError(error)}`);
      if (optional) {
        request.user = null;
        return true;
      }
      throw new UnauthorizedException('Invalid token');
    }

    if (this.redis && typeof decoded.jti === 'string') {
      try {
        const revoked = await this.redis.exists(`jti:revoked:${decoded.jti}`);
        if (revoked === 1) {
          this.logger.warn(`Revoked access token rejected: jti=${decoded.jti.slice(0, 8)}`);
          throw new UnauthorizedException('Token has been revoked');
        }
      } catch {
        this.logger.warn(
          'Redis unavailable during JTI check, proceeding with signature-only validation',
        );
      }
    }

    request.user = decoded;
    return true;
  }
}
