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
    expect(result.success).toBe(false);
    expect(result.error).toBe('unknown_service');
    expect(result.detail).toContain('NonexistentService');
  });

  it('returns unknown_service when ModuleRef throws', async () => {
    capGet().mockReturnValue(stubCapability({ domainService: 'AccountService.updateBankAccount' }));
    refGet().mockImplementation(() => {
      throw new Error('DI container error');
    });

    const result = await resolver.tryExecute('bank_cap', 'ws-1', {});

    expect(result).not.toBeNull();
    expect(result.success).toBe(false);
    expect(result.error).toBe('unknown_service');
    expect(result.detail).toContain('AccountService');
  });

  it('returns unknown_service when ModuleRef returns undefined', async () => {
    capGet().mockReturnValue(stubCapability({ domainService: 'AccountService.updateBankAccount' }));
    refGet().mockReturnValue(undefined);

    const result = await resolver.tryExecute('bank_cap', 'ws-1', {});

    expect(result).not.toBeNull();
    expect(result.success).toBe(false);
    expect(result.error).toBe('unknown_service');
  });

  it('returns method_not_found when method does not exist on service instance', async () => {
    const mockInstance = { existingMethod: jest.fn() };
    capGet().mockReturnValue(stubCapability({ domainService: 'AccountService.missingMethod' }));
    refGet().mockReturnValue(mockInstance);

    const result = await resolver.tryExecute('bad_method', 'ws-1', {});

    expect(result).not.toBeNull();
    expect(result.success).toBe(false);
    expect(result.error).toBe('method_not_found');
    expect(result.detail).toContain('missingMethod');
    expect(result.detail).toContain('AccountService');
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
    expect(result.success).toBe(false);
    expect(result.error).toBe('service_call_failed');
    expect(result.detail).toBe('DB connection lost');
  });

  it('handles non-Error throws gracefully', async () => {
    const failingMethod = jest.fn().mockRejectedValue('raw string error');
    const mockInstance = { doStuff: failingMethod };
    capGet().mockReturnValue(stubCapability({ domainService: 'BillingService.doStuff' }));
    refGet().mockReturnValue(mockInstance);

    const result = await resolver.tryExecute('raw_error', 'ws-1', {});

    expect(result.success).toBe(false);
    expect(result.error).toBe('service_call_failed');
    expect(result.detail).toBe('raw string error');
  });

  it('passes workspaceId as first argument always', async () => {
    const capture = jest.fn().mockResolvedValue({ success: true });
    const mockInstance = { doThing: capture };
    capGet().mockReturnValue(stubCapability({ domainService: 'AccountService.doThing' }));
    refGet().mockReturnValue(mockInstance);

    await resolver.tryExecute('ws_isolation', 'ws-isolated-99', { extra: 'data' });

    expect(capture).toHaveBeenCalledWith('ws-isolated-99', { extra: 'data' });
  });
});
