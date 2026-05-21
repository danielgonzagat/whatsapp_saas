import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DataDeleteController } from './data-delete.controller';
import { DataExportController } from './data-export.controller';
import { GdprController } from './gdpr.controller';
import { GdprService } from './gdpr.service';

/** Gdpr module — LGPD/GDPR data export and deletion. */
@Module({
  imports: [AuthModule, AuditModule, PrismaModule],
  controllers: [GdprController, DataExportController, DataDeleteController],
  providers: [GdprService],
  exports: [GdprService],
})
export class GdprModule {}
