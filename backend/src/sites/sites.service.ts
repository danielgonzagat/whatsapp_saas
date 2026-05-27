import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Site, SiteDomain, SiteAppIntegration, Prisma } from '@prisma/client';
import type { CreateSiteDto } from './dto/create-site.dto';
import type { UpdateSiteDto } from './dto/update-site.dto';
import type { AddSiteDomainDto } from './dto/site-domain.dto';
import type { UpdateSiteAppDto } from './dto/site-app.dto';

function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 200) || 'site'
  );
}

function isValidStatusTransition(from: string, to: string): boolean {
  if (from === 'DRAFT' && to === 'PUBLISHED') {
    return true;
  }
  if (from === 'PUBLISHED' && to === 'DRAFT') {
    return true;
  }
  if (to === 'ARCHIVED') {
    return true;
  }
  return false;
}

export interface SiteListFilters {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface SiteListResult {
  success: boolean;
  sites: Site[];
  count: number;
  page: number;
  limit: number;
}

/** Sites service — CRUD, status machine, workspace isolation. */
@Injectable()
export class SitesService {
  private readonly logger = new Logger(SitesService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Sites ────────────────────────────────────────────────

  /** List sites for a workspace with optional filters. */
  async list(workspaceId: string, filters: SiteListFilters = {}): Promise<SiteListResult> {
    const { status, search, page = 1, limit = 20 } = filters;

    const where: Prisma.SiteWhereInput = { workspaceId };
    if (status) {
      where.status = status as any;
    }
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [sites, count] = await Promise.all([
      this.prisma.site.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.site.count({ where }),
    ]);

    return { success: true, sites, count, page, limit };
  }

  /** Get a single site scoped to workspace. */
  async findById(workspaceId: string, siteId: string): Promise<Site | null> {
    return this.prisma.site.findFirst({
      where: { id: siteId, workspaceId },
    });
  }

  /** Create a new site. Slug is auto-generated from name if not provided. */
  async create(workspaceId: string, dto: CreateSiteDto): Promise<Site> {
    this.assertWorkspace(workspaceId);

    const slug = dto.slug || slugify(dto.name);

    // Check slug uniqueness within workspace
    const existing = await this.prisma.site.findFirst({
      where: { workspaceId, slug },
    });
    if (existing) {
      throw new ConflictException(`Slug "${slug}" already exists in this workspace`);
    }

    const site = await this.prisma.site.create({
      data: {
        workspaceId,
        name: dto.name,
        slug,
        template: dto.template || null,
      },
    });

    this.logger.log(`Site created: ${site.id} slug=${slug}`);
    return site;
  }

  /** Update site content and/or SEO metadata. */
  async update(workspaceId: string, siteId: string, dto: UpdateSiteDto): Promise<Site> {
    this.assertWorkspace(workspaceId);

    const existing = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!existing) {
      throw new NotFoundException(`Site ${siteId} not found`);
    }
    if (existing.workspaceId !== workspaceId) {
      throw new ForbiddenException('Cross-workspace access denied');
    }

    const data: Prisma.SiteUpdateInput = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.content !== undefined) {
      data.content = dto.content as Prisma.InputJsonValue;
    }
    if (dto.seoMeta !== undefined) {
      data.seoMeta = dto.seoMeta as Prisma.InputJsonValue;
    }

    return this.prisma.site.update({ where: { id: siteId }, data });
  }

  /** Soft-delete: archive the site. */
  async archive(workspaceId: string, siteId: string): Promise<Site> {
    this.assertWorkspace(workspaceId);

    const existing = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!existing) {
      throw new NotFoundException(`Site ${siteId} not found`);
    }
    if (existing.workspaceId !== workspaceId) {
      throw new ForbiddenException('Cross-workspace access denied');
    }

