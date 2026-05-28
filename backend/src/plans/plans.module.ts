import { Module } from '@nestjs/common';
import { PlanService } from './plan.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [EventEmitter2, PlanService],
  exports: [PlanService],
})
export class PlansModule {}
