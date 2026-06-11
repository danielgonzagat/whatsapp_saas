import { Logger } from '@nestjs/common';
import { castMock } from '../../test/helpers/cast-mock';
import { partialMatch } from '../../test/helpers/match-instance';
import { fulfillCheckout } from './billing-webhook.fulfillment';
import { activatePlanFeatures } from './billing-plan-features';
import { notifyCustomerPaymentConfirmedHelper } from './billing-webhook.helpers';
import type { StripeCheckoutSession } from './stripe-types';
import type { PrismaService } from '../prisma/prisma.service';
import type { FinancialAlertService } from '../common/financial-alert.service';

jest.mock('./billing-plan-features', () => ({
  activatePlanFeatures: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('./billing-webhook.helpers', () => ({
  notifyCustomerPaymentConfirmedHelper: jest.fn().mockResolvedValue(undefined),
}));

const mockedActivate = jest.mocked(activatePlanFeatures);
const mockedNotify = jest.mocked(notifyCustomerPaymentConfirmedHelper);

interface TxShape {
  subscription: { upsert: jest.Mock };
  auditLog: { create: jest.Mock };
}

function buildSession(overrides: Record<string, unknown> = {}): StripeCheckoutSession {
  return castMock<StripeCheckoutSession>({
    id: 'cs_1',
    subscription: 'sub_1',
    metadata: { workspaceId: 'ws-1', plan: 'SCALE' },
    ...overrides,
  });
}

describe('fulfillCheckout', () => {
  let tx: TxShape;
  let prisma: { workspace: { findUnique: jest.Mock }; $transaction: jest.Mock };
  let whatsapp: { sendMessage: jest.Mock };
  let deps: Parameters<typeof fulfillCheckout>[0];

  beforeEach(() => {
    jest.clearAllMocks();
    tx = {
      subscription: { upsert: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      workspace: { findUnique: jest.fn().mockResolvedValue({ id: 'ws-1' }) },
      $transaction: jest.fn((fn: (t: TxShape) => unknown) => fn(tx)),
    };
    whatsapp = { sendMessage: jest.fn() };
    deps = {
      prisma: castMock<PrismaService>(prisma),
      logger: new Logger('fulfillment-test'),
      financialAlert: castMock<FinancialAlertService>({}),
      resolveWhatsappService: jest.fn().mockResolvedValue(whatsapp),
    };
  });

  it('ignores sessions without a workspaceId in metadata', async () => {
    await fulfillCheckout(deps, buildSession({ metadata: {} }));

    expect(prisma.workspace.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mockedNotify).not.toHaveBeenCalled();
  });

  it('skips the upsert when the workspace no longer exists', async () => {
    prisma.workspace.findUnique.mockResolvedValue(null);

    await fulfillCheckout(deps, buildSession());

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mockedNotify).not.toHaveBeenCalled();
  });

  it('activates the subscription, plan features, audit trail, and customer notification', async () => {
    const session = buildSession();

    await fulfillCheckout(deps, session);

    expect(tx.subscription.upsert).toHaveBeenCalledWith(
      partialMatch({
        where: { workspaceId: 'ws-1' },
        update: partialMatch({
          status: 'ACTIVE',
          plan: 'SCALE',
          stripeId: 'sub_1',
          cancelAtPeriodEnd: false,
        }),
        create: partialMatch({ workspaceId: 'ws-1', status: 'ACTIVE', plan: 'SCALE' }),
      }),
    );
    expect(mockedActivate).toHaveBeenCalledWith(tx, 'ws-1', 'SCALE');
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      partialMatch({
        data: partialMatch({
          workspaceId: 'ws-1',
          action: 'subscription.created',
          resourceId: 'sub_1',
        }),
      }),
    );
    expect(deps.resolveWhatsappService).toHaveBeenCalledTimes(1);
    expect(mockedNotify).toHaveBeenCalledWith(
      deps.logger,
      deps.prisma,
      whatsapp,
      'ws-1',
      session,
      'SCALE',
      deps.financialAlert,
    );
  });

  it('defaults the plan to PRO when checkout metadata carries none', async () => {
    await fulfillCheckout(deps, buildSession({ metadata: { workspaceId: 'ws-1' } }));

    expect(tx.subscription.upsert).toHaveBeenCalledWith(
      partialMatch({ update: partialMatch({ plan: 'PRO' }) }),
    );
    expect(mockedActivate).toHaveBeenCalledWith(tx, 'ws-1', 'PRO');
  });
});
