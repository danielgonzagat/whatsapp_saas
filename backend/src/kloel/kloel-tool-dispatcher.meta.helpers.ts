import type { AuditService } from '../audit/audit.service';
import type { KloelCodeAnalysisService } from './kloel-code-analysis.service';
import type { KloelCodeToolsService } from './kloel-code-tools.service';
import type { KloelChatToolsService } from './kloel-chat-tools.service';
import type { PrismaService } from '../prisma/prisma.service';
import { isRecord, sanitizeDetails } from './kloel-tool-dispatcher.high-risk.helpers';
import { runRequestHighRiskApproval } from './kloel-tool-dispatcher.approval.helpers';
import type { CapabilityRegistryV2Service } from './capability-registry-v2/capability-registry-v2.service';
import type { ReportService } from './report.service';
import type { SelfGapsService } from './self-awareness/self-gaps.service';
import type { SelfHealthService } from './self-awareness/self-health.service';
import type { UnknownRecord } from '../common/types';

type ToolResult = { success: boolean; message?: string; error?: string; [key: string]: unknown };

type SelfAwarenessDeps = {
  auditService: AuditService;
  selfHealth?: SelfHealthService;
  selfGaps?: SelfGapsService;
  capRegistryV2?: CapabilityRegistryV2Service;
};

type CodeReportDeps = {
  codeToolsService: KloelCodeToolsService;
  codeAnalysisService: KloelCodeAnalysisService;
  reportService?: ReportService;
};

const CAPABILITIES = [
  'create_product', 'update_product', 'list_products', 'delete_product',
  'create_plan', 'update_plan', 'get_product_plans', 'create_checkout',
  'update_checkout', 'list_checkouts', 'create_coupon', 'update_coupon',
  'delete_coupon', 'list_coupons', 'validate_coupon', 'generate_pix',
  'generate_boleto', 'create_payment_link', 'list_orders', 'get_order_details',
  'get_sales_summary', 'get_abandonments', 'list_leads', 'get_lead_details',
  'get_wallet_balance', 'get_wallet_statement', 'request_withdrawal',
  'request_anticipation', 'get_dashboard_summary', 'get_analytics',
  'toggle_theme', 'get_settings', 'update_personal_data', 'update_fiscal_data',
  'upload_document', 'configure_shipping', 'configure_warranty', 'configure_pixel',
  'configure_social_proof', 'configure_exit_intent', 'configure_order_bump',
  'configure_after_pay', 'list_affiliates', 'get_affiliate_config',
  'update_affiliate_config', 'browse_marketplace', 'get_product_reviews',
  'get_product_urls', 'list_subscriptions', 'update_subscription',
  'search_agent_memory', 'search_agent_sessions', 'search_web', 'search_codebase',
  'read_source_file', 'connect_whatsapp', 'get_whatsapp_status',
  'send_whatsapp_message', 'send_channel_message', 'create_broadcast',
  'create_campaign', 'create_flow', 'list_flows', 'toggle_autopilot',
  'configure_ai_persona', 'update_billing_info', 'get_billing_status',
  'change_plan', 'remember_user_info', 'get_product_details', 'self.inspect',
  'self.health',
];

