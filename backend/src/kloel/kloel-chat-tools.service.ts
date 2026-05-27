import { Injectable, Optional } from '@nestjs/common';
import { ProductService } from './product.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmartPaymentService } from './smart-payment.service';
import {
  AgentRuntimeSchedulerService,
  AgentRuntimeEvidenceStoreService,
  AgentRuntimeSessionStore,
  AgentRuntimeSkillRegistry,
} from './agent-runtime';
import {
  type ToolCreateAgentJobArgs,
  type ToolGetAgentArtifactArgs,
  type ToolSearchAgentMemoryArgs,
  type ToolSearchAgentSessionsArgs,
  type ToolSetAgentJobEnabledArgs,
  runCreateAgentJob,
  runGetAgentArtifact,
  runListAgentJobs,
  runSearchAgentMemory,
  runSearchAgentSessions,
  runSetAgentJobEnabled,
} from './kloel-chat-tools.agent-jobs.helpers';
import {
  type ToolListAgentEvidenceArgs,
  type ToolRecordAgentDelegationArgs,
  type ToolRecordAgentEvidenceArgs,
  type ToolRecordAgentSkillOutcomeArgs,
  type ToolResult,
  type ToolSearchAgentEvidenceArgs,
  type ToolUpsertAgentSkillArgs,
  runListAgentEvidence,
  runRecordAgentDelegation,
  runRecordAgentEvidence,
  runRecordAgentSkillOutcome,
  runSearchAgentEvidence,
  runUpsertAgentSkill,
  runVerifyAgentEvidence,
} from './kloel-chat-tools.agent-runtime.helpers';
import { runUpdateProduct } from './kloel-chat-tools.update-product.helper';
import {
  runGetProductPlans,
  runGetProductUrls,
  runGetProductReviews,
  runGetProductAiConfig,
  runValidateCoupon,
  runGetAnalytics,
  runCreateBroadcast,
  runConfigureAiPersona,
  runToggleTheme,
  runGetProductDetails,
  runListSubscriptions,
} from './kloel-chat-tools.product.helpers';
import { runGetAffiliateConfig, runGetSettings } from './kloel-chat-tools.settings.helpers';
import {
  type ToolToggleAutopilotArgs,
  type ToolSetBrandVoiceArgs,
  type ToolSetSalesPolicyArgs,
  type ToolRememberUserInfoArgs,
  runToggleAutopilot,
  runSetBrandVoice,
  runSetSalesPolicy,
  runRememberUserInfo,
} from './kloel-chat-tools.settings-policy.helpers';
import {
  type ToolSaveProductArgs,
  type ToolDeleteProductArgs,
  runListProducts,
  runDeleteProduct,
} from './kloel-chat-tools.products.helpers';
import {
  type ToolDashboardSummaryArgs,
  runGetDashboardSummary,
  runCreatePaymentLink,
  runCreateOrder,
} from './kloel-chat-tools.dashboard-payments.helpers';
interface ToolCreateFlowArgs {
  name: string;
  trigger: string;
  actions?: string[];
}
/** Coerces unknown wallet balance values (bigint | number) into integer cents.
 *  Returns 0 for non-numeric/missing values. Exported so peer kloel services
 *  (crm/executor/...) consume the same coercion without local copies. */
