import {
  detectKloelSaleDivergence,
  isPaymentSettled,
  reconcileSaleLedger,
  scanSaleLedgerDivergence,
  type ReconcilePaymentRow,
  type ReconcileSaleRow,
  type SaleLedgerReconcileClient,
} from './sale-ledger-reconcile.helpers';

/**
 * Covers the ADDITIVE, flag-gated sale/payment-ledger reconciliation.
 *
 * Contract:
 *   - DETECTION (`detectKloelSaleDivergence`, `scanSaleLedgerDivergence`) is
 *     pure / read-only and never writes;
 *   - flag OFF (default) → `reconcileSaleLedger` scans but performs ZERO writes
 *     (`kloelSale.updateMany` never called); `flipped: 0`, `reconciled: false`
 *     — byte-identical to today (no reconciliation at all);
 *   - flag ON → it ADDITIONALLY flips diverged still-`pending` `KloelSale` rows
 *     to `paid`, idempotently (paid-guarded `updateMany`).
 */
describe('sale-ledger-reconcile (KLOEL_SALE_LEDGER_RECONCILE)', () => {
  const originalFlag = process.env.KLOEL_SALE_LEDGER_RECONCILE;

  type MockPrisma = {
    payment: { findMany: jest.Mock };
    kloelSale: { findFirst: jest.Mock; updateMany: jest.Mock };
  };

  const settledPayment: ReconcilePaymentRow = {
    id: 'pay-1',
    workspaceId: 'ws-1',
    externalId: 'pi_abc',
    status: 'RECEIVED',
  };

  function buildPrisma(overrides?: { payments?: unknown[]; sale?: unknown }): MockPrisma {
    return {
      payment: {
        findMany: jest.fn().mockResolvedValue(overrides?.payments ?? [settledPayment]),
      },
      kloelSale: {
        findFirst: jest
          .fn()
          .mockResolvedValue(
            overrides && 'sale' in overrides
              ? overrides.sale
              : { id: 'sale-1', status: 'pending', externalPaymentId: 'pi_abc' },
          ),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
  }

  afterEach(() => {
    if (originalFlag === undefined) {
      delete process.env.KLOEL_SALE_LEDGER_RECONCILE;
    } else {
      process.env.KLOEL_SALE_LEDGER_RECONCILE = originalFlag;
    }
    jest.restoreAllMocks();
  });

  describe('pure detection', () => {
    it('isPaymentSettled recognises terminal-paid statuses only', () => {
      expect(isPaymentSettled('RECEIVED')).toBe(true);
      expect(isPaymentSettled('CONFIRMED')).toBe(true);
      expect(isPaymentSettled('APPROVED')).toBe(true);
      expect(isPaymentSettled('PENDING')).toBe(false);
      expect(isPaymentSettled('REFUNDED')).toBe(false);
    });

    it('returns null when payment not settled (no divergence to chase)', () => {
      const pending: ReconcilePaymentRow = { ...settledPayment, status: 'PENDING' };
      expect(detectKloelSaleDivergence(pending, null)).toBeNull();
    });

    it('returns null when settled payment has a paid sale (consistent)', () => {
      const sale: ReconcileSaleRow = { id: 'sale-1', status: 'paid', externalPaymentId: 'pi_abc' };
      expect(detectKloelSaleDivergence(settledPayment, sale)).toBeNull();
    });

    it("flags kind:'pending' when settled payment has a non-paid sale", () => {
      const sale: ReconcileSaleRow = {
        id: 'sale-1',
        status: 'pending',
        externalPaymentId: 'pi_abc',
      };
      expect(detectKloelSaleDivergence(settledPayment, sale)).toEqual({
        workspaceId: 'ws-1',
        paymentId: 'pay-1',
        externalId: 'pi_abc',
        paymentStatus: 'RECEIVED',
        saleId: 'sale-1',
        saleStatus: 'pending',
        kind: 'pending',
      });
    });

    it("flags kind:'missing' when settled payment has no joined sale", () => {
      expect(detectKloelSaleDivergence(settledPayment, null)).toMatchObject({
        kind: 'missing',
        saleId: null,
        saleStatus: null,
      });
    });
  });

  describe('scan is read-only', () => {
    it('never calls a write delegate', async () => {
      const prisma = buildPrisma();
      const out = await scanSaleLedgerDivergence(
        prisma as unknown as SaleLedgerReconcileClient,
        'ws-1',
      );
      expect(prisma.payment.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.kloelSale.updateMany).not.toHaveBeenCalled();
      expect(out.scanned).toBe(1);
      expect(out.divergences).toHaveLength(1);
    });
  });

  describe('flag OFF (default) → zero writes', () => {
    it('flag unset → scans but never writes; flipped 0, reconciled false', async () => {
      delete process.env.KLOEL_SALE_LEDGER_RECONCILE;
      const prisma = buildPrisma();

      const out = await reconcileSaleLedger(prisma as unknown as SaleLedgerReconcileClient, 'ws-1');

      expect(prisma.payment.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.kloelSale.updateMany).not.toHaveBeenCalled();
      expect(out.flipped).toBe(0);
      expect(out.reconciled).toBe(false);
      expect(out.divergences).toHaveLength(1);
    });

    it("flag !== 'true' → still never writes", async () => {
      process.env.KLOEL_SALE_LEDGER_RECONCILE = 'false';
      const prisma = buildPrisma();

      const out = await reconcileSaleLedger(prisma as unknown as SaleLedgerReconcileClient, 'ws-1');

      expect(prisma.kloelSale.updateMany).not.toHaveBeenCalled();
      expect(out.reconciled).toBe(false);
    });
  });

  describe('flag ON → reconciles', () => {
    it('flips diverged pending sale → paid (paid-guarded updateMany)', async () => {
      process.env.KLOEL_SALE_LEDGER_RECONCILE = 'true';
      const prisma = buildPrisma();

      const out = await reconcileSaleLedger(prisma as unknown as SaleLedgerReconcileClient, 'ws-1');

      expect(prisma.kloelSale.updateMany).toHaveBeenCalledTimes(1);
      const call = prisma.kloelSale.updateMany.mock.calls[0][0];
      expect(call.where).toEqual({
        workspaceId: 'ws-1',
        id: 'sale-1',
        status: { not: 'paid' },
      });
      expect(call.data.status).toBe('paid');
      expect(call.data.paidAt).toBeInstanceOf(Date);
      expect(out.flipped).toBe(1);
      expect(out.reconciled).toBe(true);
    });

    it("does NOT flip kind:'missing' divergences (no sale fabricated)", async () => {
      process.env.KLOEL_SALE_LEDGER_RECONCILE = 'true';
      const prisma = buildPrisma({ sale: null });

      const out = await reconcileSaleLedger(prisma as unknown as SaleLedgerReconcileClient, 'ws-1');

      expect(prisma.kloelSale.updateMany).not.toHaveBeenCalled();
      expect(out.flipped).toBe(0);
      expect(out.divergences[0]?.kind).toBe('missing');
      expect(out.reconciled).toBe(true);
    });

    it('is a no-op flip when no divergence (consistent ledgers)', async () => {
      process.env.KLOEL_SALE_LEDGER_RECONCILE = 'true';
      const prisma = buildPrisma({
        sale: { id: 'sale-1', status: 'paid', externalPaymentId: 'pi_abc' },
      });

      const out = await reconcileSaleLedger(prisma as unknown as SaleLedgerReconcileClient, 'ws-1');

      expect(prisma.kloelSale.updateMany).not.toHaveBeenCalled();
      expect(out.divergences).toHaveLength(0);
      expect(out.flipped).toBe(0);
    });
  });
});
