import { Module } from '@nestjs/common';
import { PlanService } from './plan.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [PlanService],
  exports: [PlanService],
})
export class PlansModule {}
