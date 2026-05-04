/**
 * Handles sales/negotiation tool actions: discount, objection handling,
 * lead qualification, meeting scheduling, anti-churn, and ghost reactivation.
 */
@Injectable()
export class UnifiedAgentActionsSalesService {
  private readonly logger = new Logger(UnifiedAgentActionsSalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: UnifiedAgentActionsMessagingService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  async actionApplyDiscount(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    try {
      const discountPercent = Math.min(Math.max(Number(args?.discountPercent) || 10, 1), 30);
      const reason = args?.reason || 'Oferta especial';
      const expiresIn = args?.expiresIn || '24h';
      const recentMemory = await this.prisma.kloelMemory.findFirst({
        where: { workspaceId, category: 'products' },
        orderBy: { createdAt: 'desc' },
      });
      let originalPrice = 0;
      let productName = 'produto';
      if (recentMemory?.value) {
        const productData =
          typeof recentMemory.value === 'string'
            ? JSON.parse(recentMemory.value)
            : recentMemory.value;
        originalPrice = ((productData as UnknownRecord).price as number) || 0;
        productName = ((productData as UnknownRecord).name as string) || 'produto';
      }
      const finalPrice = originalPrice * (1 - discountPercent / 100);
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: 'NEGOTIATION',
          action: 'DISCOUNT_APPLIED',
          status: 'executed',
          meta: { discountPercent, reason, expiresIn, originalPrice, finalPrice, productName },
        },
      });
      const priceFormatted = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      }).format(finalPrice);
      const message = [
        'Oferta comercial para você',
        '',
        `Consegui um desconto exclusivo de *${discountPercent}%* para você!`,
        '',
        `De: ${formatBrlAmount(originalPrice)}`,
        `Por apenas: ${priceFormatted}`,
        '',
        reason,
        `Válido por ${expiresIn}. Aproveite!`,
      ].join('\n');
      // messageLimit: enforced via PlanLimitsService.trackMessageSend
      await this.messaging.actionSendMessage(workspaceId, phone, { message }, context);
      return {
        success: true,
        discountPercent,
        originalPrice,
        finalPrice,
        expiresIn,
        messageSent: true,
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'UnifiedAgentActionsSalesService.actionSendMessage',
      );
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao aplicar desconto: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async actionHandleObjection(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    try {
      const objectionType = args?.objectionType || 'other';
      const technique = args?.technique || 'value_focus';
      const objections = await this.prisma.kloelMemory.findMany({
        where: { workspaceId, category: 'objections' },
        select: { id: true, key: true, value: true },
        take: 50,
      });
      const objectionResponses: Record<string, string> = {
        price:
          'Entendo sua preocupação com o valor. Mas pense assim: quanto você perde por mês sem essa solução? \nO investimento se paga rapidamente quando você considera os resultados que vai alcançar.',
        time: 'Sei que seu tempo é precioso. Por isso desenvolvemos algo que economiza horas do seu dia. \nA implementação é rápida e você já começa a ver resultados na primeira semana.',
        trust:
          'É natural ter dúvidas sobre algo novo. Por isso oferecemos garantia total. \nSe não ficar satisfeito nos primeiros 7 dias, devolvemos 100% do seu dinheiro.',
        need: 'Entendo! Talvez você ainda não tenha percebido como isso pode transformar seu negócio. \nPosso mostrar casos de clientes do seu segmento que tiveram resultados incríveis?',
        competitor:
          'Ótimo que você está avaliando opções! Isso mostra que leva a sério a decisão. \nA diferença é que aqui você tem suporte personalizado e resultados comprovados.',
        other:
          'Compreendo totalmente sua posição. Cada cliente é único e merece atenção especial. \nO que posso fazer para ajudar você a tomar a melhor decisão?',
      };
      const customObjection = objections.find((o) => {
        const val = typeof o.value === 'string' ? JSON.parse(o.value) : o.value;
        return (val as Record<string, unknown>)?.type === objectionType;
      });
      let response = objectionResponses[objectionType] || objectionResponses.other;
      if (customObjection?.value) {
        const customData =
          typeof customObjection.value === 'string'
            ? JSON.parse(customObjection.value)
            : customObjection.value;
        if ((customData as Record<string, unknown>)?.response)
          response = (customData as Record<string, string>).response;
      }
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: 'OBJECTION',
          action: 'OBJECTION_HANDLED',
          status: 'executed',
          meta: { objectionType, technique, response: response.substring(0, 100) },
        },
      });
      // messageLimit: enforced via PlanLimitsService.trackMessageSend
      await this.messaging.actionSendMessage(workspaceId, phone, { message: response }, context);
      return { success: true, objectionType, technique, messageSent: true };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'UnifiedAgentActionsSalesService.actionSendMessage',
      );
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao tratar objeção: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async actionQualifyLead(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    try {
      const questions = args?.questions || [
        'Qual o principal desafio que você enfrenta hoje?',
        'Você já tentou resolver isso antes?',
        'Qual seria o resultado ideal para você?',
      ];
      const stage = args?.stage || 'interest';
      await this.prisma.contact
        .update({
          where: { id: contactId },
          data: { purchaseProbability: String(this.getStageScore(stage)) },
        })
        .catch((err: unknown) => {
          const errStr = describeUnknownError(err);
          this.logger.warn(`Failed to update contact purchaseProbability: ${errStr}`);
        });
      const message = `Para te ajudar melhor, preciso entender algumas coisas:\n\n${questions[0]}`;
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: 'QUALIFICATION',
          action: 'QUALIFY_STARTED',
          status: 'executed',
          meta: { stage, questionsCount: questions.length },
        },
      });
      // messageLimit: enforced via PlanLimitsService.trackMessageSend
      await this.messaging.actionSendMessage(workspaceId, phone, { message }, context);
      return {
        success: true,
        stage,
        questionsAsked: 1,
        totalQuestions: questions.length,
        messageSent: true,
      };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'UnifiedAgentActionsSalesService.actionSendMessage',
      );
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao qualificar lead: ${msg}`);
      return { success: false, error: msg };
    }
  }

  private getStageScore(stage: string): number {
    const scores: Record<string, number> = {
      awareness: 10,
      interest: 30,
      decision: 60,
      action: 90,
    };
    return scores[stage] || 20;
  }

  async actionScheduleMeeting(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    try {
      const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
      const meetingType = args?.type || 'demo';
      const suggestedTimes = args?.suggestedTimes || [
        'Amanhã às 10h',
        'Amanhã às 15h',
        'Sexta às 14h',
      ];
      const typeLabels: Record<string, string> = {
        demo: 'Demonstracao do Produto',
        consultation: 'Consultoria',
        followup: 'Conversa de Acompanhamento',
        support: 'Suporte Tecnico',
      };
      const message = `${typeLabels[meetingType] || 'Agendamento'}\n\nQual horário funciona melhor para você?\n\n${suggestedTimes.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n')}\n\nOu me diga um horário de sua preferência!`;
      try {
        await this.prisma.autopilotEvent.create({
          data: {
            workspaceId,
            contactId,
            intent: 'SCHEDULING',
            action: 'MEETING_PROPOSED',
            status: 'executed',
            meta: { meetingType, suggestedTimes },
          },
        });
      } catch (err: unknown) {
        void this.opsAlert?.alertOnCriticalError(err, 'UnifiedAgentActionsSalesService.create');
        const errMsg =
          err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown';
        if (!isTestEnv) {
          const code = (err as { code?: string } | null)?.code;
          if (code === 'P2003')
            this.logger.debug(`Skipping meeting event log due to FK (contactId=${contactId})`);
          else this.logger.warn(`Failed to log meeting event: ${errMsg}`);
        }
      }
      // messageLimit: enforced via PlanLimitsService.trackMessageSend
      await this.messaging.actionSendMessage(workspaceId, phone, { message }, context);
      return { success: true, meetingType, suggestedTimes, messageSent: true };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'UnifiedAgentActionsSalesService.actionSendMessage',
      );
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao agendar reunião: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async actionAntiChurn(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    try {
      const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
      const strategy = args?.strategy || 'discount';
      const offer = args?.offer || '';
      const strategyMessages: Record<string, string> = {
        discount: `Antes de concluir seu cancelamento, tenho uma condição comercial para você.\n\nQue tal um desconto exclusivo de 30% para continuar conosco? ${offer || 'Você é um cliente valioso e queremos mantê-lo!'}`,
        upgrade:
          'Que tal um upgrade gratuito?\n\nPosso liberar recursos premium para você experimentar por 30 dias, sem custo adicional!',
        downgrade:
          'Entendo que às vezes precisamos ajustar.\n\nTemos um plano mais acessível que pode atender suas necessidades. Quer conhecer?',
        pause:
          'Sem problemas. Que tal pausar sua assinatura por um mês?\n\nAssim você pode voltar quando for mais conveniente, sem perder nada.',
        feedback:
          'Sua opinião é muito importante para nós.\n\nO que podemos melhorar? Estou aqui para ouvir e resolver qualquer problema.',
        vip_support:
          'Você está em atendimento prioritário.\n\nVou te conectar com nosso time de suporte prioritário para resolver qualquer questão.',
      };
      const message = strategyMessages[strategy] || strategyMessages.feedback;
      try {
        await this.prisma.autopilotEvent.create({
          data: {
            workspaceId,
            contactId,
            intent: 'RETENTION',
            action: 'ANTI_CHURN_TRIGGERED',
            status: 'executed',
            meta: { strategy, offer },
          },
        });
      } catch (err: unknown) {
        void this.opsAlert?.alertOnCriticalError(err, 'UnifiedAgentActionsSalesService.create');
        const errMsg =
          err instanceof Error ? err.message : typeof err === 'string' ? err : 'unknown';
        if (!isTestEnv) {
          const code = (err as { code?: string } | null)?.code;
          if (code === 'P2003')
            this.logger.debug(`Skipping retention event log due to FK (contactId=${contactId})`);
          else this.logger.warn(`Failed to log retention event: ${errMsg}`);
        }
      }
      // messageLimit: enforced via PlanLimitsService.trackMessageSend
      await this.messaging.actionSendMessage(workspaceId, phone, { message }, context);
      return { success: true, strategy, messageSent: true };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'UnifiedAgentActionsSalesService.actionSendMessage',
      );
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro em anti-churn: ${msg}`);
      return { success: false, error: msg };
    }
  }

  async actionReactivateGhost(
    workspaceId: string,
    contactId: string,
    phone: string,
    args: ToolArgs,
    context?: UnknownRecord,
  ) {
    try {
      const strategy = args?.strategy || 'curiosity';
      const daysSilent = args?.daysSilent || 7;
      const reactivationMessages: Record<string, string> = {
        curiosity:
          'Oi! Percebi que você se afastou da conversa.\n\nAconteceu algo? Tenho novidades que podem te interessar.',
        urgency:
          'Última chance.\n\nAquela oferta que conversamos está acabando. Não quero que você perca essa oportunidade!',
        value:
          'Lembrei de você hoje.\n\nVi um caso de sucesso de um cliente parecido com você e pensei: isso pode te ajudar muito!',
        question:
          'Posso te fazer uma pergunta rápida?\n\nO que te fez não seguir em frente naquele momento? Sua opinião me ajuda a melhorar!',
        social_proof:
          'Mais de 500 pessoas já estão usando.\n\nOs resultados têm sido incríveis. Dá uma olhada no que estão falando!',
      };
      const message = reactivationMessages[strategy] || reactivationMessages.curiosity;
      await this.prisma.autopilotEvent.create({
        data: {
          workspaceId,
          contactId,
          intent: 'REACTIVATION',
          action: 'GHOST_CONTACTED',
          status: 'executed',
          meta: { strategy, daysSilent },
        },
      });
      await this.prisma.contact
        .update({ where: { id: contactId }, data: { updatedAt: new Date() } })
        .catch((err: unknown) => {
          const errStr = describeUnknownError(err);
          this.logger.warn(`Failed to update contact updatedAt: ${errStr}`);
        });
      // messageLimit: enforced via PlanLimitsService.trackMessageSend
      await this.messaging.actionSendMessage(workspaceId, phone, { message }, context);
      return { success: true, strategy, daysSilent, messageSent: true };
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(
        error,
        'UnifiedAgentActionsSalesService.actionSendMessage',
      );
      const msg =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
      this.logger.error(`Erro ao reativar ghost: ${msg}`);
      return { success: false, error: msg };
    }
  }
}

