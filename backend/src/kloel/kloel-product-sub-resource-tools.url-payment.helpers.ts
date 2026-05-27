import { PrismaService } from '../prisma/prisma.service';
import type { UnknownRecord } from '../common/types';

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}


export async function deleteProductUrlTool(
  prisma: PrismaService,
  workspaceId: string,
  args: UnknownRecord,
) {
  const label = str(args.urlLabel || args.label);
  const url = str(args.url);
  if (!label && !url) {
    return { success: false, error: 'Informe a descricao ou URL para remover.' };
  }
  try {
    let target: { id: string } | null = null;
    if (label) {
      target = await prisma.productUrl.findFirst({
        where: {
          description: { contains: label, mode: 'insensitive' },
          product: { workspaceId },
        },
        select: { id: true },
      });
    }
    if (!target && url) {
      target = await prisma.productUrl.findFirst({
        where: { url: { contains: url }, product: { workspaceId } },
        select: { id: true },
      });
    }
    if (!target) {
      return { success: false, error: 'URL nao encontrada.' };
    }
    await prisma.productUrl.delete({ where: { id: target.id } });
    const deletedResult = { success: true, message: 'URL removida.' };
    return deletedResult;
  } catch (error: unknown) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro ao deletar URL.',
    };
  }
}

export async function generateBoletoTool(
  _prisma: PrismaService,
  _workspaceId: string,
  _args: UnknownRecord,
) {
  return {
    success: false,
    error: 'boleto_provider_unavailable',
    message:
      'Boleto ainda nao esta conectado ao servico de dominio real. Use sales.create_boleto quando houver provedor real com recibo e auditoria.',
    capabilityId: 'sales.create_boleto',
    outputs: {},
    domainEvents: [],
  };
}
