import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BillingModule } from '../billing/billing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { SpineEmitterService } from '../kloel/spine/spine-emitter.service';
import { CrmEventEmitterService } from '../kloel/crm-emitter/crm-event-emitter.service';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { NeuroCrmController } from './neuro-crm.controller';
import { NeuroCrmService } from './neuro-crm.service';

/** Crm module. */
@Module({
  imports: [PrismaModule, ConfigModule, forwardRef(() => BillingModule)],
  controllers: [CrmController, NeuroCrmController],
  providers: [CrmService, NeuroCrmService, SpineEmitterService, CrmEventEmitterService],
  exports: [CrmService, NeuroCrmService, CrmEventEmitterService],
})
export class CrmModule {}
