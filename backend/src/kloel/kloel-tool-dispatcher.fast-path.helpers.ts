import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { KloelBusinessConfigToolsService } from './kloel-business-config-tools.service';
import type { KloelChatToolsService } from './kloel-chat-tools.service';
import type { KloelWhatsAppToolsService } from './kloel-whatsapp-tools.service';
import type { KloelCodeToolsService } from './kloel-code-tools.service';
import type { KloelCodeAnalysisService } from './kloel-code-analysis.service';
import type { KloelProductSubResourceToolsService } from './kloel-product-sub-resource-tools.service';
import type { CouponService } from './coupon.service';
import type { KloelChatCheckoutTool } from './kloel-chat-checkout.tool';
import type { KloelWalletSalesToolsService } from './kloel-wallet-sales-tools.service';
import type { SalesService } from '../sales/sales.service';
import type { AccountService } from './account.service';
import type { SelfHealthService } from './self-awareness/self-health.service';
import type { SelfGapsService } from './self-awareness/self-gaps.service';
import type { DepsCoverageService } from './self-awareness/deps-coverage.service';
import type { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
import type { MindCapabilityRegistry } from './mind/coordination/mind-capability-registry.service';
import type { MindGuardsService } from './mind/policy/mind-guards.service';
import type { ReportService } from './report.service';
import type { ChannelTransportRegistry } from './channel-transport.registry';
import type { RiskGateService } from './risk-class/risk-gate.service';

import { dispatchWhatsAppTool, isWhatsAppTool } from './kloel-tool-dispatcher.whatsapp.handlers';
import { dispatchCodeTool, isCodeTool } from './kloel-tool-dispatcher.code.handlers';
import { dispatchSelfTool, isSelfTool } from './kloel-tool-dispatcher.self.handlers';
import { dispatchConfigureTool, isConfigureTool } from './kloel-tool-dispatcher.configure.handlers';
import { dispatchSalesTool, isSalesTool } from './kloel-tool-dispatcher.sales.handlers';
import { dispatchAgentTool, isAgentTool } from './kloel-tool-dispatcher.agent.handlers';
import { dispatchAccountTool, isAccountTool } from './kloel-tool-dispatcher.account.handlers';
import {
  dispatchDottedAliasTool,
  isDottedAliasTool,
} from './kloel-tool-dispatcher.dotted-alias.handlers';
import { dispatchReportsTool, isReportsTool } from './kloel-tool-dispatcher.reports.handlers';
import {
  dispatchDepsCoverageTool,
  isDepsCoverageTool,
} from './kloel-tool-dispatcher.deps-coverage.handlers';
import {
  dispatchWalletSalesTool,
  isWalletSalesTool,
} from './kloel-tool-dispatcher.wallet-sales.handlers';
import {
  dispatchBizConfigTool,
  isBizConfigTool,
} from './kloel-tool-dispatcher.biz-config.handlers';
import {
  dispatchProductCatalogTool,
  isProductCatalogTool,
} from './kloel-tool-dispatcher.product-catalog.handlers';
import {
  dispatchWorkspaceInfoTool,
  isWorkspaceInfoTool,
} from './kloel-tool-dispatcher.workspace-info.handlers';
import {
  dispatchWorkspaceActionTool,
  isWorkspaceActionTool,
} from './kloel-tool-dispatcher.workspace-actions.handlers';
import { dispatchChannelTool, isChannelTool } from './kloel-tool-dispatcher.channel.handlers';

import type { UnknownRecord } from '../common/types';

type ToolResult = {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: unknown;
};

/** Logger surface needed by mind-guard checks. */
export interface GuardLogger {
  warn(message: unknown, ...args: unknown[]): void;
}

/** Dependencies for {@link checkMindGuard}. */
export interface MindGuardServices {
  mindGuards?: MindGuardsService;
  capRegistryV2?: CapabilityRegistryV2Service;
  logger: GuardLogger;
}

/**
 * Evaluate mind-guard policy for a tool before dispatch.
 * Returns a block result when the guard vetoes execution; `null` to proceed.
 */
export async function checkMindGuard(
  services: MindGuardServices,
  workspaceId: string,
  toolName: string,
): Promise<ToolResult | null> {
  if (!services.mindGuards || !services.capRegistryV2) {
    return null;
  }
  const cap = services.capRegistryV2.get(toolName);
  if (!cap || cap.category !== 'MUTATION_SENSITIVE') {
    return null;
  }

  const verdict = await services.mindGuards.evaluate({
    action: toolName,
    context: {},
    decisionType: 'tool_execution',
    workspaceId,
  });

  if (verdict.decision === 'block') {
    services.logger.warn(
      `MindGuard bloqueou ferramenta ${toolName} no workspace ${workspaceId}: ${verdict.reason}`,
    );
    return {
      success: false,
      error: 'mind_guard_blocked',
      reasons: [verdict.reason],
    };
  }

  if (verdict.decision === 'warn') {
    services.logger.warn(
      `MindGuard aviso para ferramenta ${toolName} no workspace ${workspaceId}: ${verdict.reason}`,
    );
  }

  return null;
}

/** Services and callbacks required by {@link runFastPathDispatch}. */
export interface FastPathServices {
  whatsappToolsService: KloelWhatsAppToolsService;
  codeToolsService: KloelCodeToolsService;
  codeAnalysisService: KloelCodeAnalysisService;
  auditService: AuditService;
  chatToolsService: KloelChatToolsService;
  bizConfigToolsService: KloelBusinessConfigToolsService;
  prisma: PrismaService;
  selfGaps?: SelfGapsService;
  selfHealth?: SelfHealthService;
  capRegistryV2?: CapabilityRegistryV2Service;
  mindCapabilityRegistry?: MindCapabilityRegistry;
  salesService?: SalesService;
  accountService?: AccountService;
  walletSalesTools?: KloelWalletSalesToolsService;
  reportService?: ReportService;
  depsCoverage?: DepsCoverageService;
  couponService?: CouponService;
  checkoutService?: KloelChatCheckoutTool;
  productSubTools?: KloelProductSubResourceToolsService;
  transports?: ChannelTransportRegistry;
  riskGate?: RiskGateService;
  executeTool: (ws: string, name: string, a: UnknownRecord, u?: string) => Promise<ToolResult>;
  applyReceipt: (
    cap: string,
    ws: string,
    a: UnknownRecord,
    r: ToolResult,
    u?: string,
    s?: number,
  ) => ToolResult;
}

/**
 * Walk the `is*Tool` fast-path checks in declaration order. Each handler
 * returns `null` when the tool name is not part of its domain; the first
 * non-null result wins.
 */
export async function runFastPathDispatch(
  services: FastPathServices,
  workspaceId: string,
  toolName: string,
  args: UnknownRecord,
  userId: string | undefined,
): Promise<ToolResult | null> {
  if (isWhatsAppTool(toolName)) {
    const result = await dispatchWhatsAppTool(
      services.whatsappToolsService,
      workspaceId,
      toolName,
      args,
    );
    if (result !== null) {
      return result;
    }
  }
  if (isCodeTool(toolName)) {
    const result = await dispatchCodeTool(
      services.codeToolsService,
      services.codeAnalysisService,
      toolName,
      args,
    );
    if (result !== null) {
      return result;
    }
  }
  if (isSelfTool(toolName)) {
    const result = await dispatchSelfTool(
      {
        auditService: services.auditService,
        selfGaps: services.selfGaps,
        selfHealth: services.selfHealth,
        capRegistryV2: services.capRegistryV2,
        mindCapabilityRegistry: services.mindCapabilityRegistry,
        prisma: services.prisma,
      },
      workspaceId,
      toolName,
      args,
    );
    if (result !== null) {
      return result;
    }
  }
  if (isConfigureTool(toolName)) {
    const result = await dispatchConfigureTool(
      services.chatToolsService,
      services.capRegistryV2,
      workspaceId,
      toolName,
      args,
      userId,
    );
    if (result !== null) {
      return result;
    }
  }
  if (isSalesTool(toolName)) {
    const result = await dispatchSalesTool(
      {
        salesService: services.salesService,
        capRegistryV2: services.capRegistryV2,
        userId,
      },
      workspaceId,
      toolName,
      args,
    );
    if (result !== null) {
      return result;
    }
  }
  if (isAgentTool(toolName)) {
    const result = await dispatchAgentTool(services.chatToolsService, workspaceId, toolName, args);
    if (result !== null) {
      return result;
    }
  }
  if (isAccountTool(toolName)) {
    const result = await dispatchAccountTool(
      {
        accountService: services.accountService,
        walletSalesTools: services.walletSalesTools,
        executeTool: (ws, name, a, u) => services.executeTool(ws, name, a, u),
        userId,
      },
      workspaceId,
      toolName,
      args,
    );
    if (result !== null) {
      return result;
    }
  }
  if (isDottedAliasTool(toolName)) {
    const result = await dispatchDottedAliasTool(
      {
        capRegistryV2: services.capRegistryV2,
        executeTool: (ws, name, a, u) => services.executeTool(ws, name, a, u),
        userId,
      },
      workspaceId,
      toolName,
      args,
    );
    if (result !== null) {
      return result;
    }
  }
  if (isReportsTool(toolName)) {
    const result = await dispatchReportsTool(
      { reportService: services.reportService },
      workspaceId,
      toolName,
      args,
    );
    if (result !== null) {
      return result;
    }
  }
  if (isDepsCoverageTool(toolName)) {
    const result = await dispatchDepsCoverageTool(
      { depsCoverage: services.depsCoverage },
      toolName,
      args,
    );
    if (result !== null) {
      return result;
    }
  }
  if (isWalletSalesTool(toolName)) {
    const result = await dispatchWalletSalesTool(
      { walletSalesTools: services.walletSalesTools },
      workspaceId,
      toolName,
      args,
    );
    if (result !== null) {
      return result;
    }
  }
  if (isBizConfigTool(toolName)) {
    const result = await dispatchBizConfigTool(
      { bizConfigToolsService: services.bizConfigToolsService },
      workspaceId,
      toolName,
      args,
    );
    if (result !== null) {
      return result;
    }
  }
  if (isProductCatalogTool(toolName)) {
    const result = await dispatchProductCatalogTool(
      {
        chatToolsService: services.chatToolsService,
        couponService: services.couponService,
        checkoutService: services.checkoutService,
        productSubTools: services.productSubTools,
      },
      workspaceId,
      toolName,
      args,
      userId,
    );
    if (result !== null) {
      return result;
    }
  }
  if (isWorkspaceInfoTool(toolName)) {
    const result = await dispatchWorkspaceInfoTool(
      { chatToolsService: services.chatToolsService },
      workspaceId,
      toolName,
      args,
    );
    if (result !== null) {
      return result;
    }
  }
  if (isWorkspaceActionTool(toolName)) {
    const result = await dispatchWorkspaceActionTool(
      {
        chatToolsService: services.chatToolsService,
        applyReceipt: (cap, ws, a, r, u, started) =>
          services.applyReceipt(cap, ws, a, r, u, started),
        userId,
      },
      workspaceId,
      toolName,
      args,
    );
    if (result !== null) {
      return result;
    }
  }
  if (isChannelTool(toolName)) {
    if (!services.transports || !services.riskGate) {
      return { success: false, error: 'channel_dispatch_unavailable' };
    }
    const result = await dispatchChannelTool(
      { transports: services.transports, riskGate: services.riskGate },
      workspaceId,
      toolName,
      args,
    );
    if (result !== null) {
      return result;
    }
  }
  return null;
}