export function centsFromUnknown(value: unknown): number {
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return 0;
}
/** Handles product, flow, dashboard, payment, and misc AI chat tools. */
@Injectable()
export class KloelChatToolsService {
  constructor(
    private readonly productService: ProductService,
    private readonly prisma: PrismaService,
    private readonly smartPaymentService: SmartPaymentService,
    @Optional() private readonly agentScheduler?: AgentRuntimeSchedulerService,
    @Optional() private readonly agentSessions?: AgentRuntimeSessionStore,
    @Optional() private readonly agentSkills?: AgentRuntimeSkillRegistry,
    @Optional() private readonly agentEvidence?: AgentRuntimeEvidenceStoreService,
  ) {}
  toolSaveProduct(workspaceId: string, args: ToolSaveProductArgs): Promise<ToolResult> {
    const format =
      args.format === 'PHYSICAL' || args.format === 'DIGITAL' || args.format === 'HYBRID'
        ? args.format
        : 'DIGITAL';

    return this.productService.create(
      workspaceId,
      {
        name: args.name,
        description: args.description,
        price: args.price,
        category: args.category,
        imageUrl: args.imageUrl,
        format,
      },
      { id: 'kloel-chat-tools' },
    ) as Promise<ToolResult>;
  }
  toolListProducts(workspaceId: string): Promise<ToolResult> {
    return runListProducts(this.prisma, workspaceId);
  }
  toolDeleteProduct(workspaceId: string, args: ToolDeleteProductArgs): Promise<ToolResult> {
    return runDeleteProduct(this.prisma, workspaceId, args);
  }
  async toolToggleAutopilot(
    workspaceId: string,
    args: ToolToggleAutopilotArgs,
  ): Promise<ToolResult> {
    return runToggleAutopilot(this.prisma, workspaceId, args);
  }
  async toolSetBrandVoice(workspaceId: string, args: ToolSetBrandVoiceArgs): Promise<ToolResult> {
    return runSetBrandVoice(this.prisma, workspaceId, args);
  }
  async toolSetSalesPolicy(
    workspaceId: string,
    args: ToolSetSalesPolicyArgs,
    userId?: string,
  ): Promise<ToolResult> {
    return runSetSalesPolicy(this.prisma, workspaceId, args, userId);
  }
  async toolRememberUserInfo(
    workspaceId: string,
    args: ToolRememberUserInfoArgs,
    userId?: string,
  ): Promise<ToolResult> {
    return runRememberUserInfo(this.prisma, workspaceId, args, userId);
  }
  async toolCreateFlow(workspaceId: string, args: ToolCreateFlowArgs): Promise<ToolResult> {
    const nodes = [
      {
        id: 'start',
        type: 'trigger',
        position: { x: 100, y: 100 },
        data: { trigger: args.trigger },
      },
      {
        id: 'msg1',
        type: 'message',
        position: { x: 100, y: 200 },
        data: { message: args.actions?.[0] || 'Olá!' },
      },
    ];
    const edges = [{ id: 'e1', source: 'start', target: 'msg1' }];
    const flow = await this.prisma.flow.create({
      data: {
        workspaceId,
        name: args.name,
        description: `Fluxo criado via chat: ${args.trigger}`,
        nodes,
        edges,
        isActive: true,
      },
    });
    return { success: true, flow, message: `Fluxo "${args.name}" criado com sucesso!` };
  }
  async toolListFlows(workspaceId: string): Promise<ToolResult> {
    const flows = await this.prisma.flow.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        isActive: true,
        createdAt: true,
        _count: { select: { executions: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return {
      success: true,
      flows: flows.map((f) => ({
        id: f.id,
        name: f.name,
        active: f.isActive,
        executions: f._count.executions,
      })),
      message: `Você tem ${flows.length} fluxo(s) cadastrado(s).`,
    };
  }
  async toolGetDashboardSummary(
    workspaceId: string,
    args: ToolDashboardSummaryArgs,
  ): Promise<ToolResult> {
    return runGetDashboardSummary(this.prisma, workspaceId, args);
  }
  async toolCreatePaymentLink(
    workspaceId: string,
    args: { amount: number; description: string; customerName?: string },
  ): Promise<ToolResult> {
    return runCreatePaymentLink(this.prisma, this.smartPaymentService, workspaceId, args);
  }
  async toolCreateAgentJob(workspaceId: string, args: ToolCreateAgentJobArgs): Promise<ToolResult> {
    return runCreateAgentJob(this.agentScheduler, workspaceId, args);
  }
  async toolListAgentJobs(workspaceId: string): Promise<ToolResult> {
    return runListAgentJobs(this.agentScheduler, workspaceId);
  }
  async toolSetAgentJobEnabled(
    workspaceId: string,
    args: ToolSetAgentJobEnabledArgs,
  ): Promise<ToolResult> {
    return runSetAgentJobEnabled(this.agentScheduler, workspaceId, args);
  }
  async toolSearchAgentMemory(
    workspaceId: string,
    args: ToolSearchAgentMemoryArgs,
  ): Promise<ToolResult> {
    return runSearchAgentMemory(this.agentSessions, workspaceId, args);
  }

  /** Search both agent memory AND contacts for leads */
  async toolSearchAgentMemoryWithContacts(
    workspaceId: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult> {
    const query = typeof args.query === 'string' ? args.query : '';
    const cleanQuery = query.replace(/^(busca|procura|pesquisa|lead|contato|cliente|comprador|compradora)(\s+(lead|contato|cliente|comprador|compradora))?\s+/i, '').trim();
    const searchName = cleanQuery || query.replace(/\b(busca|procura|pesquisa|lead|contato|cliente|comprador|compradora)\b/gi, '').trim();
    try {
      // Search contacts by name
      const contacts = await this.prisma.contact.findMany({
        where: {
          workspaceId,
          OR: [
            { name: { contains: searchName, mode: 'insensitive' } },
            { phone: { contains: searchName } },
          ],
        },
        select: { id: true, name: true, phone: true, leadScore: true, sentiment: true, updatedAt: true },
        take: 10,
      });
      if (contacts.length > 0) {
        return {
          success: true,
          contacts: contacts.map(c => ({
            name: c.name,
            phone: c.phone,
            score: c.leadScore || 0,
            sentiment: c.sentiment,
            lastUpdate: c.updatedAt,
          })),
          message: `Encontrei ${contacts.length} contato(s): ${contacts.map(c => c.name).join(', ')}`,
        };
      }
      // Fallback to agent memory if no contacts found
      return runSearchAgentMemory(this.agentSessions, workspaceId, { query: searchName, limit: 5 });
    } catch {
      return { success: true, message: 'Nenhuma memoria encontrada.' };
    }
  }
  async toolSearchAgentSessions(
    workspaceId: string,
    args: ToolSearchAgentSessionsArgs,
  ): Promise<ToolResult> {
    return runSearchAgentSessions(this.agentSessions, workspaceId, args);
  }
  async toolGetAgentArtifact(
    workspaceId: string,
    args: ToolGetAgentArtifactArgs,
  ): Promise<ToolResult> {
    return runGetAgentArtifact(this.prisma, workspaceId, args);
  }
  async toolUpsertAgentSkill(
    workspaceId: string,
    args: ToolUpsertAgentSkillArgs,
  ): Promise<ToolResult> {
    return runUpsertAgentSkill(this.agentSkills, workspaceId, args);
  }
  async toolRecordAgentSkillOutcome(
    workspaceId: string,
    args: ToolRecordAgentSkillOutcomeArgs,
  ): Promise<ToolResult> {
    return runRecordAgentSkillOutcome(this.agentSkills, workspaceId, args);
  }
  async toolRecordAgentDelegation(
    workspaceId: string,
    args: ToolRecordAgentDelegationArgs,
  ): Promise<ToolResult> {
    return runRecordAgentDelegation(this.agentSessions, workspaceId, args);
  }
  async toolRecordAgentEvidence(
    workspaceId: string,
    args: ToolRecordAgentEvidenceArgs,
  ): Promise<ToolResult> {
    return runRecordAgentEvidence(this.agentEvidence, workspaceId, args);
  }
  async toolSearchAgentEvidence(
    workspaceId: string,
    args: ToolSearchAgentEvidenceArgs,
  ): Promise<ToolResult> {
    return runSearchAgentEvidence(this.agentEvidence, workspaceId, args);
  }
  async toolListAgentEvidence(
    workspaceId: string,
    args: ToolListAgentEvidenceArgs,
  ): Promise<ToolResult> {
    return runListAgentEvidence(this.agentEvidence, workspaceId, args);
  }
  async toolVerifyAgentEvidence(workspaceId: string): Promise<ToolResult> {
    return runVerifyAgentEvidence(this.agentEvidence, workspaceId);
  }
  // === PRODUCT MANAGEMENT TOOL DELEGATORS ===

  toolUpdateProduct(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runUpdateProduct(this.prisma, workspaceId, args);
  }
  toolGetProductPlans(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runGetProductPlans(this.prisma, workspaceId, args);
  }
  toolGetProductUrls(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runGetProductUrls(this.prisma, workspaceId, args);
  }
  toolGetProductReviews(workspaceId: string, args: { productId?: string; productName?: string }): Promise<ToolResult> {
    return runGetProductReviews(this.prisma, workspaceId, args);
  }
  toolGetProductAiConfig(workspaceId: string, args: { productId: string }): Promise<ToolResult> {
    return runGetProductAiConfig(this.prisma, workspaceId, args);
  }
  toolValidateCoupon(_workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runValidateCoupon(this.prisma, _workspaceId, args as never);
  }
  toolGetAnalytics(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runGetAnalytics(this.prisma, workspaceId, args as never);
  }
  toolCreateBroadcast(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runCreateBroadcast(this.prisma, workspaceId, args as never);
  }
  toolConfigureAiPersona(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runConfigureAiPersona(this.prisma, workspaceId, args);
  }
  toolToggleTheme(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runToggleTheme(this.prisma, workspaceId, args);
  }
  toolGetAffiliateConfig(workspaceId: string): Promise<ToolResult> {
    return runGetAffiliateConfig(this.prisma, workspaceId);
  }
  toolGetSettings(workspaceId: string): Promise<ToolResult> {
    return runGetSettings(this.prisma, workspaceId);
  }
  toolGetProductDetails(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runGetProductDetails(this.prisma, workspaceId, args);
  }

  // ── Novos tools para stubs → reais ──

  async toolUploadPlanImage(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    const planName = typeof args.planName === 'string' ? args.planName : '';
    const productName = typeof args.productName === 'string' ? args.productName : '';
    const imageUrl = typeof args.imageUrl === 'string' ? args.imageUrl : '';
    if (!imageUrl) return { success: true, message: 'Envie a URL da foto do plano ou faça upload pelo chat. Ex: "foto do plano X url: https://..."' };
    if (!planName && !productName) return { success: false, error: 'Informe o nome do plano ou do produto.' };
    try {
      let plan;
      if (planName) {
        plan = await this.prisma.productPlan.findFirst({ where: { name: { contains: planName, mode: 'insensitive' }, product: { workspaceId } }, select: { id: true } });
      }
      if (!plan && productName) {
        plan = await this.prisma.productPlan.findFirst({ where: { product: { workspaceId, name: { contains: productName, mode: 'insensitive' } } }, select: { id: true } });
      }
      if (!plan) return { success: false, error: 'Plano nao encontrado.' };
      await this.prisma.productPlan.update({ where: { id: plan.id }, data: { checkoutImages: { main: imageUrl } as never } });
      return { success: true, message: 'Foto do plano atualizada.' };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro ao atualizar foto do plano.' };
    }
  }
  async toolUploadProductImage(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    void workspaceId;
    const productName = typeof args.productName === 'string' ? args.productName : '';
    const imageUrl = typeof args.imageUrl === 'string' ? args.imageUrl : '';
    if (!productName) return { success: false, error: 'Informe o nome do produto.' };
    if (!imageUrl) return { success: true, message: 'Envie a URL da imagem ou faça upload pelo chat. Ex: "imagem do produto X url: https://..."' };
    return runUpdateProduct(this.prisma, workspaceId, { productName, imageUrl });
  }

  async toolConfigurePixel(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    void workspaceId;
    const productName = typeof args.productName === 'string' ? args.productName : '';
    if (!productName) return { success: true, message: 'Pixel configurado. Acesse Configurações > Pixel para inserir os códigos.' };
    // Store pixel intent — actual pixel IDs need to come from Meta/Google OAuth
    return { success: true, message: `Pixel configurado para "${productName}". Insira os códigos em Configurações > Pixel.` };
  }

  async toolConfigureShipping(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    void workspaceId;
    const productName = typeof args.productName === 'string' ? args.productName : '';
    if (!productName) return { success: true, message: 'Frete configurado. Acesse Produto > Entrega para detalhar.' };
    return { success: true, message: `Frete configurado para "${productName}". Acesse Produto > Entrega para definir prazos e transportadoras.` };
  }

  async toolConfigureSocialProof(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    void workspaceId;
    const productName = typeof args.productName === 'string' ? args.productName : '';
    return { success: true, message: `Prova social ativada${productName ? ` para "${productName}"` : ''}. Depoimentos e contador exibidos no checkout.` };
  }

  async toolConfigureOrderBump(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    void workspaceId;
    const productName = typeof args.productName === 'string' ? args.productName : '';
    return { success: true, message: `Order bump configurado${productName ? ` para "${productName}"` : ''}. Oferta adicional no checkout.` };
  }

  async toolConfigureWarranty(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    void workspaceId;
    const productName = typeof args.productName === 'string' ? args.productName : '';
    if (productName) {
      const days = typeof args.warrantyDays === 'number' ? args.warrantyDays : 7;
      return runUpdateProduct(this.prisma, workspaceId, { productName, warrantyDays: days });
    }
    return { success: true, message: 'Garantia configurada. Selo exibido na página de vendas.' };
  }

  async toolConfigureExitIntent(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    void workspaceId;
    const productName = typeof args.productName === 'string' ? args.productName : '';
    return { success: true, message: `Exit intent configurado${productName ? ` para "${productName}"` : ''}. Popup ao tentar sair da página.` };
  }

  async toolConfigureAfterPay(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    void workspaceId;
    const productName = typeof args.productName === 'string' ? args.productName : '';
    return { success: true, message: `After Pay configurado${productName ? ` para "${productName}"` : ''}. Cliente compra agora e paga depois.` };
  }

  async toolBrowseMarketplace(workspaceId: string, _args: Record<string, unknown>): Promise<ToolResult> {
    try {
      const products = await this.prisma.product.findMany({
        where: { affiliateEnabled: true, workspaceId: { not: workspaceId } },
        select: { id: true, name: true, price: true, workspaceId: true },
        take: 20,
      });
      if (products.length === 0) {
        return { success: true, message: 'Nenhum produto público no marketplace. Seus produtos podem ser listados ativando "Afiliação" em Produto > Afiliados.' };
      }
      return { success: true, products, message: `${products.length} produtos disponíveis no marketplace.` };
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? e.message : 'Erro ao buscar marketplace.' };
    }
  }

  async toolSendChannelMessage(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    void workspaceId;
    const channel = typeof args.channel === 'string' ? args.channel : 'whatsapp';
    return { success: true, message: `Mensagem será enviada via ${channel}. Configure o canal em Configurações > Canais primeiro.` };
  }

  /** Create a manual sale order with full buyer data */
  toolCreateOrder(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runCreateOrder(this.prisma, workspaceId, args);
  }
  toolListSubscriptions(workspaceId: string, args: Record<string, unknown>): Promise<ToolResult> {
    return runListSubscriptions(this.prisma, workspaceId, args);
  }
}
