import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminComplianceController } from './admin-compliance.controller';
import { AdminComplianceService } from './admin-compliance.service';

/** Admin compliance module. */
@Module({
  imports: [PrismaModule, AdminPermissionsModule],
  controllers: [AdminComplianceController],
  providers: [AdminComplianceService],
  exports: [AdminComplianceService],
})
export class AdminComplianceModule {}
