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
}
