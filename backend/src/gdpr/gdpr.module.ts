import { Module } from '@nestjs/common';
import { DataExportController } from './data-export.controller';
import { DataDeleteController } from './data-delete.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [DataExportController, DataDeleteController],
})
export class GdprModule {}
