import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { DataDeleteController } from './data-delete.controller';
import { DataExportController } from './data-export.controller';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [DataExportController, DataDeleteController],
})
export class GdprModule {}
