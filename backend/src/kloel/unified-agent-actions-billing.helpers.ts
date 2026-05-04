import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Node/edge structures for sales funnel stage flows. */
export function buildFunnelStageData(
  stage: unknown,
  funnelName: string,
  productName: string,
  productPrice: number,
): {
  flowName: string;
  trigger: string;
  triggerValue: string;
  nodes: Prisma.InputJsonValue[];
  edges: Prisma.InputJsonValue[];
} {
  let flowName = '';
  let trigger = 'manual';
  let triggerValue = '';
  let nodes: Prisma.InputJsonValue[] = [];
  let edges: Prisma.InputJsonValue[] = [];

  switch (stage) {
    case 'awareness':
      flowName = `${funnelName} - Descoberta`;
      nodes = [
        {
          id: '1',
          type: 'message',
          data: { content: `Olá! Você conhece ${productName}?` },
          position: { x: 250, y: 0 },
        },
        {
          id: '2',
          type: 'wait',
          data: { delay: 5, unit: 'minutes' },
          position: { x: 250, y: 100 },
        },
        {
          id: '3',
          type: 'message',
          data: { content: 'Posso te contar mais?' },
          position: { x: 250, y: 200 },
        },
      ];
      edges = [
        { id: 'e1-2', source: '1', target: '2' },
        { id: 'e2-3', source: '2', target: '3' },
      ];
      break;
    case 'interest':
      flowName = `${funnelName} - Interesse`;
      trigger = 'keyword';
      triggerValue = 'sim,quero,interessado';
      nodes = [
        {
          id: '1',
          type: 'message',
          data: { content: `Ótimo! ${productName} pode gerar ganhos reais.` },
          position: { x: 250, y: 0 },
        },
        {
          id: '2',
          type: 'message',
          data: { content: 'Quer ver uma demonstração?' },
          position: { x: 250, y: 100 },
        },
      ];
      edges = [{ id: 'e1-2', source: '1', target: '2' }];
      break;
    case 'purchase':
      flowName = `${funnelName} - Fechamento`;
      trigger = 'keyword';
      triggerValue = 'comprar,fechar,quero comprar';
      nodes = [
        {
          id: '1',
          type: 'message',
          data: { content: `Perfeito. Vou preparar seu acesso ao ${productName}.` },
          position: { x: 250, y: 0 },
        },
        {
          id: '2',
          type: 'message',
          data: {
            content: productPrice
              ? `O investimento é de R$ ${productPrice}.`
              : 'Vou enviar o link de pagamento:',
          },
          position: { x: 250, y: 100 },
        },
        {
          id: '3',
          type: 'aiNode',
          data: { action: 'create_payment_link' },
          position: { x: 250, y: 200 },
        },
      ];
      edges = [
        { id: 'e1-2', source: '1', target: '2' },
        { id: 'e2-3', source: '2', target: '3' },
      ];
      break;
  }
  return { flowName, trigger, triggerValue, nodes, edges };
}

/** Creates all flow records for a sales funnel. */
export async function createFunnelFlows(
  prisma: PrismaService,
  workspaceId: string,
  funnelName: string,
  stages: unknown[],
  productName: string,
  productPrice: number,
  includeFollowUps: unknown,
): Promise<string[]> {
  const createdFlows: string[] = [];
  for (const stage of stages) {
    const { flowName, trigger, triggerValue, nodes, edges } = buildFunnelStageData(
      stage,
      funnelName,
      productName,
      productPrice,
    );
    const flow = await prisma.flow.create({
      data: {
        name: flowName,
        workspaceId,
        nodes,
        edges,
        triggerType: trigger.toUpperCase(),
        triggerCondition: triggerValue,
        isActive: false,
      },
    });
    createdFlows.push(flow.name);
  }
  if (includeFollowUps) {
    const followUpFlow = await prisma.flow.create({
      data: {
        name: `${funnelName} - Follow-up`,
        workspaceId,
        nodes: [
          { id: '1', type: 'wait', data: { delay: 24, unit: 'hours' }, position: { x: 250, y: 0 } },
          {
            id: '2',
            type: 'message',
            data: {
              content: `Oi! Vi que você se interessou por ${productName}. Posso tirar alguma dúvida?`,
            },
            position: { x: 250, y: 100 },
          },
        ],
        edges: [{ id: 'e1-2', source: '1', target: '2' }],
        triggerType: 'MANUAL',
        triggerCondition: '',
        isActive: false,
      },
    });
    createdFlows.push(followUpFlow.name);
  }
  return createdFlows;
}
