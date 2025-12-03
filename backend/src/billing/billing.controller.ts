import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import { BillingService } from './billing.service';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('subscription')
  async getSubscription(
    @Req() req: any,
    @Query('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.billingService.getSubscription(effectiveWorkspaceId);
  }

  @Get('usage')
  async getUsage(@Req() req: any, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.billingService.getUsage(effectiveWorkspaceId);
  }

  @Post('checkout')
  @Roles('ADMIN')
  async createCheckout(
    @Req() req: any,
    @Body() body: { workspaceId: string; plan: string },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    // Get user email from token (assumed populated by JwtStrategy)
    const userEmail = req.user?.email || 'customer@example.com';

    return this.billingService.createCheckoutSession(
      workspaceId,
      body.plan,
      userEmail,
    );
  }

  @Public()
  @Post('webhook')
  async handleWebhook(
    @Headers('stripe-signature') signature: string,
    @Req() req: any,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }
    if (!req.rawBody) {
      throw new BadRequestException(
        'Missing rawBody for Stripe webhook verification',
      );
    }
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new BadRequestException('Stripe webhook secret not configured');
    }

    // req.rawBody is populated by the raw-body middleware in main.ts/app.module.ts
    return this.billingService.handleWebhook(signature, req.rawBody);
  }
}
