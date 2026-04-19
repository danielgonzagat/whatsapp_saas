import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthenticatedRequest } from '../common/interfaces';
import { AuthService } from './auth.service';
import { AppleOAuthDto } from './dto/apple-oauth.dto';
import { CheckEmailDto } from './dto/check-email.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConsumeMagicLinkDto } from './dto/consume-magic-link.dto';
import { FacebookOAuthDto } from './dto/facebook-oauth.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GoogleOAuthDto } from './dto/google-oauth.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { RevokeSessionDto } from './dto/revoke-session.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { SendWhatsAppCodeDto, VerifyWhatsAppCodeDto } from './dto/whatsapp-auth.dto';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('check-email')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async checkEmail(@Body() body: CheckEmailDto) {
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
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: RegisterDto,
  ) {
    try {
      const result = await this.auth.register({
        ...body,
        ip: req.ip,
        userAgent: req.get('user-agent') || '',
      });
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
    } catch (err: unknown) {
      if ((err as { status?: number } | null)?.status === 409) {
        throw new HttpException({ error: 'Email já em uso' }, 409);
      }
      throw err;
    }
  }

  @Public()
  @Post('login')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: LoginDto,
  ) {
    const result = await this.auth.login({
      ...body,
      ip: req.ip,
      userAgent: req.get('user-agent') || '',
    });
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
  async refresh(@Req() req: Request, @Body() body: RefreshDto) {
    const token = body.refreshToken || body.refresh_token;
    if (!token) {
      throw new HttpException('refreshToken is required', 400);
    }
    return this.auth.refresh(token, {
      ipAddress: req.ip,
      userAgent: req.get('user-agent') || '',
    });
  }

  /**
   * Endpoint legado. Não aceita mais payload OAuth "cru" vindo do frontend.
   * Mantido apenas para retornar erro claro e evitar regressão silenciosa.
   */
  @Public()
  @Post('oauth')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async oauthLogin(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.auth.oauthLogin({
      ...body,
      ip: req.ip,
      userAgent: req.get('user-agent') || '',
    });
  }

  /**
   * Google Sign-In seguro: recebe o ID token emitido pelo Google Identity Services,
   * valida no backend e só então cria/loga o usuário.
   */
  @Public()
  @Post('oauth/google')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async googleOAuthLogin(@Req() req: Request, @Body() body: GoogleOAuthDto) {
    return this.auth.loginWithGoogleCredential({
      credential: body.credential,
      ip: req.ip,
      userAgent: req.get('user-agent') || '',
    });
  }

  /**
   * Apple Sign-In: recebe o identityToken emitido pelo Sign in with Apple,
   * valida e cria/loga o usuario.
   */
  @Public()
  @Post('oauth/apple')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async appleOAuthLogin(@Req() req: Request, @Body() body: AppleOAuthDto) {
    return this.auth.loginWithAppleCredential({
      identityToken: body.identityToken,
      user: body.user,
      ip: req.ip,
      userAgent: req.get('user-agent') || '',
    });
  }

  /**
   * Facebook Login seguro: recebe o user access token emitido pelo SDK JS,
   * valida via Graph API e só então cria/loga o usuário.
   */
  @Public()
  @Post('oauth/facebook')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async facebookOAuthLogin(@Req() req: Request, @Body() body: FacebookOAuthDto) {
    return this.auth.loginWithFacebookAccessToken({
      accessToken: body.accessToken,
      ip: req.ip,
      userAgent: req.get('user-agent') || '',
    });
  }

  /**
   * Envia código de verificação via WhatsApp
   */
  @Public()
  @Post('whatsapp/send-code')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async sendWhatsAppCode(@Req() req: Request, @Body() body: SendWhatsAppCodeDto) {
    return this.auth.sendWhatsAppCode(body.phone, req.ip);
  }

  /**
   * Verifica código WhatsApp e retorna tokens
   */
  @Public()
  @Post('whatsapp/verify')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async verifyWhatsAppCode(@Req() req: Request, @Body() body: VerifyWhatsAppCodeDto) {
    return this.auth.verifyWhatsAppCode(body.phone, body.code, req.ip, req.get('user-agent') || '');
  }

  // ANONYMOUS ACCOUNT
  // =========================================

  @Public()
  @Post('anonymous')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async createAnonymous(@Req() req: Request) {
    return this.auth.createAnonymous(req.ip, req.get('user-agent') || '');
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
  async forgotPassword(@Req() req: Request, @Body() body: ForgotPasswordDto) {
    return this.auth.forgotPassword(body.email, req.ip);
  }

  /**
   * Solicita magic link de login
   */
  @Public()
  @Post('magic-link/request')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async requestMagicLink(@Req() req: Request, @Body() body: CheckEmailDto) {
    return this.auth.requestMagicLink(body.email, req.ip);
  }

  /**
   * Consome magic link de login
   */
  @Public()
  @Post('magic-link/consume')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async consumeMagicLink(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: ConsumeMagicLinkDto,
  ) {
    const result = await this.auth.consumeMagicLink(
      body.token,
      req.ip,
      body.linkToken,
      req.get('user-agent') || '',
    );
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

  /**
   * Redefine a senha usando token
   */
  @Public()
  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async resetPassword(@Req() req: Request, @Body() body: ResetPasswordDto) {
    return this.auth.resetPassword(body.token, body.newPassword, req.ip);
  }

  @Post('change-password')
  async changePassword(@Req() req: AuthenticatedRequest, @Body() body: ChangePasswordDto) {
    const agentId = req.user?.sub;
    if (!agentId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }
    return this.auth.changePassword(agentId, body.currentPassword, body.newPassword);
  }

  @Get('sessions')
  async listSessions(@Req() req: AuthenticatedRequest) {
    const agentId = req.user?.sub;
    if (!agentId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }

    return this.auth.listSessions(agentId, req.user?.sessionId);
  }

  @Post('sessions/revoke-current')
  async revokeCurrentSession(@Req() req: AuthenticatedRequest) {
    const agentId = req.user?.sub;
    if (!agentId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }

    return this.auth.revokeCurrentSession(agentId, req.user?.sessionId);
  }

  @Post('sessions/revoke-others')
  async revokeOtherSessions(@Req() req: AuthenticatedRequest) {
    const agentId = req.user?.sub;
    if (!agentId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }

    return this.auth.revokeOtherSessions(agentId, req.user?.sessionId);
  }

  @Post('sessions/revoke')
  async revokeSession(@Req() req: AuthenticatedRequest, @Body() body: RevokeSessionDto) {
    const agentId = req.user?.sub;
    if (!agentId) {
      throw new UnauthorizedException('Usuário não autenticado');
    }

    return this.auth.revokeSession(agentId, body.sessionId);
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
  async verifyEmail(@Req() req: Request, @Body() body: VerifyEmailDto) {
    return this.auth.verifyEmail(body.token, req.ip);
  }

  /**
   * Reenvia email de verificação
   */
  @Public()
  @Post('resend-verification')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async resendVerificationEmail(@Req() req: Request, @Body() body: CheckEmailDto) {
    return this.auth.resendVerificationEmail(body.email, req.ip);
  }

  /**
   * Envia verificação de email para usuário logado
   * (Requer autenticação)
   */
  @Post('send-verification')
  async sendVerificationEmail(@Req() req: AuthenticatedRequest) {
    const agentId = req.user?.sub;
    if (!agentId) {
      throw new Error('Usuário não autenticado');
    }
    return this.auth.sendVerificationEmail(agentId);
  }
}
