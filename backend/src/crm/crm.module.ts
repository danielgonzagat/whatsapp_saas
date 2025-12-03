import { Module } from '@nestjs/common';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { NeuroCrmService } from './neuro-crm.service';
import { NeuroCrmController } from './neuro-crm.controller';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [CrmController, NeuroCrmController],
  providers: [CrmService, NeuroCrmService],
  exports: [CrmService, NeuroCrmService],
})
export class CrmModule {}
