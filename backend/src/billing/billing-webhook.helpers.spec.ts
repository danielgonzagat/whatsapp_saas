import { Logger } from '@nestjs/common';
import {
  mapStripeStatus,
  notifyCustomerPaymentConfirmedHelper,
  notifyOpsHelper,
  readInvoiceSubscriptionId,
} from './billing-webhook.helpers';
import { createPartialPrismaMock } from '../../test/helpers/prisma.mock';
import { castMock } from '../../test/helpers/cast-mock';
import { partialMatch } from '../../test/helpers/match-instance';
import type { PrismaService } from '../prisma/prisma.service';
import type { StripeCheckoutSession, StripeInvoice } from './stripe-types';

const silentLogger = castMock<Logger>({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
});

const asSession = (s: Record<string, unknown>): StripeCheckoutSession =>
  castMock<StripeCheckoutSession>(s);
const asInvoice = (i: Record<string, unknown>): StripeInvoice => castMock<StripeInvoice>(i);

describe('billing-webhook.helpers', () => {
  describe('readInvoiceSubscriptionId', () => {
    it('reads a string subscription reference', () => {
      expect(readInvoiceSubscriptionId(asInvoice({ subscription: 'sub_str' }))).toBe('sub_str');
    });

    it('reads an embedded subscription object id', () => {
      expect(readInvoiceSubscriptionId(asInvoice({ subscription: { id: 'sub_obj' } }))).toBe(
        'sub_obj',
      );
    });

    it('returns null for missing, blank, or malformed subscription refs', () => {
      expect(readInvoiceSubscriptionId(asInvoice({}))).toBeNull();
      expect(readInvoiceSubscriptionId(asInvoice({ subscription: '   ' }))).toBeNull();
      expect(readInvoiceSubscriptionId(asInvoice({ subscription: null }))).toBeNull();
      expect(readInvoiceSubscriptionId(asInvoice({ subscription: { id: null } }))).toBeNull();
    });
  });

  describe('mapStripeStatus', () => {
    it('maps cancellation, dunning, and trialing states; defaults to ACTIVE', () => {
      expect(mapStripeStatus('canceled')).toBe('CANCELED');
      expect(mapStripeStatus('cancelled')).toBe('CANCELED');
      expect(mapStripeStatus('past_due')).toBe('PAST_DUE');
      expect(mapStripeStatus('incomplete')).toBe('PAST_DUE');
      expect(mapStripeStatus('unpaid')).toBe('PAST_DUE');
      expect(mapStripeStatus('trialing')).toBe('TRIALING');
      expect(mapStripeStatus('active')).toBe('ACTIVE');
      expect(mapStripeStatus(null)).toBe('ACTIVE');
      expect(mapStripeStatus(undefined)).toBe('ACTIVE');
    });
  });

  describe('notifyCustomerPaymentConfirmedHelper (amount in cents → reais)', () => {
    type SendMock = jest.Mock<Promise<unknown>, [string, string, string]>;
    let prisma: ReturnType<typeof createPartialPrismaMock>;
    let notifier: { sendMessage: SendMock };

    const lastSent = (): [string, string, string] => notifier.sendMessage.mock.calls[0];
    const lastMessage = (): string => lastSent()[2];

    beforeEach(() => {
      prisma = createPartialPrismaMock({ contact: ['findFirst'] });
      prisma.contact.findFirst = jest.fn().mockResolvedValue({ phone: '+5511999999999' });
      notifier = {
        sendMessage: jest
          .fn<Promise<unknown>, [string, string, string]>()
          .mockResolvedValue(undefined),
      };
    });

    const send = (session: Record<string, unknown>, plan = 'PRO') =>
      notifyCustomerPaymentConfirmedHelper(
        silentLogger,
        castMock<PrismaService>(prisma),
        notifier,
        'ws-1',
        asSession(session),
        plan,
      );

    it('divides amount_total cents by 100 — never treats cents as reais', async () => {
      // 29700 cents = R$ 297,00. A bug that printed 29700 or 2970 must fail this.
      await send({ amount_total: 29700, customer_email: 'buyer@x.com', id: 'cs_1' });
      const message = lastMessage();
      expect(message).toContain('R$ 297,00');
      expect(message).not.toContain('29700');
      expect(message).not.toContain('2970,00');
    });

    it('formats sub-real cents precisely (1 cent does not round to zero)', async () => {
      await send({ amount_total: 1, customer_email: 'buyer@x.com', id: 'cs_cent' });
      const message = lastMessage();
      expect(message).toContain('R$ 0,01');
    });

    it('falls back to the plan list price when amount_total is absent', async () => {
      await send({ amount_total: null, customer_email: 'buyer@x.com', id: 'cs_fb' }, 'enterprise');
      const message = lastMessage();
      // ENTERPRISE fallback = 997.
      expect(message).toContain('R$ 997,00');
    });

    it('falls back to R$ 0,00 for an unknown plan with no amount_total', async () => {
      await send({ amount_total: 0, customer_email: 'buyer@x.com', id: 'cs_zero' }, 'MYSTERY');
      const message = lastMessage();
      expect(message).toContain('R$ 0,00');
    });

    it('prefers the string payment_intent id, falling back to the session id', async () => {
      await send({
        amount_total: 9700,
        customer_email: 'buyer@x.com',
        id: 'cs_2',
        payment_intent: 'pi_123',
      });
      expect(lastMessage()).toContain('ID: pi_123');

      notifier.sendMessage.mockClear();
      await send({
        amount_total: 9700,
        customer_email: 'buyer@x.com',
        id: 'cs_3',
        payment_intent: { id: 'pi_obj' },
      });
      // payment_intent as an object is NOT a string → falls back to the session id.
      expect(lastMessage()).toContain('ID: cs_3');
    });

    it('resolves the phone from a workspace-scoped contact lookup by email', async () => {
      await send({ amount_total: 9700, customer_email: 'buyer@x.com', id: 'cs_4' });
      expect(prisma.contact.findFirst).toHaveBeenCalledWith({
        where: { workspaceId: 'ws-1', email: 'buyer@x.com' },
        select: { phone: true },
      });
      expect(lastSent()[0]).toBe('ws-1');
      expect(lastSent()[1]).toBe('+5511999999999');
    });

    it('does not send when no notifier is available (honest no-op, no fake send)', async () => {
      await notifyCustomerPaymentConfirmedHelper(
        silentLogger,
        castMock<PrismaService>(prisma),
        null,
        'ws-1',
        asSession({ amount_total: 9700, customer_email: 'buyer@x.com', id: 'cs_5' }),
        'PRO',
      );
      expect(prisma.contact.findFirst).not.toHaveBeenCalled();
    });

    it('does not send when no contact phone is found', async () => {
      prisma.contact.findFirst = jest.fn().mockResolvedValue(null);
      await send({ amount_total: 9700, customer_email: 'buyer@x.com', id: 'cs_6' });
      expect(notifier.sendMessage).not.toHaveBeenCalled();
    });

    it('swallows a send failure (best-effort) without throwing to the webhook caller', async () => {
      notifier.sendMessage.mockRejectedValue(new Error('whatsapp down'));
      await expect(
        send({ amount_total: 9700, customer_email: 'buyer@x.com', id: 'cs_7' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('notifyOpsHelper', () => {
    const origFetch = (globalThis as { fetch?: unknown }).fetch;
    const origOps = process.env.OPS_WEBHOOK_URL;
    const origDlq = process.env.DLQ_WEBHOOK_URL;

    afterEach(() => {
      (globalThis as { fetch?: unknown }).fetch = origFetch;
      if (origOps === undefined) {
        delete process.env.OPS_WEBHOOK_URL;
      } else {
        process.env.OPS_WEBHOOK_URL = origOps;
      }
      if (origDlq === undefined) {
        delete process.env.DLQ_WEBHOOK_URL;
      } else {
        process.env.DLQ_WEBHOOK_URL = origDlq;
      }
    });

    it('is a no-op when no ops webhook URL is configured', async () => {
      delete process.env.OPS_WEBHOOK_URL;
      delete process.env.DLQ_WEBHOOK_URL;
      const fetchMock = jest.fn();
      (globalThis as { fetch?: unknown }).fetch = fetchMock;
      await notifyOpsHelper(silentLogger, 'billing_suspended', { workspaceId: 'ws-1' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('POSTs a JSON payload carrying the event type and context when configured', async () => {
      process.env.OPS_WEBHOOK_URL = 'https://ops.example.com/hook';
      const fetchMock = jest.fn().mockResolvedValue(undefined);
      (globalThis as { fetch?: unknown }).fetch = fetchMock;
      await notifyOpsHelper(silentLogger, 'billing_active', { workspaceId: 'ws-9' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
      expect(url).toBe('https://ops.example.com/hook');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body) as { type: string; workspaceId: string };
      expect(body.type).toBe('billing_active');
      expect(body.workspaceId).toBe('ws-9');
    });

    it('raises a reconciliation alert when the ops POST fails', async () => {
      process.env.OPS_WEBHOOK_URL = 'https://ops.example.com/hook';
      (globalThis as { fetch?: unknown }).fetch = jest.fn().mockRejectedValue(new Error('network'));
      const reconciliationAlert = jest.fn();
      await notifyOpsHelper(
        silentLogger,
        'billing_suspended',
        { workspaceId: 'ws-1' },
        castMock<Parameters<typeof notifyOpsHelper>[3]>({ reconciliationAlert }),
      );
      expect(reconciliationAlert).toHaveBeenCalledWith(
        'billing ops notification failed',
        partialMatch({ details: partialMatch({ event: 'billing_suspended' }) }),
      );
    });
  });
});
