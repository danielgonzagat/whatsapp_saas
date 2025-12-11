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

  /**
   * Endpoint completo de status para a página de billing
   * Combina subscription + usage em uma única chamada
   */
  @Get('status')
  async getStatus(
    @Req() req: any,
    @Query('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    
    const [subscription, usage] = await Promise.all([
      this.billingService.getSubscription(effectiveWorkspaceId),
      this.billingService.getUsage(effectiveWorkspaceId),
    ]);
    
    // Limites por plano
    const planLimits: Record<string, number> = {
      FREE: 100,
      STARTER: 1000,
      PRO: 10000,
      ENTERPRISE: 100000,
    };
    
    const limit = planLimits[subscription.plan?.toUpperCase()] || 100;
    const percentage = Math.round((usage.messages / limit) * 100);
    
    return {
      plan: subscription.plan?.toLowerCase() || 'starter',
      status: subscription.status || 'active',
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: false, // TODO: Get from Stripe
      trialDaysLeft: subscription.trialDaysLeft,
      usage: {
        messages: usage.messages,
        limit,
        percentage,
        flows: usage.flows,
        contacts: usage.contacts,
      },
    };
  }

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
