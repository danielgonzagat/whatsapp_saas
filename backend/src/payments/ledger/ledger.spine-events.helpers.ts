import type { ConnectLedgerEntry } from '@prisma/client';

import type { SpineEmitterService } from '../../kloel/spine/spine-emitter.service';

/**
 * Canonical commerce.payment.* spine event names emitted by the ledger after
 * a money-move transaction has committed. Kept in lockstep with the event
 * taxonomy — see {@link emitPaymentSpineEvent}.
 */
export type LedgerSpineEventName =
  | 'commerce.payment.approved'
  | 'commerce.payment.refunded'
  | 'commerce.payment.charged_back';

/**
 * Emit a canonical commerce.payment.* spine event AFTER the ledger
 * transaction has already committed successfully. Emission is
 * fire-and-forget and never throws — the money path is sacred, exactly
 * as documented on {@link SpineEmitterService}. A missing spine (DI
 * @Optional) is a silent no-op so this stays decoupled from MIND wiring.
 *
 * This does NOT mutate any balance, amount, or ledger row — it only
 * publishes a read-only signal so downstream cognitive consumers
 * (analytics, autopilot, brain/mind) observe payment state changes.
 *
 * Pure helper: the {@link LedgerService} passes its (optional) spine emitter
 * plus the already-persisted entry and event data; behaviour is identical to
 * the previously-inlined private method.
 */
export function emitPaymentSpineEvent(
  spine: SpineEmitterService | undefined,
  eventName: LedgerSpineEventName,
  entry: ConnectLedgerEntry,
  workspaceId: string,
  payload: Readonly<Record<string, unknown>>,
): void {
  if (!spine) {
    return;
  }
  void spine
    .emit({
      eventName,
      workspaceId,
      entityRef: { entityType: 'ledger_entry', entityId: entry.id },
      truthMode: 'observed',
      provenance: {
        source: 'production',
        processor: 'ledger-service',
        processorVersion: '1.0.0',
        schemaVersion: '1.0.0',
      },
      payload: {
        ledgerEntryId: entry.id,
        accountBalanceId: entry.accountBalanceId,
        amountCents: entry.amountCents.toString(),
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        ...payload,
      },
    })
    .catch(() => undefined);
}