function periodToSince(period: string | undefined): Date {
  switch (period) {
    case 'today': {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'week':
      return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    case 'year':
      return new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    default:
      return new Date(0);
  }
}

type ProductDeps = {
  prisma: PrismaService;
  chatToolsService: KloelChatToolsService;
  capRegistryV2?: CapabilityRegistryV2Service;
};

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

const FALLBACK_EVIDENCE_URLS: Record<string, string> = {
  'plans.create': '/produtos/${productId}/planos/${planId}',
  'plans.update': '/produtos/${productId}/planos/${planId}',
  'checkouts.create': '/produtos/${productId}/checkouts/${checkoutId}',
  'checkouts.update': '/produtos/${productId}/checkouts/${checkoutId}',
  'coupons.create': '/produtos/${productId}/cupons/${couponId}',
};

function buildReceiptEvidenceUrl(capabilityId: string, template: string | undefined, outputs: UnknownRecord): string | undefined {
  const resolvedTemplate = template ?? FALLBACK_EVIDENCE_URLS[capabilityId];
  if (!resolvedTemplate) return undefined;
  return resolvedTemplate
    .replace('$' + '{productId}', asString(outputs.productId))
    .replace('$' + '{orderId}', asString(outputs.orderId))
    .replace('$' + '{planId}', asString(outputs.planId))
    .replace('$' + '{checkoutId}', asString(outputs.checkoutId))
    .replace('$' + '{couponId}', asString(outputs.couponId));
}

function deriveReceiptOutputs(result: UnknownRecord, inputs: UnknownRecord = {}): UnknownRecord {
  const product = isRecord(result.product) ? result.product : null;
  const plan = isRecord(result.plan) ? result.plan : null;
  const checkout = isRecord(result.checkout) ? result.checkout : null;
  const coupon = isRecord(result.coupon) ? result.coupon : null;
  const productId = asString(result.productId, product ? asString(product.id) : asString(plan?.productId, asString(checkout?.productId, asString(coupon?.productId, asString(inputs.productId)))));
  const orderId = asString(result.orderId, asString(result.saleId));
  const planId = asString(result.planId, plan ? asString(plan.id, asString(inputs.planId)) : '');
  const checkoutId = asString(result.checkoutId, checkout ? asString(checkout.id, asString(inputs.checkoutId)) : '');
  const couponId = asString(result.couponId, coupon ? asString(coupon.id, asString(inputs.couponId)) : asString(inputs.couponId));
  return { ...result, ...(productId ? { productId } : {}), ...(orderId ? { orderId } : {}), ...(planId ? { planId } : {}), ...(checkoutId ? { checkoutId } : {}), ...(couponId ? { couponId } : {}) };
}

function receiptKeyPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function withCanonicalReceipt(deps: ProductDeps, capabilityId: string, workspaceId: string, args: UnknownRecord, result: ToolResult, userId: string | undefined, startedAt: number): ToolResult {
  const cap = deps.capRegistryV2?.get(capabilityId);
  if (!cap || !deps.capRegistryV2) return result;
  const inputs = sanitizeDetails(args);
  const outputs = result.success ? deriveReceiptOutputs(result, inputs) : {};
  const actorId = userId ?? 'kloel-chat';
  const idempotencyKey = [receiptKeyPart(capabilityId), receiptKeyPart(workspaceId), receiptKeyPart(actorId), receiptKeyPart(JSON.stringify(inputs))].join(':');
  const requestId = idempotencyKey.slice(0, 120);
  const auditLogId = asString(result.auditLogId, 'audit_' + requestId);
  const evidenceUrl = result.success ? buildReceiptEvidenceUrl(capabilityId, cap.evidenceUrlBuilder, outputs) : undefined;
  const emittedEvents = capabilityId === 'products.upload_image' ? ['product.updated'] : cap.emits;
  const receiptParams: Parameters<CapabilityRegistryV2Service['createReceipt']>[0] = {
    capabilityId: cap.id,
    title: cap.title,
    context: { workspaceId, actorId, source: 'dashboard-chat', idempotencyKey, requestId },
    inputs,
    outputs,
    domainEvents: result.success ? emittedEvents : [],
    auditLogId,
    durationMs: Date.now() - startedAt,
    success: result.success,
  };
  if (evidenceUrl) receiptParams.evidenceUrl = evidenceUrl;
  if (typeof result.error === 'string') receiptParams.error = result.error;
  const receipt = deps.capRegistryV2.createReceipt(receiptParams);
  return { ...result, capabilityId: cap.id, outputs, domainEvents: receipt.domainEvents, auditLogId: receipt.auditLogId, evidenceUrl: receipt.evidenceUrl, receipt };
}

const DOTTED_ALIASES: Record<string, string> = {
  'plans.create': 'create_plan',
  'plans.update': 'update_plan',
  'checkouts.create': 'create_checkout',
  'checkouts.update': 'update_checkout',
  'coupons.create': 'create_coupon',
  'coupons.delete': 'delete_coupon',
};

export async function handleDottedAliasTool(
  deps: ProductDeps, workspaceId: string, toolName: string, args: UnknownRecord,
  userId: string | undefined, executeBase: (baseTool: string) => Promise<ToolResult>,
): Promise<ToolResult | null> {
  const baseTool = DOTTED_ALIASES[toolName];
  if (!baseTool) return null;
  const startedAt = Date.now();
  const result = await executeBase(baseTool);
  return withCanonicalReceipt(deps, toolName, workspaceId, args, result, userId, startedAt);
}

export async function handleProductTool(deps: ProductDeps, workspaceId: string, toolName: string, args: UnknownRecord, userId?: string): Promise<ToolResult | null> {
  switch (toolName) {
    case 'save_product':
    case 'create_product':
      return deps.chatToolsService.toolSaveProduct(workspaceId, (userId ? { ...args, actorId: userId } : args) as never);
    case 'products.create': {
      const startedAt = Date.now();
      const productArgs = userId ? { ...args, actorId: userId } : args;
      const result = await deps.chatToolsService.toolSaveProduct(workspaceId, productArgs as never);
      return withCanonicalReceipt(deps, 'products.create', workspaceId, args, result, userId, startedAt);
    }
    case 'list_products':
      return deps.chatToolsService.toolListProducts(workspaceId);
    case 'update_product':
      return deps.chatToolsService.toolUpdateProduct(workspaceId, (userId ? { ...args, actorId: userId } : args) as never);
    case 'products.update': {
      const startedAt = Date.now();
      const productArgs = userId ? { ...args, actorId: userId } : args;
      const result = await deps.chatToolsService.toolUpdateProduct(workspaceId, productArgs as never);
      return withCanonicalReceipt(deps, 'products.update', workspaceId, args, result, userId, startedAt);
    }
    case 'upload_product_image':
      return deps.chatToolsService.toolUploadProductImage(workspaceId, (userId ? { ...args, actorId: userId } : args) as never);
    case 'products.upload_image': {
      const startedAt = Date.now();
      const productArgs = userId ? { ...args, actorId: userId } : args;
      const result = await deps.chatToolsService.toolUploadProductImage(workspaceId, productArgs as never);
      return withCanonicalReceipt(deps, 'products.upload_image', workspaceId, args, result, userId, startedAt);
    }
    case 'publish_product':
    case 'products.review_and_publish':
      return runRequestHighRiskApproval(deps.prisma, workspaceId, toolName, args, userId);
    default:
      return null;
  }
}

export async function handleSelfAwarenessTool(
  deps: SelfAwarenessDeps,
  workspaceId: string,
  toolName: string,
  args: UnknownRecord,
): Promise<ToolResult | null> {
  switch (toolName) {
    case 'self.audit_log': {
      const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(args.limit, 100) : 20;
      const entries = await deps.auditService.recentForWorkspace(workspaceId, limit);
      return {
        success: true,
        capabilityId: 'self.audit_log',
        outputs: {
          entries: entries.map((e) => ({
            id: e.id,
            actor: e.agent?.name ?? e.agentId ?? 'system',
            capability: e.action,
            success: true,
            timestamp: e.createdAt.toISOString(),
            evidenceUrl: undefined,
          })),
        },
        message: 'Últimas ' + entries.length + ' ações executadas',
      };
    }
    case 'self.explain': {
      const capabilityId = typeof args.capabilityId === 'string' ? args.capabilityId : '';
      const receiptId = typeof args.lastReceiptId === 'string' ? args.lastReceiptId : undefined;
      if (receiptId) {
        const entry = await deps.auditService.findById(workspaceId, receiptId);
        if (!entry) return { success: false, error: 'receipt_not_found' };
        return {
          success: true,
          capabilityId: 'self.explain',
          outputs: {
            id: entry.id,
            action: entry.action,
            resource: entry.resource,
            inputs: (entry.details ?? {}) as Record<string, unknown>,
            timestamp: entry.createdAt.toISOString(),
            agent: entry.agent?.name ?? entry.agentId ?? 'system',
          },
          message: 'Detalhes da ação ' + entry.action,
        };
      }
      if (!capabilityId) return { success: false, error: 'capabilityId_or_lastReceiptId_required' };
      const cap = deps.capRegistryV2?.get(capabilityId);
      if (!cap) return { success: false, error: 'capability_not_found' };
      return {
        success: true,
        capabilityId: 'self.explain',
        outputs: {
          id: cap.id,
          title: cap.title,
          description: cap.description,
          tier: cap.tier,
          category: cap.category,
          requiresConfirmation: cap.requiresConfirmation,
          inputSchema: cap.inputSchema,
          surface: cap.surface,
        },
        message: cap.description,
      };
    }
    case 'self.gaps': {
      if (!deps.selfGaps) return { success: false, error: 'self_gaps_service_unavailable' };
      const result = deps.selfGaps.diffRegistryVsDispatcher();
      return {
        success: true,
        capabilityId: 'self.gaps',
        outputs: {
          unwiredCount: result.unwired.length,
          unwired: result.unwired.map((c) => ({ id: c.id, title: c.title, tier: c.tier })),
        },
        message: result.unwired.length + ' capacidades declaradas mas sem dispatcher case',
      };
    }
    case 'self.health': {
      if (!deps.selfHealth) return { success: false, error: 'self_health_service_unavailable' };
      return { success: true, capabilityId: 'self.health', outputs: await deps.selfHealth.snapshot(workspaceId) };
    }
    case 'self.capabilities':
    case 'list_capabilities': {
      if (!deps.capRegistryV2) {
        return {
          success: true,
          capabilities: CAPABILITIES,
        };
      }
      const capabilities = deps.capRegistryV2.list();
      const manifest = capabilities.map((cap) => ({
        id: cap.id,
        title: cap.title,
        category: cap.category,
        tier: cap.tier,
        requiresConfirmation: cap.requiresConfirmation,
        requiredPermissions: cap.requiredPermissions,
        surface: cap.surface,
        ...(cap.maturity !== undefined ? { maturity: cap.maturity } : {}),
      }));
      return {
        success: true,
        capabilityId: 'self.capabilities',
        capabilities: manifest.map((cap) => cap.id),
        outputs: {
          total: manifest.length,
          capabilities: manifest,
        },
        message: `${manifest.length} capacidades registradas`,
      };
    }
    default:
      return null;
  }
}

export async function handleCodeAndReportTool(
  deps: CodeReportDeps,
  workspaceId: string,
  toolName: string,
  args: UnknownRecord,
): Promise<ToolResult | null> {
  switch (toolName) {
    case 'read_source_file':
      return deps.codeToolsService.toolReadSourceFile(
        typeof args.path === 'string' ? args.path : '',
        typeof args.startLine === 'number' ? args.startLine : undefined,
        typeof args.endLine === 'number' ? args.endLine : undefined,
      );
    case 'list_source_dir':
      return deps.codeToolsService.toolListSourceDir(typeof args.path === 'string' ? args.path : undefined);
    case 'search_codebase':
      return deps.codeToolsService.toolSearchCodebase(
        typeof args.pattern === 'string' ? args.pattern : '',
        typeof args.glob === 'string' ? args.glob : undefined,
      );
    case 'code_outline':
      return deps.codeToolsService.toolCodeOutline(typeof args.path === 'string' ? args.path : '');
    case 'read_prisma_schema':
      return deps.codeToolsService.toolReadPrismaSchema();
    case 'git_log':
      return deps.codeToolsService.toolGitLog(typeof args.count === 'number' ? args.count : undefined);
    case 'git_diff':
      return deps.codeToolsService.toolGitDiff(typeof args.target === 'string' ? args.target : undefined);
    case 'git_status':
      return deps.codeToolsService.toolGitStatus();
    case 'run_backend_tests':
      return deps.codeToolsService.toolRunBackendTests(typeof args.pattern === 'string' ? args.pattern : undefined);
    case 'build_status':
      return deps.codeToolsService.toolBuildStatus(typeof args.scope === 'string' ? args.scope : undefined);
    case 'code_lint':
      return deps.codeAnalysisService.toolCodeLint(typeof args.path === 'string' ? args.path : '');
    case 'code_detect_issues':
      return deps.codeAnalysisService.toolCodeDetectIssues(typeof args.path === 'string' ? args.path : '');
    case 'codegraph_status':
      return deps.codeToolsService.toolCodeGraphStatus();
    case 'codegraph_search':
      return deps.codeToolsService.toolCodeGraphSearch(typeof args.query === 'string' ? args.query : '');
    case 'codegraph_context':
      return deps.codeToolsService.toolCodeGraphContext(typeof args.task === 'string' ? args.task : 'overview');
    case 'codegraph_callers':
      return deps.codeToolsService.toolCodeGraphCallers(typeof args.symbol === 'string' ? args.symbol : '');
    case 'codegraph_callees':
      return deps.codeToolsService.toolCodeGraphCallees(typeof args.symbol === 'string' ? args.symbol : '');
    case 'codegraph_impact':
      return deps.codeToolsService.toolCodeGraphImpact(typeof args.symbol === 'string' ? args.symbol : '');
    case 'codegraph_node':
      return deps.codeToolsService.toolCodeGraphNode(typeof args.symbol === 'string' ? args.symbol : '');
    case 'codegraph_files':
      return deps.codeToolsService.toolCodeGraphFiles();
    case 'reports.operations':
    case 'reports.abandonments': {
      if (!deps.reportService) return { success: false, error: 'report_service_unavailable' };
      const period = typeof args.period === 'string' ? args.period : undefined;
      const since = periodToSince(period);
      const res = toolName === 'reports.operations'
        ? await deps.reportService.operations(workspaceId, { since })
        : await deps.reportService.abandonments(workspaceId, { since });
      return { success: true, ...res };
    }
    case 'crm.pipeline': {
      if (!deps.reportService) return { success: false, error: 'report_service_unavailable' };
      return { success: true, ...(await deps.reportService.pipeline(workspaceId)) };
    }
    default:
      return null;
  }
}
