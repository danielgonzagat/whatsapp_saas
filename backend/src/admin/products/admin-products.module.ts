import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminAuditModule } from '../audit/admin-audit.module';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminProductsController } from './admin-products.controller';
import { AdminProductsService } from './admin-products.service';

@Module({
  imports: [PrismaModule, AdminPermissionsModule, AdminAuditModule],
  controllers: [AdminProductsController],
  providers: [AdminProductsService],
  exports: [AdminProductsService],
})
export class AdminProductsModule {}
