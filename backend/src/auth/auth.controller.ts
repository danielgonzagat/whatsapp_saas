import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('check-email')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async checkEmail(@Body() body: { email: string }) {
    return this.auth.checkEmail(body.email);
  }

  @Public()
  @Get('check-email')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async checkEmailQuery(@Query('email') email?: string) {
    if (!email) return { exists: false };
    return this.auth.checkEmail(email);
  }

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Body()
    body: {
      name: string;
      email: string;
      password: string;
      workspaceName?: string;
    },
  ) {
    try {
      const result = await this.auth.register({ ...body, ip: req.ip });
      // Set httpOnly cookie for enhanced security (dual mode: cookie + body)
      if (result?.access_token) {
        res.cookie('kloel_token', result.access_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 24 * 60 * 60 * 1000, // 24h
          path: '/',
        });
      }
      return result;
    } catch (err: any) {
      if (err?.status === 409) {
        throw new HttpException({ error: 'Email já em uso' }, 409);
      }
      throw err;
    }
  }

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { email: string; password: string },
  ) {
    const result = await this.auth.login({ ...body, ip: req.ip });
    if (result?.access_token) {
      res.cookie('kloel_token', result.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
      });
    }
    return result;
  }

  @Public()
  @Post('refresh')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async refresh(
    @Body() body: { refreshToken?: string; refresh_token?: string },
  ) {
    const token = body.refreshToken || body.refresh_token;
    if (!token) {
      throw new HttpException('refreshToken is required', 400);
    }
    return this.auth.refresh(token);
  }

  /**
   * Endpoint legado. Não aceita mais payload OAuth "cru" vindo do frontend.
   * Mantido apenas para retornar erro claro e evitar regressão silenciosa.
   */
  @Public()
  @Post('oauth')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async oauthLogin(@Req() req: any, @Body() body: Record<string, any>) {
    return this.auth.oauthLogin({ ...body, ip: req.ip });
  }

  /**
   * Google Sign-In seguro: recebe o ID token emitido pelo Google Identity Services,
   * valida no backend e só então cria/loga o usuário.
   */
  @Public()
  @Post('oauth/google')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async googleOAuthLogin(
    @Req() req: any,
    @Body() body: { credential: string },
  ) {
    return this.auth.loginWithGoogleCredential({
      credential: body?.credential,
      ip: req.ip,
    });
  }

  /**
   * Apple Sign-In: recebe o identityToken emitido pelo Sign in with Apple,
   * valida e cria/loga o usuario.
   */
  @Public()
  @Post('oauth/apple')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async appleOAuthLogin(
    @Req() req: any,
    @Body()
    body: {
      identityToken: string;
      user?: {
        name?: { firstName?: string; lastName?: string };
        email?: string;
      };
    },
  ) {
    return this.auth.loginWithAppleCredential({
      identityToken: body?.identityToken,
      user: body?.user,
      ip: req.ip,
    });
  }

  /**
   * Envia código de verificação via WhatsApp
   */
  @Public()
  @Post('whatsapp/send-code')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async sendWhatsAppCode(@Req() req: any, @Body() body: { phone: string }) {
    return this.auth.sendWhatsAppCode(body.phone, req.ip);
  }

  /**
   * Verifica código WhatsApp e retorna tokens
   */
  @Public()
  @Post('whatsapp/verify')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async verifyWhatsAppCode(
    @Req() req: any,
    @Body() body: { phone: string; code: string },
  ) {
    return this.auth.verifyWhatsAppCode(body.phone, body.code, req.ip);
  }

  // ANONYMOUS ACCOUNT
  // =========================================

  @Public()
  @Post('anonymous')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async createAnonymous(@Req() req: any) {
    return this.auth.createAnonymous(req.ip);
  }

  // =========================================
  // =========================================
  // PASSWORD RECOVERY
  // =========================================

  /**
   * Solicita recuperação de senha
   */
  @Public()
  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async forgotPassword(@Req() req: any, @Body() body: { email: string }) {
    return this.auth.forgotPassword(body.email, req.ip);
  }

  /**
   * Redefine a senha usando token
   */
  @Public()
  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async resetPassword(
    @Req() req: any,
    @Body() body: { token: string; newPassword: string },
  ) {
    return this.auth.resetPassword(body.token, body.newPassword, req.ip);
  }

  // =========================================
  // EMAIL VERIFICATION
  // =========================================

  /**
   * Verifica email com token
   */
  @Public()
  @Post('verify-email')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async verifyEmail(@Req() req: any, @Body() body: { token: string }) {
    return this.auth.verifyEmail(body.token, req.ip);
  }

  /**
   * Reenvia email de verificação
   */
  @Public()
  @Post('resend-verification')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async resendVerificationEmail(
    @Req() req: any,
    @Body() body: { email: string },
  ) {
    return this.auth.resendVerificationEmail(body.email, req.ip);
  }

  /**
   * Envia verificação de email para usuário logado
   * (Requer autenticação)
   */
  @Post('send-verification')
  async sendVerificationEmail(@Req() req: any) {
    const agentId = req.user?.sub;
    if (!agentId) {
      throw new Error('Usuário não autenticado');
    }
    return this.auth.sendVerificationEmail(agentId);
  }
}
