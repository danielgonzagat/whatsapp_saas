import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminAuditModule } from '../audit/admin-audit.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminSupportController } from './admin-support.controller';
import { AdminSupportService } from './admin-support.service';

/** Admin support module. */
@Module({
  imports: [PrismaModule, AdminPermissionsModule, AdminAuditModule],
  controllers: [AdminSupportController],
  providers: [AdminSupportService],
  exports: [AdminSupportService],
})
export class AdminSupportModule {}
