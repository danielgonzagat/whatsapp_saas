import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillingModule } from '../billing/billing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { NeuroCrmController } from './neuro-crm.controller';
import { NeuroCrmService } from './neuro-crm.service';

@Module({
  imports: [PrismaModule, ConfigModule, BillingModule],
  controllers: [CrmController, NeuroCrmController],
  providers: [CrmService, NeuroCrmService],
  exports: [CrmService, NeuroCrmService],
})
export class CrmModule {}
