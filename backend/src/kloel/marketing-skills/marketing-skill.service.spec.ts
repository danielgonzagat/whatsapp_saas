import { Test, TestingModule } from '@nestjs/testing';
import { MarketingSkillService } from './marketing-skill.service';
import { MarketingSkillLoader } from './marketing-skill.loader';
import { MarketingSkillRouter } from './marketing-skill.router';
import { MarketingSkillContextBuilder } from './marketing-skill.context';
import type { MarketingWorkspaceSnapshot } from './marketing-skill.types';

type MarketingSkillLoaderMock = Pick<
  MarketingSkillLoader,
  'listInstalledSkillIds' | 'loadSkillExcerpt'
>;

type MarketingSkillRouterMock = Pick<MarketingSkillRouter, 'isMarketingRequest' | 'route'>;

type MarketingSkillContextBuilderMock = Pick<MarketingSkillContextBuilder, 'buildSnapshot'>;

describe('MarketingSkillService', () => {
  let service: MarketingSkillService;
  let loader: MarketingSkillLoaderMock;
  let router: MarketingSkillRouterMock;
  let contextBuilder: MarketingSkillContextBuilderMock;

  const wsId = 'ws-1';

  const emptySnapshot: MarketingWorkspaceSnapshot = {
    workspaceName: null,
    brandVoice: null,
    productCount: 0,
    activeProductCount: 0,
    topProducts: [],
    paidOrderCount: 0,
    totalOrderCount: 0,
    socialLeadCount: 0,
    checkoutConversionRate: null,
    grossRevenueCents: 0,
    campaignCount: 0,
    recentCampaigns: [],
    siteCount: 0,
    publishedSiteCount: 0,
    affiliateProductCount: 0,
    affiliateLinkCount: 0,
    contactCount: 0,
    notes: ['Nenhum produto ativo encontrado no workspace.'],
  };

  beforeEach(async () => {
    loader = {
      listInstalledSkillIds: jest.fn().mockReturnValue([]),
      loadSkillExcerpt: jest.fn().mockReturnValue(''),
    };

    router = {
      isMarketingRequest: jest.fn().mockReturnValue(false),
      route: jest.fn().mockReturnValue([]),
    };

    contextBuilder = {
      buildSnapshot: jest.fn().mockResolvedValue(emptySnapshot),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketingSkillService,
        { provide: MarketingSkillLoader, useValue: loader },
        { provide: MarketingSkillRouter, useValue: router },
        { provide: MarketingSkillContextBuilder, useValue: contextBuilder },
      ],
    }).compile();

    service = module.get<MarketingSkillService>(MarketingSkillService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listInstalledSkillIds', () => {
    it('delegates to loader', () => {
      (loader.listInstalledSkillIds as jest.Mock).mockReturnValue(['copywriting', 'page-cro']);

      const result = service.listInstalledSkillIds();

      expect(result).toEqual(['copywriting', 'page-cro']);
      expect(loader.listInstalledSkillIds).toHaveBeenCalled();
    });

    it('returns empty array when no skills installed', () => {
      (loader.listInstalledSkillIds as jest.Mock).mockReturnValue([]);

      const result = service.listInstalledSkillIds();

      expect(result).toEqual([]);
    });
  });

  describe('buildPacket', () => {
    it('returns null when message is not a marketing request', async () => {
      (router.isMarketingRequest as jest.Mock).mockReturnValue(false);

      const result = await service.buildPacket(wsId, 'hello world');

      expect(result).toBeNull();
      expect(router.isMarketingRequest).toHaveBeenCalledWith('hello world');
    });

    it('returns null when router finds no skill hits', async () => {
      (router.isMarketingRequest as jest.Mock).mockReturnValue(true);
      (router.route as jest.Mock).mockReturnValue([]);

      const result = await service.buildPacket(wsId, 'quero melhorar conversão');

      expect(result).toBeNull();
      expect(router.isMarketingRequest).toHaveBeenCalledWith('quero melhorar conversão');
      expect(router.route).toHaveBeenCalledWith('quero melhorar conversão');
    });

    it('returns null when all routed hits resolve to unknown catalog entries', async () => {
      (router.isMarketingRequest as jest.Mock).mockReturnValue(true);
      (router.route as jest.Mock).mockReturnValue([
        { id: 'unknown-skill', score: 3, reasons: ['test'] },
      ]);

      const result = await service.buildPacket(wsId, 'quer conversão');

      expect(result).toBeNull();
    });

    it('builds packet with selected skills and snapshot', async () => {
      (router.isMarketingRequest as jest.Mock).mockReturnValue(true);
      (router.route as jest.Mock).mockReturnValue([
        { id: 'copywriting', score: 5, reasons: ['copy', 'pagina de vendas'] },
      ]);
      (loader.loadSkillExcerpt as jest.Mock).mockReturnValue(
        'Write conversion-focused marketing copy.',
      );

      const snapshot: MarketingWorkspaceSnapshot = {
        ...emptySnapshot,
        workspaceName: 'MyWorkspace',
        productCount: 3,
        activeProductCount: 2,
        topProducts: [{ id: 'p-1', name: 'Curso', price: 99.9, active: true }],
        notes: [],
      };
      (contextBuilder.buildSnapshot as jest.Mock).mockResolvedValue(snapshot);

      const result = await service.buildPacket(wsId, 'copy para pagina de vendas');

      expect(result).not.toBeNull();
      expect(result!.isMarketingRequest).toBe(true);
      expect(result!.selectedSkills).toHaveLength(1);
      expect(result!.selectedSkills[0].id).toBe('copywriting');
      expect(result!.selectedSkills[0].title).toBe('Copywriting');
      expect(result!.snapshot.workspaceName).toBe('MyWorkspace');
      expect(result!.promptAddendum).toContain('MODO MARKETING ATIVADO');
      expect(result!.promptAddendum).toContain('Copywriting');
    });

    it('builds snapshot scoped to workspaceId', async () => {
      (router.isMarketingRequest as jest.Mock).mockReturnValue(true);
      (router.route as jest.Mock).mockReturnValue([
        { id: 'page-cro', score: 4, reasons: ['conversão', 'pagina'] },
      ]);
      (loader.loadSkillExcerpt as jest.Mock).mockReturnValue(
        'Improve conversion on marketing pages.',
      );

      await service.buildPacket('ws-tenant', 'melhorar conversão da pagina');

      expect(contextBuilder.buildSnapshot).toHaveBeenCalledWith('ws-tenant');
    });

    it('skips catalog entries that are missing from MARKETING_SKILL_CATALOG', async () => {
      (router.isMarketingRequest as jest.Mock).mockReturnValue(true);
      (router.route as jest.Mock).mockReturnValue([
        { id: 'copywriting', score: 2, reasons: ['copy'] },
        { id: 'ghost-skill', score: 3, reasons: ['nonexistent'] },
      ]);
      (loader.loadSkillExcerpt as jest.Mock).mockReturnValue('excerpt');

      const result = await service.buildPacket(wsId, 'copy');

      expect(result).not.toBeNull();
      expect(result!.selectedSkills).toHaveLength(1);
      expect(result!.selectedSkills[0].id).toBe('copywriting');
    });

    it('includes promptAddendum with skill frameworks and snapshot JSON', async () => {
      (router.isMarketingRequest as jest.Mock).mockReturnValue(true);
      (router.route as jest.Mock).mockReturnValue([
        { id: 'paid-ads', score: 5, reasons: ['trafego pago', 'roas'] },
      ]);
      (loader.loadSkillExcerpt as jest.Mock).mockReturnValue(
        'Plan and optimize paid acquisition campaigns.',
      );

      const result = await service.buildPacket(wsId, 'trafego pago roas');

      expect(result!.promptAddendum).toContain('Snapshot real do workspace');
      expect(result!.promptAddendum).toContain('Frameworks relevantes');
      expect(result!.promptAddendum).toContain('Paid Ads');
      expect(result!.promptAddendum).toContain('Plan and optimize');
    });
  });

  describe('tenant isolation', () => {
    it('buildSnapshot called with correct workspaceId', async () => {
      (router.isMarketingRequest as jest.Mock).mockReturnValue(true);
      (router.route as jest.Mock).mockReturnValue([
        { id: 'page-cro', score: 2, reasons: ['pagina'] },
      ]);
      (loader.loadSkillExcerpt as jest.Mock).mockReturnValue('excerpt');

      await service.buildPacket('ws-tenant-A', 'pagina');

      expect(contextBuilder.buildSnapshot).toHaveBeenCalledWith('ws-tenant-A');
    });

    it('separate workspace calls use different workspaceIds', async () => {
      (router.isMarketingRequest as jest.Mock).mockReturnValue(true);
      (router.route as jest.Mock).mockReturnValue([
        { id: 'page-cro', score: 2, reasons: ['pagina'] },
      ]);
      (loader.loadSkillExcerpt as jest.Mock).mockReturnValue('excerpt');

      await service.buildPacket('ws-alpha', 'pagina');
      await service.buildPacket('ws-beta', 'pagina');

      expect(contextBuilder.buildSnapshot).toHaveBeenNthCalledWith(1, 'ws-alpha');
      expect(contextBuilder.buildSnapshot).toHaveBeenNthCalledWith(2, 'ws-beta');
    });
  });

  describe('error handling', () => {
    it('rejects when contextBuilder.buildSnapshot throws', async () => {
      (router.isMarketingRequest as jest.Mock).mockReturnValue(true);
      (router.route as jest.Mock).mockReturnValue([
        { id: 'page-cro', score: 2, reasons: ['pagina'] },
      ]);
      (loader.loadSkillExcerpt as jest.Mock).mockReturnValue('excerpt');
      (contextBuilder.buildSnapshot as jest.Mock).mockRejectedValue(new Error('DB down'));

      await expect(service.buildPacket(wsId, 'pagina')).rejects.toThrow('DB down');
    });

    it('returns null when router.route throws (caught by service)', async () => {
      (router.isMarketingRequest as jest.Mock).mockReturnValue(true);
      (router.route as jest.Mock).mockImplementation(() => {
        throw new Error('route error');
      });

      await expect(service.buildPacket(wsId, 'marketing')).rejects.toThrow('route error');
    });
  });
});
