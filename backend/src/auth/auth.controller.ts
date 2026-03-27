import {
  Body,
  Controller,
  Get,
  HttpException,
  Post,
  Query,
  Req,
} from '@nestjs/common';
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
  async checkEmailQuery(@Query('email') email?: string) {
    if (!email) return { exists: false };
    return this.auth.checkEmail(email);
  }

  @Public()
  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(
    @Req() req: any,
    @Body()
    body: {
      name: string;
      email: string;
      password: string;
      workspaceName?: string;
    },
  ) {
    try {
      return await this.auth.register({ ...body, ip: req.ip });
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
    @Body() body: { email: string; password: string },
  ) {
    return this.auth.login({ ...body, ip: req.ip });
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() body: { refreshToken: string }) {
    return this.auth.refresh(body.refreshToken);
  }

  /**
   * Endpoint legado. Não aceita mais payload OAuth "cru" vindo do frontend.
   * Mantido apenas para retornar erro claro e evitar regressão silenciosa.
   */
  @Public()
  @Post('oauth')
  async oauthLogin(
    @Req() req: any,
    @Body() body: Record<string, any>,
  ) {
    return this.auth.oauthLogin({ ...body, ip: req.ip });
  }

  /**
   * Google Sign-In seguro: recebe o ID token emitido pelo Google Identity Services,
   * valida no backend e só então cria/loga o usuário.
   */
  @Public()
  @Post('oauth/google')
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
   * Envia código de verificação via WhatsApp
   */
  @Public()
  @Post('whatsapp/send-code')
  async sendWhatsAppCode(@Req() req: any, @Body() body: { phone: string }) {
    return this.auth.sendWhatsAppCode(body.phone, req.ip);
  }

  /**
   * Verifica código WhatsApp e retorna tokens
   */
  @Public()
  @Post('whatsapp/verify')
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
  async verifyEmail(@Req() req: any, @Body() body: { token: string }) {
    return this.auth.verifyEmail(body.token, req.ip);
  }

  /**
   * Reenvia email de verificação
   */
  @Public()
  @Post('resend-verification')
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