    return this.prisma.site.update({
      where: { id: siteId },
      data: { status: 'ARCHIVED' },
    });
  }

  /** Publish: DRAFT → PUBLISHED. */
  async publish(workspaceId: string, siteId: string): Promise<Site> {
    this.assertWorkspace(workspaceId);

    const existing = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!existing) {
      throw new NotFoundException(`Site ${siteId} not found`);
    }
    if (existing.workspaceId !== workspaceId) {
      throw new ForbiddenException('Cross-workspace access denied');
    }
    if (!isValidStatusTransition(existing.status, 'PUBLISHED')) {
      throw new BadRequestException(`Cannot publish a site with status ${existing.status}`);
    }

    return this.prisma.site.update({
      where: { id: siteId },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
  }

  /** Unpublish: PUBLISHED → DRAFT. */
  async unpublish(workspaceId: string, siteId: string): Promise<Site> {
    this.assertWorkspace(workspaceId);

    const existing = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!existing) {
      throw new NotFoundException(`Site ${siteId} not found`);
    }
    if (existing.workspaceId !== workspaceId) {
      throw new ForbiddenException('Cross-workspace access denied');
    }
    if (!isValidStatusTransition(existing.status, 'DRAFT')) {
      throw new BadRequestException(`Cannot unpublish a site with status ${existing.status}`);
    }

    return this.prisma.site.update({
      where: { id: siteId },
      data: { status: 'DRAFT', publishedAt: null },
    });
  }

  // ── Domains ──────────────────────────────────────────────

  /** List domains for a site. */
  async listDomains(workspaceId: string, siteId: string): Promise<SiteDomain[]> {
    await this.ensureOwnership(workspaceId, siteId);
    return this.prisma.siteDomain.findMany({
      where: { siteId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Add a custom domain. */
  async addDomain(workspaceId: string, siteId: string, dto: AddSiteDomainDto): Promise<SiteDomain> {
    await this.ensureOwnership(workspaceId, siteId);

    const existingHost = await this.prisma.siteDomain.findUnique({
      where: { hostname: dto.hostname },
    });
    if (existingHost) {
      throw new ConflictException(`Hostname "${dto.hostname}" is already in use`);
    }

    return this.prisma.siteDomain.create({
      data: {
        siteId,
        hostname: dto.hostname,
        isCustom: true,
      },
    });
  }

  /** Remove a domain from a site. */
  async removeDomain(workspaceId: string, siteId: string, domainId: string): Promise<void> {
    await this.ensureOwnership(workspaceId, siteId);

    const domain = await this.prisma.siteDomain.findFirst({
      where: { id: domainId, siteId },
    });
    if (!domain) {
      throw new NotFoundException(`Domain ${domainId} not found on site ${siteId}`);
    }

    await this.prisma.siteDomain.delete({ where: { id: domainId } });
  }

  // ── App Integrations ─────────────────────────────────────

  /** List app integrations for a site. */
  async listApps(workspaceId: string, siteId: string): Promise<SiteAppIntegration[]> {
    await this.ensureOwnership(workspaceId, siteId);
    return this.prisma.siteAppIntegration.findMany({
      where: { siteId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Create or update an app integration (enable/disable + config). */
  async upsertApp(
    workspaceId: string,
    siteId: string,
    appKey: string,
    dto: UpdateSiteAppDto,
  ): Promise<SiteAppIntegration> {
    await this.ensureOwnership(workspaceId, siteId);

    return this.prisma.siteAppIntegration.upsert({
      where: { siteId_appKey: { siteId, appKey } },
      create: {
        siteId,
        appKey,
        enabled: dto.enabled ?? false,
        config: (dto.config ?? {}) as Prisma.InputJsonValue,
      },
      update: {
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        ...(dto.config !== undefined ? { config: dto.config as Prisma.InputJsonValue } : {}),
      },
    });
  }

  // ── Helpers ──────────────────────────────────────────────

  private assertWorkspace(workspaceId: string): void {
    if (!workspaceId) {
      throw new ForbiddenException('Workspace ID is required');
    }
  }

  private async ensureOwnership(workspaceId: string, siteId: string): Promise<Site> {
    this.assertWorkspace(workspaceId);
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      throw new NotFoundException(`Site ${siteId} not found`);
    }
    if (site.workspaceId !== workspaceId) {
      throw new ForbiddenException('Cross-workspace access denied');
    }
    return site;
  }
}
