import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { WhatsappController } from './whatsapp.controller';
import { WorkspaceModule } from '../workspaces/workspace.module';
import { InboxModule } from '../inbox/inbox.module';
import { ConfigModule } from '@nestjs/config'; // Add ConfigModule
import { BillingModule } from '../billing/billing.module';
import { CrmModule } from '../crm/crm.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [
    WorkspaceModule,
    InboxModule,
    ConfigModule,
    BillingModule,
    CrmModule,
    WebhooksModule,
  ],
  controllers: [WhatsappController],
  providers: [WhatsappService],
  exports: [WhatsappService], // <-- ESSENCIAL
})
export class WhatsappModule {}
