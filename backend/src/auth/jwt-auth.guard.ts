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
import { IS_PUBLIC_KEY } from './public.decorator';

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

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization as string | undefined;
    const optional = process.env.NODE_ENV !== 'production' && process.env.AUTH_OPTIONAL === 'true';

    // Extract token from Authorization header OR httpOnly cookie
    let token: string | undefined;

    if (authHeader) {
      const [scheme, headerToken] = authHeader.split(' ');
      if (scheme === 'Bearer' && headerToken) {
        token = headerToken;
      }
    }

    // Fallback to shared auth cookies used across app/auth subdomains.
    if (!token && request.cookies?.kloel_access_token) {
      token = request.cookies.kloel_access_token;
    }

    if (!token && request.cookies?.kloel_token) {
      token = request.cookies.kloel_token;
    }

    if (!token) {
      if (optional) {
        request.user = null;
        return true;
      }
      throw new UnauthorizedException('Missing Authorization header');
    }

    try {
      const payload = verify(token, getJwtSecret());
      request.user = payload;
      return true;
    } catch (error: unknown) {
      const details =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'unknown verification error';
      this.logger.warn(`JWT verification failed: ${details}`);
      if (optional) {
        request.user = null;
        return true;
      }
      throw new UnauthorizedException('Invalid token');
    }
  }
}
