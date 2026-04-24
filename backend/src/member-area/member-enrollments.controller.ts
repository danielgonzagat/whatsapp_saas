import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
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
import { EnrollStudentDto, readText } from './member-area.helpers';
import { MemberAreaStatsService } from './member-area-stats.service';

/**
 * MEMBER ENROLLMENTS CONTROLLER — Student listing + lifecycle
 *
 * Nested under `/member-areas/:id/students`. Every mutation re-validates the
 * parent area's workspace, then delegates counter recomputation to the shared
 * MemberAreaStatsService.
 */
@Controller('member-areas')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MemberEnrollmentsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly stats: MemberAreaStatsService,
  ) {}

  @Get(':id/students')
  async listStudents(
    @Request() req: AuthenticatedRequest,
    @Param('id') areaId: string,
    @Query('q') q?: string,
  ) {
    try {
      const workspaceId = req.user.workspaceId;
      const area = await this.prisma.memberArea.findFirst({
        where: { id: areaId, workspaceId },
      });
      if (!area) {
        return [];
      }
      const where: Record<string, unknown> = { memberAreaId: areaId, workspaceId };
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

  /** Enroll student. */
  @Post(':id/students')
  async enrollStudent(
    @Request() req: AuthenticatedRequest,
    @Param('id') areaId: string,
    @Body() dto: EnrollStudentDto,
  ) {
    const workspaceId = req.user.workspaceId;
    const area = await this.prisma.memberArea.findFirst({
      where: { id: areaId, workspaceId },
    });
    if (!area) {
      throw new NotFoundException('Area not found');
    }

    const studentName = readText(dto.studentName) ?? readText(dto.name);
    const studentEmail = readText(dto.studentEmail) ?? readText(dto.email);
    const studentPhone = readText(dto.studentPhone) ?? readText(dto.phone);

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
      throw new BadRequestException('Este aluno já está matriculado nesta área');
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

    await this.stats.recalculate(areaId, workspaceId);

    return enrollment;
  }

  /** Update student. */
  @Put(':id/students/:studentId')
  async updateStudent(
    @Request() req: AuthenticatedRequest,
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
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    const updated = await this.prisma.memberEnrollment.update({
      where: { id: studentId },
      data: dto,
      include: { memberArea: { select: { workspaceId: true } } },
    });

    await this.stats.recalculate(areaId, workspaceId);

    return updated;
  }

  /** Remove student. */
  @Delete(':id/students/:studentId')
  async removeStudent(
    @Request() req: AuthenticatedRequest,
    @Param('id') areaId: string,
    @Param('studentId') studentId: string,
  ) {
    const workspaceId = req.user.workspaceId;
    const enrollment = await this.prisma.memberEnrollment.findFirst({
      where: { id: studentId, memberAreaId: areaId, workspaceId },
    });
    if (!enrollment) {
      throw new NotFoundException('Enrollment not found');
    }
    await this.auditService.log({
      workspaceId,
      action: 'DELETE_RECORD',
      resource: 'MemberEnrollment',
      resourceId: studentId,
      details: { deletedBy: 'user', memberAreaId: areaId },
    });
    await this.prisma.memberEnrollment.deleteMany({
      where: { id: studentId, workspaceId },
    });

    await this.stats.recalculate(areaId, workspaceId);

    return { success: true };
  }
}
