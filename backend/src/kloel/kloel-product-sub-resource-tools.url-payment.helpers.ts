import { PrismaService } from '../prisma/prisma.service';
import type { UnknownRecord } from '../common/types';

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
  prisma: PrismaService,
  workspaceId: string,
  args: UnknownRecord,
) {
  try {
    const amount = num(args.amount);
    const sale = await prisma.kloelSale.create({
      data: {
        workspaceId,
        externalPaymentId: 'bol_' + Date.now(),
        leadPhone: str(args.customerPhone),
        productName: str(args.productName),
        amount,
        status: 'pending',
        paymentMethod: 'BOLETO',
      },
    });
    const roundedAmount = String(Math.round(amount * 100)).padStart(10, '0');
    const boletoCode = '34191.79001 01043.510047 91020.150008 9 ' + roundedAmount;
    const boletoResult = {
      success: true,
      saleId: sale.id,
      boletoCode,
      boletoPdf: null,
      boletoHtml: `<div style="font-family:monospace;padding:20px;border:1px solid #000">
<h3>BOLETO BANCARIO</h3>
<p>Valor: R$ ${amount.toFixed(2)}</p>
<p>Codigo: ${boletoCode}</p>
<p>Beneficiario: ${str(args.customerPhone || args.productName)}</p>
<p>Vencimento: ${new Date(Date.now() + 3 * 86400000).toLocaleDateString('pt-BR')}</p>
</div>`,
      amount,
    };
    return boletoResult;
  } catch (error: unknown) {
    return { success: false, error: error instanceof Error ? error.message : 'Erro' };
  }
}
