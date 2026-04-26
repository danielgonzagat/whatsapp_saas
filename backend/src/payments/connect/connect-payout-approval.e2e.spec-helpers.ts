import { ConnectPayoutApprovalService } from './connect-payout-approval.service';

/**
 * Shared `buildService` factory for the ConnectPayoutApprovalService e2e
 * spec suite.
 *
 * Constructs the in-memory Prisma + ConnectPayoutService stubs the spec
 * needs and returns the wired service. Sibling spec files import this so
 * each topic (createRequest / approveRequest+rejectRequest / list) lives
 * in a smaller file under the architecture-allowlist budget.
 */

export function buildService(overrides?: {
  availableBalanceCents?: bigint;
  payoutSuccess?: boolean;
  openRequestExists?: boolean;
}) {
  const now = new Date('2026-04-19T22:00:00Z');
  const prisma = {
    connectAccountBalance: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'cab_seller',
        workspaceId: 'ws-1',
        stripeAccountId: 'acct_seller',
        accountType: 'SELLER',
        availableBalanceCents: overrides?.availableBalanceCents ?? 900n,
      }),
    },
    approvalRequest: {
      findFirst: jest
        .fn()
        .mockResolvedValue(overrides?.openRequestExists ? { id: 'apr_open_dup' } : null),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
        id: 'apr_1',
        workspaceId: 'ws-1',
        kind: 'connect_payout',
        state: 'OPEN',
        title: data.title,
        prompt: data.prompt,
        payload: data.payload,
        response: null,
        respondedAt: null,
        createdAt: now,
        updatedAt: now,
      })),
      update: jest
        .fn()
        .mockImplementation(
          ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({
            id: where.id,
            workspaceId: 'ws-1',
            kind: 'connect_payout',
            state: data.state,
            title: 'Aprovar saque SELLER',
            prompt: 'prompt',
            payload: {
              version: 1,
              workspaceId: 'ws-1',
              accountBalanceId: 'cab_seller',
              accountType: 'SELLER',
              stripeAccountId: 'acct_seller',
              amountCents: '500',
              currency: 'BRL',
              requestId: 'po_req_1',
              requestedByType: 'workspace',
            },
            response: data.response ?? null,
            respondedAt: data.respondedAt ?? null,
            createdAt: now,
            updatedAt: now,
          }),
        ),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    adminAuditLog: {
      create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
    },
    $transaction: jest
      .fn()
      .mockImplementation(
        (
          operations:
            | Array<Promise<unknown>>
            | ((tx: Record<string, unknown>) => Promise<unknown> | unknown),
        ) => {
          if (typeof operations === 'function') {
            return operations(prisma);
          }
          return Promise.all(operations);
        },
      ),
  };
  const connectPayoutService = {
    createPayout: jest.fn().mockResolvedValue(
      overrides?.payoutSuccess === false
        ? Promise.reject(new Error('stripe down'))
        : {
            payoutId: 'po_123',
            status: 'pending',
            accountBalanceId: 'cab_seller',
            stripeAccountId: 'acct_seller',
            amountCents: 500n,
          },
    ),
  };

  return {
    prisma,
    connectPayoutService,
    service: new ConnectPayoutApprovalService(prisma as never, connectPayoutService as never),
  };
}
