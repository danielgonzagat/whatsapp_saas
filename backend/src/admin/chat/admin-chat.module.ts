import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminAccountsModule } from '../accounts/admin-accounts.module';
import { AdminAccountsService } from '../accounts/admin-accounts.service';
import { AdminClientsModule } from '../clients/admin-clients.module';
import { AdminClientsService } from '../clients/admin-clients.service';
import { AdminComplianceModule } from '../compliance/admin-compliance.module';
import { AdminComplianceService } from '../compliance/admin-compliance.service';
import { AdminConfigModule } from '../config/admin-config.module';
import { AdminConfigService } from '../config/admin-config.service';
import { AdminDashboardModule } from '../dashboard/admin-dashboard.module';
import { AdminDashboardService } from '../dashboard/admin-dashboard.service';
import { AdminMarketingModule } from '../marketing/admin-marketing.module';
import { AdminMarketingService } from '../marketing/admin-marketing.service';
import { AdminNotificationsModule } from '../notifications/admin-notifications.module';
import { AdminNotificationsService } from '../notifications/admin-notifications.service';
import { AdminPermissionsModule } from '../permissions/admin-permissions.module';
import { AdminProductsModule } from '../products/admin-products.module';
import { AdminProductsService } from '../products/admin-products.service';
import { AdminReportsModule } from '../reports/admin-reports.module';
import { AdminReportsService } from '../reports/admin-reports.service';
import { AdminSalesModule } from '../sales/admin-sales.module';
import { AdminSalesService } from '../sales/admin-sales.service';
import { AdminSupportModule } from '../support/admin-support.module';
import { AdminSupportService } from '../support/admin-support.service';
import { AdminChatController } from './admin-chat.controller';
import { AdminChatService } from './admin-chat.service';
import { ChatToolRegistry } from './chat-tool.registry';
import {
  accountsOverviewTool,
  clientsOverviewTool,
  complianceOverviewTool,
  configOverviewTool,
  dashboardOverviewTool,
  marketingOverviewTool,
  notificationsOverviewTool,
  productsOverviewTool,
  reportsOverviewTool,
  salesOverviewTool,
  supportOverviewTool,
} from './tools/overview.tools';
import { searchWorkspacesTool } from './tools/search-workspaces.tool';

/** Admin chat module. */
@Module({
  imports: [
    PrismaModule,
    AdminPermissionsModule,
    AdminDashboardModule,
    AdminMarketingModule,
    AdminSalesModule,
    AdminComplianceModule,
    AdminReportsModule,
    AdminConfigModule,
    AdminSupportModule,
    AdminNotificationsModule,
    AdminClientsModule,
    AdminAccountsModule,
    AdminProductsModule,
  ],
  controllers: [AdminChatController],
  providers: [AdminChatService, ChatToolRegistry],
  exports: [AdminChatService, ChatToolRegistry],
})
export class AdminChatModule implements OnModuleInit {
  constructor(
    private readonly registry: ChatToolRegistry,
    private readonly prisma: PrismaService,
    private readonly dashboard: AdminDashboardService,
    private readonly marketing: AdminMarketingService,
    private readonly sales: AdminSalesService,
    private readonly compliance: AdminComplianceService,
    private readonly reports: AdminReportsService,
    private readonly config: AdminConfigService,
    private readonly support: AdminSupportService,
    private readonly notifications: AdminNotificationsService,
    private readonly clients: AdminClientsService,
    private readonly accounts: AdminAccountsService,
    private readonly products: AdminProductsService,
  ) {}

  /** On module init. */
  onModuleInit(): void {
    // Bootstrap the built-in read tools. Domain modules can
    // register their own tools via ChatToolRegistry.register from
    // their own onModuleInit in follow-up PRs.
    this.registry.register(searchWorkspacesTool(this.prisma));
    this.registry.register(dashboardOverviewTool(this.dashboard));
    this.registry.register(marketingOverviewTool(this.marketing));
    this.registry.register(salesOverviewTool(this.sales));
    this.registry.register(complianceOverviewTool(this.compliance));
    this.registry.register(reportsOverviewTool(this.reports));
    this.registry.register(configOverviewTool(this.config));
    this.registry.register(supportOverviewTool(this.support));
    this.registry.register(notificationsOverviewTool(this.notifications));
    this.registry.register(clientsOverviewTool(this.clients));
    this.registry.register(accountsOverviewTool(this.accounts));
    this.registry.register(productsOverviewTool(this.products));
  }
}
