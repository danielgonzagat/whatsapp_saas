import { Module } from '@nestjs/common';
import { FlowsController } from './flows.controller';
import { FlowsService } from './flows.service';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { FlowsGateway } from './flows.gateway';
// NOTA: RedisModule já é configurado globalmente no AppModule com REDIS_URL
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { AuditModule } from '../audit/audit.module';

import { FlowOptimizerService } from './flow-optimizer.service';
import { FlowOptimizerController } from './flow-optimizer.controller';
import { ConfigModule } from '@nestjs/config';
import { FlowTemplateService } from './flow-template.service';
import { FlowTemplateController } from './flow-template.controller';

@Module({
  imports: [
    WorkspaceModule,
    // RedisModule - REMOVIDO: já configurado no AppModule
    AuthModule,
    BillingModule,
    AuditModule,
    ConfigModule,
  ], // Add RedisModule
  controllers: [
    FlowsController,
    FlowOptimizerController,
    FlowTemplateController,
  ],
  providers: [
    FlowsService,
    FlowsGateway,
    FlowOptimizerService,
    FlowTemplateService,
  ], // Add FlowsGateway
  exports: [FlowsService, FlowOptimizerService, FlowTemplateService],
})
export class FlowsModule {}
