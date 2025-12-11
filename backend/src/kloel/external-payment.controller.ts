import { Controller, Post, Get, Delete, Body, Param, Query, HttpCode, HttpStatus, Logger, Headers, UseGuards, Req } from '@nestjs/common';
import { ExternalPaymentService, ExternalPaymentLink, PaymentPlatformConfig } from './external-payment.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { Public } from '../auth/public.decorator';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('External Payment Links')
@Controller('kloel/external-payments')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@ApiBearerAuth()
export class ExternalPaymentController {
  private readonly logger = new Logger(ExternalPaymentController.name);

  constructor(private readonly externalPaymentService: ExternalPaymentService) {}

  /**
   * Add a new external payment link
   * POST /kloel/external-payments/:workspaceId/link
   */
  @Post(':workspaceId/link')
  async addLink(
    @Param('workspaceId') workspaceId: string,
    @Body() body: {
      platform: ExternalPaymentLink['platform'];
      productName: string;
      price: number;
      paymentUrl: string;
      checkoutUrl?: string;
      affiliateUrl?: string;
    }
  ) {
    const link = await this.externalPaymentService.addPaymentLink(workspaceId, body);
    return {
      success: true,
      link,
      message: `Payment link added for ${body.platform}`,
    };
  }

  /**
   * Get all payment links
   * GET /kloel/external-payments/:workspaceId/links
   */
  @Get(':workspaceId/links')
  async getLinks(@Param('workspaceId') workspaceId: string) {
    const links = await this.externalPaymentService.getPaymentLinks(workspaceId);
    const summary = await this.externalPaymentService.getPaymentSummary(workspaceId);
    return {
      links,
      summary,
    };
  }

  /**
   * Search payment links by product name
   * GET /kloel/external-payments/:workspaceId/search
   */
  @Get(':workspaceId/search')
  async searchLinks(
    @Param('workspaceId') workspaceId: string,
    @Query('q') query: string
  ) {
    const links = await this.externalPaymentService.findByProductName(workspaceId, query);
    return {
      query,
      results: links,
      count: links.length,
    };
  }

  /**
   * Toggle link status
   * POST /kloel/external-payments/:workspaceId/link/:linkId/toggle
   */
  @Post(':workspaceId/link/:linkId/toggle')
  async toggleLink(
    @Param('workspaceId') workspaceId: string,
    @Param('linkId') linkId: string
  ) {
    const link = await this.externalPaymentService.toggleLink(workspaceId, linkId);
    if (!link) {
      return { success: false, message: 'Link not found' };
    }
    return {
      success: true,
      link,
      message: `Link is now ${link.isActive ? 'active' : 'inactive'}`,
    };
  }

  /**
   * Delete a payment link
   * DELETE /kloel/external-payments/:workspaceId/link/:linkId
   */
  @Delete(':workspaceId/link/:linkId')
  async deleteLink(
    @Param('workspaceId') workspaceId: string,
    @Param('linkId') linkId: string
  ) {
    const deleted = await this.externalPaymentService.deleteLink(workspaceId, linkId);
    return {
      success: deleted,
      message: deleted ? 'Link deleted' : 'Link not found',
    };
  }

  /**
   * Configure platform integration
   * POST /kloel/external-payments/:workspaceId/platform
   */
  @Post(':workspaceId/platform')
  async configurePlatform(
    @Param('workspaceId') workspaceId: string,
    @Body() config: PaymentPlatformConfig
  ) {
    await this.externalPaymentService.configurePlatform(workspaceId, config);
    return {
      success: true,
      message: `${config.platform} configured successfully`,
    };
  }

  /**
   * Get platform configurations
   * GET /kloel/external-payments/:workspaceId/platforms
   */
  @Get(':workspaceId/platforms')
  async getPlatforms(@Param('workspaceId') workspaceId: string) {
    const configs = await this.externalPaymentService.getPlatformConfigs(workspaceId);
    return { platforms: configs };
  }

