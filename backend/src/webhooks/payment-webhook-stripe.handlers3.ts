/**
 * Stripe webhook event handlers — Connect account updates.
 * Extracted from payment-webhook-stripe.handlers.ts to keep each file
 * under the architecture line budget (max_new_file_lines).
 */
import { type WebhookEvent } from '@prisma/client';
import { asRecord, asString, asStringArray, type StripeEventLike } from './payment-webhook-types';
import type { StripeHandlerDeps } from './payment-webhook-stripe.deps';

export async function handleAccountUpdated(
  deps: StripeHandlerDeps,
  event: StripeEventLike,
  webhookEvent: WebhookEvent | undefined,
): Promise<void> {
  const account = asRecord(event.data?.object);
  const stripeAccountId = asString(account?.id);
  if (stripeAccountId) {
    const balance = await deps.prisma.connectAccountBalance.findUnique({
      where: { stripeAccountId },
      select: { id: true, workspaceId: true, accountType: true, stripeAccountId: true },
    });
    if (balance) {
      const requirements = asRecord(account?.requirements);
      await deps.adminAudit.append({
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
      deps.logger.warn(
        `Stripe account.updated received for unknown local balance stripeAccountId=${stripeAccountId}`,
      );
    }
  }
  if (webhookEvent?.id) {
    await deps.webhooksService.markWebhookProcessed(webhookEvent.id).catch((err: unknown) => {
      const errMsg = err instanceof Error ? err.message : 'unknown_error';
      deps.logger.error(
        `[STRIPE] Failed to mark webhook ${webhookEvent.id} as processed: ${errMsg}`,
      );
    });
  }
}
