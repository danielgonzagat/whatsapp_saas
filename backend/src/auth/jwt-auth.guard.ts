import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { verify } from 'jsonwebtoken';
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
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly reflector: Reflector) {}

  /** Can activate. */
  canActivate(context: ExecutionContext): boolean {
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

  private verifyToken(request: JwtRequestLike, token: string, optional: boolean): boolean {
    try {
      request.user = verify(token, getJwtSecret());
      return true;
    } catch (error: unknown) {
      this.logger.warn(`JWT verification failed: ${describeJwtVerifyError(error)}`);
      if (optional) {
        request.user = null;
        return true;
      }
      throw new UnauthorizedException('Invalid token');
    }
  }
}
