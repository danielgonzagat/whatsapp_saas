import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest, RawBodyRequest } from '../common/interfaces';
import { BillingService } from './billing.service';
import { BillingCheckoutDto } from './dto/billing-checkout.dto';

/** Billing controller. */
@Controller('billing')
@UseGuards(JwtAuthGuard, WorkspaceGuard, ThrottlerGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * Endpoint completo de status para a página de billing
   * Combina subscription + usage em uma única chamada
   */
  @Get('status')
  async getStatus(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId: string) {
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
    const safeLimit = Math.max(1, limit);
    const percentage = Math.round((usage.messages / safeLimit) * 100);

    return {
      plan: subscription.plan?.toLowerCase() || 'starter',
      status: subscription.status || 'active',
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd || false,
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
    @Req() req: AuthenticatedRequest,
    @Query('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.billingService.getSubscription(effectiveWorkspaceId);
  }

  @Get('usage')
  async getUsage(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.billingService.getUsage(effectiveWorkspaceId);
  }

  @Post('activate-trial')
  @Roles('ADMIN', 'OWNER')
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  async activateTrial(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.billingService.activateTrial(effectiveWorkspaceId);
  }

  @Post('cancel')
  @Roles('ADMIN', 'OWNER')
  async cancelSubscription(
    @Req() req: AuthenticatedRequest,
    @Query('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.billingService.cancelSubscription(effectiveWorkspaceId);
  }

  @Post('checkout')
  @Roles('ADMIN')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 checkouts por minuto máximo
  async createCheckout(@Req() req: AuthenticatedRequest, @Body() body: BillingCheckoutDto) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    // Get user email from token (assumed populated by JwtStrategy)
    const userEmail = req.user?.email || 'customer@example.com';

    return this.billingService.createCheckoutSession(workspaceId, body.plan, userEmail);
  }

  @Public()
  @Post('webhook')
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  async handleWebhook(@Headers('stripe-signature') signature: string, @Req() req: RawBodyRequest) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }
    if (!req.rawBody) {
      throw new BadRequestException('Missing rawBody for Stripe webhook verification');
    }
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) {
      throw new BadRequestException('Stripe webhook secret not configured');
    }

    // req.rawBody is populated by the raw-body middleware in main.ts/app.module.ts
    return this.billingService.handleWebhook(signature, req.rawBody);
  }
}
