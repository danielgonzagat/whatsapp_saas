import { matchInstance } from '../../test/helpers/match-instance';
import { castMock } from '../../test/helpers/cast-mock';
import type { SalesService } from '../sales/sales.service';
import {
  dispatchSalesTool,
  isSalesTool,
  SALES_TOOL_NAMES,
} from './kloel-tool-dispatcher.sales.handlers';
import type { SalesToolDeps } from './kloel-tool-dispatcher.sales.handlers';

type Stub = {
  salesService: {
    refund: jest.Mock;
    cancelSubscription: jest.Mock;
    createPixOrder: jest.Mock;
    createBoletoOrder: jest.Mock;
    createStripeCardLink: jest.Mock;
  };
};

const DEFAULT_WS_ID = 'ws-1';
const DEFAULT_USER_ID = 'u1';

const makeStubDeps = (
  withService = true,
  userId: string | undefined = DEFAULT_USER_ID,
): { stub: Stub; deps: SalesToolDeps } => {
  const stub: Stub = {
    salesService: {
      refund: jest.fn().mockResolvedValue({ refundId: 're_sale-1', status: 'pending' as const }),
      cancelSubscription: jest
        .fn()
        .mockResolvedValue({ success: true, status: 'CANCELLED', subscriptionId: 'sub-1' }),
      createPixOrder: jest.fn(),
      createBoletoOrder: jest.fn(),
      createStripeCardLink: jest.fn(),
    },
  };
  const deps: SalesToolDeps = {
    salesService: withService ? (stub.salesService as unknown as SalesService) : undefined,
    // capRegistryV2 left undefined → buildCanonicalReceipt returns the raw
    // result unchanged, so assertions target the handler's own output shape.
    capRegistryV2: undefined,
    userId,
  };
  return { stub, deps };
};

