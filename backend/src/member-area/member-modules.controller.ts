import {
  Body,
  Controller,
  Delete,
  NotFoundException,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLessonDto, CreateModuleDto, UpdateLessonDto } from './member-area.helpers';

/**
 * MEMBER MODULES CONTROLLER — Modules + Lessons CRUD
 *
 * Nested resources of `/member-areas/:id`. Shares the same workspace guard as
 * the Areas controller; every mutation re-verifies that the parent area
 * belongs to the caller's workspace before touching the child records.
 */
@Controller('member-areas')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MemberModulesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Create a module inside a member area — accepts idempotencyKey
   */
  @Post(':id/modules')
  async createModule(
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CreateModuleDto,
  ) {
    const workspaceId = req.user.workspaceId;

    // Idempotency: check for existingRecord with same name in this area
    if (dto.name) {
      const existingRecord = await this.prisma.memberModule.findFirst({
        where: { memberAreaId: id, name: dto.name },
      });
      if (existingRecord) {
        return { data: existingRecord };
      }
    }

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
    @Request() req: AuthenticatedRequest,
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
    @Request() req: AuthenticatedRequest,
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
    @Request() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('moduleId') moduleId: string,
    @Body() dto: CreateLessonDto,
  ) {
    const workspaceId = req.user.workspaceId;

    // Idempotency: check for existingRecord with same name in this module
    if (dto.name) {
      const existingRecord = await this.prisma.memberLesson.findFirst({
        where: { moduleId, name: dto.name },
      });
      if (existingRecord) {
        return { data: existingRecord };
      }
    }

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
    @Request() req: AuthenticatedRequest,
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
    @Request() req: AuthenticatedRequest,
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
}
