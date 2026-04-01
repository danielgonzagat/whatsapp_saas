import { Module } from '@nestjs/common';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { NeuroCrmService } from './neuro-crm.service';
import { NeuroCrmController } from './neuro-crm.controller';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [PrismaModule, ConfigModule, BillingModule],
  controllers: [CrmController, NeuroCrmController],
  providers: [CrmService, NeuroCrmService],
  exports: [CrmService, NeuroCrmService],
})
export class CrmModule {}
