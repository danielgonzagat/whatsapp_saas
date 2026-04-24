import crypto from 'node:crypto';
import { InjectRedis } from '@nestjs-modules/ioredis';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { type WebhookEvent } from '@prisma/client';
import type { Redis } from 'ioredis';
import { AdminAuditService } from '../admin/audit/admin-audit.service';
import { MarketplaceTreasuryPayoutService } from '../marketplace-treasury/marketplace-treasury-payout.service';
import { Public } from '../auth/public.decorator';
import { AutopilotService } from '../autopilot/autopilot.service';
import { StripeRuntime } from '../billing/stripe-runtime';
import type {
  StripeCheckoutSession,
  StripeEvent,
  StripePaymentIntent,
} from '../billing/stripe-types';
import { validatePaymentTransition } from '../common/payment-state-machine';
import { ConnectPayoutService } from '../payments/connect/connect-payout.service';
import { ConnectReversalService } from '../payments/connect/connect-reversal.service';
import { StripeWebhookProcessor } from '../payments/stripe/stripe-webhook.processor';
import { FinancialAlertService } from '../common/financial-alert.service';
import { validateNoInternalAccess } from '../common/utils/url-validator';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { WebhooksService } from './webhooks.service';
import { StripeWebhookLedgerService } from './stripe-webhook-ledger.service';
import {
  FINANCIAL_TRANSACTION_OPTIONS,
  D_RE,
  asRecord,
  asString,
  asStringArray,
  parseBigIntNumberish,
  mapStripeIntentStatusForCheckout,
  type WebhookRequest,
  type StripeEventLike,
  type StripePaymentIntentLike,
  type StripeCheckoutSessionLike,
} from './payment-webhook-types';

/**
 * Handles all Stripe-originated webhooks at POST /webhook/payment/stripe.
 * Ledger / audit side-effects are delegated to StripeWebhookLedgerService.
 * Separated from generic/third-party webhooks to keep each file under 600 lines.
 */
@Controller('webhook/payment')
@Throttle({ default: { limit: 100, ttl: 60000 } })
export class PaymentWebhookStripeController {
  private readonly logger = new Logger(PaymentWebhookStripeController.name);

  constructor(
    private readonly autopilot: AutopilotService,
    private readonly whatsapp: WhatsappService,
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
    private readonly webhooksService: WebhooksService,
    private readonly stripeWebhookProcessor: StripeWebhookProcessor,
    private readonly connectReversalService: ConnectReversalService,
    private readonly connectPayoutService: ConnectPayoutService,
    private readonly marketplaceTreasuryPayoutService: MarketplaceTreasuryPayoutService,
    private readonly adminAudit: AdminAuditService,
    private readonly financialAlert: FinancialAlertService,
    private readonly ledger: StripeWebhookLedgerService,
  ) {}

