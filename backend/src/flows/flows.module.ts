import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
// NOTA: RedisModule já é configurado globalmente no AppModule com REDIS_URL
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { FlowsController } from './flows.controller';
import { FlowsGateway } from './flows.gateway';
import { FlowsService } from './flows.service';

import { ConfigModule } from '@nestjs/config';
import { FlowOptimizerController } from './flow-optimizer.controller';
import { FlowOptimizerService } from './flow-optimizer.service';
import { FlowTemplateController } from './flow-template.controller';
import { FlowTemplateService } from './flow-template.service';

/** Flows module. */
@Module({
  imports: [
    WorkspaceModule,
    // RedisModule - REMOVIDO: já configurado globalmente
    AuthModule,
    BillingModule,
    AuditModule,
    ConfigModule,
  ], // Add RedisModule
  controllers: [FlowsController, FlowOptimizerController, FlowTemplateController],
  providers: [FlowsService, FlowsGateway, FlowOptimizerService, FlowTemplateService], // Add FlowsGateway
  exports: [FlowsService, FlowOptimizerService, FlowTemplateService],
})
export class FlowsModule {}
