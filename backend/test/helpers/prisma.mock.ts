/**
 * Canonical Prisma mock factory for unit tests.
 *
 * Audit A3 (2026-05-21) found 4 distinct mock shapes across ~282 spec
 * files, with 5 reusable spec-helper variants + ~280 inline ones. This
 * factory replaces the inline pattern. Each call returns a FRESH mock
 * (no shared state), preserving Jest worker isolation.
 *
 * Usage:
 * ```ts
 * import { createPrismaMock, type PrismaMockRecord } from '../../test/helpers/prisma.mock';
 *
 * let prisma: PrismaMockRecord;
 * beforeEach(() => {
 *   prisma = createPrismaMock({ models: ['agent', 'workspace'] });
 * });
 *
 * it('foo', async () => {
 *   prisma.agent.findUnique.mockResolvedValue({ id: '1' });
 *   const service = new MyService(prisma as unknown as PrismaService);
 *   ...
 * });
 * ```
 *
 * For specs that need a domain-specific narrow mock, use
 * {@link createPartialPrismaMock}. For specs that need fluent jest.Mock
 * with `.mockResolvedValue` chaining, see the `FlexMock` type below.
 */

export type PrismaMockMethod = jest.Mock;

export type PrismaMockModel = Record<string, PrismaMockMethod>;

export type PrismaMockRecord = Record<string, PrismaMockModel> & {
  $transaction: jest.Mock;
};

/**
 * Fluent jest.Mock with `.mockResolvedValue` chaining preserved as the
 * same FlexMock (rather than `jest.Mock`). Replaces 6 local copies of
 * this type across `contacts/*.spec.ts`, `autopilot/*.spec.ts`, etc.
 */
export type FlexMock<T extends (...args: never[]) => unknown = (...args: never[]) => unknown> =
  jest.Mock<ReturnType<T>, Parameters<T>> & {
    mockResolvedValue: (v: Awaited<ReturnType<T>>) => FlexMock<T>;
    mockResolvedValueOnce: (v: Awaited<ReturnType<T>>) => FlexMock<T>;
    mockRejectedValue: (e: unknown) => FlexMock<T>;
    mockRejectedValueOnce: (e: unknown) => FlexMock<T>;
    mockReturnValue: (v: ReturnType<T>) => FlexMock<T>;
    mockImplementation: (fn: T) => FlexMock<T>;
  };

const COMMON_MODELS = [
  'agent',
  'workspace',
  'contact',
  'refreshToken',
  'conversation',
  'message',
  'campaign',
  'autopilotEvent',
  'deal',
  'checkoutProductPlan',
  'checkoutConfig',
  'checkoutPixel',
  'affiliateLink',
  'followUp',
  'channelIdentifier',
  'kycDocument',
  'adminPermission',
  'adminAuditLog',
  'approvalRequest',
  'payment',
  'webhookEvent',
  'kloelWallet',
  'kloelWalletLedger',
] as const;

const COMMON_METHODS = [
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
] as const;

function buildModelMock(methods: readonly string[] = COMMON_METHODS): PrismaMockModel {
  const model: PrismaMockModel = {};
  for (const method of methods) {
    model[method] = jest.fn();
  }
  return model;
}

export interface CreatePrismaMockOptions {
  /** Specific Prisma models to mock. If omitted, mocks all common models. */
  models?: readonly string[];
  /** Per-model method overrides. */
  overrides?: Record<string, Partial<PrismaMockModel>>;
  /** Custom $transaction implementation. Default: dual-mode (interactive callback + batch). */
  $transaction?: jest.Mock;
}

/**
 * Create a fully isolated Prisma mock with `jest.fn()` for every specified
 * model + method. Each call returns a FRESH mock — no shared state across
 * tests or workers. Safe for parallel Jest execution.
 */
export function createPrismaMock(options: CreatePrismaMockOptions = {}): PrismaMockRecord {
  const models = options.models ?? COMMON_MODELS;
  const prisma: PrismaMockRecord = { $transaction: jest.fn() } as PrismaMockRecord;

  for (const model of models) {
    prisma[model] = buildModelMock();
  }

  prisma.$transaction =
    options.$transaction ??
    jest.fn((arg: unknown) => {
      // Dual mode: $transaction(async (tx) => {...}) → call with self as tx
      if (typeof arg === 'function') {
        return (arg as (tx: PrismaMockRecord) => unknown)(prisma);
      }
      // $transaction([promises...]) → resolve all
      return Promise.all(arg as Promise<unknown>[]);
    });

  if (options.overrides) {
    for (const [model, methods] of Object.entries(options.overrides)) {
      if (prisma[model]) {
        Object.assign(prisma[model] as PrismaMockModel, methods);
      } else {
        prisma[model] = methods as PrismaMockModel;
      }
    }
  }

  return prisma;
}

/**
 * Create a partial Prisma mock with only the specified models AND specific
 * methods per model. Use for narrow unit tests that exercise 1-2 models.
 *
 * @example
 * const prisma = createPartialPrismaMock({
 *   agent: ['findUnique', 'update'],
 *   workspace: ['findFirst'],
 * });
 */
export function createPartialPrismaMock(
  modelDefs: Record<string, readonly string[]>,
  overrides?: Record<string, Partial<PrismaMockModel>>,
): PrismaMockRecord {
  const prisma: PrismaMockRecord = { $transaction: jest.fn() } as PrismaMockRecord;

  for (const [model, methods] of Object.entries(modelDefs)) {
    prisma[model] = buildModelMock(methods);
  }

  prisma.$transaction = jest.fn((arg: unknown) => {
    if (typeof arg === 'function') {
      return (arg as (tx: PrismaMockRecord) => unknown)(prisma);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });

  if (overrides) {
    for (const [model, methods] of Object.entries(overrides)) {
      if (prisma[model]) {
        Object.assign(prisma[model] as PrismaMockModel, methods);
      } else {
        prisma[model] = methods as PrismaMockModel;
      }
    }
  }

  return prisma;
}
