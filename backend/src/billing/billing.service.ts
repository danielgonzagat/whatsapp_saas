import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { StructuredLogger } from '../logging/structured-logger';
import { FinancialAlertService } from '../common/financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeRuntime } from './stripe-runtime';
import type { StripeClient } from './stripe-types';
import { BillingCheckoutHelperService } from './billing-checkout-helper.service';
import { BillingCheckoutWebhookService } from './billing-checkout-webhook.service';
import { BillingSubscriptionService } from './billing-subscription.service';

@Injectable()
/**
 * @cluster whatsapp_saas/backend/billing
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class BillingService {
  private readonly logger = StructuredLogger.from(BillingService.name);
  private stripe!: StripeClient;
  private subsService: BillingSubscriptionService;
  private checkoutWebhook: BillingCheckoutWebhookService;
  private helper: BillingCheckoutHelperService;

  /** Plan identifiers the agent/resolver is allowed to set. */
  private static readonly VALID_PLANS = ['starter', 'pro', 'enterprise', 'free'] as const;
  /** Milliseconds in one day — used to seed a local FREE-tier period end. */
  private static readonly MS_PER_DAY = 24 * 60 * 60 * 1000;
  /** Default local billing period (days) for FREE-tier subscriptions. */
  private static readonly FREE_TIER_BILLING_PERIOD_DAYS = 30;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private readonly moduleRef: ModuleRef,
    @Optional()
    private readonly financialAlert?: FinancialAlertService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (secretKey) {
      this.stripe = new StripeRuntime(secretKey);
    } else {
      if (!process.env.JEST_WORKER_ID && process.env.NODE_ENV !== 'test') {
        this.logger.warn(
          'STRIPE_SECRET_KEY not found. Billing will run in MOCK mode if BILLING_MOCK_MODE=true.',
        );
      }
    }
    this.helper = new BillingCheckoutHelperService(
      this.prisma,
      this.configService,
      this.moduleRef,
      this.stripe,
      this.financialAlert,
    );
    this.subsService = new BillingSubscriptionService(
      this.prisma,
      this.configService,
      this.moduleRef,
      this.stripe,
      this.helper,
    );
    this.checkoutWebhook = new BillingCheckoutWebhookService(
      this.prisma,
      this.configService,
      this.moduleRef,
      this.stripe,
      this.helper,
      this.financialAlert,
    );
  }

  async getSubscription(workspaceId: string) {
    return this.subsService.getSubscription(workspaceId);
  }

  /**
   * Canonical-name alias of {@link getSubscription} for the Kloel
   * capability resolver (`BillingService.status`). Accepts the
   * (workspaceId, args) signature used by `KloelDomainServiceResolver`;
   * args are ignored. Read-only — no Stripe writes.
   */
  async status(workspaceId: string) {
    return this.getSubscription(workspaceId);
  }

  async activateTrial(workspaceId: string) {
    return this.subsService.activateTrial(workspaceId);
  }

  async getUsage(workspaceId: string) {
    return this.subsService.getUsage(workspaceId);
  }

  async createCheckoutSession(workspaceId: string, plan: string, userEmail: string) {
    return this.checkoutWebhook.createCheckoutSession(workspaceId, plan, userEmail);
  }

  async handleWebhook(signature: string, rawBody: Buffer) {
    return this.checkoutWebhook.handleWebhook(signature, rawBody);
  }

  async cancelSubscription(workspaceId: string) {
    return this.subsService.cancelSubscription(workspaceId);
  }

  /**
   * Changes the workspace's platform subscription PLAN. This is a record
   * mutation plus a routing decision — it NEVER moves money on its own:
   *
   * - When a Stripe-managed subscription already exists, the caller is
   *   directed to the Stripe billing portal (`requiresAction`) so Stripe can
   *   prorate/charge under its own flow. No direct charge is issued here.
   * - When upgrading from FREE to a paid tier, the caller is directed to
   *   checkout (`requiresCheckout`). No subscription row is paid-activated
   *   without a confirmed checkout.
   * - Only local/free-tier plan transitions update the {@link Subscription}
   *   record directly via an idempotent upsert.
   *
   * Workspace-isolated (every query is scoped by `workspaceId`). Accepts the
   * `(workspaceId, args)` signature used by `KloelDomainServiceResolver`; the
   * target plan is read from `args.plan` (registry) or `args.newPlan` (legacy
   * tool alias).
   */
  async changePlan(
    workspaceId: string,
    args: { plan?: string; newPlan?: string },
  ): Promise<{
    success: boolean;
    error?: string;
    message?: string;
    [key: string]: unknown;
  }> {
    const requested = (args.plan ?? args.newPlan ?? '').trim();
    if (!requested) {
      return {
        success: false,
        error: 'Parâmetro obrigatório: plan (starter, pro, enterprise).',
      };
    }
    if (!BillingService.VALID_PLANS.includes(requested.toLowerCase() as never)) {
      return {
        success: false,
        error: `Plano inválido. Opções: ${BillingService.VALID_PLANS.join(', ')}.`,
      };
    }
    const targetPlan = requested.toUpperCase();
    const existing = await this.prisma.subscription.findUnique({
      where: { workspaceId },
      select: { plan: true, stripeId: true },
    });
    const currentPlan = existing?.plan || 'FREE';

    // A Stripe-managed subscription must be changed through Stripe's own
    // proration/charge flow — never mutate the plan locally underneath it.
    if (existing?.stripeId) {
      return {
        success: true,
        requiresAction: true,
        currentPlan,
        targetPlan,
        message: `Para alterar de ${currentPlan} para ${targetPlan}, acesse /billing e use o portal de pagamento.`,
      };
    }

    // Upgrading from FREE to a paid tier requires a real checkout — no money
    // is moved here and no paid plan is activated without confirmation.
    if (targetPlan !== 'FREE' && currentPlan === 'FREE') {
      return {
        success: true,
        requiresCheckout: true,
        currentPlan,
        targetPlan,
        message: `Para assinar o plano ${targetPlan}, acesse /pricing e complete o checkout.`,
      };
    }

    // Local/free-tier transition: idempotent record upsert. Replaying the same
    // plan converges to the same row (no duplicate side effects).
    await this.prisma.subscription.upsert({
      where: { workspaceId },
      update: { plan: targetPlan },
      create: {
        workspaceId,
        plan: targetPlan,
        status: 'ACTIVE',
        currentPeriodEnd: new Date(
          Date.now() + BillingService.FREE_TIER_BILLING_PERIOD_DAYS * BillingService.MS_PER_DAY,
        ),
      },
    });
    return {
      success: true,
      previousPlan: currentPlan,
      newPlan: targetPlan,
      message: `Plano alterado de ${currentPlan} para ${targetPlan}.`,
    };
  }

  /**
   * Returns a Stripe billing-portal URL so the customer can self-service their
   * payment information (cards, billing address). This is a CONFIG operation —
   * it issues no charge; Stripe owns any subsequent payment-method mutation.
   *
   * If the workspace has no Stripe customer attached yet, returns an honest
   * "not configured" error instead of faking success. Workspace-isolated.
   * Accepts the `(workspaceId, args)` resolver signature; `args.returnUrl`
   * overrides the post-portal redirect.
   */
  async update(
    workspaceId: string,
    args: { returnUrl?: string },
  ): Promise<{
    success: boolean;
    error?: string;
    message?: string;
    url?: string;
    [key: string]: unknown;
  }> {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { stripeCustomerId: true },
    });
    if (!workspace) {
      return { success: false, error: 'Workspace não encontrado.' };
    }
    if (!workspace.stripeCustomerId) {
      return {
        success: false,
        error: 'Nenhum método de pagamento configurado ainda. Acesse /billing para configurar.',
      };
    }
    if (!this.stripe) {
      return {
        success: false,
        error: 'Cobrança não configurada (STRIPE_SECRET_KEY ausente).',
      };
    }
    const returnUrl =
      args.returnUrl ||
      `${this.configService.get<string>('FRONTEND_URL') || process.env.FRONTEND_URL || 'http://localhost:3000'}/billing`;
    const session = await this.stripe.billingPortal.sessions.create({
      customer: workspace.stripeCustomerId,
      return_url: returnUrl,
    });
    return {
      success: true,
      url: session.url,
      message: 'Acesse o link para atualizar seus dados de pagamento.',
    };
  }
}
