import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { AdminAuditModule } from '../audit/admin-audit.module';
import { AdminAuthModule } from '../auth/admin-auth.module';
import { AdminSeedService } from './admin-seed.service';

/** Admin seed module. */
@Module({
  imports: [PrismaModule, ConfigModule, AdminAuditModule, AdminAuthModule],
  providers: [AdminSeedService],
})
export class AdminSeedModule {}
