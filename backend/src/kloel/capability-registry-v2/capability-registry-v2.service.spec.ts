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

// ── Mock CAPABILITY_DEFINITIONS so describe / listGaps have predictable data ──

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

// The mocked CAPABILITY_MAP must be populated for describe() lookups.
// We import the mocked module and populate it in beforeEach.
const mockedConst = jest.requireMock('./capability-registry-v2.const');

describe('CapabilityRegistryV2Service — describe', () => {
  let service: CapabilityRegistryV2Service;
  let moduleRef: Pick<ModuleRef, 'get'>;

  beforeEach(async () => {
    // Rebuild the map from the mocked definitions
    mockedConst.CAPABILITY_MAP = new Map(
      mockedConst.CAPABILITY_DEFINITIONS.map((c: CapabilityDefinition) => [c.id, c]),
    );

    moduleRef = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CapabilityRegistryV2Service,
        { provide: ModuleRef, useValue: moduleRef },
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

  it('returns correct fields for a capability with no emits and no args', () => {
    const result = service.describe('self.health');

    expect(result).not.toBeNull();
    expect(result!.id).toBe('self.health');
    expect(result!.args).toEqual([]);
    expect(result!.output).toEqual(['health.snapshot']);
  });
});

describe('CapabilityRegistryV2Service — listGaps', () => {
  let service: CapabilityRegistryV2Service;
  let moduleRef: { get: jest.Mock };

  beforeEach(async () => {
    mockedConst.CAPABILITY_MAP = new Map(
      mockedConst.CAPABILITY_DEFINITIONS.map((c: CapabilityDefinition) => [c.id, c]),
    );

    moduleRef = { get: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CapabilityRegistryV2Service,
        { provide: ModuleRef, useValue: moduleRef },
      ],
    }).compile();

    service = module.get(CapabilityRegistryV2Service);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('identifies capabilities whose domainService references an unknown service', async () => {
    // BogusService is not in DOMAIN_SERVICE_TOKEN_MAP
    // ProductService IS in the map — mock it as resolvable with method
    const mockProductService = { create: jest.fn() };
    moduleRef.get.mockImplementation((token: unknown) => {
      if (token === DOMAIN_SERVICE_TOKEN_MAP.get('ProductService')) {
        return mockProductService;
      }
      return undefined;
    });

    const gaps = await service.listGaps();

    // orphan_cap → BogusService (unknown)
    const orphanGap = gaps.find((g) => g.id === 'orphan_cap');
    expect(orphanGap).toBeDefined();
    expect(orphanGap!.declaredService).toBe('BogusService.doThing');
    expect(orphanGap!.missingMethod).toBe('BogusService (unknown service)');

    // empty_domain_cap, alias_cap, compound_cap → skipped (not gaps)
    expect(gaps.find((g) => g.id === 'empty_domain_cap')).toBeUndefined();
    expect(gaps.find((g) => g.id === 'alias_cap')).toBeUndefined();
    expect(gaps.find((g) => g.id === 'compound_cap')).toBeUndefined();

    // create_product → ProductService.create, method exists → not a gap
    expect(gaps.find((g) => g.id === 'create_product')).toBeUndefined();
  });

  it('identifies capabilities whose service resolves but method is missing', async () => {
    // HealthService with no 'snapshot' method
    const mockHealthService = { ping: jest.fn() }; // no snapshot
    moduleRef.get.mockImplementation((token: unknown) => {
      if (token === DOMAIN_SERVICE_TOKEN_MAP.get('HealthService')) {
        return mockHealthService;
      }
      return undefined;
    });

    const gaps = await service.listGaps();

    // self.health → HealthService.snapshot, but snapshot doesn't exist
    const healthGap = gaps.find((g) => g.id === 'self.health');
    expect(healthGap).toBeDefined();
    expect(healthGap!.declaredService).toBe('HealthService.snapshot');
    expect(healthGap!.missingMethod).toBe('HealthService.snapshot');
  });

  it('reports CapabilityRegistry self-reference gaps for non-existent methods', async () => {
    const gaps = await service.listGaps();

    // self.bogus_method → CapabilityRegistry.nonExistentMethod
    const bogusGap = gaps.find((g) => g.id === 'self.bogus_method');
    expect(bogusGap).toBeDefined();
    expect(bogusGap!.declaredService).toBe('CapabilityRegistry.nonExistentMethod');
    expect(bogusGap!.missingMethod).toBe('CapabilityRegistry.nonExistentMethod');

    // self.capabilities → CapabilityRegistry.filterFor — method exists on service
    expect(gaps.find((g) => g.id === 'self.capabilities')).toBeUndefined();
  });

  it('handles ModuleRef throwing during resolution', async () => {
    moduleRef.get.mockImplementation(() => {
      throw new Error('DI container error');
    });

    const gaps = await service.listGaps();

    // self.health → HealthService.snapshot, but DI throws
    const healthGap = gaps.find((g) => g.id === 'self.health');
    expect(healthGap).toBeDefined();
    expect(healthGap!.missingMethod).toBe('HealthService (DI unavailable)');
  });

  it('handles ModuleRef returning undefined', async () => {
    moduleRef.get.mockReturnValue(undefined);

    const gaps = await service.listGaps();

    // self.health → HealthService.snapshot, DI returns undefined
    const healthGap = gaps.find((g) => g.id === 'self.health');
    expect(healthGap).toBeDefined();
    expect(healthGap!.missingMethod).toBe('HealthService (undefined instance)');
  });

  it('returns empty array when all capabilities have valid domainServices', async () => {
    const mockHealthService = { snapshot: jest.fn() };
    const mockProductService = { create: jest.fn() };

    moduleRef.get.mockImplementation((token: unknown) => {
      if (token === DOMAIN_SERVICE_TOKEN_MAP.get('HealthService')) return mockHealthService;
      if (token === DOMAIN_SERVICE_TOKEN_MAP.get('ProductService')) return mockProductService;
      return undefined;
    });

    const gaps = await service.listGaps();

    // orphan_cap → BogusService is unknown → still a gap
    // self.bogus_method → CapabilityRegistry.nonExistentMethod → still a gap
    // But self.health and create_product should be resolved
    expect(gaps.find((g) => g.id === 'self.health')).toBeUndefined();
    expect(gaps.find((g) => g.id === 'create_product')).toBeUndefined();

    // The orphan and bogus self-ref are still gaps
    expect(gaps.find((g) => g.id === 'orphan_cap')).toBeDefined();
    expect(gaps.find((g) => g.id === 'self.bogus_method')).toBeDefined();
  });
});
