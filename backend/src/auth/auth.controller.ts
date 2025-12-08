import { Body, Controller, Post, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from './public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('check-email')
  async checkEmail(@Body() body: { email: string }) {
    return this.auth.checkEmail(body.email);
  }

  @Public()
  @Post('register')
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
    return this.auth.register({ ...body, ip: req.ip });
  }

  @Public()
  @Post('login')
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
   * OAuth Login - para Google/Apple via NextAuth
   */
  @Public()
  @Post('oauth')
  async oauthLogin(
    @Req() req: any,
    @Body()
    body: {
      provider: 'google' | 'apple';
      providerId: string;
      email: string;
      name: string;
      image?: string;
    },
  ) {
    return this.auth.oauthLogin({ ...body, ip: req.ip });
  }

  /**
   * Envia código de verificação via WhatsApp
   */
  @Public()
  @Post('whatsapp/send-code')
  async sendWhatsAppCode(
    @Req() req: any,
    @Body() body: { phone: string },
  ) {
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

  // =========================================
  // PASSWORD RECOVERY
  // =========================================

  /**
   * Solicita recuperação de senha
   */
  @Public()
  @Post('forgot-password')
  async forgotPassword(
    @Req() req: any,
    @Body() body: { email: string },
  ) {
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
  async verifyEmail(@Body() body: { token: string }) {
    return this.auth.verifyEmail(body.token);
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
