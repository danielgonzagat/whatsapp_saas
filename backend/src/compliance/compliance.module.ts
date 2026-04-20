import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { JwtSetValidator } from './utils/jwt-set.validator';

/** Compliance module. */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ComplianceController],
  providers: [ComplianceService, JwtSetValidator],
  exports: [ComplianceService],
})
export class ComplianceModule {}
