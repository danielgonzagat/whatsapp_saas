import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WebhookEndpoint } from '../common/decorators/webhook-endpoint.decorator';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { GoogleAdsMarketingService } from './google-ads-marketing.service';

@Controller('marketing/connect/google-ads')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class GoogleAdsMarketingController {
  constructor(private readonly googleAds: GoogleAdsMarketingService) {}

  @Get('status')
  status(@Request() req: { user: { workspaceId: string } }) {
    return this.googleAds.getStatus(req.user.workspaceId);
  }

  @Get('url')
  url(@Request() req: { user: { workspaceId: string } }) {
    return this.googleAds.generateAuthUrl(req.user.workspaceId);
  }

  @WebhookEndpoint('Google Ads OAuth callback')
  @Post('complete')
  complete(
    @Request() req: { user: { workspaceId: string } },
    @Body() body: { code?: string; state?: string; redirectUri?: string },
  ) {
    return this.googleAds.completeOAuth(req.user.workspaceId, body);
  }

  @Get('customers')
  customers(@Request() req: { user: { workspaceId: string } }) {
    return this.googleAds.listAccessibleCustomers(req.user.workspaceId);
  }

  @Get('campaigns')
  campaigns(
    @Request() req: { user: { workspaceId: string } },
    @Query('customerId') customerId?: string,
  ) {
    return this.googleAds.listCampaigns(req.user.workspaceId, customerId || '');
  }
}
