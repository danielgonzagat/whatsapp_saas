import { runCreatePaymentLink } from './kloel-chat-tools.workspace.helpers';
import type { ToolResult } from './kloel-chat-tools.agent-runtime.helpers';
import type { PrismaService } from '../prisma/prisma.service';
import type { SmartPaymentService } from './smart-payment.service';

/**
 * Guards the stale, no-longer-wired `runCreatePaymentLink` in workspace.helpers.
 *
 * It previously fabricated an EMV PIX copy-paste payload (`00020126...`) with a
 * random checksum and a `pay_dev_*` id in the non-production branch and returned
 * it as a real payment instrument. This proves the honest-state contract: it
 * returns `canonical_dispatcher_required` and never fabricates an instrument or
 * touches a payment provider — regardless of NODE_ENV.
 */
describe('runCreatePaymentLink (workspace.helpers honest state)', () => {
  const logger = { log: jest.fn() };
  const createSmartPayment = jest.fn();
  const smartPaymentService = { createSmartPayment } as unknown as SmartPaymentService;

  // Throwing proxy: any prisma access in this path is a contract violation.
  const prisma = new Proxy(
    {},
    {
      get() {
        throw new Error('prisma must not be touched by the stale payment-link helper');
      },
    },
  ) as unknown as PrismaService;

  const baseArgs = { amount: 99.9, description: 'Produto Teste', customerName: 'Joao' };

  afterEach(() => {
    jest.clearAllMocks();
  });

  const expectHonestSetupRequired = (result: ToolResult) => {
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        error: 'canonical_dispatcher_required',
        billingType: 'PIX',
      }),
    );
    // No fabricated payment instrument may leak.
    expect(result.paymentId).toBeUndefined();
    expect(result.pixCopyPaste).toBeUndefined();
    expect(result.pixQrCode).toBeUndefined();
    expect(typeof result.message).toBe('string');
    // The honest message must never contain a fabricated EMV PIX / dev id literal.
    expect(result.message).not.toContain('00020126');
    expect(result.message).not.toContain('pay_dev_');
  };

  it('returns honest setup-required in non-production without fabricating PIX', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    try {
      const result = await runCreatePaymentLink(
        prisma,
        smartPaymentService,
        logger,
        'ws-1',
        baseArgs,
      );
      expectHonestSetupRequired(result);
      expect(createSmartPayment).not.toHaveBeenCalled();
    } finally {
      if (original === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = original;
      }
    }
  });

  it('returns honest setup-required in production without calling the payment provider', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const result = await runCreatePaymentLink(
        prisma,
        smartPaymentService,
        logger,
        'ws-1',
        baseArgs,
      );
      expectHonestSetupRequired(result);
      expect(createSmartPayment).not.toHaveBeenCalled();
    } finally {
      if (original === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = original;
      }
    }
  });
});
