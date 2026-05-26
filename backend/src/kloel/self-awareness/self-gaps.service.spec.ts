import { Test, TestingModule } from '@nestjs/testing';
import { SelfGapsService } from './self-gaps.service';
import { CodeAccessService } from './code-access.service';

// We need to pre-load CAPABILITY_DEFINITIONS so the module reference resolves.
// The real const is loaded at import time and is a no-op if unavailable in test.
jest.mock('../capability-registry-v2/capability-registry-v2.const', () => ({
  CAPABILITY_DEFINITIONS: [
    { id: 'self.health', title: 'Saúde', description: '', category: 'SELF_AWARENESS', tier: 0, requiresConfirmation: false, requiredPermissions: [], inputSchema: [], domainService: '', emits: [], surface: [] },
    { id: 'self.gaps', title: 'Lacunas', description: '', category: 'SELF_AWARENESS', tier: 0, requiresConfirmation: false, requiredPermissions: [], inputSchema: [], domainService: '', emits: [], surface: [] },
    { id: 'create_product', title: 'Criar Produto', description: '', category: 'MUTATION_SAFE', tier: 1, requiresConfirmation: false, requiredPermissions: [], inputSchema: [], domainService: '', emits: [], surface: [] },
    { id: 'unwired_cap', title: 'Not Wired', description: '', category: 'QUERY', tier: 5, requiresConfirmation: false, requiredPermissions: [], inputSchema: [], domainService: '', emits: [], surface: [] },
  ],
  CAPABILITY_MAP: new Map(),
  CAPABILITIES_BY_TIER: {},
}));
describe('SelfGapsService', () => {
  let service: SelfGapsService;
  let codeAccess: { search: jest.Mock };
  beforeEach(async () => {
    codeAccess = {
      search: jest.fn().mockReturnValue([]),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SelfGapsService,
        { provide: CodeAccessService, useValue: codeAccess },
      ],
    }).compile();
    service = module.get<SelfGapsService>(SelfGapsService);
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  it('returns all registry caps as unwired when dispatcher has no self-awareness cases', async () => {
    codeAccess.search.mockReturnValue([
      {
        file: 'backend/src/kloel/kloel-tool-dispatcher.service.ts',
        line: 100,
        column: 10,
        content: "case 'create_product':",
        match: "case 'create_product':",
      },
    ]);

    const result = await service.diffRegistryVsDispatcher();

    // 4 registry caps: self.health, self.gaps, create_product, unwired_cap
    // create_product is wired, so 3 unwired
    expect(result.unwired.length).toBe(3);
    expect(result.wired).toContain('create_product');
  });
  it('filters out non-dispatcher files', async () => {
    codeAccess.search.mockReturnValue([
      {
        file: 'backend/src/kloel/kloel-tool-dispatcher.service.ts',
        line: 100,
        column: 10,
        content: "case 'create_product':",
        match: "case 'create_product':",
      },
      {
        file: 'backend/src/kloel/other.service.ts',
        line: 50,
        column: 10,
        content: "case 'self.health':",
        match: "case 'self.health':",
      },
    ]);

    const result = await service.diffRegistryVsDispatcher();

    // Only create_product from dispatcher counts; self.health from other.service doesn't
    expect(result.wired).toContain('create_product');
    expect(result.wired).not.toContain('self.health');
  });
  it('returns empty unwired when all caps are wired', async () => {
    codeAccess.search.mockReturnValue([
      {
        file: 'backend/src/kloel/kloel-tool-dispatcher.service.ts',
        line: 100,
        column: 10,
        content: "case 'self.health':",
        match: "case 'self.health':",
      },
      {
        file: 'backend/src/kloel/kloel-tool-dispatcher.service.ts',
        line: 110,
        column: 10,
        content: "case 'self.gaps':",
        match: "case 'self.gaps':",
      },
      {
        file: 'backend/src/kloel/kloel-tool-dispatcher.service.ts',
        line: 120,
        column: 10,
        content: "case 'create_product':",
        match: "case 'create_product':",
      },
      {
        file: 'backend/src/kloel/kloel-tool-dispatcher.service.ts',
        line: 130,
        column: 10,
        content: "case 'unwired_cap':",
        match: "case 'unwired_cap':",
      },
    ]);

    const result = await service.diffRegistryVsDispatcher();

    expect(result.unwired.length).toBe(0);
    expect(result.wired.length).toBe(4);
  });
  it('survives empty search results', async () => {
    codeAccess.search.mockReturnValue([]);

    const result = await service.diffRegistryVsDispatcher();

    expect(result.unwired.length).toBe(4);
    expect(result.wired.length).toBe(0);
  });
});
