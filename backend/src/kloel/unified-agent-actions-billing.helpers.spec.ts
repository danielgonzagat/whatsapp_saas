import { getProductAIConfig } from './unified-agent-actions-billing.helpers';
import type { PrismaService } from '../prisma/prisma.service';

/**
 * Coverage for the flag-gated canonical `ProductAIConfig` reader preference
 * (P2-16). Verifies the env flag `KLOEL_PRODUCT_AICONFIG_READ_CANONICAL`:
 *   - OFF (default): byte-identical to the canonical-table-only read; the
 *     per-plan `aiConfig` JSON blob is NEVER queried.
 *   - ON + typed row present: typed row is preferred; plan blob never queried.
 *   - ON + typed row missing + plan blob present: falls back to the first
 *     non-empty per-plan `aiConfig` JSON.
 *   - ON + typed row missing + no plan blob: stays `{ config: null }`.
 */
describe('getProductAIConfig — canonical-reader flag (P2-16)', () => {
  const ENV_KEY = 'KLOEL_PRODUCT_AICONFIG_READ_CANONICAL';
  const original = process.env[ENV_KEY];

  function makePrisma(opts: { typed: unknown; plans?: Array<{ aiConfig: unknown }> }): {
    prisma: PrismaService;
    findUnique: jest.Mock;
    findMany: jest.Mock;
  } {
    const findUnique = jest.fn().mockResolvedValue(opts.typed);
    const findMany = jest.fn().mockResolvedValue(opts.plans ?? []);
    const prisma = {
      productAIConfig: { findUnique },
      productPlan: { findMany },
    } as unknown as PrismaService;
    return { prisma, findUnique, findMany };
  }

  afterEach(() => {
    if (original === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = original;
    }
    jest.clearAllMocks();
  });

  describe('flag OFF (default)', () => {
    beforeEach(() => {
      delete process.env[ENV_KEY];
    });

    it('returns the typed row and never queries plans', async () => {
      const typed = { id: 'cfg-1', productId: 'p-1', customerProfile: { persona: 'x' } };
      const { prisma, findUnique, findMany } = makePrisma({ typed });
      const result = await getProductAIConfig(prisma, 'p-1');
      expect(result).toEqual({ config: typed });
      expect(findUnique).toHaveBeenCalledWith({ where: { productId: 'p-1' } });
      expect(findMany).not.toHaveBeenCalled();
    });

    it('returns { config: null } when typed row is missing, no plan fallback', async () => {
      const { prisma, findMany } = makePrisma({
        typed: null,
        plans: [{ aiConfig: { tone: 'CONSULTIVE' } }],
      });
      const result = await getProductAIConfig(prisma, 'p-1');
      expect(result).toEqual({ config: null });
      expect(findMany).not.toHaveBeenCalled();
    });
  });

  describe('flag ON', () => {
    beforeEach(() => {
      process.env[ENV_KEY] = 'true';
    });

    it('prefers the typed row and never queries plans when present', async () => {
      const typed = { id: 'cfg-1', productId: 'p-1' };
      const { prisma, findMany } = makePrisma({
        typed,
        plans: [{ aiConfig: { tone: 'CONSULTIVE' } }],
      });
      const result = await getProductAIConfig(prisma, 'p-1');
      expect(result).toEqual({ config: typed });
      expect(findMany).not.toHaveBeenCalled();
    });

    it('falls back to the first non-empty per-plan aiConfig JSON when typed is missing', async () => {
      const planBlob = { tone: 'AGGRESSIVE', persistenceLevel: 5 };
      const { prisma, findMany } = makePrisma({
        typed: null,
        plans: [{ aiConfig: null }, { aiConfig: planBlob }],
      });
      const result = await getProductAIConfig(prisma, 'p-1');
      expect(result).toEqual({ config: planBlob });
      expect(findMany).toHaveBeenCalledWith({
        where: { productId: 'p-1' },
        select: { aiConfig: true },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('stays { config: null } when typed is missing and no plan carries aiConfig', async () => {
      const { prisma } = makePrisma({
        typed: null,
        plans: [{ aiConfig: null }, { aiConfig: undefined }],
      });
      const result = await getProductAIConfig(prisma, 'p-1');
      expect(result).toEqual({ config: null });
    });

    it('ignores non-object plan aiConfig values during fallback', async () => {
      const { prisma } = makePrisma({
        typed: null,
        plans: [{ aiConfig: 'not-an-object' }, { aiConfig: 42 }],
      });
      const result = await getProductAIConfig(prisma, 'p-1');
      expect(result).toEqual({ config: null });
    });
  });
});