  /**
   * Generate tracking URL
   * POST /kloel/external-payments/:workspaceId/tracking
   */
  @Post(':workspaceId/tracking')
  async generateTracking(
    @Param('workspaceId') workspaceId: string,
    @Body() body: {
      baseUrl: string;
      source?: string;
      medium?: string;
      campaign?: string;
      content?: string;
      leadId?: string;
    }
  ) {
    const trackingUrl = this.externalPaymentService.generateTrackingLink(body.baseUrl, {
      source: body.source || 'kloel',
      medium: body.medium || 'whatsapp',
      campaign: body.campaign,
      content: body.content,
      leadId: body.leadId,
    });
    return {
      originalUrl: body.baseUrl,
      trackingUrl,
    };
  }

  // ============================================
  // WEBHOOKS - Public endpoints (external platforms)
  // ============================================

  /**
   * Hotmart Webhook
   * POST /kloel/external-payments/webhook/hotmart/:workspaceId
   */
  @Public()
  @Post('webhook/hotmart/:workspaceId')
  @HttpCode(HttpStatus.OK)
  async hotmartWebhook(
    @Param('workspaceId') workspaceId: string,
    @Body() body: any,
    @Headers('x-hotmart-hottok') hottok?: string
  ) {
    this.logger.log(`Hotmart webhook for ${workspaceId}: ${body.event || body.status}`);
    
    const event = body.event || body.status;
    await this.externalPaymentService.handlePlatformWebhook(workspaceId, 'hotmart', event, body);
    
    return { received: true };
  }

  /**
   * Kiwify Webhook
   * POST /kloel/external-payments/webhook/kiwify/:workspaceId
   */
  @Public()
  @Post('webhook/kiwify/:workspaceId')
  @HttpCode(HttpStatus.OK)
  async kiwifyWebhook(
    @Param('workspaceId') workspaceId: string,
    @Body() body: any,
    @Headers('signature') signature?: string
  ) {
    this.logger.log(`Kiwify webhook for ${workspaceId}: ${body.order_status}`);
    
    const event = body.order_status;
    await this.externalPaymentService.handlePlatformWebhook(workspaceId, 'kiwify', event, body);
    
    return { received: true };
  }

  /**
   * Eduzz Webhook
   * POST /kloel/external-payments/webhook/eduzz/:workspaceId
   */
  @Public()
  @Post('webhook/eduzz/:workspaceId')
  @HttpCode(HttpStatus.OK)
  async eduzzWebhook(
    @Param('workspaceId') workspaceId: string,
    @Body() body: any
  ) {
    this.logger.log(`Eduzz webhook for ${workspaceId}: ${body.trans_status}`);
    
    const event = body.trans_status;
    await this.externalPaymentService.handlePlatformWebhook(workspaceId, 'eduzz', event, body);
    
    return { received: true };
  }

  /**
   * Monetizze Webhook
   * POST /kloel/external-payments/webhook/monetizze/:workspaceId
   */
  @Public()
  @Post('webhook/monetizze/:workspaceId')
  @HttpCode(HttpStatus.OK)
  async monetizzeWebhook(
    @Param('workspaceId') workspaceId: string,
    @Body() body: any
  ) {
    this.logger.log(`Monetizze webhook for ${workspaceId}`);
    
    const event = body.venda?.status || 'unknown';
    await this.externalPaymentService.handlePlatformWebhook(workspaceId, 'monetizze', event, body);
    
    return { received: true };
  }

  /**
   * Braip Webhook
   * POST /kloel/external-payments/webhook/braip/:workspaceId
   */
  @Public()
  @Post('webhook/braip/:workspaceId')
  @HttpCode(HttpStatus.OK)
  async braipWebhook(
    @Param('workspaceId') workspaceId: string,
    @Body() body: any
  ) {
    this.logger.log(`Braip webhook for ${workspaceId}`);
    
    const event = body.status || body.event;
    await this.externalPaymentService.handlePlatformWebhook(workspaceId, 'braip', event, body);
    
    return { received: true };
  }

  /**
   * Generic Webhook (for custom platforms)
   * POST /kloel/external-payments/webhook/:platform/:workspaceId
   */
  @Post('webhook/:platform/:workspaceId')
  @HttpCode(HttpStatus.OK)
  async genericWebhook(
    @Param('workspaceId') workspaceId: string,
    @Param('platform') platform: string,
    @Body() body: any
  ) {
    this.logger.log(`Generic webhook from ${platform} for ${workspaceId}`);
    
    const event = body.event || body.status || 'unknown';
    await this.externalPaymentService.handlePlatformWebhook(workspaceId, platform, event, body);
    
    return { received: true };
  }
}
