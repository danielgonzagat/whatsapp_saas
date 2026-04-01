import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { normalizeStorageUrlForRequest } from '../common/storage/public-storage-url.util';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

interface CreateMemberAreaDto {
  name: string;
  slug?: string;
  description?: string;
  type?: string;
  template?: string;
  logoUrl?: string;
  coverUrl?: string;
  primaryColor?: string;
  customDomain?: string;
  productId?: string;
  certificates?: boolean;
  quizzes?: boolean;
  community?: boolean;
  gamification?: boolean;
  progressTrack?: boolean;
  downloads?: boolean;
  comments?: boolean;
}

interface UpdateMemberAreaDto extends Partial<CreateMemberAreaDto> {
  active?: boolean;
}

interface CreateModuleDto {
  name: string;
  description?: string;
  position?: number;
  releaseType?: string;
  releaseDate?: string;
  releaseDays?: number;
}

interface CreateLessonDto {
  name: string;
  description?: string;
  type?: string;
  position?: number;
  videoUrl?: string;
  textContent?: string;
  downloadUrl?: string;
  quizData?: any;
  durationMin?: number;
}

interface UpdateLessonDto {
  name?: string;
  description?: string;
  videoUrl?: string;
  textContent?: string;
  downloadUrl?: string;
  position?: number;
  type?: string;
  durationMin?: number;
  active?: boolean;
}

/**
 * MEMBER AREAS CONTROLLER
 *
 * Manages member areas (courses, communities, memberships)
 * for each workspace. All endpoints require authentication.
 */
