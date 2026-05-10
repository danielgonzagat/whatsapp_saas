import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { FinancialAlertService } from '../common/financial-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeRuntime } from './stripe-runtime';
import type { StripeClient } from './stripe-types';
import { BillingCheckoutWebhookService } from './billing-checkout-webhook.service';
import { BillingSubscriptionService } from './billing-subscription.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe: StripeClient;
  private subsService: BillingSubscriptionService;
  private checkoutWebhook: BillingCheckoutWebhookService;

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
    this.subsService = new BillingSubscriptionService(
      this.prisma,
      this.configService,
      this.moduleRef,
      this.stripe,
      this.financialAlert,
    );
    this.checkoutWebhook = new BillingCheckoutWebhookService(
      this.prisma,
      this.configService,
      this.moduleRef,
      this.stripe,
      this.subsService,
      this.financialAlert,
    );
  }

  async getSubscription(workspaceId: string) {
    return this.subsService.getSubscription(workspaceId);
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
}
