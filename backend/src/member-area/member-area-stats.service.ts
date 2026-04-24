import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * MemberArea denormalized-counters service.
 *
 * Recomputes totalStudents / avgCompletion / totalModules / totalLessons for
 * a single member area. Always requires an explicit workspaceId so the
 * enrollment aggregate is workspace-bounded — defense in depth for the
 * tenant-isolation invariant even when the caller already narrowed by areaId.
 */
@Injectable()
export class MemberAreaStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async recalculate(areaId: string, workspaceId: string) {
    const [enrollmentAgg, moduleCount, lessonCount] = await Promise.all([
      this.prisma.memberEnrollment.aggregate({
        where: { memberAreaId: areaId, workspaceId },
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
}