@Controller('member-areas')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MemberAreaController {
  private readonly logger = new Logger(MemberAreaController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private serializeArea(req: any, area: any) {
    if (!area) return area;

    const modules = Array.isArray(area.modules) ? area.modules : [];
    const lessonsCount =
      area.totalLessons ??
      modules.reduce(
        (sum: number, module: any) =>
          sum + (Array.isArray(module.lessons) ? module.lessons.length : 0),
        0,
      );

    return {
      ...area,
      logoUrl: normalizeStorageUrlForRequest(area.logoUrl, req) || null,
      coverUrl: normalizeStorageUrlForRequest(area.coverUrl, req) || null,
      studentsCount: area.totalStudents ?? 0,
      modulesCount: area.totalModules ?? modules.length,
      lessonsCount,
      modulesList: modules,
    };
  }

  private async recalculateAreaTotals(areaId: string) {
    const [enrollmentAgg, moduleCount, lessonCount] = await Promise.all([
      this.prisma.memberEnrollment.aggregate({
        where: { memberAreaId: areaId },
        _count: { _all: true },
        _avg: { progress: true },
      }),
      this.prisma.memberModule.count({
        where: { memberAreaId: areaId },
      }),
      this.prisma.memberLesson.count({
        where: { module: { memberAreaId: areaId } },
      }),
    ]);

    return this.prisma.memberArea.update({
      where: { id: areaId },
      data: {
        totalStudents: enrollmentAgg._count._all,
        avgCompletion: Number(enrollmentAgg._avg.progress || 0),
        totalModules: moduleCount,
        totalLessons: lessonCount,
      },
    });
  }

  /**
   * List all member areas for the workspace
   */
  @Get()
  async listAreas(
    @Request() req: any,
    @Query('type') type?: string,
    @Query('active') active?: string,
    @Query('search') search?: string,
  ) {
    const workspaceId = req.user.workspaceId;

    const where: any = { workspaceId };

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
      where,
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
      areas: areas.map((area) => this.serializeArea(req, area)),
      count: areas.length,
    };
  }

  /**
   * Get member area stats for the workspace
   */
  @Get('stats')
  async getStats(@Request() req: any) {
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
      areas.length > 0
        ? areas.reduce((sum, a) => sum + a.avgCompletion, 0) / areas.length
        : 0;
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
  async getArea(@Request() req: any, @Param('id') id: string) {
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

    return { area: this.serializeArea(req, area) };
  }

  /**
   * Create a new member area
   */
  @Post()
  async createArea(@Request() req: any, @Body() dto: CreateMemberAreaDto) {
    // Accepts idempotencyKey for safe client retry via DTO
    const workspaceId = req.user.workspaceId;

    // Auto-generate slug from name if not provided
    if (!dto.slug) {
      dto.slug =
        (dto.name || 'area')
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') +
        '-' +
        Date.now().toString(36);
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

      return { area: this.serializeArea(req, area), success: true };
    } catch (error) {
      this.logger.error(
        `Failed to create member area: ${error.message}`,
        error.stack,
      );
      throw new BadRequestException(
        error.code === 'P2002'
          ? 'A member area with this slug already exists'
          : `Failed to create member area: ${error.message}`,
      );
    }
  }

  /**
   * Update an existing member area
   */
  @Put(':id')
  async updateArea(
    @Request() req: any,
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

    const area = await this.prisma.memberArea.update({
      where: { id },
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

    return { area: this.serializeArea(req, area), success: true };
  }

  /**
   * Delete a member area
   */
  @Delete(':id')
  async deleteArea(@Request() req: any, @Param('id') id: string) {
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
    await this.prisma.memberArea.delete({ where: { id } });

    return { success: true, deleted: id };
  }

  /**
   * Create a module inside a member area — accepts idempotencyKey
   */
  @Post(':id/modules')
  async createModule(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: CreateModuleDto,
  ) {
    const workspaceId = req.user.workspaceId;

    const area = await this.prisma.memberArea.findFirst({
      where: { id, workspaceId },
    });

    if (!area) {
      throw new NotFoundException('Member area not found');
    }

    const mod = await this.prisma.memberModule.create({
      data: {
        memberAreaId: id,
        name: dto.name,
        description: dto.description || null,
        position: dto.position ?? 0,
        releaseType: dto.releaseType || 'IMMEDIATE',
        releaseDate: dto.releaseDate ? new Date(dto.releaseDate) : null,
        releaseDays: dto.releaseDays ?? null,
      },
    });

    // Update module count
    const moduleCount = await this.prisma.memberModule.count({
      where: { memberAreaId: id },
    });
    await this.prisma.memberArea.update({
      where: { id },
      data: { totalModules: moduleCount },
    });

    return { module: mod, success: true };
  }

  /**
   * Update a module
   */
  @Put(':id/modules/:moduleId')
  async updateModule(
    @Request() req: any,
    @Param('id') id: string,
    @Param('moduleId') moduleId: string,
    @Body() dto: Partial<CreateModuleDto> & { active?: boolean },
  ) {
    const workspaceId = req.user.workspaceId;

    const area = await this.prisma.memberArea.findFirst({
      where: { id, workspaceId },
    });

    if (!area) {
      throw new NotFoundException('Member area not found');
    }

    const existing = await this.prisma.memberModule.findFirst({
      where: { id: moduleId, memberAreaId: id },
    });

    if (!existing) {
      throw new NotFoundException('Module not found');
    }

    const mod = await this.prisma.memberModule.update({
      where: { id: moduleId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.position !== undefined && { position: dto.position }),
        ...(dto.releaseType !== undefined && { releaseType: dto.releaseType }),
        ...(dto.releaseDate !== undefined && {
          releaseDate: dto.releaseDate ? new Date(dto.releaseDate) : null,
        }),
        ...(dto.releaseDays !== undefined && { releaseDays: dto.releaseDays }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });

    return { module: mod, success: true };
  }

  /**
   * Delete a module
   */
  @Delete(':id/modules/:moduleId')
  async deleteModule(
    @Request() req: any,
    @Param('id') id: string,
    @Param('moduleId') moduleId: string,
  ) {
    const workspaceId = req.user.workspaceId;

    const area = await this.prisma.memberArea.findFirst({
      where: { id, workspaceId },
    });

    if (!area) {
      throw new NotFoundException('Member area not found');
    }

    const existing = await this.prisma.memberModule.findFirst({
      where: { id: moduleId, memberAreaId: id },
    });

    if (!existing) {
      throw new NotFoundException('Module not found');
    }

    await this.auditService.log({
      workspaceId,
      action: 'DELETE_RECORD',
      resource: 'MemberModule',
      resourceId: moduleId,
      details: { deletedBy: 'user', memberAreaId: id },
    });
    await this.prisma.memberModule.delete({ where: { id: moduleId } });

    // Update counts
    const moduleCount = await this.prisma.memberModule.count({
      where: { memberAreaId: id },
    });
    const lessonCount = await this.prisma.memberLesson.count({
      where: { module: { memberAreaId: id } },
    });
    await this.prisma.memberArea.update({
      where: { id },
      data: { totalModules: moduleCount, totalLessons: lessonCount },
    });

    return { success: true, deleted: moduleId };
  }

  /**
   * Create a lesson inside a module — accepts idempotencyKey
   */
  @Post(':id/modules/:moduleId/lessons')
  async createLesson(
    @Request() req: any,
    @Param('id') id: string,
    @Param('moduleId') moduleId: string,
    @Body() dto: CreateLessonDto,
  ) {
    const workspaceId = req.user.workspaceId;

    const area = await this.prisma.memberArea.findFirst({
      where: { id, workspaceId },
    });

    if (!area) {
      throw new NotFoundException('Member area not found');
    }

    const mod = await this.prisma.memberModule.findFirst({
      where: { id: moduleId, memberAreaId: id },
    });

    if (!mod) {
      throw new NotFoundException('Module not found');
    }

    const lesson = await this.prisma.memberLesson.create({
      data: {
        moduleId,
        name: dto.name,
        description: dto.description || null,
        type: dto.type || 'VIDEO',
        position: dto.position ?? 0,
        videoUrl: dto.videoUrl || null,
        textContent: dto.textContent || null,
        downloadUrl: dto.downloadUrl || null,
        quizData: dto.quizData || null,
        durationMin: dto.durationMin ?? null,
      },
    });

    // Update lesson count
    const lessonCount = await this.prisma.memberLesson.count({
      where: { module: { memberAreaId: id } },
    });
    await this.prisma.memberArea.update({
      where: { id },
      data: { totalLessons: lessonCount },
    });

    return { lesson, success: true };
  }

  /**
   * Update a lesson
   */
  @Put(':id/lessons/:lessonId')
  async updateLesson(
    @Request() req: any,
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
    @Body() dto: UpdateLessonDto,
  ) {
    const workspaceId = req.user.workspaceId;

    const area = await this.prisma.memberArea.findFirst({
      where: { id, workspaceId },
    });

    if (!area) {
      throw new NotFoundException('Member area not found');
    }

    const existing = await this.prisma.memberLesson.findFirst({
      where: { id: lessonId, module: { memberAreaId: id } },
    });

    if (!existing) {
      throw new NotFoundException('Lesson not found');
    }

    const lesson = await this.prisma.memberLesson.update({
      where: { id: lessonId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.position !== undefined && { position: dto.position }),
        ...(dto.videoUrl !== undefined && { videoUrl: dto.videoUrl }),
        ...(dto.textContent !== undefined && { textContent: dto.textContent }),
        ...(dto.downloadUrl !== undefined && { downloadUrl: dto.downloadUrl }),
        ...(dto.durationMin !== undefined && { durationMin: dto.durationMin }),
        ...(dto.active !== undefined && { active: dto.active }),
      },
    });

    return { lesson, success: true };
  }

  /**
   * Delete a lesson
   */
  @Delete(':id/lessons/:lessonId')
  async deleteLesson(
    @Request() req: any,
    @Param('id') id: string,
    @Param('lessonId') lessonId: string,
  ) {
    const workspaceId = req.user.workspaceId;

    const area = await this.prisma.memberArea.findFirst({
      where: { id, workspaceId },
    });

    if (!area) {
      throw new NotFoundException('Member area not found');
    }

    const lesson = await this.prisma.memberLesson.findFirst({
      where: { id: lessonId, module: { memberAreaId: id } },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found');
    }

    await this.auditService.log({
      workspaceId,
      action: 'DELETE_RECORD',
      resource: 'MemberLesson',
      resourceId: lessonId,
      details: { deletedBy: 'user', memberAreaId: id },
    });
    await this.prisma.memberLesson.delete({ where: { id: lessonId } });

    // Update lesson count
    const lessonCount = await this.prisma.memberLesson.count({
      where: { module: { memberAreaId: id } },
    });
    await this.prisma.memberArea.update({
      where: { id },
      data: { totalLessons: lessonCount },
    });

    return { success: true, deleted: lessonId };
  }

  /**
   * Generate a template structure based on area type
   */
  @Post(':id/generate-structure')
  async generateStructure(@Request() req: any, @Param('id') id: string) {
    const workspaceId = req.user.workspaceId;

    const area = await this.prisma.memberArea.findFirst({
      where: { id, workspaceId },
    });

    if (!area) {
      throw new NotFoundException('Member area not found');
    }

    const existingModules = await this.prisma.memberModule.count({
      where: { memberAreaId: id },
    });

    if (existingModules > 0) {
      throw new BadRequestException(
        'Esta área já possui módulos. Edite a estrutura atual em vez de gerar outra do zero.',
      );
    }

    const type = area.type || 'COURSE';
    let modulesData: Array<{
      name: string;
      description: string;
      position: number;
      lessons: Array<{ name: string; type: string; position: number }>;
    }> = [];

    if (type === 'COURSE') {
      modulesData = [
        {
          name: 'Fundamentos',
          description: 'Base teorica e conceitos essenciais',
          position: 0,
          lessons: [
            { name: 'Introducao ao Curso', type: 'VIDEO', position: 0 },
            { name: 'Conceitos Basicos', type: 'VIDEO', position: 1 },
            { name: 'Ferramentas Necessarias', type: 'TEXT', position: 2 },
            { name: 'Quiz - Fundamentos', type: 'QUIZ', position: 3 },
          ],
        },
        {
          name: 'Estrategia',
          description: 'Planejamento e estrategias avancadas',
          position: 1,
          lessons: [
            { name: 'Definindo Objetivos', type: 'VIDEO', position: 0 },
            { name: 'Analise de Mercado', type: 'VIDEO', position: 1 },
            { name: 'Plano de Acao', type: 'TEXT', position: 2 },
            { name: 'Quiz - Estrategia', type: 'QUIZ', position: 3 },
          ],
        },
        {
          name: 'Execucao',
          description: 'Colocando em pratica tudo que aprendeu',
          position: 2,
          lessons: [
            { name: 'Primeiro Passo', type: 'VIDEO', position: 0 },
            { name: 'Otimizacao', type: 'VIDEO', position: 1 },
            { name: 'Estudo de Caso', type: 'VIDEO', position: 2 },
            { name: 'Projeto Final', type: 'TEXT', position: 3 },
          ],
        },
      ];
    } else if (type === 'COMMUNITY') {
      modulesData = [
        {
          name: 'Comunidade',
          description: 'Espaco de discussao e networking',
          position: 0,
          lessons: [
            { name: 'Boas-vindas e Regras', type: 'TEXT', position: 0 },
            { name: 'Apresente-se', type: 'TEXT', position: 1 },
            { name: 'Duvidas e Suporte', type: 'TEXT', position: 2 },
          ],
        },
      ];
    } else if (type === 'HYBRID') {
      modulesData = [
        {
          name: 'Fundamentos',
          description: 'Base teorica e conceitos essenciais',
          position: 0,
          lessons: [
            { name: 'Introducao ao Curso', type: 'VIDEO', position: 0 },
            { name: 'Conceitos Basicos', type: 'VIDEO', position: 1 },
            { name: 'Ferramentas Necessarias', type: 'TEXT', position: 2 },
            { name: 'Quiz - Fundamentos', type: 'QUIZ', position: 3 },
          ],
        },
        {
          name: 'Estrategia',
          description: 'Planejamento e estrategias avancadas',
          position: 1,
          lessons: [
            { name: 'Definindo Objetivos', type: 'VIDEO', position: 0 },
            { name: 'Analise de Mercado', type: 'VIDEO', position: 1 },
            { name: 'Plano de Acao', type: 'TEXT', position: 2 },
            { name: 'Quiz - Estrategia', type: 'QUIZ', position: 3 },
          ],
        },
        {
          name: 'Execucao',
          description: 'Colocando em pratica tudo que aprendeu',
          position: 2,
          lessons: [
            { name: 'Primeiro Passo', type: 'VIDEO', position: 0 },
            { name: 'Otimizacao', type: 'VIDEO', position: 1 },
            { name: 'Estudo de Caso', type: 'VIDEO', position: 2 },
            { name: 'Projeto Final', type: 'TEXT', position: 3 },
          ],
        },
        {
          name: 'Comunidade',
          description: 'Espaco de discussao e networking',
          position: 3,
          lessons: [
            { name: 'Boas-vindas e Regras', type: 'TEXT', position: 0 },
            { name: 'Apresente-se', type: 'TEXT', position: 1 },
            { name: 'Duvidas e Suporte', type: 'TEXT', position: 2 },
          ],
        },
      ];
    } else if (type === 'MEMBERSHIP') {
      modulesData = [
        {
          name: 'Semana 1 - Inicio',
          description: 'Conteudo da primeira semana',
          position: 0,
          lessons: [
            { name: 'Video da Semana', type: 'VIDEO', position: 0 },
            { name: 'Material Complementar', type: 'TEXT', position: 1 },
            { name: 'Atividade Pratica', type: 'TEXT', position: 2 },
          ],
        },
        {
          name: 'Semana 2 - Aprofundamento',
          description: 'Conteudo da segunda semana',
          position: 1,
          lessons: [
            { name: 'Video da Semana', type: 'VIDEO', position: 0 },
            { name: 'Material Complementar', type: 'TEXT', position: 1 },
            { name: 'Atividade Pratica', type: 'TEXT', position: 2 },
          ],
        },
        {
          name: 'Semana 3 - Pratica',
          description: 'Conteudo da terceira semana',
          position: 2,
          lessons: [
            { name: 'Video da Semana', type: 'VIDEO', position: 0 },
            { name: 'Material Complementar', type: 'TEXT', position: 1 },
            { name: 'Atividade Pratica', type: 'TEXT', position: 2 },
          ],
        },
        {
          name: 'Semana 4 - Consolidacao',
          description: 'Conteudo da quarta semana',
          position: 3,
          lessons: [
            { name: 'Video da Semana', type: 'VIDEO', position: 0 },
            { name: 'Material Complementar', type: 'TEXT', position: 1 },
            { name: 'Revisao e Proximos Passos', type: 'TEXT', position: 2 },
          ],
        },
      ];
    }

    // Create modules and lessons in a transaction
    let totalModulesCreated = 0;
    let totalLessonsCreated = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const modData of modulesData) {
        const createdModule = await tx.memberModule.create({
          data: {
            memberAreaId: id,
            name: modData.name,
            description: modData.description,
            position: modData.position,
          },
        });
        totalModulesCreated++;

        for (const lessonData of modData.lessons) {
          await tx.memberLesson.create({
            data: {
              moduleId: createdModule.id,
              name: lessonData.name,
              type: lessonData.type,
              position: lessonData.position,
            },
          });
          totalLessonsCreated++;
        }
      }

      await tx.memberArea.update({
        where: { id },
        data: {
          totalModules: totalModulesCreated,
          totalLessons: totalLessonsCreated,
          aiGenerated: true,
        },
      });
    });

    // Fetch the full area with generated structure
    const updatedArea = await this.prisma.memberArea.findFirst({
      where: { id },
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

    this.logger.log(
      `Generated structure for area ${id}: ${totalModulesCreated} modules, ${totalLessonsCreated} lessons`,
    );

    return {
      area: this.serializeArea(req, updatedArea),
      generated: {
        modules: totalModulesCreated,
        lessons: totalLessonsCreated,
      },
      success: true,
    };
  }

  // ══════════════════════════════════════════════
  // STUDENT ENROLLMENT CRUD
  // ══════════════════════════════════════════════

  @Get(':id/students')
  async listStudents(
    @Request() req: any,
    @Param('id') areaId: string,
    @Query('q') q?: string,
  ) {
    try {
      const workspaceId = req.user.workspaceId;
      const area = await this.prisma.memberArea.findFirst({
        where: { id: areaId, workspaceId },
      });
      if (!area) return [];
      const where: any = { memberAreaId: areaId, workspaceId };
      if (q) {
        where.OR = [
          { studentName: { contains: q, mode: 'insensitive' } },
          { studentEmail: { contains: q, mode: 'insensitive' } },
        ];
      }
      const students = await this.prisma.memberEnrollment.findMany({
        where,
        orderBy: { enrolledAt: 'desc' },
      });
      return { students, count: students.length };
    } catch {
      return { students: [], count: 0 };
    }
  }

  @Post(':id/students')
  async enrollStudent(
    @Request() req: any,
    @Param('id') areaId: string,
    @Body()
    dto: {
      studentName: string;
      studentEmail: string;
      studentPhone?: string;
    },
  ) {
    const workspaceId = req.user.workspaceId;
    const area = await this.prisma.memberArea.findFirst({
      where: { id: areaId, workspaceId },
    });
    if (!area) throw new NotFoundException('Area not found');

    const studentName = dto.studentName || (dto as any).name;
    const studentEmail = dto.studentEmail || (dto as any).email;
    const studentPhone = dto.studentPhone || (dto as any).phone;

    if (!studentName || !studentEmail) {
      throw new BadRequestException('Nome e e-mail do aluno são obrigatórios');
    }

    const existingEnrollment = await this.prisma.memberEnrollment.findFirst({
      where: {
        workspaceId,
        memberAreaId: areaId,
        studentEmail,
      },
    });

    if (existingEnrollment) {
      throw new BadRequestException(
        'Este aluno já está matriculado nesta área',
      );
    }

    const enrollment = await this.prisma.memberEnrollment.create({
      data: {
        workspaceId,
        memberAreaId: areaId,
        studentName,
        studentEmail,
        studentPhone,
      },
    });

    await this.recalculateAreaTotals(areaId);

    return enrollment;
  }

  @Put(':id/students/:studentId')
  async updateStudent(
    @Request() req: any,
    @Param('id') areaId: string,
    @Param('studentId') studentId: string,
    @Body()
    dto: {
      studentName?: string;
      studentEmail?: string;
      studentPhone?: string;
      status?: string;
      progress?: number;
    },
  ) {
    const workspaceId = req.user.workspaceId;
    const enrollment = await this.prisma.memberEnrollment.findFirst({
      where: { id: studentId, memberAreaId: areaId, workspaceId },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    const updated = await this.prisma.memberEnrollment.update({
      where: { id: studentId },
      data: dto,
    });

    await this.recalculateAreaTotals(areaId);

    return updated;
  }

  @Delete(':id/students/:studentId')
  async removeStudent(
    @Request() req: any,
    @Param('id') areaId: string,
    @Param('studentId') studentId: string,
  ) {
    const workspaceId = req.user.workspaceId;
    const enrollment = await this.prisma.memberEnrollment.findFirst({
      where: { id: studentId, memberAreaId: areaId, workspaceId },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    await this.auditService.log({
      workspaceId,
      action: 'DELETE_RECORD',
      resource: 'MemberEnrollment',
      resourceId: studentId,
      details: { deletedBy: 'user', memberAreaId: areaId },
    });
    await this.prisma.memberEnrollment.delete({
      where: { id: studentId },
    });

    await this.recalculateAreaTotals(areaId);

    return { success: true };
  }
}
