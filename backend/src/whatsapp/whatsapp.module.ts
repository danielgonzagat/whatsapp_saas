import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { InboxModule } from '../inbox/inbox.module';
import { ConfigModule } from '@nestjs/config';
import { BillingModule } from '../billing/billing.module';
import { CrmModule } from '../crm/crm.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { InboundProcessorService } from './inbound-processor.service';
import { WhatsAppApiProvider } from './providers/whatsapp-api.provider';
import { WhatsAppProviderRegistry } from './providers/provider-registry';
import { WhatsAppApiController } from './controllers/whatsapp-api.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    WorkspaceModule,
    InboxModule,
    ConfigModule,
    BillingModule,
    CrmModule,
    WebhooksModule,
    PrismaModule,
  ],
  controllers: [WhatsappController, WhatsAppApiController],
  providers: [WhatsappService, InboundProcessorService, WhatsAppApiProvider, WhatsAppProviderRegistry],
  exports: [WhatsappService, InboundProcessorService, WhatsAppApiProvider, WhatsAppProviderRegistry],
})
export class WhatsappModule {}
