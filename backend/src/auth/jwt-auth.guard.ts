import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * JWT Guard global.
 * - Permite rotas marcadas com @Public()
 * - Se AUTH_OPTIONAL !== "true", exige Authorization: Bearer <token>
 * - Em modo opcional (default), se não houver token, permite mas registra req.user = null
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] as string | undefined;
    const optional = process.env.AUTH_OPTIONAL === 'true';

    if (!authHeader) {
      if (optional) {
        request.user = null;
        return true;
      }
      throw new UnauthorizedException('Missing Authorization header');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      if (optional) {
        request.user = null;
        return true;
      }
      throw new UnauthorizedException('Invalid Authorization header');
    }

    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'dev-secret',
      });
      request.user = payload;
      return true;
    } catch {
      if (optional) {
        request.user = null;
        return true;
      }
      throw new UnauthorizedException('Invalid token');
    }
  }
}