  /** Handle stripe. */
  @Public()
  @Post('stripe')
  async handleStripe(
    @Req() req: WebhookRequest,
    @Headers('stripe-signature') stripeSignature: string | undefined,
    @Headers('x-event-id') eventId: string | undefined,
    @Body() body: StripeEventLike,
  ) {
    const primarySecret = process.env.STRIPE_WEBHOOK_SECRET;
    const endpointSecrets = Array.from(
      new Set(
        [
          primarySecret,
          ...(process.env.STRIPE_WEBHOOK_SECRETS?.split(',').map((s) => s.trim()) ?? []),
        ].filter((s): s is string => Boolean(s && s.length > 0)),
      ),
    );
    if (process.env.NODE_ENV === 'production' && endpointSecrets.length === 0) {
      throw new ForbiddenException('STRIPE_WEBHOOK_SECRET not configured');
    }

    let event: StripeEventLike = body;
    if (endpointSecrets.length > 0) {
      if (!stripeSignature) {
        throw new BadRequestException('Missing stripe-signature header');
      }
      if (!req.rawBody) {
        throw new BadRequestException('Missing rawBody for Stripe webhook verification');
      }
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) {
        this.logger.warn('STRIPE_SECRET_KEY not configured — payment webhooks disabled');
        return { received: true, skipped: true, reason: 'Stripe not configured' };
      }
      const stripe = new StripeRuntime(stripeKey);
      let verified: StripeEvent | undefined;
      let lastSignatureError: unknown;
      for (const secret of endpointSecrets) {
        try {
          verified = stripe.webhooks.constructEvent(req.rawBody, stripeSignature, secret);
          break;
        } catch (err) {
          lastSignatureError = err;
        }
      }
      if (!verified) {
        const message =
          lastSignatureError instanceof Error
            ? lastSignatureError.message
            : 'Invalid stripe signature';
        throw new BadRequestException(message);
      }

      const verifiedRecord = asRecord(verified);
      const relatedObject = asRecord(verifiedRecord?.related_object);
      const isThinAccountUpdated =
        verifiedRecord?.object === 'v2.core.event' &&
        verified.type === 'account.updated' &&
        relatedObject?.type === 'account' &&
        typeof verified.id === 'string';

      if (isThinAccountUpdated) {
        const hydrated = await stripe.events.retrieve(verified.id, {}, undefined);
        event = {
          id: hydrated.id,
          type: hydrated.type,
          data: { object: asRecord(hydrated.data?.object) ?? undefined },
        };
      } else if (verified.type === 'checkout.session.completed') {
        const session: StripeCheckoutSession = verified.data.object;
        event = {
          id: verified.id,
          type: verified.type,
          data: {
            object: {
              id: session.id,
              payment_intent:
                typeof session.payment_intent === 'string'
                  ? session.payment_intent
                  : (session.payment_intent?.id ?? null),
              amount_total: session.amount_total ?? null,
              currency: session.currency ?? null,
              customer_email: session.customer_email ?? null,
              customer_details: session.customer_details
                ? {
                    email: session.customer_details.email ?? null,
                    phone: session.customer_details.phone ?? null,
                  }
                : null,
              metadata: session.metadata ?? null,
            },
          },
        };
      } else if (verified.type.startsWith('payment_intent.')) {
        const intent = verified.data.object as unknown as StripePaymentIntent;
        event = {
          id: verified.id,
          type: verified.type,
          data: {
            object: {
              id: intent.id,
              status: intent.status,
              currency: intent.currency ?? null,
              latest_charge: typeof intent.latest_charge === 'string' ? intent.latest_charge : null,
              transfer_group: intent.transfer_group ?? null,
              metadata: intent.metadata ?? null,
              next_action:
                intent.next_action?.type === 'pix_display_qr_code'
                  ? {
                      type: intent.next_action.type,
                      pix_display_qr_code: {
                        data: intent.next_action.pix_display_qr_code?.data ?? null,
                        image_url_png:
                          intent.next_action.pix_display_qr_code?.image_url_png ?? null,
                        expires_at: intent.next_action.pix_display_qr_code?.expires_at ?? null,
                      },
                    }
                  : null,
              last_payment_error: intent.last_payment_error
                ? { message: intent.last_payment_error.message ?? null }
                : null,
            },
          },
        };
      } else {
        event = {
          id: verified.id,
          type: verified.type,
          data: { object: asRecord(verified.data.object) ?? undefined },
        };
      }
    }

    const stripeDupe = await this.ensureIdempotent(eventId || event?.id || body?.id, req);
    if (stripeDupe) {
      return stripeDupe;
    }

    const stripeExternalId = event?.id || eventId || body?.id || `stripe_${Date.now()}`;
    let webhookEvent: WebhookEvent | undefined;
    try {
      webhookEvent = await this.webhooksService.logWebhookEvent(
        'stripe',
        event?.type || 'unknown',
        String(stripeExternalId),
        body,
      );
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      if ((err as { code?: string } | null)?.code === 'P2002') {
        this.logger.log(`Duplicate Stripe webhook event ${stripeExternalId}, returning 200`);
        return { received: true, skipped: true, reason: 'duplicate_webhook_event' };
      }
      this.logger.warn(`Failed to log Stripe webhook event: ${errMsg?.message}`);
    }

    if (event?.type === 'refund.created') {
      await this.handleRefundCreated(event, webhookEvent, stripeExternalId);
      return { received: true };
    }

