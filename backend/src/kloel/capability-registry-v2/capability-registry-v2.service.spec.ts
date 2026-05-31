import { Test, TestingModule } from '@nestjs/testing';
import { ModuleRef, ModulesContainer } from '@nestjs/core';
import { CapabilityRegistryV2Service } from './capability-registry-v2.service';
import type { CapabilityDefinition } from './capability-registry-v2.types';

// ── Stub helpers ──

function stubCapability(overrides: Partial<CapabilityDefinition>): CapabilityDefinition {
  return {
    id: 'test.cap',
    title: 'Test Capability',
    description: 'Does something useful',
    category: 'QUERY',
    tier: 5,
    requiresConfirmation: false,
    requiredPermissions: [],
    inputSchema: [],
    domainService: '',
    emits: [],
    surface: ['*'],
    ...overrides,
  };
}

/** Build a mock ModulesContainer from a record of constructor-name → instance. */
function mockModulesContainer(instances: Record<string, object>): ModulesContainer {
  const wrapper = (name: string, instance: object) => ({
    instance,
    name,
    isNotMetatype: false,
    isLazy: false,
    isExported: false,
    isAlias: false,
    isDependencyTreeStatic: () => true,
    isTransient: false,
    metatype: instance.constructor,
    scope: undefined,
  });

  const providers = new Map(
    Object.entries(instances).map(([name, inst]) => [name, wrapper(name, inst)]),
  );

  const mod = { providers, controllers: new Map(), exports: new Set(), imports: new Set() };
  return new Map([['TestModule', mod]]) as unknown as ModulesContainer;
}

// ── Mock CAPABILITY_DEFINITIONS ──

jest.mock('./capability-registry-v2.const', () => ({
  CAPABILITY_DEFINITIONS: [
    stubCapability({
      id: 'self.health',
      title: 'Saúde',
      description: 'Status do sistema',
      tier: 0,
      inputSchema: [],
      domainService: 'HealthService.snapshot',
      emits: ['health.snapshot'],
    }),
    stubCapability({
      id: 'create_product',
      title: 'Criar Produto',
      description: 'Cria um novo produto',
      tier: 1,
      inputSchema: [
        { key: 'name', type: 'string', label: 'Nome', required: true },
        { key: 'price', type: 'number', label: 'Preço', required: false },
      ],
      domainService: 'ProductService.create',
      emits: ['product.created'],
    }),
    stubCapability({
      id: 'orphan_cap',
      title: 'Orphan',
      description: 'References unknown service',
      tier: 3,
      inputSchema: [],
      domainService: 'BogusService.doThing',
      emits: [],
    }),
    stubCapability({
      id: 'empty_domain_cap',
      title: 'No domain',
      description: 'Has no domainService',
      tier: 0,
      inputSchema: [],
      domainService: '',
      emits: [],
    }),
    stubCapability({
      id: 'alias_cap',
      title: 'Alias',
      description: 'Has an alias placeholder',
      tier: 0,
      inputSchema: [],
      domainService: 'Alias for something.else',
      emits: [],
    }),
    stubCapability({
      id: 'compound_cap',
      title: 'Compound',
      description: 'Has a compound domainService',
      tier: 0,
      inputSchema: [],
      domainService: 'MediaService.attach + ProductService.setImage',
      emits: [],
    }),
    stubCapability({
      id: 'self.capabilities',
      title: 'Listar Capacidades',
      description: 'Lista capacidades',
      tier: 0,
      inputSchema: [],
      domainService: 'CapabilityRegistry.filterFor',
      emits: [],
    }),
    stubCapability({
      id: 'self.bogus_method',
      title: 'Bogus self-ref',
      description: 'References non-existent method on CapabilityRegistry',
      tier: 0,
      inputSchema: [],
      domainService: 'CapabilityRegistry.nonExistentMethod',
      emits: [],
    }),
  ],
  CAPABILITY_MAP: new Map(),
  CAPABILITIES_BY_TIER: {},
}));

const mockedConst: {
  CAPABILITY_MAP: Map<string, CapabilityDefinition>;
  CAPABILITY_DEFINITIONS: CapabilityDefinition[];
} = jest.requireMock('./capability-registry-v2.const');

describe('CapabilityRegistryV2Service — describe', () => {
  let service: CapabilityRegistryV2Service;

  beforeEach(async () => {
    mockedConst.CAPABILITY_MAP = new Map(
      mockedConst.CAPABILITY_DEFINITIONS.map((cap: CapabilityDefinition) => [cap.id, cap] as const),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CapabilityRegistryV2Service,
        { provide: ModuleRef, useValue: { get: jest.fn() } },
        { provide: ModulesContainer, useValue: new Map() },
      ],
    }).compile();

    service = module.get(CapabilityRegistryV2Service);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns structured summary for a known capability', () => {
    const result = service.describe('create_product');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('create_product');
    expect(result!.description).toBe('Cria um novo produto');
    expect(result!.args).toEqual([
      { key: 'name', type: 'string', label: 'Nome', required: true },
      { key: 'price', type: 'number', label: 'Preço', required: false },
    ]);
    expect(result!.output).toEqual(['product.created']);
    expect(result!.domainService).toBe('ProductService.create');
    expect(result!.tier).toBe(1);
  });

  it('returns null for an unknown capability', () => {
    const result = service.describe('nonexistent');
    expect(result).toBeNull();
  });

  it('returns correct fields for a capability with no args', () => {
    const result = service.describe('self.health');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('self.health');
    expect(result!.args).toEqual([]);
    expect(result!.output).toEqual(['health.snapshot']);
  });
});

