import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { PrismaService } from '../prisma/prisma.service';
import {
  A_Z0_9_RE,
  CreateMemberAreaDto,
  PATTERN_RE,
  U0300__U036F_RE,
  UpdateMemberAreaDto,
  serializeArea,
} from './member-area.helpers';

/**
 * MEMBER AREAS CONTROLLER — Areas CRUD
 *
 * Manages member areas (courses, communities, memberships) for each workspace.
 * All endpoints require authentication and workspace scope. Module, lesson,
 * structure-generation and enrollment endpoints live in sibling controllers
 * under the same `/member-areas` prefix.
 */
@Controller('member-areas')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MemberAreasController {
  private readonly logger = new Logger(MemberAreasController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * List all member areas for the workspace
   */
  @Get()
  async listAreas(
    @Request() req: AuthenticatedRequest,
    @Query('type') type?: string,
    @Query('active') active?: string,
    @Query('search') search?: string,
  ) {
    const workspaceId = req.user.workspaceId;

    const where: Record<string, unknown> = { workspaceId };

    if (type) {
      where.type = type;
    }

    if (active !== undefined) {
      where.active = active === 'true';
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const areas = await this.prisma.memberArea.findMany({
      where: { ...where, workspaceId },
      include: {
        modules: {
          orderBy: { position: 'asc' },
          include: {
            lessons: {
              orderBy: { position: 'asc' },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      areas: areas.map((area) => serializeArea(req, area)),
      count: areas.length,
    };
  }

  /**
   * Get member area stats for the workspace
   */
  @Get('stats')
  async getStats(@Request() req: AuthenticatedRequest) {
    const workspaceId = req.user.workspaceId;

    const totalAreas = await this.prisma.memberArea.count({
      where: { workspaceId },
    });

    const activeAreas = await this.prisma.memberArea.count({
      where: { workspaceId, active: true },
    });

    const areas = await this.prisma.memberArea.findMany({
      where: { workspaceId },
      select: {
        totalStudents: true,
        avgCompletion: true,
        totalModules: true,
        totalLessons: true,
      },
    });

    const totalStudents = areas.reduce((sum, a) => sum + a.totalStudents, 0);
    const avgCompletion =
      areas.length > 0 ? areas.reduce((sum, a) => sum + a.avgCompletion, 0) / areas.length : 0;
    const totalModules = areas.reduce((sum, a) => sum + a.totalModules, 0);
    const totalLessons = areas.reduce((sum, a) => sum + a.totalLessons, 0);

    return {
      totalAreas,
      activeAreas,
      totalStudents,
      avgCompletion: Math.round(avgCompletion * 100) / 100,
      totalModules,
      totalLessons,
    };
  }

  /**
   * Get a single member area by ID with modules and lessons
   */
  @Get(':id')
  async getArea(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user.workspaceId;

    const area = await this.prisma.memberArea.findFirst({
      where: { id, workspaceId },
      include: {
        modules: {
          orderBy: { position: 'asc' },
          include: {
            lessons: {
              orderBy: { position: 'asc' },
            },
          },
        },
      },
    });

    if (!area) {
      throw new NotFoundException('Member area not found');
    }

    return { area: serializeArea(req, area) };
  }

  /**
   * Create a new member area
   */
  @Post()
  async createArea(@Request() req: AuthenticatedRequest, @Body() dto: CreateMemberAreaDto) {
    // Accepts idempotencyKey for safe client retry via DTO
    const workspaceId = req.user.workspaceId;

    // Auto-generate slug from name if not provided
    if (!dto.slug) {
      dto.slug = `${(dto.name || 'area')
        .toLowerCase()
        .normalize('NFD')
        .replace(U0300__U036F_RE, '')
        .replace(A_Z0_9_RE, '-')
        .replace(PATTERN_RE, '')}-${Date.now().toString(36)}`;
    }

    try {
      const area = await this.prisma.memberArea.create({
        data: {
          workspaceId,
          name: dto.name,
          slug: dto.slug,
          description: dto.description || null,
          type: dto.type || 'COURSE',
          template: dto.template || 'academy',
          logoUrl: dto.logoUrl || null,
          coverUrl: dto.coverUrl || null,
          primaryColor: dto.primaryColor || '#E85D30',
          customDomain: dto.customDomain || null,
          productId: dto.productId || null,
          certificates: dto.certificates ?? true,
          quizzes: dto.quizzes ?? true,
          community: dto.community ?? true,
          gamification: dto.gamification ?? true,
          progressTrack: dto.progressTrack ?? true,
          downloads: dto.downloads ?? true,
          comments: dto.comments ?? true,
        },
      });

      this.logger.log(`Member area created: ${area.id} - ${area.name}`);

      return { area: serializeArea(req, area), success: true };
    } catch (error: unknown) {
      this.logger.error(
        `Failed to create member area: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new BadRequestException(
        error instanceof Error && (error as { code?: string }).code === 'P2002'
          ? 'A member area with this slug already exists'
          : `Failed to create member area: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Update an existing member area
   */
  @Put(':id')
  async updateArea(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateMemberAreaDto,
  ) {
    const workspaceId = req.user.workspaceId;

    const existing = await this.prisma.memberArea.findFirst({
      where: { id, workspaceId },
    });

    if (!existing) {
      throw new NotFoundException('Member area not found');
    }

    await this.prisma.memberArea.updateMany({
      where: { id, workspaceId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.template !== undefined && { template: dto.template }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.coverUrl !== undefined && { coverUrl: dto.coverUrl }),
        ...(dto.primaryColor !== undefined && {
          primaryColor: dto.primaryColor,
        }),
        ...(dto.customDomain !== undefined && {
          customDomain: dto.customDomain,
        }),
        ...(dto.productId !== undefined && { productId: dto.productId }),
        ...(dto.certificates !== undefined && {
          certificates: dto.certificates,
        }),
        ...(dto.quizzes !== undefined && { quizzes: dto.quizzes }),
        ...(dto.community !== undefined && { community: dto.community }),
        ...(dto.gamification !== undefined && {
          gamification: dto.gamification,
        }),
        ...(dto.progressTrack !== undefined && {
          progressTrack: dto.progressTrack,
        }),
        ...(dto.downloads !== undefined && { downloads: dto.downloads }),
        ...(dto.comments !== undefined && { comments: dto.comments }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });

    const area = await this.prisma.memberArea.findFirst({
      where: { id, workspaceId },
    });

    return { area: serializeArea(req, area), success: true };
  }

  /**
   * Delete a member area
   */
  @Delete(':id')
  async deleteArea(@Request() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = req.user.workspaceId;

    const existing = await this.prisma.memberArea.findFirst({
      where: { id, workspaceId },
    });

    if (!existing) {
      throw new NotFoundException('Member area not found');
    }

    await this.auditService.log({
      workspaceId,
      action: 'DELETE_RECORD',
      resource: 'MemberArea',
      resourceId: id,
      details: { deletedBy: 'user', name: existing.name },
    });
    const deleted = await this.prisma.memberArea.deleteMany({
      where: { id, workspaceId },
    });
    if (deleted.count === 0) {
      throw new NotFoundException('Member area not found');
    }

    return { success: true, deleted: id };
  }
}
