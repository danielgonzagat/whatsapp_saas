import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MemberAreaStatsService } from './member-area-stats.service';
import { MemberAreasController } from './member-areas.controller';
import { MemberEnrollmentsController } from './member-enrollments.controller';
import { MemberModulesController } from './member-modules.controller';
import { MemberStructureController } from './member-structure.controller';

/**
 * Member area module.
 *
 * Routes under `/member-areas` are split into four focused controllers:
 *
 *   - MemberAreasController        — areas CRUD (list/get/create/update/delete)
 *   - MemberModulesController      — modules + lessons CRUD
 *   - MemberStructureController    — POST :id/generate-structure template
 *   - MemberEnrollmentsController  — students CRUD + enrollment lifecycle
 *
 * Each controller declares its own `@UseGuards(JwtAuthGuard, WorkspaceGuard)`
 * and operates on the same prefix so the HTTP surface is unchanged from the
 * prior single-controller layout. Shared denormalized-counter recomputation
 * lives in MemberAreaStatsService.
 */
@Module({
  imports: [PrismaModule],
  controllers: [
    MemberAreasController,
    MemberModulesController,
    MemberStructureController,
    MemberEnrollmentsController,
  ],
  providers: [MemberAreaStatsService],
})
export class MemberAreaModule {}
