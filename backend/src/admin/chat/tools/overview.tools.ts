import { AdminAction, AdminModule } from '@prisma/client';
import type { AdminAccountsService } from '../../accounts/admin-accounts.service';
import type { AdminClientsService } from '../../clients/admin-clients.service';
import type { AdminComplianceService } from '../../compliance/admin-compliance.service';
import type { AdminConfigService } from '../../config/admin-config.service';
import type { AdminDashboardService } from '../../dashboard/admin-dashboard.service';
import type { AdminMarketingService } from '../../marketing/admin-marketing.service';
import type { AdminNotificationsService } from '../../notifications/admin-notifications.service';
import type { AdminProductsService } from '../../products/admin-products.service';
import type { AdminReportsService } from '../../reports/admin-reports.service';
import type { AdminSalesService } from '../../sales/admin-sales.service';
import type { AdminSupportService } from '../../support/admin-support.service';
import type { ChatTool } from '../chat-tool.registry';

type OverviewPeriod = 'TODAY' | '30D' | 'CUSTOM';

function readPeriod(args: Record<string, unknown>): OverviewPeriod {
  return typeof args.period === 'string' ? (args.period as OverviewPeriod) : '30D';
}

function asRecord<T>(value: T): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}

/** Dashboard overview tool. */
export function dashboardOverviewTool(service: AdminDashboardService): ChatTool {
  return {
    name: 'dashboardOverview',
    kind: 'read',
    description: 'Resumo executivo do dashboard global com GMV, receita Kloel e produtores.',
    permissionModule: AdminModule.HOME,
    permissionAction: AdminAction.VIEW,
    inputSchema: { type: 'object', properties: { period: { type: 'string' } } },
    async execute(args) {
      return asRecord(await service.getHome(readPeriod(args), 'NONE'));
    },
  };
}

/** Marketing overview tool. */
export function marketingOverviewTool(service: AdminMarketingService): ChatTool {
  return {
    name: 'marketingOverview',
    kind: 'read',
    description: 'Resumo global de marketing com canais, feed e top produtos.',
    permissionModule: AdminModule.MARKETING,
    permissionAction: AdminAction.VIEW,
    inputSchema: { type: 'object', properties: { period: { type: 'string' } } },
    async execute(args) {
      return asRecord(await service.overview(readPeriod(args)));
    },
  };
}

/** Sales overview tool. */
export function salesOverviewTool(service: AdminSalesService): ChatTool {
  return {
    name: 'salesOverview',
    kind: 'read',
    description: 'Resumo global de vendas com pipeline, assinaturas e transações.',
    permissionModule: AdminModule.VENDAS,
    permissionAction: AdminAction.VIEW,
    inputSchema: { type: 'object', properties: { search: { type: 'string' } } },
    async execute(args) {
      return asRecord(
        await service.overview({
          search: typeof args.search === 'string' ? args.search : undefined,
        }),
      );
    },
  };
}

/** Compliance overview tool. */
export function complianceOverviewTool(service: AdminComplianceService): ChatTool {
  return {
    name: 'complianceOverview',
    kind: 'read',
    description: 'Resumo global de compliance com chargebacks, reembolsos e KYC.',
    permissionModule: AdminModule.COMPLIANCE,
    permissionAction: AdminAction.VIEW,
    inputSchema: { type: 'object', properties: { period: { type: 'string' } } },
    async execute(args) {
      return asRecord(await service.overview(readPeriod(args)));
    },
  };
}

/** Reports overview tool. */
export function reportsOverviewTool(service: AdminReportsService): ChatTool {
  return {
    name: 'reportsOverview',
    kind: 'read',
    description: 'Resumo executivo dos relatórios com histórico de export.',
    permissionModule: AdminModule.RELATORIOS,
    permissionAction: AdminAction.VIEW,
    inputSchema: { type: 'object', properties: { period: { type: 'string' } } },
    async execute(args) {
      return asRecord(await service.overview(readPeriod(args)));
    },
  };
}

/** Config overview tool. */
export function configOverviewTool(service: AdminConfigService): ChatTool {
  return {
    name: 'configOverview',
    kind: 'read',
    description: 'Resumo das configurações operacionais por workspace.',
    permissionModule: AdminModule.CONFIGURACOES,
    permissionAction: AdminAction.VIEW,
    inputSchema: { type: 'object', properties: { search: { type: 'string' } } },
    async execute(args) {
      return asRecord(
        await service.overview(typeof args.search === 'string' ? args.search : undefined),
      );
    },
  };
}

/** Support overview tool. */
export function supportOverviewTool(service: AdminSupportService): ChatTool {
  return {
    name: 'supportOverview',
    kind: 'read',
    description: 'Fila operacional de suporte com tickets e prioridades.',
    permissionModule: AdminModule.CONTAS,
    permissionAction: AdminAction.VIEW,
    inputSchema: { type: 'object', properties: { search: { type: 'string' } } },
    async execute(args) {
      return asRecord(
        await service.overview(typeof args.search === 'string' ? args.search : undefined),
      );
    },
  };
}

/** Notifications overview tool. */
export function notificationsOverviewTool(service: AdminNotificationsService): ChatTool {
  return {
    name: 'notificationsOverview',
    kind: 'read',
    description: 'Alertas operacionais do admin respeitando preferências do usuário.',
    permissionModule: AdminModule.HOME,
    permissionAction: AdminAction.VIEW,
    inputSchema: { type: 'object', properties: {} },
    async execute(_args, context) {
      if (!context) {
        return { items: [], unreadCount: 0 };
      }
      return asRecord(await service.list(context.adminUserId));
    },
  };
}

/** Clients overview tool. */
export function clientsOverviewTool(service: AdminClientsService): ChatTool {
  return {
    name: 'clientsOverview',
    kind: 'read',
    description: 'Lista e resumo dos clientes da plataforma com health score.',
    permissionModule: AdminModule.CLIENTES,
    permissionAction: AdminAction.VIEW,
    inputSchema: { type: 'object', properties: { search: { type: 'string' } } },
    async execute(args) {
      return asRecord(
        await service.list({
          search: typeof args.search === 'string' ? args.search : undefined,
          take: 20,
        }),
      );
    },
  };
}

/** Accounts overview tool. */
export function accountsOverviewTool(service: AdminAccountsService): ChatTool {
  return {
    name: 'accountsOverview',
    kind: 'read',
    description: 'Lista e resumo das contas operacionais com status administrativo.',
    permissionModule: AdminModule.CONTAS,
    permissionAction: AdminAction.VIEW,
    inputSchema: { type: 'object', properties: { search: { type: 'string' } } },
    async execute(args) {
      return asRecord(
        await service.list({
          search: typeof args.search === 'string' ? args.search : undefined,
          take: 20,
        }),
      );
    },
  };
}

/** Products overview tool. */
export function productsOverviewTool(service: AdminProductsService): ChatTool {
  return {
    name: 'productsOverview',
    kind: 'read',
    description: 'Lista e resumo dos produtos moderados globalmente.',
    permissionModule: AdminModule.PRODUTOS,
    permissionAction: AdminAction.VIEW,
    inputSchema: { type: 'object', properties: { search: { type: 'string' } } },
    async execute(args) {
      return asRecord(
        await service.list({
          search: typeof args.search === 'string' ? args.search : undefined,
          take: 20,
        }),
      );
    },
  };
}
