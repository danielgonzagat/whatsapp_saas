import { Test, TestingModule } from '@nestjs/testing';
import { ModuleRef } from '@nestjs/core';
import { KloelDomainServiceResolver } from './domain-service-resolver.service';
import { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
import type { CapabilityDefinition } from './capability-registry-v2/capability-registry-v2.types';

/**
 * Build a minimal CapabilityDefinition stub used in the tests below.
 * Only the fields consumed by the resolver are populated.
 */
function stubCapability(overrides: Partial<CapabilityDefinition>): CapabilityDefinition {
  return {
    id: 'test.cap',
    title: 'Test Capability',
    description: 'Test',
    category: 'QUERY',
    tier: 0,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [],
    domainService: '',
    emits: [],
    surface: ['*'],
    ...overrides,
  };
}

describe('KloelDomainServiceResolver', () => {
  let resolver: KloelDomainServiceResolver;
  let moduleRef: Pick<ModuleRef, 'get'>;
  let capRegistry: Pick<CapabilityRegistryV2Service, 'get'>;

  beforeEach(async () => {
    moduleRef = { get: jest.fn() };
    capRegistry = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KloelDomainServiceResolver,
        { provide: ModuleRef, useValue: moduleRef },
        { provide: CapabilityRegistryV2Service, useValue: capRegistry },
      ],
    }).compile();

    resolver = module.get(KloelDomainServiceResolver);
  });

  /** Typed accessors so eslint's no-unsafe-* / unbound-method rules stay happy. */
  const capGet = () => jest.mocked(capRegistry.get);
  const refGet = () => jest.mocked(moduleRef.get);

  // ── compound dispatch: MediaService.attach + {Product,Plan}Service.setImage ──

  describe('compound dispatch (image upload)', () => {
    /**
     * Wire ModuleRef to return distinct mock instances per service token. The
     * resolver looks tokens up by class reference, so the mock matches on the
     * class's runtime `.name` and returns the matching stub instance.
     */
    function wireServices(instances: Record<string, object>): void {
      refGet().mockImplementation((token: unknown) => {
        const name = (token as { name?: string } | undefined)?.name;
        return name ? instances[name] : undefined;
      });
    }

    it('attaches the image then calls setImage with the injected URL (product)', async () => {
      const attach = jest.fn().mockResolvedValue({
        success: true,
        data: { url: 'https://cdn.example/img/abc.jpg', path: 'media/ws-7/abc.jpg', size: 1234 },
      });
      const setImage = jest.fn().mockResolvedValue({ success: true, product: { id: 'p-1' } });
      wireServices({
        MediaService: { attach },
        ProductService: { setImage },
      });
      capGet().mockReturnValue(
        stubCapability({ domainService: 'MediaService.attach + ProductService.setImage' }),
      );

      const args = { productId: 'p-1', imageBase64: 'AAAA', actorId: 'user-9' };
      const result = await resolver.tryExecute('products.upload_image', 'ws-7', args);

      // Step 1: attach received the original (workspaceId, args) convention.
      expect(attach).toHaveBeenCalledWith('ws-7', args);
      // Step 2: setImage received the POSITIONAL signature with the uploaded URL.
      expect(setImage).toHaveBeenCalledWith('ws-7', 'p-1', 'https://cdn.example/img/abc.jpg', {
        id: 'user-9',
      });
      // Returns the setImage (second-step) result.
      expect(result).toEqual({ success: true, product: { id: 'p-1' } });
    });

    it('attaches the image then calls setImage with the injected URL (plan)', async () => {
      const attach = jest.fn().mockResolvedValue({
        success: true,
        data: { url: 'https://cdn.example/img/plan.png', path: 'media/ws-3/plan.png', size: 99 },
      });
      const setImage = jest.fn().mockResolvedValue({ success: true, plan: { id: 'pl-2' } });
      wireServices({
        MediaService: { attach },
        PlanService: { setImage },
      });
      capGet().mockReturnValue(
        stubCapability({ domainService: 'MediaService.attach + PlanService.setImage' }),
      );

      const args = { planId: 'pl-2', imageData: 'BBBB' };
      const result = await resolver.tryExecute('upload_plan_image', 'ws-3', args);

      expect(attach).toHaveBeenCalledWith('ws-3', args);
      // No actorId supplied → defaults to the chat dispatch actor.
      expect(setImage).toHaveBeenCalledWith('ws-3', 'pl-2', 'https://cdn.example/img/plan.png', {
        id: 'kloel-chat',
      });
      expect(result).toEqual({ success: true, plan: { id: 'pl-2' } });
    });

    it('propagates the attach failure and does NOT call setImage', async () => {
      const attach = jest
        .fn()
        .mockResolvedValue({ success: false, data: null, error: 'invalid_image_payload' });
      const setImage = jest.fn();
      wireServices({
        MediaService: { attach },
        ProductService: { setImage },
      });
      capGet().mockReturnValue(
        stubCapability({ domainService: 'MediaService.attach + ProductService.setImage' }),
      );

      const result = await resolver.tryExecute('products.upload_image', 'ws-7', {
        productId: 'p-1',
        imageBase64: 'not-valid',
      });

      expect(attach).toHaveBeenCalledTimes(1);
      expect(setImage).not.toHaveBeenCalled();
      expect(result).toEqual({ success: false, data: null, error: 'invalid_image_payload' });
    });

    it('does NOT clobber an imageUrl the caller already provided', async () => {
      const attach = jest.fn().mockResolvedValue({
        success: true,
        data: { url: 'https://cdn.example/img/uploaded.jpg', path: 'p', size: 1 },
      });
      const setImage = jest.fn().mockResolvedValue({ success: true });
      wireServices({
        MediaService: { attach },
        ProductService: { setImage },
      });
      capGet().mockReturnValue(
        stubCapability({ domainService: 'MediaService.attach + ProductService.setImage' }),
      );

      await resolver.tryExecute('products.upload_image', 'ws-7', {
        productId: 'p-1',
        imageUrl: 'https://caller.example/original.jpg',
        actorId: 'user-1',
      });

      // setImage must persist the CALLER's URL, not the freshly attached one.
      expect(setImage).toHaveBeenCalledWith('ws-7', 'p-1', 'https://caller.example/original.jpg', {
        id: 'user-1',
      });
    });

    it('returns image_upload_no_url when attach succeeds without a usable URL', async () => {
      const attach = jest.fn().mockResolvedValue({ success: true, data: null });
      const setImage = jest.fn();
      wireServices({
        MediaService: { attach },
        ProductService: { setImage },
      });
      capGet().mockReturnValue(
        stubCapability({ domainService: 'MediaService.attach + ProductService.setImage' }),
      );

      const result = await resolver.tryExecute('products.upload_image', 'ws-7', {
        productId: 'p-1',
      });

      expect(setImage).not.toHaveBeenCalled();
      expect(result!.success).toBe(false);
      expect(result!.error).toBe('image_upload_no_url');
    });

    it('returns entity_id_required when the entity id is missing for setImage', async () => {
      const attach = jest.fn().mockResolvedValue({
        success: true,
        data: { url: 'https://cdn.example/img/x.jpg', path: 'p', size: 1 },
      });
      const setImage = jest.fn();
      wireServices({
        MediaService: { attach },
        ProductService: { setImage },
      });
      capGet().mockReturnValue(
        stubCapability({ domainService: 'MediaService.attach + ProductService.setImage' }),
      );

      const result = await resolver.tryExecute('products.upload_image', 'ws-7', {
        imageBase64: 'AAAA',
      });

      expect(setImage).not.toHaveBeenCalled();
      expect(result!.success).toBe(false);
      expect(result!.error).toBe('entity_id_required');
      expect(result!.detail).toContain('productId');
    });

    it('propagates a setImage failure (e.g. workspace ownership rejection)', async () => {
      const attach = jest.fn().mockResolvedValue({
        success: true,
        data: { url: 'https://cdn.example/img/x.jpg', path: 'p', size: 1 },
      });
      const setImage = jest.fn().mockRejectedValue(new Error('Product not found'));
      wireServices({
        MediaService: { attach },
        ProductService: { setImage },
      });
      capGet().mockReturnValue(
        stubCapability({ domainService: 'MediaService.attach + ProductService.setImage' }),
      );

      const result = await resolver.tryExecute('products.upload_image', 'ws-7', {
        productId: 'p-foreign',
        imageBase64: 'AAAA',
      });

      expect(attach).toHaveBeenCalledTimes(1);
      expect(result!.success).toBe(false);
      expect(result!.error).toBe('service_call_failed');
      expect(result!.detail).toBe('Product not found');
    });

    it('returns invalid_compound_capability for a malformed compound (3 parts)', async () => {
      capGet().mockReturnValue(stubCapability({ domainService: 'A.x + B.y + C.z' }));

      const result = await resolver.tryExecute('bad_compound', 'ws-1', {});

      expect(result!.success).toBe(false);
      expect(result!.error).toBe('invalid_compound_capability');
      expect(refGet()).not.toHaveBeenCalled();
    });

    it('returns invalid_compound_capability when a compound part has no dot', async () => {
      capGet().mockReturnValue(stubCapability({ domainService: 'MediaService.attach + NoDot' }));

      const result = await resolver.tryExecute('bad_compound2', 'ws-1', {});

      expect(result!.success).toBe(false);
      expect(result!.error).toBe('invalid_compound_capability');
    });

    it('returns unknown_service when the attach service is not in the token map', async () => {
      capGet().mockReturnValue(
        stubCapability({ domainService: 'GhostService.attach + ProductService.setImage' }),
      );
      refGet().mockReturnValue(undefined);

      const result = await resolver.tryExecute('ghost_compound', 'ws-1', { productId: 'p-1' });

      expect(result!.success).toBe(false);
      expect(result!.error).toBe('unknown_service');
      expect(result!.detail).toContain('GhostService');
    });
  });
});
