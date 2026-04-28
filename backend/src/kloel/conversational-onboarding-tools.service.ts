/**
 * ============================================
 * CONVERSATIONAL ONBOARDING TOOLS SERVICE
 * ============================================
 * Executes AI tool calls during onboarding:
 * persists business/contact/product/flow data,
 * manages KloelMemory, and renders flow templates.
 * ============================================
 */

import { Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { getFlowTemplate } from './conversational-onboarding-flow-templates';

/** Prisma extension with dynamic models not yet in generated types */
interface PrismaWithDynamicModels {
  kloelMemory: {
    findUnique(args: Record<string, unknown>): Promise<Record<string, unknown> | null>;
    findMany(args: Record<string, unknown>): Promise<Array<Record<string, unknown>>>;
    upsert(args: Record<string, unknown>): Promise<Record<string, unknown>>;
    deleteMany(args: Record<string, unknown>): Promise<{ count: number }>;
  };
  product: {
    create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  flow: {
    create(args: Record<string, unknown>): Promise<Record<string, unknown>>;
  };
  $transaction: (fn: (tx: Record<string, unknown>) => Promise<unknown>) => Promise<unknown>;
}

/** Handles tool-call execution and memory/flow persistence for onboarding. */
@Injectable()
export class ConversationalOnboardingToolsService {
  private readonly logger = new Logger(ConversationalOnboardingToolsService.name);
  private readonly prismaExt: PrismaWithDynamicModels;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {
    this.prismaExt = prisma as object as PrismaWithDynamicModels;
  }

  // ---------------------------------------------------------------------------
  // Type helpers
  // ---------------------------------------------------------------------------

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  readText(value: unknown, fallback = ''): string {
    if (typeof value === 'string') {
      return value;
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value);
    }
    return fallback;
  }

  readNumber(value: unknown, fallback = 0): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  }

  readStringArray(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }
    return value.map((entry) => this.readText(entry).trim()).filter((entry) => entry.length > 0);
  }

  toErrorMessage(error: unknown, fallback = 'unknown_error'): string {
    if (error instanceof Error) {
      const message = error.message.trim();
      if (message) {
        return message;
      }
    }
    if (this.isRecord(error)) {
      const message = this.readText(error.message).trim();
      if (message) {
        return message;
      }
    }
    return fallback;
  }

  // ---------------------------------------------------------------------------
  // Memory helpers
  // ---------------------------------------------------------------------------

  async saveMemory(
    workspaceId: string,
    key: string,
    value: unknown,
    category: string,
  ): Promise<void> {
    await this.prismaExt.kloelMemory.upsert({
      where: { workspaceId_key: { workspaceId, key } },
      create: { workspaceId, key, value, category },
      update: { value, category },
    });
  }

  async getMemoryValue(workspaceId: string, key: string): Promise<unknown> {
    const memory = await this.prismaExt.kloelMemory.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
    });
    return memory?.value;
  }

  // ---------------------------------------------------------------------------
  // Onboarding history helpers
  // ---------------------------------------------------------------------------

  async getOnboardingHistory(
    workspaceId: string,
  ): Promise<Array<{ role: string; content: string }>> {
    const messages = await this.prismaExt.kloelMemory.findMany({
      where: { workspaceId, key: { startsWith: 'onboarding_msg_' } },
      select: { id: true, key: true, value: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    return messages.map((m: Record<string, unknown>) => {
      const val = this.isRecord(m.value) ? m.value : {};
      return {
        role: this.readText(val.role) || 'assistant',
        content: this.readText(val.content),
      };
    });
  }

  async saveOnboardingMessage(workspaceId: string, role: string, content: string): Promise<void> {
    const key = `onboarding_msg_${Date.now()}`;
    await this.saveMemory(workspaceId, key, { role, content }, 'onboarding');
  }

  async clearOnboardingHistory(workspaceId: string): Promise<void> {
    await this.auditService
      .log({
        workspaceId,
        action: 'DELETE_ONBOARDING_HISTORY',
        resource: 'KloelMemory',
        details: { filter: 'onboarding_msg_*' },
      })
      .catch(() => {});

    await this.prismaExt.kloelMemory.deleteMany({
      where: { workspaceId, key: { startsWith: 'onboarding_msg_' } },
    });
  }

  // ---------------------------------------------------------------------------
  // Flow creation
  // ---------------------------------------------------------------------------

  async createAutomatedFlow(
    workspaceId: string,
    flowType: string,
    _businessContext?: string,
    customMessages?: string[],
  ): Promise<Record<string, unknown>> {
    const template = getFlowTemplate(flowType, customMessages);

    try {
      const flow = await this.prismaExt.flow.create({
        data: {
          workspaceId,
          name: template.name,
          description: template.description,
          nodes: template.nodes,
          edges: template.edges,
          isActive: true,
          triggerType: template.triggerType,
          triggerCondition: template.keywords.join(','),
        },
      });
      const flowName = this.readText(flow.name);
      const flowId = this.readText(flow.id);

      return {
        success: true,
        message: `Fluxo "${template.name}" criado com sucesso!`,
        flowId,
        flowName,
      };
    } catch (error: unknown) {
      this.logger.error('Erro ao criar fluxo automático:', error);
      return {
        success: false,
        message: `Erro ao criar fluxo: ${this.toErrorMessage(error)}`,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Tool call dispatcher
  // ---------------------------------------------------------------------------

  async executeToolCall(
    workspaceId: string,
    functionName: string,
    args: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (functionName) {
      case 'save_business_info': {
        const businessName = this.readText(args.businessName).trim();
        const ownerName = this.readText(args.ownerName).trim();
        const segment = this.readText(args.segment).trim();
        const description = this.readText(args.description).trim();

        await this.saveMemory(workspaceId, 'businessName', businessName, 'business');
        if (args.ownerName) {
          await this.saveMemory(workspaceId, 'ownerName', ownerName, 'business');
        }
        if (args.segment) {
          await this.saveMemory(workspaceId, 'segment', segment, 'business');
        }
        if (args.description) {
          await this.saveMemory(workspaceId, 'description', description, 'business');
        }

        // Atualizar nome do workspace (wrapped in $transaction to prevent race conditions)
        await this.prisma.$transaction(
          async (tx) => {
            await tx.workspace.update({
              where: { id: workspaceId },
              data: { name: businessName },
            });
          },
          { isolationLevel: 'ReadCommitted' },
        );

        return { success: true, message: `Negócio "${businessName}" salvo com sucesso!` };
      }

      case 'save_contact_info': {
        if (args.whatsappNumber) {
          await this.saveMemory(workspaceId, 'whatsappNumber', args.whatsappNumber, 'contact');
        }
        if (args.email) {
          await this.saveMemory(workspaceId, 'email', args.email, 'contact');
        }
        if (args.instagram) {
          await this.saveMemory(workspaceId, 'instagram', args.instagram, 'contact');
        }
        if (args.website) {
          await this.saveMemory(workspaceId, 'website', args.website, 'contact');
        }
        return { success: true, message: 'Informações de contato salvas!' };
      }

      case 'add_product': {
        const productName = this.readText(args.name).trim();
        const price = this.readNumber(args.price);
        const description = this.readText(args.description).trim();
        const category = this.readText(args.category).trim() || 'default';
        const productId = `product_${Date.now()}`;

        await this.saveMemory(workspaceId, productId, args, 'products');

        try {
          await this.prismaExt.product.create({
            data: {
              workspaceId,
              name: productName,
              price,
              description,
              category,
              active: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
          this.logger.log(`Produto "${productName}" persistido na tabela Product`);
        } catch (error: unknown) {
          this.logger.warn(
            `Produto "${productName}" salvo apenas em memória: ${this.toErrorMessage(error)}`,
          );
        }

        return {
          success: true,
          message: `Produto "${productName}" adicionado ao catálogo!`,
          productId,
        };
      }

      case 'set_brand_voice':
        await this.saveMemory(workspaceId, 'brandVoice', args, 'branding');
        return { success: true, message: 'Tom de voz da marca configurado!' };

      case 'set_business_hours':
        await this.saveMemory(workspaceId, 'businessHours', args, 'settings');
        return { success: true, message: 'Horário de funcionamento salvo!' };

      case 'set_main_goal':
        await this.saveMemory(workspaceId, 'mainGoal', args.goal, 'business');
        if (args.targetAudience) {
          await this.saveMemory(workspaceId, 'targetAudience', args.targetAudience, 'business');
        }
        if (args.painPoints) {
          await this.saveMemory(workspaceId, 'painPoints', args.painPoints, 'business');
        }
        return {
          success: true,
          message: `Objetivo principal definido: ${this.readText(args.goal)}`,
        };

      case 'create_initial_flow': {
        return this.createAutomatedFlow(
          workspaceId,
          this.readText(args.flowType),
          this.readText(args.businessContext).trim() || undefined,
          this.readStringArray(args.customMessages),
        );
      }

      case 'complete_onboarding': {
        if (args.createDefaultFlows !== false) {
          const mainGoal = this.readText(await this.getMemoryValue(workspaceId, 'mainGoal')).trim();
          const businessName = this.readText(
            await this.getMemoryValue(workspaceId, 'businessName'),
          ).trim();
          const segment = this.readText(await this.getMemoryValue(workspaceId, 'segment')).trim();
          const sharedContext = `Negócio: ${businessName}, Segmento: ${segment}`;

          await this.createAutomatedFlow(
            workspaceId,
            'welcome',
            `${sharedContext}, Objetivo: ${mainGoal}`,
          );

          if (mainGoal === 'vendas') {
            await this.createAutomatedFlow(workspaceId, 'sales', sharedContext);
          } else if (mainGoal === 'leads') {
            await this.createAutomatedFlow(workspaceId, 'lead_capture', sharedContext);
          } else if (mainGoal === 'agendamentos') {
            await this.createAutomatedFlow(workspaceId, 'scheduling', sharedContext);
          } else if (mainGoal === 'suporte' || mainGoal === 'atendimento') {
            await this.createAutomatedFlow(workspaceId, 'support', sharedContext);
          }
        }

        await this.saveMemory(workspaceId, 'onboarding_completed', true, 'system');
        await this.saveMemory(workspaceId, 'onboarding_summary', args.summary, 'system');
        if (args.nextSteps) {
          await this.saveMemory(workspaceId, 'onboarding_next_steps', args.nextSteps, 'system');
        }

        return {
          success: true,
          message: 'Onboarding concluído com sucesso! Fluxos iniciais criados automaticamente.',
          summary: args.summary,
          nextSteps: args.nextSteps,
        };
      }

      default:
        return { success: false, message: `Função desconhecida: ${functionName}` };
    }
  }
}