describe('CapabilityRegistryV2Service — listGaps', () => {
  async function setupService(instances: Record<string, object> = {}) {
    mockedConst.CAPABILITY_MAP = new Map(
      mockedConst.CAPABILITY_DEFINITIONS.map((cap: CapabilityDefinition) => [cap.id, cap] as const),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CapabilityRegistryV2Service,
        { provide: ModuleRef, useValue: { get: jest.fn() } },
        { provide: ModulesContainer, useValue: mockModulesContainer(instances) },
      ],
    }).compile();

    return module.get(CapabilityRegistryV2Service);
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('identifies capabilities whose domainService references an unknown service', async () => {
    const service = await setupService({
      ProductService: { create: jest.fn() },
    });

    const gaps = service.listGaps();

    // self.health → HealthService.snapshot, HealthService not in container
    const healthGap = gaps.find((g) => g.id === 'self.health');
    expect(healthGap).toBeDefined();
    expect(healthGap!.declaredService).toBe('HealthService.snapshot');
    expect(healthGap!.missingMethod).toBe('HealthService (not found in DI container)');

    // orphan_cap → BogusService.doThing, not in container
    const orphanGap = gaps.find((g) => g.id === 'orphan_cap');
    expect(orphanGap).toBeDefined();
    expect(orphanGap!.declaredService).toBe('BogusService.doThing');
    expect(orphanGap!.missingMethod).toBe('BogusService (not found in DI container)');

    // create_product → ProductService.create, method exists → not a gap
    expect(gaps.find((g) => g.id === 'create_product')).toBeUndefined();

    // empty_domain_cap, alias_cap, compound_cap → skipped
    expect(gaps.find((g) => g.id === 'empty_domain_cap')).toBeUndefined();
    expect(gaps.find((g) => g.id === 'alias_cap')).toBeUndefined();
    expect(gaps.find((g) => g.id === 'compound_cap')).toBeUndefined();
  });

  it('identifies capabilities whose service exists but method is missing', async () => {
    // HealthService present but without snapshot method
    const service = await setupService({
      HealthService: { ping: jest.fn() },
    });

    const gaps = service.listGaps();

    // self.health → HealthService.snapshot, but snapshot doesn't exist
    const healthGap = gaps.find((g) => g.id === 'self.health');
    expect(healthGap).toBeDefined();
    expect(healthGap!.declaredService).toBe('HealthService.snapshot');
    expect(healthGap!.missingMethod).toBe('HealthService.snapshot');
  });

  it('reports CapabilityRegistry self-reference gaps for non-existent methods', async () => {
    const service = await setupService({});

    const gaps = service.listGaps();

    // self.bogus_method → CapabilityRegistry.nonExistentMethod
    const bogusGap = gaps.find((g) => g.id === 'self.bogus_method');
    expect(bogusGap).toBeDefined();
    expect(bogusGap!.declaredService).toBe('CapabilityRegistry.nonExistentMethod');
    expect(bogusGap!.missingMethod).toBe('CapabilityRegistry.nonExistentMethod');

    // self.capabilities → CapabilityRegistry.filterFor — method exists
    expect(gaps.find((g) => g.id === 'self.capabilities')).toBeUndefined();
  });

  it('only reports true gaps when services are properly registered', async () => {
    const service = await setupService({
      HealthService: { snapshot: jest.fn() },
      ProductService: { create: jest.fn() },
    });

    const gaps = service.listGaps();

    // Resolvable services with matching methods → not gaps
    expect(gaps.find((g) => g.id === 'self.health')).toBeUndefined();
    expect(gaps.find((g) => g.id === 'create_product')).toBeUndefined();

    // orphan_cap (BogusService unknown) and self.bogus_method are still gaps
    expect(gaps.find((g) => g.id === 'orphan_cap')).toBeDefined();
    expect(gaps.find((g) => g.id === 'self.bogus_method')).toBeDefined();
  });

  it('handles empty container — all DI-dependent caps are gaps', async () => {
    const service = await setupService({});

    const gaps = service.listGaps();

    // self.health → HealthService not found → gap
    expect(gaps.find((g) => g.id === 'self.health')).toBeDefined();
    // create_product → ProductService not found → gap
    expect(gaps.find((g) => g.id === 'create_product')).toBeDefined();
    // self.capabilities → CapabilityRegistry.filterFor exists → not a gap
    expect(gaps.find((g) => g.id === 'self.capabilities')).toBeUndefined();
    // Skipped caps still skipped
    expect(gaps.find((g) => g.id === 'empty_domain_cap')).toBeUndefined();
  });
});
