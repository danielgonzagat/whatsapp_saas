import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { CreateSiteDto } from './dto/create-site.dto';
import { AddSiteDomainDto } from './dto/site-domain.dto';
import { UpdateSiteAppDto } from './dto/site-app.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { SitesService } from './sites.service';

/** Sites controller — REST endpoints for site builder CRUD. */
@Controller('sites')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  // ── Sites ────────────────────────────────────────────────

  /** List user's sites (paginated, filterable by status). */
  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.sites.list(workspaceId, {
      ...(status !== undefined ? { status } : {}),
      ...(search !== undefined ? { search } : {}),
      ...(page ? { page: Number(page) } : {}),
      ...(limit ? { limit: Math.min(Number(limit), 100) } : {}),
    });
  }

  /** Create a new site. */
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async create(@Req() req: AuthenticatedRequest, @Body() dto: CreateSiteDto) {
    const workspaceId = resolveWorkspaceId(req);
    return this.sites.create(workspaceId, dto);
  }

  /** Get site detail. */
  @Get(':id')
  async findOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req);
    const site = await this.sites.findById(workspaceId, id);
    if (!site) {
      throw new BadRequestException('Site não encontrado ou não pertence a este workspace');
    }
    return site;
  }

  /** Update site content/seoMeta. */
  @Put(':id')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateSiteDto,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.sites.update(workspaceId, id, dto);
  }

  /** Soft-delete (archive) a site. */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async archive(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req);
    return this.sites.archive(workspaceId, id);
  }

  /** Publish a site (DRAFT → PUBLISHED). */
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  async publish(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req);
    return this.sites.publish(workspaceId, id);
  }

  /** Unpublish a site (PUBLISHED → DRAFT). */
  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  async unpublish(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req);
    return this.sites.unpublish(workspaceId, id);
  }

  // ── Domains ──────────────────────────────────────────────

  /** List domains for a site. */
  @Get(':id/domains')
  async listDomains(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req);
    return this.sites.listDomains(workspaceId, id);
  }

  /** Add a custom domain. */
  @Post(':id/domains')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async addDomain(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: AddSiteDomainDto,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.sites.addDomain(workspaceId, id, dto);
  }

  /** Remove a domain from a site. */
  @Delete(':id/domains/:domainId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeDomain(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('domainId') domainId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    await this.sites.removeDomain(workspaceId, id, domainId);
  }

  // ── App Integrations ─────────────────────────────────────

  /** List app integrations for a site. */
  @Get(':id/apps')
  async listApps(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req);
    return this.sites.listApps(workspaceId, id);
  }

  /** Enable/disable + configure an app integration. */
  @Put(':id/apps/:appKey')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async upsertApp(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('appKey') appKey: string,
    @Body() dto: UpdateSiteAppDto,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.sites.upsertApp(workspaceId, id, appKey, dto);
  }
}
