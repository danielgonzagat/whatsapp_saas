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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { Roles } from '../auth/roles.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { Idempotent } from '../common/idempotency.guard';
import { AuthenticatedRequest, RawBodyRequest } from '../common/interfaces';
import { BillingService } from './billing.service';
import { BillingCheckoutDto } from './dto/billing-checkout.dto';
import { InternalEndpoint } from '../common/decorators/internal-endpoint.decorator';
import { RouteClass } from '../common/throttler/route-class.decorator';

type PricingPlanFeatureDto = {
  readonly text: string;
  readonly included: boolean;
};

type PricingPlanDto = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly price: number;
  readonly iconKey: 'zap' | 'crown' | 'rocket';
  readonly features: readonly PricingPlanFeatureDto[];
  readonly popular?: boolean;
  readonly cta: string;
};

type PricingBenefitDto = {
  readonly iconKey: 'messageCircle' | 'bot' | 'users' | 'barChart3' | 'headphones' | 'sparkles';
  readonly title: string;
  readonly description: string;
};

const PLATFORM_PRICING_PLANS: readonly PricingPlanDto[] = [
  {
    id: 'starter',
    name: 'Starter',
    description: 'Para quem está começando a vender pelo WhatsApp',
    price: 97,
    iconKey: 'zap',
    cta: 'Começar agora',
    features: [
      { text: '1.000 mensagens/mês', included: true },
      { text: '1 número WhatsApp', included: true },
      { text: 'IA de vendas básica', included: true },
      { text: 'Autopilot (100 respostas/mês)', included: true },
      { text: '3 fluxos de automação', included: true },
      { text: 'Suporte por email', included: true },
      { text: 'Campanhas ilimitadas', included: false },
      { text: 'API de integração', included: false },
      { text: 'Suporte prioritário', included: false },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Para negócios em crescimento que querem escalar',
    price: 297,
    iconKey: 'crown',
    popular: true,
    cta: 'Escolher Pro',
    features: [
      { text: '10.000 mensagens/mês', included: true },
      { text: '3 números WhatsApp', included: true },
      { text: 'IA de vendas avançada', included: true },
      { text: 'Autopilot ilimitado', included: true },
      { text: 'Fluxos ilimitados', included: true },
      { text: 'Suporte por chat', included: true },
      { text: 'Campanhas ilimitadas', included: true },
      { text: 'API de integração', included: true },
      { text: 'Suporte prioritário', included: false },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Para empresas que precisam de escala e suporte dedicado',
    price: 997,
    iconKey: 'rocket',
    cta: 'Falar com vendas',
    features: [
      { text: 'Mensagens ilimitadas', included: true },
      { text: 'Números ilimitados', included: true },
      { text: 'IA personalizada', included: true },
      { text: 'Autopilot ilimitado', included: true },
      { text: 'Fluxos ilimitados', included: true },
      { text: 'Suporte 24/7', included: true },
      { text: 'Campanhas ilimitadas', included: true },
      { text: 'API de integração', included: true },
      { text: 'Suporte prioritário', included: true },
    ],
  },
];

const PLATFORM_PRICING_BENEFITS: readonly PricingBenefitDto[] = [
  {
    iconKey: 'messageCircle',
    title: 'WhatsApp Oficial',
    description: 'Conexão direta com API oficial',
  },
  { iconKey: 'bot', title: 'IA que Vende', description: 'Autopilot responde e fecha vendas' },
  { iconKey: 'users', title: 'CRM Integrado', description: 'Gerencie leads automaticamente' },
  { iconKey: 'barChart3', title: 'Analytics', description: 'Métricas em tempo real' },
  { iconKey: 'headphones', title: 'Suporte Humano', description: 'Time pronto para ajudar' },
  { iconKey: 'sparkles', title: 'Updates Gratuitos', description: 'Novas features todo mês' },
];

@Controller('pricing')
@RouteClass('read')
export class PricingController {
  /** Public list of platform subscription plans used by the in-app pricing surface. */
  @Public()
  @Get('plans')
  getPlans() {
    return {
      plans: PLATFORM_PRICING_PLANS,
      benefits: PLATFORM_PRICING_BENEFITS,
    };
  }
}

/** Billing controller. */
@Controller('billing')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
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

  /** Get subscription. */
  @InternalEndpoint('billing subscription status')
  @Get('subscription')
  async getSubscription(
    @Req() req: AuthenticatedRequest,
    @Query('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.billingService.getSubscription(effectiveWorkspaceId);
  }

  /** Get usage. */
  @Get('usage')
  async getUsage(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.billingService.getUsage(effectiveWorkspaceId);
  }

  /** Activate trial. */
  @Post('activate-trial')
  @Roles('ADMIN', 'OWNER')
  @Idempotent()
  async activateTrial(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.billingService.activateTrial(effectiveWorkspaceId);
  }

  /** Cancel subscription. */
  @Post('cancel')
  @Roles('ADMIN', 'OWNER')
  @Idempotent()
  async cancelSubscription(
    @Req() req: AuthenticatedRequest,
    @Query('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.billingService.cancelSubscription(effectiveWorkspaceId);
  }

  /** Create checkout. */
  @Post('checkout')
  @Roles('ADMIN')
  @Idempotent()
  async createCheckout(@Req() req: AuthenticatedRequest, @Body() body: BillingCheckoutDto) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    // Get user email from token (assumed populated by JwtStrategy)
    const userEmail = req.user?.email || 'customer@example.com';

    return this.billingService.createCheckoutSession(workspaceId, body.plan, userEmail);
  }

  /** Handle webhook. */
  @Public()
  @Post('webhook')
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