    if (event?.type === 'charge.dispute.created') {
      await this.handleDisputeCreated(event, webhookEvent, stripeExternalId);
      return { received: true };
    }

    if (event?.type === 'payout.failed' || event?.type === 'payout.paid') {
      await this.handlePayoutEvent(event, webhookEvent, stripeExternalId);
      return { received: true };
    }

    if (event?.type === 'account.updated') {
      await this.handleAccountUpdated(event, webhookEvent);
      return { received: true };
    }

    if (
      event?.type === 'payment_intent.succeeded' ||
      event?.type === 'payment_intent.processing' ||
      event?.type === 'payment_intent.payment_failed' ||
      event?.type === 'payment_intent.canceled'
    ) {
      await this.handlePaymentIntentEvent(event, webhookEvent, stripeExternalId);
      return { received: true };
    }

    if (event?.type === 'checkout.session.completed') {
      await this.handleCheckoutSessionCompleted(event, webhookEvent);
    }

    if (webhookEvent?.id) {
      await this.webhooksService.markWebhookProcessed(webhookEvent.id).catch(() => {});
    }
    return { received: true };
  }

  // ─── Private event handlers ────────────────────────────────

  private async handleRefundCreated(
    event: StripeEventLike,
    webhookEvent: WebhookEvent | undefined,
    _stripeExternalId: string,
  ): Promise<void> {
    const refund = asRecord(event.data?.object);
    const refundId = asString(refund?.id);
    const paymentIntentId = asString(refund?.payment_intent);
    const requestedAmountCents = parseBigIntNumberish(refund?.amount);

    if (refundId && paymentIntentId && requestedAmountCents > 0n) {
      try {
        const reversal = await this.connectReversalService.processRefund({
          paymentIntentId,
          refundId,
          amountCents: requestedAmountCents,
        });
        const checkoutContext = await this.ledger.loadCheckoutPaymentContext(paymentIntentId);
        const workspaceId = checkoutContext?.order?.workspaceId ?? null;
        const orderId = checkoutContext?.orderId ?? null;

        await this.prisma.$transaction(
          [
            this.prisma.checkoutPayment.updateMany({
              where: { externalId: paymentIntentId },
              data: { status: 'REFUNDED' },
            }),
            ...(workspaceId && orderId
              ? [
                  this.prisma.checkoutOrder.updateMany({
                    where: { id: orderId, workspaceId },
                    data: { status: 'REFUNDED', refundedAt: new Date() },
                  }),
                  this.prisma.kloelSale.updateMany({
                    where: { workspaceId, externalPaymentId: paymentIntentId },
                    data: { status: 'refunded' },
                  }),
                ]
              : []),
          ],
          FINANCIAL_TRANSACTION_OPTIONS,
        );

        const marketplaceDebit = requestedAmountCents - reversal.reversedAmountCents;
        await this.ledger.appendMarketplaceTreasuryReversal({
          triggerKind: 'refund',
          triggerId: refundId,
          paymentIntentId,
          requestedAmountCents,
          stakeholderReversedAmountCents: reversal.reversedAmountCents,
          marketplaceDebitCents: marketplaceDebit,
        });
        await this.ledger.appendSaleReversalAudit({
          action: 'system.sale.refund_processed',
          paymentIntentId,
          orderId,
          workspaceId,
          triggerId: refundId,
          requestedAmountCents,
          stakeholderReversedAmountCents: reversal.reversedAmountCents,
          marketplaceDebitCents: marketplaceDebit,
        });
      } catch (error) {
        this.financialAlert.webhookProcessingFailed(error as Error, {
          provider: 'stripe',
          externalId: paymentIntentId,
          eventType: event.type,
        });
        throw error;
      }
    }

    if (webhookEvent?.id) {
      await this.webhooksService.markWebhookProcessed(webhookEvent.id).catch(() => {});
    }
  }

  private async handleDisputeCreated(
    event: StripeEventLike,
    webhookEvent: WebhookEvent | undefined,
    _stripeExternalId: string,
  ): Promise<void> {
    const dispute = asRecord(event.data?.object);
    const disputeId = asString(dispute?.id);
    const paymentIntentId = asString(dispute?.payment_intent);
    const requestedAmountCents = parseBigIntNumberish(dispute?.amount);

    if (disputeId && paymentIntentId && requestedAmountCents > 0n) {
      try {
        const reversal = await this.connectReversalService.processDispute({
          paymentIntentId,
          disputeId,
          amountCents: requestedAmountCents,
        });
        const checkoutContext = await this.ledger.loadCheckoutPaymentContext(paymentIntentId);
        const workspaceId = checkoutContext?.order?.workspaceId ?? null;
        const orderId = checkoutContext?.orderId ?? null;

        await this.prisma.$transaction(
          [
            this.prisma.checkoutPayment.updateMany({
              where: { externalId: paymentIntentId },
              data: { status: 'CHARGEBACK' },
            }),
            ...(workspaceId && orderId
              ? [
                  this.prisma.checkoutOrder.updateMany({
                    where: { id: orderId, workspaceId },
                    data: { status: 'CHARGEBACK' },
                  }),
                  this.prisma.kloelSale.updateMany({
                    where: { workspaceId, externalPaymentId: paymentIntentId },
                    data: { status: 'chargeback' },
                  }),
                ]
              : []),
          ],
          FINANCIAL_TRANSACTION_OPTIONS,
        );

        const marketplaceDebit = requestedAmountCents - reversal.reversedAmountCents;
        await this.ledger.appendMarketplaceTreasuryReversal({
          triggerKind: 'dispute',
          triggerId: disputeId,
          paymentIntentId,
          requestedAmountCents,
          stakeholderReversedAmountCents: reversal.reversedAmountCents,
          marketplaceDebitCents: marketplaceDebit,
        });
        await this.ledger.appendSaleReversalAudit({
          action: 'system.sale.chargeback_posted',
          paymentIntentId,
          orderId,
          workspaceId,
          triggerId: disputeId,
          requestedAmountCents,
          stakeholderReversedAmountCents: reversal.reversedAmountCents,
          marketplaceDebitCents: marketplaceDebit,
        });
      } catch (error) {
        this.financialAlert.webhookProcessingFailed(error as Error, {
          provider: 'stripe',
          externalId: paymentIntentId,
          eventType: event.type,
        });
        throw error;
      }
    }

    if (webhookEvent?.id) {
      await this.webhooksService.markWebhookProcessed(webhookEvent.id).catch(() => {});
    }
  }

  private async handlePayoutEvent(
    event: StripeEventLike,
    webhookEvent: WebhookEvent | undefined,
    stripeExternalId: string,
  ): Promise<void> {
    const payout = asRecord(event.data?.object);
    const payoutId = asString(payout?.id);
    const amountCents = parseBigIntNumberish(payout?.amount);
    const metadata = asRecord(payout?.metadata);
    const accountBalanceId = asString(metadata?.accountBalanceId);
    const requestId = asString(metadata?.requestId);
    const isMarketplaceTreasuryPayout = asString(metadata?.marketplaceTreasury) === 'true';
    const payoutCurrency =
      asString(metadata?.marketplaceTreasuryCurrency) ??
      (asString(payout?.currency)?.toUpperCase() || 'BRL');

    try {
      if (
        event.type === 'payout.failed' &&
        payoutId &&
        accountBalanceId &&
        requestId &&
        amountCents > 0n
      ) {
        await this.connectPayoutService.handleFailedPayout({
          payoutId,
          accountBalanceId,
          requestId,
          amountCents,
        });
        await this.ledger.appendConnectPayoutAudit({
          action: 'system.connect.payout_failed',
          accountBalanceId,
          payoutId,
          requestId,
          amountCents,
          status: 'failed',
        });
      } else if (
        event.type === 'payout.failed' &&
        payoutId &&
        requestId &&
        amountCents > 0n &&
        isMarketplaceTreasuryPayout
      ) {
        await this.marketplaceTreasuryPayoutService.handleFailedPayout({
          payoutId,
          requestId,
          amountCents,
          currency: payoutCurrency,
        });
        await this.ledger.appendMarketplaceTreasuryPayoutAudit({
          action: 'system.carteira.payout_failed',
          payoutId,
          requestId,
          amountCents,
          currency: payoutCurrency,
          status: 'failed',
        });
      } else if (
        event.type === 'payout.paid' &&
        payoutId &&
        accountBalanceId &&
        requestId &&
        amountCents > 0n
      ) {
        await this.ledger.appendConnectPayoutAudit({
          action: 'system.connect.payout_paid',
          accountBalanceId,
          payoutId,
          requestId,
          amountCents,
          status: 'paid',
        });
      } else if (
        event.type === 'payout.paid' &&
        payoutId &&
        requestId &&
        amountCents > 0n &&
        isMarketplaceTreasuryPayout
      ) {
        await this.ledger.appendMarketplaceTreasuryPayoutAudit({
          action: 'system.carteira.payout_paid',
          payoutId,
          requestId,
          amountCents,
          currency: payoutCurrency,
          status: 'paid',
        });
      }
    } catch (error) {
      this.financialAlert.webhookProcessingFailed(error as Error, {
        provider: 'stripe',
        externalId: payoutId || stripeExternalId,
        eventType: event.type,
      });
      throw error;
    }

    if (webhookEvent?.id) {
      await this.webhooksService.markWebhookProcessed(webhookEvent.id).catch(() => {});
    }
  }

  private async handleAccountUpdated(
    event: StripeEventLike,
    webhookEvent: WebhookEvent | undefined,
  ): Promise<void> {
    const account = asRecord(event.data?.object);
    const stripeAccountId = asString(account?.id);
    if (stripeAccountId) {
      const balance = await this.prisma.connectAccountBalance.findUnique({
        where: { stripeAccountId },
        select: { id: true, workspaceId: true, accountType: true, stripeAccountId: true },
      });

      if (balance) {
        const requirements = asRecord(account?.requirements);
        await this.adminAudit.append({
          action: 'system.connect.account_updated',
          entityType: 'connect_account_balance',
          entityId: balance.id,
          details: {
            accountBalanceId: balance.id,
            workspaceId: balance.workspaceId,
            accountType: balance.accountType,
            stripeAccountId: balance.stripeAccountId,
            chargesEnabled: Boolean(account?.charges_enabled),
            payoutsEnabled: Boolean(account?.payouts_enabled),
            detailsSubmitted: Boolean(account?.details_submitted),
            requirementsCurrentlyDue: asStringArray(requirements?.currently_due),
            requirementsPastDue: asStringArray(requirements?.past_due),
            requirementsDisabledReason: asString(requirements?.disabled_reason),
          },
        });
      } else {
        this.logger.warn(
          `Stripe account.updated received for unknown local balance stripeAccountId=${stripeAccountId}`,
        );
      }
    }

    if (webhookEvent?.id) {
      await this.webhooksService.markWebhookProcessed(webhookEvent.id).catch(() => {});
    }
  }

  private async handlePaymentIntentEvent(
    event: StripeEventLike,
    webhookEvent: WebhookEvent | undefined,
    stripeExternalId: string,
  ): Promise<void> {
    const rawIntent = event.data?.object;
    const intent: StripePaymentIntentLike =
      rawIntent && typeof rawIntent === 'object' ? rawIntent : {};
    const workspaceId = intent.metadata?.workspace_id || intent.metadata?.workspaceId;
    const orderId = intent.metadata?.kloel_order_id || intent.metadata?.orderId;

    if (workspaceId) {
      await this.assertWorkspaceExists(workspaceId);
    }

    const checkoutPaymentStatus = mapStripeIntentStatusForCheckout(
      event.type,
      intent.status || undefined,
    );
    const isApprovedSaleIntent =
      checkoutPaymentStatus === 'APPROVED' && intent.metadata?.type === 'sale';

    if (intent.id && !isApprovedSaleIntent) {
      await this.prisma.checkoutPayment
        .updateMany({
          where: { externalId: intent.id },
          data: {
            status: checkoutPaymentStatus,
            ...(intent.next_action?.type === 'pix_display_qr_code'
              ? {
                  pixQrCode: intent.next_action.pix_display_qr_code?.image_url_png || undefined,
                  pixCopyPaste: intent.next_action.pix_display_qr_code?.data || undefined,
                  pixExpiresAt:
                    typeof intent.next_action.pix_display_qr_code?.expires_at === 'number'
                      ? new Date(intent.next_action.pix_display_qr_code.expires_at * 1000)
                      : undefined,
                }
              : {}),
          },
        })
        .catch(() => undefined);
    }

    if (workspaceId && intent.id && !isApprovedSaleIntent) {
      if (checkoutPaymentStatus === 'APPROVED') {
        await this.prisma
          .$transaction(async (tx) => {
            await tx.kloelSale.updateMany({
              where: { workspaceId, externalPaymentId: intent.id },
              data: { status: 'paid', paidAt: new Date() },
            });
          }, FINANCIAL_TRANSACTION_OPTIONS)
          .catch(() => undefined);
      } else if (checkoutPaymentStatus === 'CANCELED') {
        await this.prisma
          .$transaction(async (tx) => {
            await tx.kloelSale.updateMany({
              where: { workspaceId, externalPaymentId: intent.id },
              data: { status: 'cancelled' },
            });
          }, FINANCIAL_TRANSACTION_OPTIONS)
          .catch(() => undefined);
      }
    }

    if (isApprovedSaleIntent) {
      try {
        const postSaleResult = await this.stripeWebhookProcessor.processSaleSucceeded(
          intent as StripePaymentIntent,
          await this.ledger.buildMatureAtResolver(orderId),
        );
        if (postSaleResult.skippedReason) {
          throw new Error(
            `Stripe post-sale processing skipped for paymentIntent=${intent.id || stripeExternalId}: ${postSaleResult.skippedReason}`,
          );
        }
        if (intent.id) {
          await this.ledger.persistConnectPostSaleSnapshot(
            intent.id,
            postSaleResult.connectPostSale,
          );
          await this.ledger.appendMarketplaceTreasurySaleCredit(intent.id);
          await this.prisma
            .$transaction(async (tx) => {
              await tx.checkoutPayment.updateMany({
                where: { externalId: intent.id },
                data: { status: 'APPROVED' },
              });
              if (workspaceId) {
                await tx.kloelSale.updateMany({
                  where: { workspaceId, externalPaymentId: intent.id },
                  data: { status: 'paid', paidAt: new Date() },
                });
              }
            }, FINANCIAL_TRANSACTION_OPTIONS)
            .catch(() => undefined);
        }
      } catch (error) {
        this.financialAlert.webhookProcessingFailed(error as Error, {
          provider: 'stripe',
          externalId: intent.id || stripeExternalId,
          eventType: event.type,
        });
        throw error;
      }
    }

    if (workspaceId && orderId) {
      await this.updateOrderStatusForIntent(workspaceId, orderId, checkoutPaymentStatus);
    }

    if (webhookEvent?.id) {
      await this.webhooksService.markWebhookProcessed(webhookEvent.id).catch(() => {});
    }
  }

  private async updateOrderStatusForIntent(
    workspaceId: string,
    orderId: string,
    checkoutPaymentStatus: string,
  ): Promise<void> {
    const currentOrder = await this.prisma.checkoutOrder.findUnique({
      where: { id: orderId },
      select: { status: true },
    });

    if (checkoutPaymentStatus === 'APPROVED') {
      if (currentOrder?.status !== 'PROCESSING' && currentOrder?.status !== 'PAID') {
        this.logger.warn(
          `Invalid payment state transition: tried to move from ${currentOrder?.status} to PAID for order ${orderId}; enforcing PROCESSING intermediate state`,
        );
        await this.prisma.$transaction(async (tx) => {
          await tx.checkoutOrder.updateMany({
            where: { id: orderId, workspaceId },
            data: { status: 'PROCESSING' },
          });
        }, FINANCIAL_TRANSACTION_OPTIONS);
      } else {
        await this.prisma.$transaction(async (tx) => {
          await tx.checkoutOrder.updateMany({
            where: { id: orderId, workspaceId },
            data: { status: 'PAID', paidAt: new Date() },
          });
        }, FINANCIAL_TRANSACTION_OPTIONS);
      }
    } else if (checkoutPaymentStatus === 'PROCESSING') {
      await this.prisma.checkoutOrder.updateMany({
        where: { id: orderId, workspaceId },
        data: { status: 'PROCESSING' },
      });
    } else if (checkoutPaymentStatus === 'CANCELED') {
      await this.prisma.checkoutOrder.updateMany({
        where: { id: orderId, workspaceId },
        data: { status: 'CANCELED', canceledAt: new Date() },
      });
    }
  }

  private async handleCheckoutSessionCompleted(
    event: StripeEventLike,
    webhookEvent: WebhookEvent | undefined,
  ): Promise<void> {
    const rawSession = event.data?.object;
    const session: StripeCheckoutSessionLike = rawSession ?? {};
    const workspaceId = session.metadata?.workspaceId;
    if (!workspaceId) {
      throw new BadRequestException('missing_workspaceId');
    }
    await this.assertWorkspaceExists(workspaceId);
    const email = session.customer_details?.email || session.customer_email;
    const phone = session.customer_details?.phone || session.metadata?.phone;
    const amount = session.amount_total ? session.amount_total / 100 : 0;
    const currency = session.currency?.toUpperCase() || 'BRL';

    let contact = null;
    if (email) {
      contact = await this.prisma.contact.findFirst({ where: { workspaceId, email } });
    }
    if (!contact && phone) {
      const normalizedPhone = String(phone).replace(D_RE, '');
      contact = await this.prisma.contact.findFirst({
        where: { workspaceId, phone: normalizedPhone },
      });
    }

    await this.updatePaymentAndSaleForSession(session, workspaceId);

    const customerPhone =
      contact?.phone || phone ? String(contact?.phone || phone).replace(D_RE, '') : undefined;
    if (customerPhone) {
      await this.sendCheckoutConfirmation(workspaceId, customerPhone, amount, currency, session);
    } else {
      this.logger.warn(`[STRIPE] Sem telefone para notificar. Email: ${email}`);
    }

    await this.autopilot.markConversion({
      workspaceId,
      contactId: contact?.id,
      phone: customerPhone,
      reason: 'stripe_paid',
      meta: {
        provider: 'stripe',
        paymentIntent: session.payment_intent || session.id,
        amount,
        currency,
        email,
        productName: session.metadata?.productName,
      },
    });

    if (contact?.id) {
      try {
        await this.autopilot.triggerPostPurchaseFlow(workspaceId, contact.id, {
          provider: 'stripe',
          amount,
          productName: session.metadata?.productName,
        });
      } catch (flowErr: unknown) {
        const msg =
          flowErr instanceof Error
            ? flowErr
            : new Error(typeof flowErr === 'string' ? flowErr : 'unknown error');
        this.logger.warn(`[STRIPE] Erro ao ativar fluxo pós-venda: ${msg?.message}`);
      }
    }

    if (webhookEvent?.id) {
      await this.webhooksService.markWebhookProcessed(webhookEvent.id).catch(() => {});
    }
  }

  private async updatePaymentAndSaleForSession(
    session: StripeCheckoutSessionLike,
    workspaceId: string,
  ): Promise<void> {
    const stripePaymentExternalId = session.payment_intent || session.id;
    try {
      if (this.prisma.payment) {
        const existingPayment = await this.prisma.payment.findFirst({
          where: { workspaceId, externalId: stripePaymentExternalId },
        });
        const canTransition =
          !existingPayment ||
          validatePaymentTransition(existingPayment.status || 'PENDING', 'RECEIVED', {
            paymentId: existingPayment?.id,
            provider: 'stripe',
            externalId: stripePaymentExternalId,
          });
        if (canTransition) {
          await this.prisma.payment.updateMany({
            where: { workspaceId, externalId: stripePaymentExternalId },
            data: { status: 'RECEIVED' },
          });
        } else {
          this.logger.warn(
            `Stripe webhook rejected by state machine: ${existingPayment?.status} -> RECEIVED for ${stripePaymentExternalId}`,
          );
        }
      }
    } catch (paymentErr: unknown) {
      const msg =
        paymentErr instanceof Error
          ? paymentErr
          : new Error(typeof paymentErr === 'string' ? paymentErr : 'unknown error');
      this.logger.warn(`Não foi possível atualizar pagamento Stripe: ${msg?.message}`);
    }

    try {
      if (this.prisma.kloelSale) {
        await this.prisma.kloelSale.updateMany({
          where: { workspaceId, externalPaymentId: stripePaymentExternalId },
          data: { status: 'paid', paidAt: new Date() },
        });
      }
    } catch (saleErr: unknown) {
      const msg =
        saleErr instanceof Error
          ? saleErr
          : new Error(typeof saleErr === 'string' ? saleErr : 'unknown error');
      this.logger.warn(`Não foi possível atualizar KloelSale (Stripe): ${msg?.message}`);
    }
  }

  private async sendCheckoutConfirmation(
    workspaceId: string,
    customerPhone: string,
    amount: number,
    currency: string,
    session: StripeCheckoutSessionLike,
  ): Promise<void> {
    try {
      const formattedAmount = amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      const confirmationMessage = `Pagamento confirmado.\n\nValor: ${currency === 'BRL' ? 'R$' : currency} ${formattedAmount}\nID: ${session.payment_intent || session.id}\n\nObrigado pela sua compra.\n\nSe tiver qualquer dúvida, estou à disposição.`;
      await this.whatsapp.sendMessage(workspaceId, customerPhone, confirmationMessage);
      this.logger.log(`[STRIPE] Notificação enviada para ${customerPhone}`);
    } catch (notifyErr: unknown) {
      const msg =
        notifyErr instanceof Error
          ? notifyErr
          : new Error(typeof notifyErr === 'string' ? notifyErr : 'unknown error');
      this.logger.warn(`[STRIPE] Falha ao notificar cliente: ${msg?.message}`);
    }
  }

  private async assertWorkspaceExists(workspaceId: string) {
    const ws = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!ws) {
      throw new BadRequestException('invalid_workspaceId');
    }
  }

  private async ensureIdempotent(
    eventId: string | undefined,
    req: WebhookRequest,
  ): Promise<{ ok: true; received: true; duplicate: true; reason: string } | null> {
    const reqBody = req?.body;
    const raw = req?.rawBody || JSON.stringify(reqBody || '');
    const key =
      eventId ||
      crypto
        .createHash('sha256')
        .update(Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw)))
        .digest('hex')
        .slice(0, 32);
    const cacheKey = `webhook:payment:${key}`;
    const result = await this.redis.set(cacheKey, '1', 'EX', 300, 'NX');
    if (result === null) {
      this.logger.warn(`Duplicate payment webhook ignored: ${key}`);
      await this.sendOpsAlert('webhook_duplicate_payment', { key, path: req?.url });
      return { ok: true, received: true, duplicate: true, reason: 'duplicate_event' };
    }
    return null;
  }

  private async sendOpsAlert(message: string, meta: Record<string, unknown>) {
    const url =
      process.env.OPS_WEBHOOK_URL ||
      process.env.AUTOPILOT_ALERT_WEBHOOK ||
      process.env.DLQ_WEBHOOK_URL;
    if (!url || !globalThis.fetch) {
      return;
    }
    const requestId = this.buildOpsAlertRequestId(message, meta);
    try {
      validateNoInternalAccess(url);
      await globalThis.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
        body: JSON.stringify({
          type: message,
          meta,
          requestId,
          at: new Date().toISOString(),
          env: process.env.NODE_ENV || 'dev',
        }),
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      // best effort
    }

    try {
      const payload = { type: message, meta, requestId, at: new Date().toISOString() };
      await this.redis.lpush('alerts:webhooks', JSON.stringify(payload));
      await this.redis.ltrim('alerts:webhooks', 0, 49);
    } catch {
      // ignore
    }
  }

  private buildOpsAlertRequestId(message: string, meta: Record<string, unknown>): string {
    const stableId =
      asString(meta.eventId) ||
      asString(meta.externalId) ||
      asString(meta.paymentIntentId) ||
      asString(meta.orderId) ||
      crypto.randomUUID();
    return `payment-webhook:${message}:${stableId}`;
  }
}
