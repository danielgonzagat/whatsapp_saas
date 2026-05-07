import type { Logger } from '@nestjs/common';

import type { AdminAuditService } from '../admin/audit/admin-audit.service';
import type { AutopilotService } from '../autopilot/autopilot.service';
import type { FinancialAlertService } from '../common/financial-alert.service';
import type { MarketplaceTreasuryPayoutService } from '../marketplace-treasury/marketplace-treasury-payout.service';
import type { ConnectPayoutService } from '../payments/connect/connect-payout.service';
import type { ConnectReversalService } from '../payments/connect/connect-reversal.service';
import type { StripeWebhookProcessor } from '../payments/stripe/stripe-webhook.processor';
import type { PrismaService } from '../prisma/prisma.service';
import type { WhatsappService } from '../whatsapp/whatsapp.service';

import type { StripeWebhookLedgerService } from './stripe-webhook-ledger.service';
import type { WebhooksService } from './webhooks.service';

/**
 * Shared deps injected from the controller into Stripe webhook handler
 * functions. Lives in its own file so handler split modules can import the
 * type without creating a circular import chain back to the main handlers
 * module.
 */
export interface StripeHandlerDeps {
  logger: Logger;
  prisma: PrismaService;
  autopilot: AutopilotService;
  whatsapp: WhatsappService;
  webhooksService: WebhooksService;
  stripeWebhookProcessor: StripeWebhookProcessor;
  connectReversalService: ConnectReversalService;
  connectPayoutService: ConnectPayoutService;
  marketplaceTreasuryPayoutService: MarketplaceTreasuryPayoutService;
  adminAudit: AdminAuditService;
  financialAlert: FinancialAlertService;
  ledger: StripeWebhookLedgerService;
}
