type UnknownRecord = Record<string, unknown>;

export async function actionHandleObjection(deps: {
  workspaceId: string;
  contactId: string;
  phone: string;
  args: any;
  context: UnknownRecord | undefined;
  prisma: any;
  messaging: any;
  logger: { error(msg: string): void };
  opsAlert?: any;
}) {
  const { workspaceId, contactId, phone, args, context } = deps;
  try {
    const objectionType = (args as UnknownRecord)?.objectionType || 'other';
    const technique = (args as UnknownRecord)?.technique || 'value_focus';
    const objections = await deps.prisma.kloelMemory.findMany({
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
    const customObjection = objections.find((o: any) => {
      const val = typeof o.value === 'string' ? JSON.parse(o.value) : o.value;
      return (val as UnknownRecord)?.type === objectionType;
    });
    let response = objectionResponses[objectionType as string] || objectionResponses.other;
    if (customObjection?.value) {
      const customData =
        typeof customObjection.value === 'string'
          ? JSON.parse(customObjection.value)
          : customObjection.value;
      if ((customData as UnknownRecord)?.response)
        response = (customData as Record<string, string>).response;
    }
    await deps.prisma.autopilotEvent.create({
      data: {
        workspaceId,
        contactId,
        intent: 'OBJECTION',
        action: 'OBJECTION_HANDLED',
        status: 'executed',
        meta: { objectionType, technique, response: response.substring(0, 100) },
      },
    });
    await deps.messaging.actionSendMessage(workspaceId, phone, { message: response }, context);
    return { success: true, objectionType, technique, messageSent: true };
  } catch (error: unknown) {
    void deps.opsAlert?.alertOnCriticalError(
      error,
      'UnifiedAgentActionsSalesService.actionSendMessage',
    );
    const msg =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
    deps.logger.error(`Erro ao tratar objeção: ${msg}`);
    return { success: false, error: msg };
  }
}
