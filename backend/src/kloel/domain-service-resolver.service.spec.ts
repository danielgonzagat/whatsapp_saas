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

  // ── null returns (fall-through to dispatcher) ──

  it('returns null when capability is not found in registry', async () => {
    capGet().mockReturnValue(undefined);

    const result = await resolver.tryExecute('non_existent', 'ws-1', {});

    expect(result).toBeNull();
  });

  it('returns null when capability has no domainService', async () => {
    capGet().mockReturnValue(stubCapability({ domainService: '' }));

    const result = await resolver.tryExecute('no_domain', 'ws-1', {});

    expect(result).toBeNull();
  });

  it('returns null when domainService is an alias placeholder', async () => {
    capGet().mockReturnValue(stubCapability({ domainService: 'Alias for sales.create_pix' }));

    const result = await resolver.tryExecute('alias_cap', 'ws-1', {});

    expect(result).toBeNull();
  });

  it('returns null when single domainService has no dot separator', async () => {
    capGet().mockReturnValue(stubCapability({ domainService: 'NoDotHere' }));

    const result = await resolver.tryExecute('no_dot', 'ws-1', {});

    expect(result).toBeNull();
  });

  // ── error codes (single path, via invokeService) ──

  it('returns unknown_service when service name is not in the token map', async () => {
    capGet().mockReturnValue(stubCapability({ domainService: 'NonexistentService.doSomething' }));

    const result = await resolver.tryExecute('missing_svc', 'ws-1', {});

    expect(result).not.toBeNull();
    expect(result!.success).toBe(false);
    expect(result!.error).toBe('unknown_service');
    expect(result!.detail).toContain('NonexistentService');
  });

  it('returns unknown_service when ModuleRef throws', async () => {
    capGet().mockReturnValue(stubCapability({ domainService: 'AccountService.updateBankAccount' }));
    refGet().mockImplementation(() => {
      throw new Error('DI container error');
    });

    const result = await resolver.tryExecute('bank_cap', 'ws-1', {});

    expect(result).not.toBeNull();
    expect(result!.success).toBe(false);
    expect(result!.error).toBe('unknown_service');
    expect(result!.detail).toContain('AccountService');
  });

  it('returns unknown_service when ModuleRef returns undefined', async () => {
    capGet().mockReturnValue(stubCapability({ domainService: 'AccountService.updateBankAccount' }));
    refGet().mockReturnValue(undefined);

    const result = await resolver.tryExecute('bank_cap', 'ws-1', {});

    expect(result).not.toBeNull();
    expect(result!.success).toBe(false);
    expect(result!.error).toBe('unknown_service');
  });

  it('returns method_not_found when method does not exist on service instance', async () => {
    const mockInstance = { existingMethod: jest.fn() };
    capGet().mockReturnValue(stubCapability({ domainService: 'AccountService.missingMethod' }));
    refGet().mockReturnValue(mockInstance);

    const result = await resolver.tryExecute('bad_method', 'ws-1', {});

    expect(result).not.toBeNull();
    expect(result!.success).toBe(false);
    expect(result!.error).toBe('method_not_found');
    expect(result!.detail).toContain('missingMethod');
    expect(result!.detail).toContain('AccountService');
  });

  // ── successful single-path call (regression: must still work via invokeService) ──

  it('calls method with workspaceId and args, returns ToolResult on success', async () => {
    const updateBankAccount = jest.fn().mockResolvedValue({
      success: true,
      message: 'Bank account updated',
    });
    const mockInstance = { updateBankAccount };
    capGet().mockReturnValue(stubCapability({ domainService: 'AccountService.updateBankAccount' }));
    refGet().mockReturnValue(mockInstance);

    const args = { bank: '001', agency: '1234', account: '56789-0' };
    const result = await resolver.tryExecute('update_bank', 'ws-42', args);

    expect(updateBankAccount).toHaveBeenCalledWith('ws-42', args);
    expect(result).toEqual({ success: true, message: 'Bank account updated' });
  });

  it('wraps non-ToolResult return into success envelope', async () => {
    const listMethod = jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const mockInstance = { list: listMethod };
    capGet().mockReturnValue(stubCapability({ domainService: 'ProductService.list' }));
    refGet().mockReturnValue(mockInstance);

    const result = await resolver.tryExecute('list_products', 'ws-1', {});

    expect(result).toEqual({ success: true, data: [{ id: 1 }, { id: 2 }] });
  });

  // ── error propagation (single path) ──

  it('returns service_call_failed when method throws', async () => {
    const failingMethod = jest.fn().mockRejectedValue(new Error('DB connection lost'));
    const mockInstance = { doStuff: failingMethod };
    capGet().mockReturnValue(stubCapability({ domainService: 'BillingService.doStuff' }));
    refGet().mockReturnValue(mockInstance);

    const result = await resolver.tryExecute('failing_cap', 'ws-1', {});

    expect(result).not.toBeNull();
    expect(result!.success).toBe(false);
    expect(result!.error).toBe('service_call_failed');
    expect(result!.detail).toBe('DB connection lost');
  });

  it('handles non-Error throws gracefully', async () => {
    const failingMethod = jest.fn().mockRejectedValue('raw string error');
    const mockInstance = { doStuff: failingMethod };
    capGet().mockReturnValue(stubCapability({ domainService: 'BillingService.doStuff' }));
    refGet().mockReturnValue(mockInstance);

    const result = await resolver.tryExecute('raw_error', 'ws-1', {});

    expect(result!.success).toBe(false);
    expect(result!.error).toBe('service_call_failed');
    expect(result!.detail).toBe('raw string error');
  });

  it('passes workspaceId as first argument always', async () => {
    const capture = jest.fn().mockResolvedValue({ success: true });
    const mockInstance = { doThing: capture };
    capGet().mockReturnValue(stubCapability({ domainService: 'AccountService.doThing' }));
    refGet().mockReturnValue(mockInstance);

    await resolver.tryExecute('ws_isolation', 'ws-isolated-99', { extra: 'data' });

    expect(capture).toHaveBeenCalledWith('ws-isolated-99', { extra: 'data' });
  });

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
