import { Test } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../../prisma/prisma.service';
import { AuditService } from '../../../audit/audit.service';
import { ProductService } from '../../../products/product.service';
import { MindEventSpine } from '../../mind/coordination';
import { KloelDomainServiceResolver } from '../../domain-service-resolver.service';
import { CapabilityRegistryV2Service } from '../capability-registry-v2.service';
import { CAPABILITY_MAP } from '../capability-registry-v2.const';
import { TIER_1_PRODUCTS_CAPABILITIES } from './tier-1-products';

/**
 * Wave7 L1 — fine-grained product capabilities (Y-1/Y-2).
 *
 * Proves, per capability, the full chain:
 *   capability registered → resolver dispatch → real ProductService method →
 *   ProductResult receipt (success + product, never Prisma-direct here).
 */
describe('tier-1 fine-grained product capabilities (Wave7 L1)', () => {
  const ws = 'ws-fg-1';
  const productId = 'prod-fg-1';

  const FINE_GRAINED = [
    'products.set_pixels',
    'products.set_shipping',
    'products.set_fulfillment',
    'products.set_sales_page',
    'products.update_urls',
    'products.toggle_availability',
    'products.review_and_publish',
  ] as const;

  // ── Registry: every fine-grained cap is registered with a real domainService ──
  describe('registry contract', () => {
    it('registers all 7 fine-grained capabilities in the products partition', () => {
      for (const id of FINE_GRAINED) {
        const cap = TIER_1_PRODUCTS_CAPABILITIES.find((c) => c.id === id);
        expect(cap).toBeDefined();
        expect(cap.domainService.startsWith('ProductService.')).toBe(true);
        expect(cap.requiredPermissions).toContain('product:write');
        expect(cap.tier).toBe(1);
        expect(cap.evidenceUrlBuilder).toBe('/produtos/${productId}');
      }
    });

    it('flags review_and_publish as MUTATION_SENSITIVE requiring confirmation', () => {
      const cap = TIER_1_PRODUCTS_CAPABILITIES.find((c) => c.id === 'products.review_and_publish');
      expect(cap.category).toBe('MUTATION_SENSITIVE');
      expect(cap.requiresConfirmation).toBe(true);
    });

    it('exposes the caps through the global CAPABILITY_MAP', () => {
      for (const id of FINE_GRAINED) {
        expect(CAPABILITY_MAP.get(id)).toBeDefined();
      }
    });
  });

  // ── Dispatch: resolver routes each cap id to the real ProductService method ──
  describe('dispatch → domain-service → receipt', () => {
    let resolver: KloelDomainServiceResolver;
    let product: ProductService;
    let prisma: {
      product: {
        findFirst: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock<
          Promise<Record<string, unknown>>,
          [{ where: { id: string }; data: Record<string, unknown> }]
        >;
      };
    };

    const makeProduct = (overrides: Record<string, unknown> = {}) => ({
      id: productId,
      workspaceId: ws,
      name: 'P',
      price: 10,
      status: 'DRAFT',
      active: false,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    });

    beforeEach(async () => {
      prisma = {
        product: {
          findFirst: jest.fn().mockResolvedValue(makeProduct()),
          findUnique: jest.fn().mockResolvedValue(makeProduct()),
          update: jest
            .fn<
              Promise<Record<string, unknown>>,
              [{ where: { id: string }; data: Record<string, unknown> }]
            >()
            .mockImplementation(({ where, data }) =>
              Promise.resolve(makeProduct({ id: where.id, ...data })),
            ),
        },
      };

      const moduleRef = await Test.createTestingModule({
        providers: [
          ProductService,
          { provide: PrismaService, useValue: prisma },
          { provide: AuditService, useValue: { log: jest.fn() } },
          {
            provide: MindEventSpine,
            useValue: { recordCommercial: jest.fn().mockResolvedValue('ok') },
          },
        ],
      }).compile();
      product = moduleRef.get(ProductService);

      // Real capability registry (so resolver reads the actual domainService strings),
      // ModuleRef stubbed to return our ProductService instance for the token.
      const capRegistry = {
        get: (id: string) => CAPABILITY_MAP.get(id),
      } as Pick<CapabilityRegistryV2Service, 'get'>;
      const fakeModuleRef = {
        get: () => product,
      } as unknown as ModuleRef;

      resolver = new KloelDomainServiceResolver(
        fakeModuleRef,
        capRegistry as CapabilityRegistryV2Service,
      );
    });

    it('products.set_pixels → ProductService.setPixels persists pixels in metadata', async () => {
      const result = await resolver.tryExecute('products.set_pixels', ws, {
        productId,
        pixels: [{ type: 'FACEBOOK', pixelId: 'fb-1' }],
      });
      expect(result).not.toBeNull();
      expect(result.success).toBe(true);
      const data = prisma.product.update.mock.calls[0][0].data as {
        metadata: { pixels: unknown };
      };
      expect(data.metadata.pixels).toEqual([{ type: 'FACEBOOK', pixelId: 'fb-1' }]);
    });

    it('products.set_shipping → ProductService.setShipping writes real shipping columns', async () => {
      const result = await resolver.tryExecute('products.set_shipping', ws, {
        productId,
        shippingType: 'FIXED',
        shippingValue: 25,
        warrantyDays: 7,
      });
      expect(result.success).toBe(true);
      const data = prisma.product.update.mock.calls[0][0].data;
      expect(data.shippingType).toBe('FIXED');
      expect(data.shippingValue).toBe(25);
      expect(data.warrantyDays).toBe(7);
    });

    it('products.set_fulfillment → ProductService.setFulfillment writes provider + metadata', async () => {
      const result = await resolver.tryExecute('products.set_fulfillment', ws, {
        productId,
        provider: 'correios',
      });
      expect(result.success).toBe(true);
      const data = prisma.product.update.mock.calls[0][0].data;
      expect(data.afterPayShippingProvider).toBe('correios');
    });

    it('products.set_sales_page → ProductService.setSalesPage writes salesPageUrl', async () => {
      const result = await resolver.tryExecute('products.set_sales_page', ws, {
        productId,
        salesPageUrl: 'https://vendas.exemplo.com',
      });
      expect(result.success).toBe(true);
      const data = prisma.product.update.mock.calls[0][0].data;
      expect(data.salesPageUrl).toBe('https://vendas.exemplo.com');
    });

    it('products.update_urls → ProductService.updateUrls writes post-purchase URLs', async () => {
      const result = await resolver.tryExecute('products.update_urls', ws, {
        productId,
        thankyouUrl: 'https://obrigado.exemplo.com',
        supportEmail: 'suporte@exemplo.com',
      });
      expect(result.success).toBe(true);
      const data = prisma.product.update.mock.calls[0][0].data;
      expect(data.thankyouUrl).toBe('https://obrigado.exemplo.com');
      expect(data.supportEmail).toBe('suporte@exemplo.com');
    });

    it('products.toggle_availability → ProductService.toggleAvailabilityFor flips active', async () => {
      const result = await resolver.tryExecute('products.toggle_availability', ws, {
        productId,
        available: true,
      });
      expect(result.success).toBe(true);
      const data = prisma.product.update.mock.calls[0][0].data;
      expect(data.active).toBe(true);
    });

    it('products.review_and_publish → ProductService.reviewAndPublish marks APPROVED+active', async () => {
      const result = await resolver.tryExecute('products.review_and_publish', ws, { productId });
      expect(result.success).toBe(true);
      const data = prisma.product.update.mock.calls[0][0].data;
      expect(data.status).toBe('APPROVED');
      expect(data.active).toBe(true);
    });

    it('enforces workspace isolation: cross-workspace product is rejected', async () => {
      // Cross-workspace product: the workspace-scoped findFirst misses it (null),
      // and the id-only existence probe finds it elsewhere → assertOwnedProduct
      // throws ForbiddenException, which the resolver wraps as service_call_failed.
      prisma.product.findFirst.mockResolvedValue(null);
      prisma.product.findUnique.mockResolvedValue(makeProduct({ workspaceId: 'other-ws' }));
      const result = await resolver.tryExecute('products.set_sales_page', ws, {
        productId,
        salesPageUrl: 'https://x.com',
      });
      // resolver wraps thrown ForbiddenException into service_call_failed
      expect(result.success).toBe(false);
      expect(result.error).toBe('service_call_failed');
    });
  });
});