describe('kloel-tool-dispatcher.sales.handlers', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isSalesTool / SALES_TOOL_NAMES', () => {
    it('recognises every sales tool name including refund + cancel_subscription', () => {
      for (const name of SALES_TOOL_NAMES) {
        expect(isSalesTool(name)).toBe(true);
      }
      expect(SALES_TOOL_NAMES.has('sales.refund')).toBe(true);
      expect(SALES_TOOL_NAMES.has('sales.cancel_subscription')).toBe(true);
    });

    it('returns false for unrelated tools', () => {
      expect(isSalesTool('list_refunds')).toBe(false);
      expect(isSalesTool('toggle_autopilot')).toBe(false);
    });
  });

  describe('dispatchSalesTool', () => {
    it('returns null for unrelated tool names', async () => {
      const { deps } = makeStubDeps();
      expect(await dispatchSalesTool(deps, DEFAULT_WS_ID, 'unrelated', {})).toBeNull();
    });

    describe('sales.refund', () => {
      it('dispatches to SalesService.refund with the workspace-scoped saleId + reason', async () => {
        const { stub, deps } = makeStubDeps();
        const result = await dispatchSalesTool(deps, DEFAULT_WS_ID, 'sales.refund', {
          saleId: 'sale-1',
          reason: 'cliente desistiu',
        });

        expect(stub.salesService.refund).toHaveBeenCalledTimes(1);
        expect(stub.salesService.refund).toHaveBeenCalledWith(DEFAULT_WS_ID, 'sale-1', {
          reason: 'cliente desistiu',
        });
        expect(result?.success).toBe(true);
        expect(result?.capabilityId).toBe('sales.refund');
        expect(result?.refundId).toBe('re_sale-1');
        expect(result?.status).toBe('pending');
        expect(result?.saleId).toBe('sale-1');
        expect(result?.orderId).toBe('sale-1');
      });

      it('falls back to a default reason when none is supplied', async () => {
        const { stub, deps } = makeStubDeps();
        await dispatchSalesTool(deps, DEFAULT_WS_ID, 'sales.refund', { saleId: 'sale-1' });
        expect(stub.salesService.refund).toHaveBeenCalledWith(
          DEFAULT_WS_ID,
          'sale-1',
          expect.objectContaining({ reason: matchInstance(String) }),
        );
        const reasonArg = castMock<[unknown, unknown, { reason: string }][]>(
          stub.salesService.refund.mock.calls,
        )[0]?.[2];
        expect((reasonArg?.reason ?? '').length).toBeGreaterThan(0);
      });

      it('forwards an integer amountCents as bigint cents (partial refund)', async () => {
        const { stub, deps } = makeStubDeps();
        await dispatchSalesTool(deps, DEFAULT_WS_ID, 'sales.refund', {
          saleId: 'sale-1',
          amountCents: 5000,
        });
        expect(stub.salesService.refund).toHaveBeenCalledWith(
          DEFAULT_WS_ID,
          'sale-1',
          expect.objectContaining({ amountCents: 5000n }),
        );
      });

      it('accepts a bigint amountCents and forwards it unchanged', async () => {
        const { stub, deps } = makeStubDeps();
        await dispatchSalesTool(deps, DEFAULT_WS_ID, 'sales.refund', {
          saleId: 'sale-1',
          amountCents: 7500n,
        });
        expect(stub.salesService.refund).toHaveBeenCalledWith(
          DEFAULT_WS_ID,
          'sale-1',
          expect.objectContaining({ amountCents: 7500n }),
        );
      });

      it('drops a fractional amountCents (never sends a float to the money path)', async () => {
        const { stub, deps } = makeStubDeps();
        await dispatchSalesTool(deps, DEFAULT_WS_ID, 'sales.refund', {
          saleId: 'sale-1',
          amountCents: 50.5,
        });
        const dtoArg = castMock<[unknown, unknown, { amountCents?: bigint }][]>(
          stub.salesService.refund.mock.calls,
        )[0]?.[2];
        expect('amountCents' in (dtoArg ?? {})).toBe(false);
      });

      it('drops a negative amountCents', async () => {
        const { stub, deps } = makeStubDeps();
        await dispatchSalesTool(deps, DEFAULT_WS_ID, 'sales.refund', {
          saleId: 'sale-1',
          amountCents: -100,
        });
        const dtoArg = castMock<[unknown, unknown, { amountCents?: bigint }][]>(
          stub.salesService.refund.mock.calls,
        )[0]?.[2];
        expect('amountCents' in (dtoArg ?? {})).toBe(false);
      });

      it('returns inputs_required without calling the service when saleId is missing', async () => {
        const { stub, deps } = makeStubDeps();
        const result = await dispatchSalesTool(deps, DEFAULT_WS_ID, 'sales.refund', {
          reason: 'sem id',
        });
        expect(stub.salesService.refund).not.toHaveBeenCalled();
        expect(result?.success).toBe(false);
        expect(result?.error).toBe('sales_refund_inputs_required');
        expect(result?.missingInputs).toEqual(['saleId']);
      });

      it('short-circuits to sales_service_unavailable when SalesService is absent', async () => {
        const { deps } = makeStubDeps(false);
        const result = await dispatchSalesTool(deps, DEFAULT_WS_ID, 'sales.refund', {
          saleId: 'sale-1',
        });
        expect(result?.success).toBe(false);
        expect(result?.error).toBe('sales_service_unavailable');
      });

      it('surfaces a service error message without throwing', async () => {
        const { stub, deps } = makeStubDeps();
        stub.salesService.refund.mockRejectedValueOnce(new Error('gateway recusou'));
        const result = await dispatchSalesTool(deps, DEFAULT_WS_ID, 'sales.refund', {
          saleId: 'sale-1',
        });
        expect(result?.success).toBe(false);
        expect(result?.error).toBe('gateway recusou');
      });
    });

    describe('sales.cancel_subscription', () => {
      it('dispatches to SalesService.cancelSubscription with the workspace-scoped subscriptionId', async () => {
        const { stub, deps } = makeStubDeps();
        const result = await dispatchSalesTool(deps, DEFAULT_WS_ID, 'sales.cancel_subscription', {
          subscriptionId: 'sub-1',
        });

        expect(stub.salesService.cancelSubscription).toHaveBeenCalledTimes(1);
        expect(stub.salesService.cancelSubscription).toHaveBeenCalledWith(DEFAULT_WS_ID, {
          subscriptionId: 'sub-1',
        });
        expect(result?.success).toBe(true);
        expect(result?.capabilityId).toBe('sales.cancel_subscription');
        expect(result?.subscriptionId).toBe('sub-1');
        expect(result?.status).toBe('CANCELLED');
      });

      it('returns inputs_required without calling the service when subscriptionId is missing', async () => {
        const { stub, deps } = makeStubDeps();
        const result = await dispatchSalesTool(
          deps,
          DEFAULT_WS_ID,
          'sales.cancel_subscription',
          {},
        );
        expect(stub.salesService.cancelSubscription).not.toHaveBeenCalled();
        expect(result?.success).toBe(false);
        expect(result?.error).toBe('sales_cancel_subscription_inputs_required');
        expect(result?.missingInputs).toEqual(['subscriptionId']);
      });

      it('short-circuits to sales_service_unavailable when SalesService is absent', async () => {
        const { deps } = makeStubDeps(false);
        const result = await dispatchSalesTool(deps, DEFAULT_WS_ID, 'sales.cancel_subscription', {
          subscriptionId: 'sub-1',
        });
        expect(result?.success).toBe(false);
        expect(result?.error).toBe('sales_service_unavailable');
      });

      it('surfaces a service error message without throwing', async () => {
        const { stub, deps } = makeStubDeps();
        stub.salesService.cancelSubscription.mockRejectedValueOnce(
          new Error('assinatura nao encontrada'),
        );
        const result = await dispatchSalesTool(deps, DEFAULT_WS_ID, 'sales.cancel_subscription', {
          subscriptionId: 'sub-x',
        });
        expect(result?.success).toBe(false);
        expect(result?.error).toBe('assinatura nao encontrada');
      });
    });

    it('passes the matchInstance Number startedAt window through the wrap path', async () => {
      // Smoke: refund success path executes end-to-end (wrap returns the raw
      // result because capRegistryV2 is undefined) and is awaitable.
      const { deps } = makeStubDeps();
      const result = await dispatchSalesTool(deps, DEFAULT_WS_ID, 'sales.refund', {
        saleId: 'sale-1',
      });
      expect(result).toEqual(matchInstance(Object));
    });
  });
});
