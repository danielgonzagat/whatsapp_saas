import { Body, Controller, Get, HttpException, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import { AuthenticatedRequest } from '../common/interfaces';
import { AuthService } from './auth.service';
import { getJwtCookieMaxAgeMs } from './jwt-config';
import { AppleOAuthDto } from './dto/apple-oauth.dto';
import { CheckEmailDto } from './dto/check-email.dto';
import { FacebookOAuthDto } from './dto/facebook-oauth.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { GoogleOAuthDto } from './dto/google-oauth.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { RequestMagicLinkDto } from './dto/request-magic-link.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { TikTokOAuthDto } from './dto/tiktok-oauth.dto';
import { VerifyMagicLinkDto } from './dto/verify-magic-link.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { SendWhatsAppCodeDto, VerifyWhatsAppCodeDto } from './dto/whatsapp-auth.dto';
import { Public } from './public.decorator';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { InternalEndpoint } from '../common/decorators/internal-endpoint.decorator';

/** Auth controller. */
@ApiTags('Auth')
@Controller('auth')
@RouteClass('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Check email. */
  @ApiOperation({ summary: 'Check if an email is available for registration' })
  @ApiResponse({ status: 200, description: 'Email availability status' })
  @ApiBody({ type: CheckEmailDto })
  @Public()
  @Post('check-email')
  async checkEmail(@Body() body: CheckEmailDto) {
    return this.auth.checkEmail(body.email);
  }

  /** Check email query. */
  @ApiOperation({ summary: 'Check if an email is available (GET variant)' })
  @ApiResponse({ status: 200, description: 'Email availability status' })
  @Public()
  @Get('check-email')
  async checkEmailQuery(@Query('email') email?: string) {
    if (!email) {
      return { exists: false };
    }
    return this.auth.checkEmail(email);
  }

  /** Register. */
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, description: 'Account created' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @ApiBody({ type: RegisterDto })
  @Public()
  @Post('register')
  async register(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: RegisterDto,
  ) {
    try {
      const result = await this.auth.register({
        ...body,
        ...(req.ip !== undefined ? { ip: req.ip } : {}),
      });
      // Set httpOnly cookie for enhanced security (dual mode: cookie + body)
      if (result?.access_token) {
        res.cookie('kloel_token', result.access_token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: getJwtCookieMaxAgeMs(),
          path: '/',
        });
      }
      return result;
    } catch (err: unknown) {
      Sentry.captureException(err, {
        tags: { type: 'auth_alert', operation: 'register' },
        extra: {
          email: (body.email ?? '').substring(0, 3) + '***',
          hasReferral: Boolean((body as never as Record<string, unknown>).referralCode),
        },
        level: 'error',
      });
      if ((err as { status?: number } | null)?.status === 409) {
        throw new HttpException({ error: 'Email já em uso' }, 409);
      }
      throw err;
    }
  }

  /** Login. */
  @ApiOperation({ summary: 'Authenticate a user and return an access token' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiBody({ type: LoginDto })
  @Public()
  @Post('login')
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: LoginDto,
  ) {
    const result = await this.auth.login({
      ...body,
      ...(req.ip !== undefined ? { ip: req.ip } : {}),
    });
    if (result?.access_token) {
      Sentry.addBreadcrumb({
        message: `login: user authenticated`,
        category: 'auth',
        level: 'info',
      });
      res.cookie('kloel_token', result.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: getJwtCookieMaxAgeMs(),
        path: '/',
      });
    }
    return result;
  }

  /** Refresh. */
  @ApiOperation({ summary: 'Refresh an expired access token' })
  @ApiResponse({ status: 200, description: 'New token pair' })
  @ApiResponse({ status: 400, description: 'Refresh token required' })
  @ApiBody({ type: RefreshDto })
  @Public()
  @Post('refresh')
  async refresh(@Body() body: RefreshDto) {
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
  @ApiOperation({ summary: 'Legacy OAuth login — deprecated, returns an error' })
  @ApiResponse({ status: 400, description: 'Deprecated endpoint' })
  @Public()
  @Post('oauth')
  async oauthLogin(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.auth.oauthLogin({
      ...body,
      ...(req.ip !== undefined ? { ip: req.ip } : {}),
    });
  }

  /**
   * Google Sign-In seguro: recebe o ID token emitido pelo Google Identity Services,
   * valida no backend e só então cria/loga o usuário.
   */
  @ApiOperation({ summary: 'Authenticate via Google OAuth ID token' })
  @ApiResponse({ status: 200, description: 'Google authentication successful' })
  @ApiResponse({ status: 401, description: 'Invalid Google credential' })
  @ApiBody({ type: GoogleOAuthDto })
  @Public()
  @Post('oauth/google')
  async googleOAuthLogin(@Req() req: Request, @Body() body: GoogleOAuthDto) {
    return this.auth.loginWithGoogleCredential({
      credential: body.credential,
      ...(req.ip !== undefined ? { ip: req.ip } : {}),
    });
  }

  /** Facebook o auth login. */
  @ApiOperation({ summary: 'Authenticate via Facebook OAuth access token' })
  @ApiResponse({ status: 200, description: 'Facebook authentication successful' })
  @ApiResponse({ status: 401, description: 'Invalid Facebook token' })
  @ApiBody({ type: FacebookOAuthDto })
  @Public()
  @Post('oauth/facebook')
  async facebookOAuthLogin(@Req() req: Request, @Body() body: FacebookOAuthDto) {
    return this.auth.loginWithFacebookAccessToken({
      accessToken: body.accessToken,
      ...(body.userId !== undefined ? { userId: body.userId } : {}),
      ...(req.ip !== undefined ? { ip: req.ip } : {}),
    });
  }

  /**
   * Apple Sign-In: recebe o identityToken emitido pelo Sign in with Apple,
   * valida e cria/loga o usuario.
   */
  @ApiOperation({ summary: 'Authenticate via Apple Sign-In identity token' })
  @ApiResponse({ status: 200, description: 'Apple authentication successful' })
  @ApiResponse({ status: 400, description: 'Identity token required' })
  @ApiBody({ type: AppleOAuthDto })
  @Public()
  @Post('oauth/apple')
  async appleOAuthLogin(@Req() req: Request, @Body() body: AppleOAuthDto) {
    if (!body.identityToken) {
      throw new HttpException('identityToken is required', 400);
    }
    return this.auth.loginWithAppleCredential({
      identityToken: body.identityToken,
      ...(body.authorizationCode !== undefined
        ? { authorizationCode: body.authorizationCode }
        : {}),
      ...(body.redirectUri !== undefined ? { redirectUri: body.redirectUri } : {}),
      ...(body.user !== undefined ? { user: body.user } : {}),
      ...(req.ip !== undefined ? { ip: req.ip } : {}),
    });
  }

  /** TikTok o auth login. */
  @ApiOperation({ summary: 'Authenticate via TikTok OAuth' })
  @ApiResponse({ status: 200, description: 'TikTok authentication successful' })
  @ApiResponse({ status: 401, description: 'Invalid TikTok credential' })
  @ApiBody({ type: TikTokOAuthDto })
  @Public()
  @Post('oauth/tiktok')
  async tikTokOAuthLogin(@Req() req: Request, @Body() body: TikTokOAuthDto) {
    if (body.accessToken) {
      return this.auth.loginWithTikTokAccessToken({
        accessToken: body.accessToken,
        ...(body.openId !== undefined ? { openId: body.openId } : {}),
        ...(body.refreshToken !== undefined ? { refreshToken: body.refreshToken } : {}),
        ...(body.expiresInSeconds !== undefined ? { expiresInSeconds: body.expiresInSeconds } : {}),
        ...(req.ip !== undefined ? { ip: req.ip } : {}),
      });
    }

    return this.auth.loginWithTikTokAuthorizationCode({
      code: body.code || '',
      ...(body.redirectUri !== undefined ? { redirectUri: body.redirectUri } : {}),
      ...(req.ip !== undefined ? { ip: req.ip } : {}),
    });
  }

  /** Request magic link. */
  @ApiOperation({ summary: 'Request a magic link for passwordless login' })
  @ApiResponse({ status: 200, description: 'Magic link sent' })
  @ApiBody({ type: RequestMagicLinkDto })
  @Public()
  @Post('magic-link/request')
  requestMagicLink(@Req() req: Request, @Body() body: RequestMagicLinkDto) {
    return this.auth.requestMagicLink({
      email: body.email,
      ...(body.redirectTo !== undefined ? { redirectTo: body.redirectTo } : {}),
      ...(req.ip !== undefined ? { ip: req.ip } : {}),
    });
  }

  /** Verify magic link. */
  @ApiOperation({ summary: 'Verify a magic link token and authenticate' })
  @ApiResponse({ status: 200, description: 'Magic link verified' })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  @ApiBody({ type: VerifyMagicLinkDto })
  @Public()
  @Post('magic-link/verify')
  verifyMagicLink(@Req() req: Request, @Body() body: VerifyMagicLinkDto) {
    return this.auth.verifyMagicLink(body.token, req.ip);
  }

  /**
   * Envia código de verificação via WhatsApp
   */
  @ApiOperation({ summary: 'Send a verification code via WhatsApp' })
  @ApiResponse({ status: 200, description: 'Code sent' })
  @ApiBody({ type: SendWhatsAppCodeDto })
  @Public()
  @Post('whatsapp/send-code')
  async sendWhatsAppCode(@Req() req: Request, @Body() body: SendWhatsAppCodeDto) {
    return this.auth.sendWhatsAppCode(body.phone, req.ip);
  }

  /**
   * Verifica código WhatsApp e retorna tokens
   */
  @ApiOperation({ summary: 'Verify a WhatsApp authentication code and return tokens' })
  @ApiResponse({ status: 200, description: 'WhatsApp code verified' })
  @ApiResponse({ status: 401, description: 'Invalid code' })
  @ApiBody({ type: VerifyWhatsAppCodeDto })
  @Public()
  @Post('whatsapp/verify')
  async verifyWhatsAppCode(@Req() req: Request, @Body() body: VerifyWhatsAppCodeDto) {
    return this.auth.verifyWhatsAppCode(body.phone, body.code, req.ip);
  }

  // ANONYMOUS ACCOUNT
  // =========================================

  @ApiOperation({ summary: 'Create an anonymous user session' })
  @ApiResponse({ status: 201, description: 'Anonymous session created' })
  @Public()
  @Post('anonymous')
  async createAnonymous(@Req() req: Request) {
    return this.auth.createAnonymous(req.ip);
  }

  // =========================================
  // =========================================
  // PASSWORD RECOVERY
  // =========================================

  /**
   * Solicita recuperação de senha
   */
  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiResponse({ status: 200, description: 'Password reset email sent' })
  @ApiBody({ type: ForgotPasswordDto })
  @Public()
  @Post('forgot-password')
  async forgotPassword(@Req() req: Request, @Body() body: ForgotPasswordDto) {
    return this.auth.forgotPassword(body.email, req.ip);
  }

  /**
   * Redefine a senha usando token
   */
  @ApiOperation({ summary: 'Reset password using a reset token' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @ApiBody({ type: ResetPasswordDto })
  @Public()
  @Post('reset-password')
  async resetPassword(@Req() req: Request, @Body() body: ResetPasswordDto) {
    return this.auth.resetPassword(body.token, body.newPassword, req.ip);
  }

  // =========================================
  // EMAIL VERIFICATION
  // =========================================

  /**
   * Verifica email com token
   */
  @ApiOperation({ summary: 'Verify an email address with a token' })
  @ApiResponse({ status: 200, description: 'Email verified' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  @ApiBody({ type: VerifyEmailDto })
  @Public()
  @Post('verify-email')
  async verifyEmail(@Req() req: Request, @Body() body: VerifyEmailDto) {
    return this.auth.verifyEmail(body.token, req.ip);
  }

  /**
   * Reenvia email de verificação
   */
  @ApiOperation({ summary: 'Resend the email verification link' })
  @ApiResponse({ status: 200, description: 'Verification email resent' })
  @ApiBody({ type: CheckEmailDto })
  @Public()
  @Post('resend-verification')
  async resendVerificationEmail(@Req() req: Request, @Body() body: CheckEmailDto) {
    return this.auth.resendVerificationEmail(body.email, req.ip);
  }

  /**
   * Envia verificação de email para usuário logado
   * (Requer autenticação)
   */
  @ApiOperation({ summary: 'Send verification email to authenticated user' })
  @ApiResponse({ status: 200, description: 'Verification email sent' })
  @InternalEndpoint('auth verification email trigger')
  @Post('send-verification')
  async sendVerificationEmail(@Req() req: AuthenticatedRequest) {
    const agentId = req.user?.sub;
    if (!agentId) {
      throw new Error('Usuário não autenticado');
    }
    return this.auth.sendVerificationEmail(agentId);
  }

  /** Logout — revoke all refresh tokens for the authenticated agent. */
  @ApiOperation({ summary: 'Logout and revoke all refresh tokens' })
  @ApiResponse({ status: 200, description: 'Logged out' })
  @Post('logout')
  async logout(@Req() req: AuthenticatedRequest) {
    const agentId = req.user?.sub;
    if (!agentId) {
      throw new Error('Usuário não autenticado');
    }
    return this.auth.logout(agentId, req.user?.jti, req.user?.exp);
  }

  /** Get authenticated user profile including onboarding status. */
  @ApiOperation({ summary: 'Get authenticated user profile and onboarding status' })
  @ApiResponse({ status: 200, description: 'User profile' })
  @Get('me')
  getMe(@Req() req: AuthenticatedRequest) {
    const agentId = req.user?.sub;
    if (!agentId) {
      throw new Error('Usuário não autenticado');
    }
    return this.auth.getMe(agentId);
  }

  /** Mark onboarding as completed for the authenticated user. */
  @ApiOperation({ summary: 'Mark onboarding as completed for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Onboarding marked complete' })
  @Put('me/onboarding-complete')
  async completeOnboarding(@Req() req: AuthenticatedRequest) {
    const agentId = req.user?.sub;
    if (!agentId) {
      throw new Error('Usuário não autenticado');
    }
    return this.auth.completeOnboarding(agentId);
  }
}
