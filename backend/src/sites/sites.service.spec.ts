import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SitesService } from './sites.service';

describe('SitesService', () => {
  let service: SitesService;
  let prisma: {
    site: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    siteDomain: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      delete: jest.Mock;
    };
    siteAppIntegration: {
      findMany: jest.Mock;
      upsert: jest.Mock;
    };
  };

  const ws = 'ws-1';
  const wsOther = 'ws-other';
  const makeSite = (overrides: Record<string, unknown> = {}) => ({
    id: 'site-1',
    workspaceId: ws,
    name: 'My Site',
    slug: 'my-site',
    status: 'DRAFT',
    template: null,
    content: {},
    seoMeta: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    publishedAt: null,
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      site: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'site-1',
            workspaceId: data.workspaceId ?? ws,
            name: data.name,
            slug: data.slug,
            status: 'DRAFT',
            template: data.template || null,
            content: {},
            seoMeta: {},
            createdAt: new Date(),
            updatedAt: new Date(),
            publishedAt: null,
          }),
        ),
        update: jest.fn().mockImplementation(({ where, data }) =>
          Promise.resolve({
            id: where.id,
            workspaceId: ws,
            name: 'My Site',
            slug: 'my-site',
            status: data.status ?? 'DRAFT',
            template: null,
            content: {},
            seoMeta: {},
            createdAt: new Date(),
            updatedAt: new Date(),
            publishedAt: data.publishedAt ?? null,
          }),
        ),
      },
      siteDomain: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'dom-1', ...data, createdAt: new Date() }),
          ),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      siteAppIntegration: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest
          .fn()
          .mockImplementation(({ create, update }) =>
            Promise.resolve({ id: 'app-1', ...create, ...update, createdAt: new Date() }),
          ),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SitesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(SitesService);
  });

  // ── List ────────────────────────────────────────────────

  describe('list', () => {
    it('returns paginated sites with count', async () => {
      prisma.site.findMany.mockResolvedValue([
        makeSite(),
        makeSite({ id: 'site-2', slug: 'site-2' }),
      ]);
      prisma.site.count.mockResolvedValue(2);

      const result = await service.list(ws, { page: 1, limit: 10 });
      expect(result.success).toBe(true);
      expect(result.sites).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(result.page).toBe(1);
    });

    it('filters by status', async () => {
      prisma.site.findMany.mockResolvedValue([]);
      prisma.site.count.mockResolvedValue(0);

      await service.list(ws, { status: 'PUBLISHED' });
      expect(prisma.site.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PUBLISHED' }),
        }),
      );
    });

    it('applies search filter', async () => {
      prisma.site.findMany.mockResolvedValue([]);
      prisma.site.count.mockResolvedValue(0);

      await service.list(ws, { search: 'hello' });
      expect(prisma.site.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.any(Array) }),
        }),
      );
    });
  });

  // ── Create ──────────────────────────────────────────────

  describe('create', () => {
    it('creates a site with default DRAFT status', async () => {
      const result = await service.create(ws, { name: 'Hello World' });
      expect(result.name).toBe('Hello World');
      expect(result.slug).toBe('hello-world');
      expect(result.status).toBe('DRAFT');
    });

    it('uses provided slug when given', async () => {
      const result = await service.create(ws, { name: 'Hello', slug: 'custom-slug' });
      expect(result.slug).toBe('custom-slug');
    });

    it('throws ConflictException on duplicate slug within workspace', async () => {
      prisma.site.findFirst.mockResolvedValue(makeSite());
      await expect(service.create(ws, { name: 'X', slug: 'my-site' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws ForbiddenException when workspaceId is empty', async () => {
      await expect(service.create('', { name: 'X' })).rejects.toThrow(ForbiddenException);
    });
  });

  // ── FindById ────────────────────────────────────────────

  describe('findById', () => {
    it('returns site scoped to workspace', async () => {
      prisma.site.findFirst.mockResolvedValue(makeSite());
      const result = await service.findById(ws, 'site-1');
      expect(result?.id).toBe('site-1');
      expect(prisma.site.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'site-1', workspaceId: ws } }),
      );
    });

    it('returns null when not found', async () => {
      prisma.site.findFirst.mockResolvedValue(null);
      const result = await service.findById(ws, 'none');
      expect(result).toBeNull();
    });
  });

  // ── Update ──────────────────────────────────────────────

  describe('update', () => {
    it('updates content and seoMeta', async () => {
      prisma.site.findUnique.mockResolvedValue(makeSite());
      await service.update(ws, 'site-1', {
        content: { sections: [] },
        seoMeta: { title: 'T' },
      });
      expect(prisma.site.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ content: { sections: [] } }),
        }),
      );
    });

    it('throws NotFoundException when site missing', async () => {
      prisma.site.findUnique.mockResolvedValue(null);
      await expect(service.update(ws, 'missing', { name: 'X' })).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for cross-workspace access', async () => {
      prisma.site.findUnique.mockResolvedValue(makeSite({ workspaceId: wsOther }));
      await expect(service.update(ws, 'site-1', { name: 'X' })).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Archive ─────────────────────────────────────────────

  describe('archive', () => {
    it('sets status to ARCHIVED', async () => {
      prisma.site.findUnique.mockResolvedValue(makeSite());
      prisma.site.update.mockResolvedValue(makeSite({ status: 'ARCHIVED' }));
      const result = await service.archive(ws, 'site-1');
      expect(result.status).toBe('ARCHIVED');
    });
  });

  // ── Publish / Unpublish ─────────────────────────────────

  describe('publish', () => {
    it('transitions DRAFT → PUBLISHED and sets publishedAt', async () => {
      prisma.site.findUnique.mockResolvedValue(makeSite({ status: 'DRAFT' }));
      prisma.site.update.mockResolvedValue(
        makeSite({ status: 'PUBLISHED', publishedAt: new Date() }),
      );
      const result = await service.publish(ws, 'site-1');
      expect(result.status).toBe('PUBLISHED');
    });

    it('throws BadRequestException when already ARCHIVED', async () => {
      prisma.site.findUnique.mockResolvedValue(makeSite({ status: 'ARCHIVED' }));
      await expect(service.publish(ws, 'site-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('unpublish', () => {
    it('transitions PUBLISHED → DRAFT and clears publishedAt', async () => {
      prisma.site.findUnique.mockResolvedValue(
        makeSite({ status: 'PUBLISHED', publishedAt: new Date() }),
      );
      prisma.site.update.mockResolvedValue(makeSite({ status: 'DRAFT', publishedAt: null }));
      const result = await service.unpublish(ws, 'site-1');
      expect(result.status).toBe('DRAFT');
    });

    it('throws BadRequestException when already DRAFT', async () => {
      prisma.site.findUnique.mockResolvedValue(makeSite({ status: 'DRAFT' }));
      await expect(service.unpublish(ws, 'site-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ── Domains ─────────────────────────────────────────────

  describe('domains', () => {
    it('adds a custom domain', async () => {
      prisma.site.findUnique.mockResolvedValue(makeSite());
      prisma.siteDomain.findUnique.mockResolvedValue(null);
      const result = await service.addDomain(ws, 'site-1', { hostname: 'www.example.com' });
      expect(result.hostname).toBe('www.example.com');
      expect(result.isCustom).toBe(true);
    });

    it('throws ConflictException on duplicate hostname', async () => {
      prisma.site.findUnique.mockResolvedValue(makeSite());
      prisma.siteDomain.findUnique.mockResolvedValue({ id: 'dom-existing', hostname: 'dup.com' });
      await expect(service.addDomain(ws, 'site-1', { hostname: 'dup.com' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('removes a domain scoped to site', async () => {
      prisma.site.findUnique.mockResolvedValue(makeSite());
      prisma.siteDomain.findFirst.mockResolvedValue({ id: 'dom-1', siteId: 'site-1' });
      await expect(service.removeDomain(ws, 'site-1', 'dom-1')).resolves.toBeUndefined();
      expect(prisma.siteDomain.delete).toHaveBeenCalledWith({ where: { id: 'dom-1' } });
    });

    it('throws NotFoundException removing domain not on site', async () => {
      prisma.site.findUnique.mockResolvedValue(makeSite());
      prisma.siteDomain.findFirst.mockResolvedValue(null);
      await expect(service.removeDomain(ws, 'site-1', 'bad-dom')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── Apps ────────────────────────────────────────────────

  describe('apps', () => {
    it('upserts an app integration with config', async () => {
      prisma.site.findUnique.mockResolvedValue(makeSite());
      const result = await service.upsertApp(ws, 'site-1', 'google-analytics', {
        enabled: true,
        config: { trackingId: 'UA-123' },
      });
      expect(result.enabled).toBe(true);
    });
  });
});
