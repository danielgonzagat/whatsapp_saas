import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { MercadoPagoService } from './mercado-pago.service';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

function buildMercadoPagoFailureRedirect(reason: string) {
  const raw = process.env.FRONTEND_URL?.trim();

  if (raw) {
    try {
      const url = new URL(raw);
      if (url.hostname === 'kloel.com' || url.hostname === 'www.kloel.com') {
        url.hostname = 'app.kloel.com';
      }
      url.pathname = '/carteira';
      url.searchParams.set('mercadoPago', 'error');
      url.searchParams.set('reason', reason);
      return url.toString();
    } catch {
      // ignore invalid FRONTEND_URL and fall through to default
    }
  }

  return `https://app.kloel.com/carteira?mercadoPago=error&reason=${encodeURIComponent(reason)}`;
}

@Controller('kloel/wallet')
export class MercadoPagoWalletController {
  private readonly logger = new Logger(MercadoPagoWalletController.name);

  constructor(private readonly mercadoPagoService: MercadoPagoService) {}

  @Get(':workspaceId/mercado-pago/status')
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async getStatus(@Param('workspaceId') workspaceId: string) {
    return this.mercadoPagoService.getWorkspaceConnectionStatus(workspaceId);
  }

  @Post(':workspaceId/mercado-pago/connect')
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  connect(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { returnUrl?: string } | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.mercadoPagoService.getAuthorizationUrl(workspaceId, req, body?.returnUrl);
  }

  @Delete(':workspaceId/mercado-pago/disconnect')
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async disconnect(@Param('workspaceId') workspaceId: string) {
    return this.mercadoPagoService.disconnectWorkspace(workspaceId);
  }

  @Public()
  @Get('mercado-pago/callback')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    try {
      const result = await this.mercadoPagoService.handleOAuthCallback(
        code || '',
        state || '',
        req,
      );
      return res.redirect(result.redirectUrl);
    } catch (error) {
      this.logger.error(`Mercado Pago OAuth callback failed: ${(error as Error).message}`);
      return res.redirect(buildMercadoPagoFailureRedirect('oauth_failed'));
    }
  }
}
